-- Supabase에서 실행: 강의 분석 히스토리 테이블
-- 분석 완료된 결과를 저장하여 나중에 다시 볼 수 있게 합니다.

CREATE TABLE IF NOT EXISTS lecture_analysis_history (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  youtube_url TEXT,                    -- YouTube 영상 URL
  video_title TEXT,                    -- 영상 제목
  video_duration INTEGER,             -- 영상 길이 (초)
  analysis TEXT NOT NULL,             -- 분석 결과 전문
  prompt TEXT,                        -- 사용된 프롬프트
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 빠른 조회를 위한 인덱스
CREATE INDEX IF NOT EXISTS idx_lah_created_at ON lecture_analysis_history (created_at DESC);
