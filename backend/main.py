import os
import re
import json
import asyncio
import hashlib
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

                    # 텍스트 분석
                    analysis = await analyze_transcript(model, caption_text, prompt, lambda step, pct, detail: None)

                    # 진행상황을 위한 간단한 분석
                    yield sse_event({"type": "progress", "step": "Gemini 분석 중", "percent": 70, "detail": "분석 진행 중..."})
                else:
                    # 자막 없음 → 파일 업로드 방식으로 전환 안내
                    yield sse_event({
                        "type": "error",
                        "message": "이 영상에서 자막을 찾을 수 없습니다.\n\n해결 방법:\n1. 파일 업로드 모드로 전환하여 영상/오디오 파일을 직접 업로드\n2. 자막이 있는 YouTube 영상을 사용"
                    })
                    return

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
                import time
                while uploaded_file.state.name == "PROCESSING":
                    await asyncio.sleep(3)
                    uploaded_file = genai.get_file(uploaded_file.name)

                if uploaded_file.state.name == "FAILED":
                    yield sse_event({"type": "error", "message": "Gemini 파일 처리에 실패했습니다."})
                    return

                yield sse_event({"type": "progress", "step": "Gemini 분석 중", "percent": 60, "detail": "영상을 분석 중..."})

                response = model.generate_content([uploaded_file, prompt])
                analysis = response.text

            if analysis:
                yield sse_event({"type": "progress", "step": "분석 완료", "percent": 95, "detail": "결과를 정리합니다..."})
                yield sse_event({"type": "result", "analysis": analysis})
            else:
                yield sse_event({"type": "error", "message": "분석 결과가 비어있습니다."})

        except Exception as e:
            yield sse_event({"type": "error", "message": str(e)})

    return StreamingResponse(event_stream(), media_type="text/event-stream")


async def analyze_transcript(model, transcript: str, prompt: str, on_progress) -> str:
    """텍스트 자막을 Gemini로 분석 (긴 텍스트는 Map-Reduce)"""
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
