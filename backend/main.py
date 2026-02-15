import os
import re
import json
import asyncio
import hashlib
import subprocess
import tempfile
import shutil
import queue as queue_mod
from concurrent.futures import ThreadPoolExecutor
from fastapi import FastAPI, UploadFile, Form, File
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
import google.generativeai as genai
from youtube_transcript_api import YouTubeTranscriptApi

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
    """YouTube 자막 추출 (한국어 우선, 영어 폴백)"""
    try:
        transcript_list = YouTubeTranscriptApi.list_transcripts(video_id)

        # 한국어 자막 시도
        try:
            transcript = transcript_list.find_transcript(['ko'])
            entries = transcript.fetch()
            text = ' '.join(entry['text'] for entry in entries)
            if len(text) > 50:
                return text
        except Exception:
            pass

        # 영어 자막 시도
        try:
            transcript = transcript_list.find_transcript(['en'])
            entries = transcript.fetch()
            text = ' '.join(entry['text'] for entry in entries)
            if len(text) > 50:
                return text
        except Exception:
            pass

        # 자동생성 자막 시도
        try:
            for t in transcript_list:
                entries = t.fetch()
                text = ' '.join(entry['text'] for entry in entries)
                if len(text) > 50:
                    return text
        except Exception:
            pass

        return None
    except Exception:
        return None


def download_youtube_audio(video_id: str, progress_q: queue_mod.Queue | None = None) -> tuple[bytes, str] | None:
    """yt-dlp로 YouTube 오디오 다운로드. 진행상황을 progress_q에 전달."""
    full_url = f"https://www.youtube.com/watch?v={video_id}"
    tmp_dir = tempfile.mkdtemp()

    def send_progress(detail: str, dl_percent: float = -1):
        if progress_q:
            progress_q.put({"detail": detail, "dl_percent": dl_percent})

    process = None
    try:
        out_path = os.path.join(tmp_dir, f"yt_{video_id}")

        # --newline: 진행률을 줄 단위로 출력
        process = subprocess.Popen([
            "yt-dlp",
            "-x", "--audio-format", "mp3", "--audio-quality", "5",
            "-o", f"{out_path}.%(ext)s",
            "--no-playlist", "--newline", full_url
        ], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)

        for line in process.stdout:
            line = line.strip()
            # "[download]  45.2% of  150.00MiB at  2.50MiB/s ETA 00:35"
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
                send_progress("오디오 변환 중 (mp3)...", 100)

        process.wait()
        if process.returncode != 0:
            return None

        # 생성된 파일 찾기
        expected = f"{out_path}.mp3"
        if os.path.exists(expected):
            audio_path = expected
        else:
            files = [f for f in os.listdir(tmp_dir) if f.startswith(f"yt_{video_id}.")]
            if not files:
                return None
            audio_path = os.path.join(tmp_dir, files[0])

        with open(audio_path, "rb") as f:
            audio_bytes = f.read()

        ext = os.path.splitext(audio_path)[1].lstrip(".") or "mp3"
        send_progress(f"다운로드 완료 ({len(audio_bytes) / (1024*1024):.1f}MB)", 100)
        return (audio_bytes, ext)

    except (FileNotFoundError, subprocess.TimeoutExpired, OSError):
        return None
    finally:
        if process and process.poll() is None:
            process.kill()
        shutil.rmtree(tmp_dir, ignore_errors=True)


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
                    # 자막 없음 → yt-dlp로 오디오 다운로드 후 Gemini File API 분석
                    yield sse_event({"type": "progress", "step": "오디오 다운로드", "percent": 15, "detail": "자막 없음, yt-dlp로 오디오를 다운로드합니다..."})

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
                                # 다운로드 0~100% → 전체 진행률 15~35%
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
                        yield sse_event({
                            "type": "error",
                            "message": "자막도 없고 오디오 다운로드도 실패했습니다.\n\n해결 방법:\n1. yt-dlp 설치: PowerShell에서 'winget install yt-dlp' 실행\n2. 파일 업로드 모드로 전환하여 영상/오디오 파일을 직접 업로드"
                        })
                        return

                    audio_bytes, ext = audio_result
                    file_size_mb = len(audio_bytes) / (1024 * 1024)
                    mime_type = "audio/mpeg" if ext == "mp3" else f"audio/{ext}"

                    yield sse_event({"type": "progress", "step": "Gemini 업로드 중", "percent": 40, "detail": f"오디오 {file_size_mb:.1f}MB를 Gemini에 업로드합니다..."})

                    # Gemini File API로 업로드
                    uploaded_file = genai.upload_file(
                        data=audio_bytes,
                        mime_type=mime_type,
                    )

                    yield sse_event({"type": "progress", "step": "파일 처리 대기 중", "percent": 50, "detail": "Gemini가 오디오를 처리하는 중..."})

                    while uploaded_file.state.name == "PROCESSING":
                        await asyncio.sleep(3)
                        uploaded_file = genai.get_file(uploaded_file.name)

                    if uploaded_file.state.name == "FAILED":
                        yield sse_event({"type": "error", "message": "Gemini 오디오 처리에 실패했습니다."})
                        return

                    yield sse_event({"type": "progress", "step": "Gemini 분석 중", "percent": 70, "detail": "오디오를 분석 중..."})

                    # Gemini 분석을 스레드에서 실행, keepalive 전송
                    gen_task = asyncio.create_task(
                        asyncio.to_thread(model.generate_content, [uploaded_file, prompt]))
                    ka = 0
                    while not gen_task.done():
                        await asyncio.sleep(10)
                        ka += 1
                        yield sse_event({"type": "progress", "step": "Gemini 분석 중", "percent": min(70 + ka * 2, 90), "detail": f"AI가 오디오를 분석 중입니다... ({ka * 10}초)"})
                    response = await gen_task
                    analysis = response.text

            else:
                # 파일 업로드 방식
                if not videoFile:
                    yield sse_event({"type": "error", "message": "파일이 필요합니다."})
                    return

                yield sse_event({"type": "progress", "step": "파일 처리 중", "percent": 10, "detail": "업로드된 파일을 처리합니다..."})

                file_content = await videoFile.read()
                file_size_mb = len(file_content) / (1024 * 1024)

                yield sse_event({"type": "progress", "step": "Gemini 업로드 중", "percent": 20, "detail": f"{videoFile.filename} - {file_size_mb:.1f}MB"})

                # Gemini File API로 분석
                uploaded_file = genai.upload_file(
                    data=file_content,
                    mime_type=videoFile.content_type or "video/mp4",
                )

                yield sse_event({"type": "progress", "step": "파일 처리 대기 중", "percent": 40, "detail": "Gemini가 파일을 처리하는 중..."})

                # 파일 처리 대기
                while uploaded_file.state.name == "PROCESSING":
                    await asyncio.sleep(3)
                    uploaded_file = genai.get_file(uploaded_file.name)

                if uploaded_file.state.name == "FAILED":
                    yield sse_event({"type": "error", "message": "Gemini 파일 처리에 실패했습니다."})
                    return

                yield sse_event({"type": "progress", "step": "Gemini 분석 중", "percent": 60, "detail": "영상을 분석 중..."})

                # Gemini 분석을 스레드에서 실행, keepalive 전송
                gen_task = asyncio.create_task(
                    asyncio.to_thread(model.generate_content, [uploaded_file, prompt]))
                ka = 0
                while not gen_task.done():
                    await asyncio.sleep(10)
                    ka += 1
                    yield sse_event({"type": "progress", "step": "Gemini 분석 중", "percent": min(60 + ka * 2, 90), "detail": f"AI가 영상을 분석 중입니다... ({ka * 10}초)"})
                response = await gen_task
                analysis = response.text

            if analysis:
                yield sse_event({"type": "progress", "step": "분석 완료", "percent": 95, "detail": "결과를 정리합니다..."})
                yield sse_event({"type": "result", "analysis": analysis})
            else:
                yield sse_event({"type": "error", "message": "분석 결과가 비어있습니다."})

        except Exception as e:
            yield sse_event({"type": "error", "message": str(e)})

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
