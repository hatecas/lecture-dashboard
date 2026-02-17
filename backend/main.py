import os
import re
import json
import asyncio
import logging
import tempfile
import traceback
import time
import shutil
import subprocess
from concurrent.futures import ThreadPoolExecutor
from fastapi import FastAPI, UploadFile, Form, File
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from google import genai
from google.genai import types
from youtube_transcript_api import YouTubeTranscriptApi

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("lecture-backend")

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 환경변수에서 Gemini API 키 로드
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.0-flash")


def get_genai_client():
    """Gemini 클라이언트 초기화 (새 google-genai SDK)"""
    return genai.Client(api_key=GEMINI_API_KEY)


def extract_video_id(url: str) -> str | None:
    """YouTube URL에서 video ID 추출"""
    patterns = [
        r'(?:youtube\.com/watch\?v=|youtu\.be/|youtube\.com/embed/|youtube\.com/v/|youtube\.com/live/)([a-zA-Z0-9_-]{11})',
        r'^([a-zA-Z0-9_-]{11})$'
    ]
    for pattern in patterns:
        match = re.search(pattern, url)
        if match:
            return match.group(1)
    return None


def fetch_youtube_captions(video_id: str) -> str | None:
    """YouTube 자막 추출 (한국어 우선, 영어 폴백) - youtube-transcript-api v1.x"""
    try:
        logger.info(f"[자막] YouTube 자막 추출 시도: {video_id}")
        ytt_api = YouTubeTranscriptApi()

        # 한국어/영어 자막 우선 시도
        try:
            transcript = ytt_api.fetch(video_id, languages=['ko', 'en'])
            text = ' '.join(snippet.text for snippet in transcript)
            if len(text) > 50:
                logger.info(f"[자막] 자막 확보 (ko/en): {len(text)}자")
                return text
        except Exception as e:
            logger.info(f"[자막] ko/en 자막 실패: {e}")

        # 사용 가능한 아무 자막이라도 시도
        try:
            transcript_list = ytt_api.list(video_id)
            for t in transcript_list:
                logger.info(f"[자막] 사용 가능: {t.language} ({t.language_code}, auto={t.is_generated})")
                fetched = t.fetch()
                text = ' '.join(snippet.text for snippet in fetched)
                if len(text) > 50:
                    logger.info(f"[자막] 자막 확보 ({t.language_code}): {len(text)}자")
                    return text
        except Exception as e:
            logger.info(f"[자막] 전체 자막 탐색 실패: {e}")

        logger.warning(f"[자막] 사용 가능한 자막 없음: {video_id}")
        return None
    except Exception as e:
        logger.warning(f"[자막] 자막 추출 실패: {type(e).__name__}: {e}")
        return None


def download_audio_yt_dlp(video_url: str) -> str:
    """yt-dlp로 YouTube 오디오만 다운로드 (일부공개/공개 모두 지원, 쿠키 불필요)

    Returns: 다운로드된 오디오 파일 경로
    """
    tmp_dir = tempfile.mkdtemp(prefix="lecture_audio_")
    output_path = os.path.join(tmp_dir, "audio.mp3")

    cmd = [
        "yt-dlp",
        "--extract-audio",
        "--audio-format", "mp3",
        "--audio-quality", "64K",       # 음성이므로 64kbps면 충분 (파일 크기 최소화)
        "--no-playlist",
        "--no-check-certificates",
        "--output", os.path.join(tmp_dir, "audio.%(ext)s"),
        video_url,
    ]

    logger.info(f"[yt-dlp] 오디오 다운로드 시작: {video_url}")
    start_time = time.time()

    result = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        timeout=600,  # 10분 타임아웃
    )

    elapsed = time.time() - start_time

    if result.returncode != 0:
        logger.error(f"[yt-dlp] 다운로드 실패 (코드 {result.returncode}): {result.stderr[:500]}")
        raise RuntimeError(f"yt-dlp 다운로드 실패: {result.stderr[:300]}")

    # yt-dlp 출력 파일 확인
    if os.path.exists(output_path):
        file_size_mb = os.path.getsize(output_path) / (1024 * 1024)
        logger.info(f"[yt-dlp] 다운로드 완료: {output_path} ({file_size_mb:.1f}MB, {elapsed:.0f}초)")
        return output_path

    # mp3 변환이 안 된 경우 다른 확장자 파일 찾기
    for f in os.listdir(tmp_dir):
        fpath = os.path.join(tmp_dir, f)
        if os.path.isfile(fpath) and f.startswith("audio."):
            file_size_mb = os.path.getsize(fpath) / (1024 * 1024)
            logger.info(f"[yt-dlp] 다운로드 완료 (변환): {fpath} ({file_size_mb:.1f}MB, {elapsed:.0f}초)")
            return fpath

    raise RuntimeError("yt-dlp 다운로드는 성공했지만 오디오 파일을 찾을 수 없습니다.")


def upload_and_analyze_audio_sync(client, audio_path: str, prompt: str) -> str:
    """오디오 파일을 Gemini File API로 업로드하고 분석 (동기 - 스레드에서 실행)"""
    file_size_mb = os.path.getsize(audio_path) / (1024 * 1024)

    # 확장자로 MIME 타입 결정
    ext = os.path.splitext(audio_path)[1].lower()
    mime_map = {".mp3": "audio/mpeg", ".m4a": "audio/mp4", ".wav": "audio/wav",
                ".ogg": "audio/ogg", ".webm": "audio/webm", ".opus": "audio/opus"}
    mime_type = mime_map.get(ext, "audio/mpeg")

    logger.info(f"[Gemini] 오디오 업로드 시작: {audio_path} ({file_size_mb:.1f}MB, {mime_type})")

    # Gemini File API 업로드
    uploaded_file = client.files.upload(
        file=audio_path,
        config=types.UploadFileConfig(mime_type=mime_type),
    )
    logger.info(f"[Gemini] 업로드 완료: name={uploaded_file.name}, state={uploaded_file.state}")

    # 파일 처리 대기
    while uploaded_file.state == "PROCESSING":
        time.sleep(5)
        uploaded_file = client.files.get(name=uploaded_file.name)
        logger.info(f"[Gemini] 파일 처리 상태: {uploaded_file.state}")

    if uploaded_file.state == "FAILED":
        raise RuntimeError("Gemini 파일 처리 실패")

    logger.info("[Gemini] 파일 처리 완료, 오디오 분석 시작")

    # Gemini로 분석
    response = client.models.generate_content(
        model=GEMINI_MODEL,
        contents=[uploaded_file, prompt],
    )

    # 업로드된 파일 정리
    try:
        client.files.delete(name=uploaded_file.name)
        logger.info(f"[Gemini] 업로드 파일 삭제 완료: {uploaded_file.name}")
    except Exception as e:
        logger.warning(f"[Gemini] 업로드 파일 삭제 실패 (무시): {e}")

    return response.text or "분석 결과가 비어있습니다."


def split_transcript(transcript: str, max_chars: int = 100000) -> list[str]:
    """긴 텍스트를 문장 경계에서 분할"""
    if len(transcript) <= max_chars:
        return [transcript]

    chunks = []
    remaining = transcript

    while remaining:
        if len(remaining) <= max_chars:
            chunks.append(remaining)
            break

        split_at = remaining.rfind('. ', 0, max_chars)
        if split_at < max_chars * 0.5:
            split_at = remaining.rfind(' ', 0, max_chars)
        if split_at < max_chars * 0.5:
            split_at = max_chars

        chunks.append(remaining[:split_at + 1])
        remaining = remaining[split_at + 1:]

    return chunks


def sse_event(data: dict) -> str:
    """SSE 이벤트 포맷"""
    return f"data: {json.dumps(data, ensure_ascii=False)}\n\n"


@app.get("/")
async def root():
    return {"status": "ok", "service": "lecture-backend"}


@app.get("/health")
async def health():
    return {"status": "ok", "has_api_key": bool(GEMINI_API_KEY)}


@app.post("/api/analyze")
async def analyze_lecture(
    prompt: str = Form(...),
    inputMode: str = Form("youtube"),
    youtubeUrl: str = Form(None),
    videoFile: UploadFile = File(None),
):
    """무료강의 분석 엔드포인트 (SSE 스트리밍)"""

    if not GEMINI_API_KEY:
        async def error_stream():
            yield sse_event({"type": "error", "message": "서버에 GEMINI_API_KEY가 설정되지 않았습니다."})
        return StreamingResponse(error_stream(), media_type="text/event-stream")

    async def event_stream():
        try:
            client = get_genai_client()
            analysis = None

            if inputMode == "youtube":
                if not youtubeUrl:
                    yield sse_event({"type": "error", "message": "YouTube URL이 필요합니다."})
                    return

                video_id = extract_video_id(youtubeUrl)
                if not video_id:
                    yield sse_event({"type": "error", "message": "유효하지 않은 YouTube URL입니다."})
                    return

                # 1단계: 자막 추출 시도 (텍스트 분석이 더 빠르고 저렴)
                yield sse_event({"type": "progress", "step": "자막 추출 시도", "percent": 10, "detail": "YouTube 자막을 가져오는 중..."})

                caption_text = fetch_youtube_captions(video_id)

                if caption_text and len(caption_text) > 50:
                    # 자막이 있으면 텍스트로 분석 (빠르고 저렴)
                    yield sse_event({"type": "progress", "step": "자막 분석 중", "percent": 30, "detail": f"자막 {len(caption_text):,}자 확보, Gemini로 분석 중..."})

                    gen_task = asyncio.create_task(
                        asyncio.to_thread(analyze_transcript_sync, client, caption_text, prompt))
                    ka = 0
                    while not gen_task.done():
                        await asyncio.sleep(10)
                        ka += 1
                        yield sse_event({"type": "progress", "step": "Gemini 분석 중", "percent": min(30 + ka * 3, 85), "detail": f"AI가 텍스트를 분석 중입니다... ({ka * 10}초)"})
                    analysis = await gen_task
                else:
                    # 자막 없음 → yt-dlp로 오디오 다운로드 후 Gemini File API로 분석
                    # (일부공개/공개 모두 지원, 쿠키 불필요)
                    youtube_url = f"https://www.youtube.com/watch?v={video_id}"
                    yield sse_event({"type": "progress", "step": "오디오 다운로드", "percent": 15, "detail": "자막 없음, 영상 오디오를 다운로드합니다..."})

                    # 1) yt-dlp로 오디오 다운로드
                    audio_path = None
                    try:
                        dl_task = asyncio.create_task(
                            asyncio.to_thread(download_audio_yt_dlp, youtube_url))
                        ka = 0
                        while not dl_task.done():
                            await asyncio.sleep(5)
                            ka += 1
                            yield sse_event({"type": "progress", "step": "오디오 다운로드", "percent": min(15 + ka * 2, 40), "detail": f"오디오 다운로드 중... ({ka * 5}초)"})
                        audio_path = await dl_task

                        file_size_mb = os.path.getsize(audio_path) / (1024 * 1024)
                        yield sse_event({"type": "progress", "step": "Gemini 업로드", "percent": 45, "detail": f"오디오 {file_size_mb:.0f}MB 다운로드 완료, Gemini에 업로드 중..."})

                        # 2) Gemini File API 업로드 + 분석
                        gen_task = asyncio.create_task(
                            asyncio.to_thread(upload_and_analyze_audio_sync, client, audio_path, prompt))
                        ka = 0
                        while not gen_task.done():
                            await asyncio.sleep(10)
                            ka += 1
                            yield sse_event({"type": "progress", "step": "Gemini 분석 중", "percent": min(50 + ka * 2, 90), "detail": f"AI가 오디오를 분석 중입니다... ({ka * 10}초)"})
                        analysis = await gen_task

                    finally:
                        # 로컬 오디오 파일 정리
                        if audio_path and os.path.exists(audio_path):
                            tmp_dir = os.path.dirname(audio_path)
                            try:
                                shutil.rmtree(tmp_dir, ignore_errors=True)
                                logger.info(f"[정리] 임시 오디오 폴더 삭제: {tmp_dir}")
                            except Exception:
                                pass

            else:
                # 파일 업로드 방식
                if not videoFile:
                    yield sse_event({"type": "error", "message": "파일이 필요합니다."})
                    return

                yield sse_event({"type": "progress", "step": "파일 처리 중", "percent": 10, "detail": "업로드된 파일을 처리합니다..."})

                file_content = await videoFile.read()
                file_size_mb = len(file_content) / (1024 * 1024)
                file_mime = videoFile.content_type or "video/mp4"
                logger.info(f"[분석] 파일 업로드: {videoFile.filename} ({file_size_mb:.1f}MB, mime={file_mime})")

                yield sse_event({"type": "progress", "step": "Gemini 업로드 중", "percent": 20, "detail": f"{videoFile.filename} - {file_size_mb:.1f}MB"})

                # Gemini File API로 분석 (임시 파일 경로 사용)
                suffix = os.path.splitext(videoFile.filename or "file.mp4")[1] or ".mp4"
                tmp_upload = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
                try:
                    tmp_upload.write(file_content)
                    tmp_upload.close()
                    logger.info(f"[Gemini] 임시 파일 생성: {tmp_upload.name}")
                    uploaded_file = client.files.upload(
                        file=tmp_upload.name,
                        config=types.UploadFileConfig(mime_type=file_mime),
                    )
                    logger.info(f"[Gemini] 업로드 완료: name={uploaded_file.name}, state={uploaded_file.state}")
                finally:
                    os.unlink(tmp_upload.name)

                yield sse_event({"type": "progress", "step": "파일 처리 대기 중", "percent": 40, "detail": "Gemini가 파일을 처리하는 중..."})

                # 파일 처리 대기
                while uploaded_file.state == "PROCESSING":
                    await asyncio.sleep(3)
                    uploaded_file = client.files.get(name=uploaded_file.name)
                    logger.info(f"[Gemini] 파일 처리 상태: {uploaded_file.state}")

                if uploaded_file.state == "FAILED":
                    logger.error("[Gemini] 파일 처리 실패")
                    yield sse_event({"type": "error", "message": "Gemini 파일 처리에 실패했습니다."})
                    return

                logger.info("[Gemini] 파일 처리 완료, 분석 시작")
                yield sse_event({"type": "progress", "step": "Gemini 분석 중", "percent": 60, "detail": "영상을 분석 중..."})

                # Gemini 분석을 스레드에서 실행, keepalive 전송
                gen_task = asyncio.create_task(
                    asyncio.to_thread(
                        client.models.generate_content,
                        model=GEMINI_MODEL,
                        contents=[uploaded_file, prompt],
                    ))
                ka = 0
                while not gen_task.done():
                    await asyncio.sleep(10)
                    ka += 1
                    logger.info(f"[Gemini] 분석 진행 중... ({ka * 10}초)")
                    yield sse_event({"type": "progress", "step": "Gemini 분석 중", "percent": min(60 + ka * 2, 90), "detail": f"AI가 영상을 분석 중입니다... ({ka * 10}초)"})
                response = await gen_task
                analysis = response.text
                logger.info(f"[Gemini] 분석 완료 (결과 길이: {len(analysis)}자)")

            if analysis:
                yield sse_event({"type": "progress", "step": "분석 완료", "percent": 95, "detail": "결과를 정리합니다..."})
                yield sse_event({"type": "result", "analysis": analysis})
            else:
                yield sse_event({"type": "error", "message": "분석 결과가 비어있습니다."})

        except Exception as e:
            logger.error(f"[분석] 예외 발생: {type(e).__name__}: {e}")
            logger.error(traceback.format_exc())
            yield sse_event({"type": "error", "message": f"{type(e).__name__}: {e}"})

    return StreamingResponse(event_stream(), media_type="text/event-stream")


def analyze_transcript_sync(client, transcript: str, prompt: str) -> str:
    """텍스트 자막을 Gemini로 분석 (동기 - 스레드에서 실행용, 긴 텍스트는 Map-Reduce)"""
    CHUNK_LIMIT = 100000

    if len(transcript) <= CHUNK_LIMIT:
        response = client.models.generate_content(
            model=GEMINI_MODEL,
            contents=f"{prompt}\n\n---\n\n{transcript}",
        )
        return response.text or "분석 결과가 비어있습니다."

    # Map-Reduce for long transcripts
    chunks = split_transcript(transcript, CHUNK_LIMIT)

    map_prompt = """당신은 온라인 강의 분석 전문가입니다. 아래는 장시간 강의의 일부 구간입니다.
이 구간의 내용을 다음 형식으로 상세하게 요약해주세요:
- 핵심 내용 요약 (5~10문장)
- 주요 키워드 및 반복 메시지
- 판매 전환 포인트 (수강 유도, 할인, 긴급성 등)
- 수강생 반응 유도 구간
- 특이사항

구간 내용:

"""

    summaries = []
    BATCH_SIZE = 3
    for i in range(0, len(chunks), BATCH_SIZE):
        batch = chunks[i:i + BATCH_SIZE]
        for j, chunk in enumerate(batch):
            response = client.models.generate_content(
                model=GEMINI_MODEL,
                contents=f"{map_prompt}{chunk}",
            )
            summaries.append(response.text)

    # Reduce phase
    reduce_input = '\n\n'.join(
        f"=== 구간 {i+1}/{len(chunks)} ===\n{s}"
        for i, s in enumerate(summaries)
    )
    reduce_prompt = f"""아래는 장시간 강의(총 {len(chunks)}개 구간)의 구간별 분석 결과입니다.
이 모든 구간의 분석을 종합하여, 다음 원본 프롬프트의 형식에 맞게 최종 분석 리포트를 작성해주세요.

[원본 분석 프롬프트]
{prompt}

[구간별 분석 결과]
{reduce_input}"""

    response = client.models.generate_content(
        model=GEMINI_MODEL,
        contents=reduce_prompt,
    )
    return response.text or "분석 결과가 비어있습니다."


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    print(f"Python 백엔드 시작: http://localhost:{port}")
    print(f"GEMINI_API_KEY 설정됨: {'Yes' if GEMINI_API_KEY else 'No'}")
    print(f"GEMINI_MODEL: {GEMINI_MODEL}")
    uvicorn.run(app, host="0.0.0.0", port=port)
