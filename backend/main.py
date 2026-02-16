import os
import re
import io
import json
import asyncio
import hashlib
import logging
import subprocess
import tempfile
import traceback
import shutil
import queue as queue_mod
from concurrent.futures import ThreadPoolExecutor
from fastapi import FastAPI, UploadFile, Form, File
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
import google.generativeai as genai
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
# YouTube 다운로드용 프록시 (선택사항, 봇 감지 우회용)
YTDLP_PROXY = os.environ.get("YTDLP_PROXY", "")

# YouTube 쿠키 (Base64 인코딩된 Netscape cookies.txt)
# 봇 감지 우회의 유일한 확실한 방법
YOUTUBE_COOKIES_PATH = None
_cookies_b64 = os.environ.get("YOUTUBE_COOKIES_BASE64", "")
if _cookies_b64:
    import base64
    try:
        cookies_content = base64.b64decode(_cookies_b64).decode("utf-8")
        YOUTUBE_COOKIES_PATH = "/tmp/youtube_cookies.txt"
        with open(YOUTUBE_COOKIES_PATH, "w") as f:
            f.write(cookies_content)
        logger.info("[초기화] YouTube 쿠키 설정 완료")
    except Exception as e:
        logger.warning(f"[초기화] YouTube 쿠키 디코딩 실패: {e}")


def get_gemini_model():
    """Gemini 모델 초기화"""
    genai.configure(api_key=GEMINI_API_KEY)
    return genai.GenerativeModel("gemini-2.0-flash")


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


def download_youtube_audio(video_id: str, progress_q: queue_mod.Queue | None = None) -> tuple[bytes, str] | None:
    """yt-dlp로 YouTube 오디오 다운로드 → 실패 시 pytubefix 폴백. 진행상황을 progress_q에 전달."""
    full_url = f"https://www.youtube.com/watch?v={video_id}"

    def send_progress(detail: str, dl_percent: float = -1):
        if progress_q:
            progress_q.put({"detail": detail, "dl_percent": dl_percent})

    # 1차 시도: yt-dlp
    result = _download_with_ytdlp(video_id, full_url, send_progress)
    if result:
        return result

    # 2차 시도: pytubefix (순수 Python, 외부 바이너리 불필요)
    logger.info("[pytubefix] yt-dlp 실패, pytubefix로 재시도")
    send_progress("yt-dlp 실패, 대체 방법으로 재시도...", 0)
    result = _download_with_pytubefix(video_id, full_url, send_progress)
    if result:
        return result

    return None


def _download_with_ytdlp(video_id: str, full_url: str, send_progress) -> tuple[bytes, str] | None:
    """yt-dlp를 사용한 오디오 다운로드"""
    tmp_dir = tempfile.mkdtemp()
    process = None
    try:
        out_path = os.path.join(tmp_dir, f"yt_{video_id}")
        logger.info(f"[yt-dlp] 오디오 다운로드 시작: {full_url}")

        # 서버 환경에서 YouTube 봇 감지 우회를 위한 옵션
        cmd = [
            "yt-dlp",
            "-x",
            "-o", f"{out_path}.%(ext)s",
            "--no-playlist", "--newline",
            "--user-agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
            "--extractor-args", "youtube:player_client=web_creator,mweb,tv",
            "--no-check-certificates",
            "--no-cache-dir",
            "--geo-bypass",
            "--socket-timeout", "30",
            full_url
        ]
        # 쿠키가 있으면 사용 (봇 감지 우회)
        if YOUTUBE_COOKIES_PATH:
            cmd.insert(-1, "--cookies")
            cmd.insert(-1, YOUTUBE_COOKIES_PATH)
            logger.info("[yt-dlp] 쿠키 사용")
        # 프록시가 설정되어 있으면 사용
        if YTDLP_PROXY:
            cmd.insert(-1, "--proxy")
            cmd.insert(-1, YTDLP_PROXY)
            logger.info(f"[yt-dlp] 프록시 사용: {YTDLP_PROXY}")

        process = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)

        last_error = ""
        for line in process.stdout:
            line = line.strip()
            if line:
                logger.info(f"[yt-dlp] {line}")
            if "ERROR" in line:
                last_error = line
            m = re.search(
                r'\[download\]\s+([\d.]+)%\s+of\s+~?([\d.]+\s*\w+)'
                r'(?:\s+at\s+([\d.]+\s*\w+/s))?'
                r'(?:\s+ETA\s+(\S+))?',
                line
            )
            if m:
                pct = float(m.group(1))
                size = m.group(2)
                speed = m.group(3) or ""
                eta = m.group(4) or ""
                parts = [f"다운로드 {pct:.1f}% ({size})"]
                if speed:
                    parts.append(speed)
                if eta:
                    parts.append(f"남은 시간 {eta}")
                send_progress(" · ".join(parts), pct)
            elif "[ExtractAudio]" in line:
                send_progress("오디오 추출 중...", 100)

        process.wait()
        logger.info(f"[yt-dlp] 프로세스 종료 코드: {process.returncode}")
        if process.returncode != 0:
            logger.error(f"[yt-dlp] 다운로드 실패 (exit code: {process.returncode}): {last_error}")
            return None

        files = [f for f in os.listdir(tmp_dir) if f.startswith(f"yt_{video_id}.")]
        if not files:
            logger.error(f"[yt-dlp] 다운로드된 파일을 찾을 수 없음: {tmp_dir}")
            return None
        audio_path = os.path.join(tmp_dir, files[0])

        with open(audio_path, "rb") as f:
            audio_bytes = f.read()

        ext = os.path.splitext(audio_path)[1].lstrip(".") or "mp3"
        logger.info(f"[yt-dlp] 다운로드 완료: {audio_path} ({len(audio_bytes) / (1024*1024):.1f}MB, ext={ext})")
        send_progress(f"다운로드 완료 ({len(audio_bytes) / (1024*1024):.1f}MB)", 100)
        return (audio_bytes, ext)

    except (FileNotFoundError, subprocess.TimeoutExpired, OSError) as e:
        logger.error(f"[yt-dlp] 예외 발생: {type(e).__name__}: {e}")
        return None
    finally:
        if process and process.poll() is None:
            process.kill()
        shutil.rmtree(tmp_dir, ignore_errors=True)


def _download_with_pytubefix(video_id: str, full_url: str, send_progress) -> tuple[bytes, str] | None:
    """pytubefix를 사용한 오디오 다운로드 (yt-dlp 실패 시 폴백)"""
    try:
        from pytubefix import YouTube

        send_progress("pytubefix로 오디오 다운로드 중...", 10)
        yt = YouTube(full_url)

        # 오디오 전용 스트림 선택 (최고 비트레이트)
        audio_stream = yt.streams.filter(only_audio=True).order_by("abr").desc().first()
        if not audio_stream:
            logger.error("[pytubefix] 오디오 스트림을 찾을 수 없음")
            return None

        logger.info(f"[pytubefix] 오디오 스트림 선택: {audio_stream.mime_type}, {audio_stream.abr}")
        send_progress(f"오디오 다운로드 중 ({audio_stream.abr})...", 30)

        # 메모리에 다운로드
        buffer = io.BytesIO()
        audio_stream.stream_to_buffer(buffer)
        audio_bytes = buffer.getvalue()

        ext = audio_stream.subtype or "mp4"  # webm, mp4 등
        logger.info(f"[pytubefix] 다운로드 완료: {len(audio_bytes) / (1024*1024):.1f}MB, ext={ext}")
        send_progress(f"다운로드 완료 ({len(audio_bytes) / (1024*1024):.1f}MB)", 100)
        return (audio_bytes, ext)

    except Exception as e:
        logger.error(f"[pytubefix] 예외 발생: {type(e).__name__}: {e}")
        logger.error(traceback.format_exc())
        return None


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
            model = get_gemini_model()
            analysis = None

            if inputMode == "youtube":
                if not youtubeUrl:
                    yield sse_event({"type": "error", "message": "YouTube URL이 필요합니다."})
                    return

                video_id = extract_video_id(youtubeUrl)
                if not video_id:
                    yield sse_event({"type": "error", "message": "유효하지 않은 YouTube URL입니다."})
                    return

                # 1단계: 자막 추출
                yield sse_event({"type": "progress", "step": "자막 추출 시도", "percent": 10, "detail": "YouTube 자막을 가져오는 중..."})

                caption_text = fetch_youtube_captions(video_id)

                if caption_text and len(caption_text) > 50:
                    yield sse_event({"type": "progress", "step": "자막 분석 중", "percent": 30, "detail": f"자막 {len(caption_text):,}자 확보, Gemini로 분석 중..."})

                    # Gemini 분석을 스레드에서 실행, keepalive 전송
                    gen_task = asyncio.create_task(
                        asyncio.to_thread(analyze_transcript_sync, model, caption_text, prompt))
                    ka = 0
                    while not gen_task.done():
                        await asyncio.sleep(10)
                        ka += 1
                        yield sse_event({"type": "progress", "step": "Gemini 분석 중", "percent": min(30 + ka * 3, 85), "detail": f"AI가 텍스트를 분석 중입니다... ({ka * 10}초)"})
                    analysis = await gen_task
                else:
                    # 자막 없음 → 오디오 다운로드 후 Gemini File API 분석
                    yield sse_event({"type": "progress", "step": "오디오 다운로드", "percent": 15, "detail": "자막 없음, 오디오를 다운로드합니다..."})

                    progress_q = queue_mod.Queue()
                    loop = asyncio.get_event_loop()
                    executor = ThreadPoolExecutor(max_workers=1)
                    future = loop.run_in_executor(executor, download_youtube_audio, video_id, progress_q)

                    # 다운로드 진행률을 실시간 SSE로 전송
                    while not future.done():
                        await asyncio.sleep(0.5)
                        while True:
                            try:
                                prog = progress_q.get_nowait()
                                dl_pct = prog.get("dl_percent", 0)
                                overall = 15 + int(max(0, min(dl_pct, 100)) * 0.2)
                                yield sse_event({
                                    "type": "progress",
                                    "step": "오디오 다운로드",
                                    "percent": overall,
                                    "detail": prog.get("detail", "")
                                })
                            except queue_mod.Empty:
                                break

                    audio_result = await future
                    executor.shutdown(wait=False)

                    if not audio_result:
                        cookie_hint = "" if YOUTUBE_COOKIES_PATH else "\n\n관리자에게 YouTube 쿠키 설정을 요청하세요."
                        yield sse_event({
                            "type": "error",
                            "message": f"자막도 없고 오디오 다운로드도 실패했습니다.\n\n이 영상은 YouTube에서 서버 다운로드를 차단하고 있을 수 있습니다.\n\n다른 영상 URL을 시도하거나, 잠시 후 다시 시도해주세요.{cookie_hint}"
                        })
                        return

                    audio_bytes, ext = audio_result
                    file_size_mb = len(audio_bytes) / (1024 * 1024)
                    mime_map = {"mp3": "audio/mpeg", "m4a": "audio/mp4", "webm": "audio/webm",
                                "opus": "audio/ogg", "ogg": "audio/ogg", "wav": "audio/wav",
                                "flac": "audio/flac", "aac": "audio/aac"}
                    mime_type = mime_map.get(ext, f"audio/{ext}")
                    logger.info(f"[분석] 오디오 준비 완료: {file_size_mb:.1f}MB, ext={ext}, mime={mime_type}")

                    yield sse_event({"type": "progress", "step": "Gemini 업로드 중", "percent": 40, "detail": f"오디오 {file_size_mb:.1f}MB를 Gemini에 업로드합니다..."})

                    # Gemini File API로 업로드 (임시 파일 경로 사용)
                    tmp_upload = tempfile.NamedTemporaryFile(delete=False, suffix=f".{ext}")
                    try:
                        tmp_upload.write(audio_bytes)
                        tmp_upload.close()
                        logger.info(f"[Gemini] 임시 파일 생성: {tmp_upload.name}")
                        uploaded_file = genai.upload_file(
                            tmp_upload.name,
                            mime_type=mime_type,
                        )
                        logger.info(f"[Gemini] 업로드 완료: name={uploaded_file.name}, state={uploaded_file.state.name}")
                    finally:
                        os.unlink(tmp_upload.name)

                    yield sse_event({"type": "progress", "step": "파일 처리 대기 중", "percent": 50, "detail": "Gemini가 오디오를 처리하는 중..."})

                    while uploaded_file.state.name == "PROCESSING":
                        await asyncio.sleep(3)
                        uploaded_file = genai.get_file(uploaded_file.name)
                        logger.info(f"[Gemini] 파일 처리 상태: {uploaded_file.state.name}")

                    if uploaded_file.state.name == "FAILED":
                        logger.error("[Gemini] 오디오 처리 실패")
                        yield sse_event({"type": "error", "message": "Gemini 오디오 처리에 실패했습니다."})
                        return

                    logger.info("[Gemini] 파일 처리 완료, 분석 시작")
                    yield sse_event({"type": "progress", "step": "Gemini 분석 중", "percent": 70, "detail": "오디오를 분석 중..."})

                    # Gemini 분석을 스레드에서 실행, keepalive 전송
                    gen_task = asyncio.create_task(
                        asyncio.to_thread(model.generate_content, [uploaded_file, prompt]))
                    ka = 0
                    while not gen_task.done():
                        await asyncio.sleep(10)
                        ka += 1
                        logger.info(f"[Gemini] 분석 진행 중... ({ka * 10}초)")
                        yield sse_event({"type": "progress", "step": "Gemini 분석 중", "percent": min(70 + ka * 2, 90), "detail": f"AI가 오디오를 분석 중입니다... ({ka * 10}초)"})
                    response = await gen_task
                    analysis = response.text
                    logger.info(f"[Gemini] 분석 완료 (결과 길이: {len(analysis)}자)")

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
                    uploaded_file = genai.upload_file(
                        tmp_upload.name,
                        mime_type=file_mime,
                    )
                    logger.info(f"[Gemini] 업로드 완료: name={uploaded_file.name}, state={uploaded_file.state.name}")
                finally:
                    os.unlink(tmp_upload.name)

                yield sse_event({"type": "progress", "step": "파일 처리 대기 중", "percent": 40, "detail": "Gemini가 파일을 처리하는 중..."})

                # 파일 처리 대기
                while uploaded_file.state.name == "PROCESSING":
                    await asyncio.sleep(3)
                    uploaded_file = genai.get_file(uploaded_file.name)
                    logger.info(f"[Gemini] 파일 처리 상태: {uploaded_file.state.name}")

                if uploaded_file.state.name == "FAILED":
                    logger.error("[Gemini] 파일 처리 실패")
                    yield sse_event({"type": "error", "message": "Gemini 파일 처리에 실패했습니다."})
                    return

                logger.info("[Gemini] 파일 처리 완료, 분석 시작")
                yield sse_event({"type": "progress", "step": "Gemini 분석 중", "percent": 60, "detail": "영상을 분석 중..."})

                # Gemini 분석을 스레드에서 실행, keepalive 전송
                gen_task = asyncio.create_task(
                    asyncio.to_thread(model.generate_content, [uploaded_file, prompt]))
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


def analyze_transcript_sync(model, transcript: str, prompt: str) -> str:
    """텍스트 자막을 Gemini로 분석 (동기 - 스레드에서 실행용, 긴 텍스트는 Map-Reduce)"""
    CHUNK_LIMIT = 100000

    if len(transcript) <= CHUNK_LIMIT:
        response = model.generate_content(f"{prompt}\n\n---\n\n{transcript}")
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
            response = model.generate_content(f"{map_prompt}{chunk}")
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

    response = model.generate_content(reduce_prompt)
    return response.text or "분석 결과가 비어있습니다."


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    print(f"Python 백엔드 시작: http://localhost:{port}")
    print(f"GEMINI_API_KEY 설정됨: {'Yes' if GEMINI_API_KEY else 'No'}")
    uvicorn.run(app, host="0.0.0.0", port=port)
