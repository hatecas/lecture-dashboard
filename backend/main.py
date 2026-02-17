import os
import re
import json
import asyncio
import logging
import tempfile
import traceback
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


def analyze_youtube_url_sync(client, video_id: str, prompt: str) -> str:
    """YouTube URL을 Gemini에 직접 전달하여 분석 (쿠키/다운로드 불필요)"""
    youtube_url = f"https://www.youtube.com/watch?v={video_id}"
    logger.info(f"[Gemini] YouTube URL 직접 분석: {youtube_url}")

    response = client.models.generate_content(
        model=GEMINI_MODEL,
        contents=types.Content(
            parts=[
                types.Part(
                    file_data=types.FileData(file_uri=youtube_url)
                ),
                types.Part(text=prompt),
            ]
        ),
    )
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
                    # 자막 없음 → YouTube URL을 Gemini에 직접 전달 (쿠키/다운로드 불필요)
                    yield sse_event({"type": "progress", "step": "영상 분석 중", "percent": 20, "detail": "자막 없음, Gemini가 영상을 직접 분석합니다..."})

                    gen_task = asyncio.create_task(
                        asyncio.to_thread(analyze_youtube_url_sync, client, video_id, prompt))
                    ka = 0
                    while not gen_task.done():
                        await asyncio.sleep(10)
                        ka += 1
                        yield sse_event({"type": "progress", "step": "Gemini 분석 중", "percent": min(20 + ka * 3, 90), "detail": f"AI가 영상을 분석 중입니다... ({ka * 10}초)"})
                    analysis = await gen_task

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
