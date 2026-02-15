"""HuggingFace Space 엔트리포인트 (Gradio SDK)"""
import uvicorn
from main import app

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=7860)
