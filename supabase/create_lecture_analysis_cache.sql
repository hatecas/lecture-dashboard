-- Supabase에서 실행: 강의 분석 결과 캐시 테이블
-- 같은 영상을 반복 분석하지 않도록 결과를 저장합니다.

CREATE TABLE IF NOT EXISTS lecture_analysis_cache (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cache_key TEXT UNIQUE NOT NULL,       -- videoId + promptHash
  video_id TEXT NOT NULL,               -- YouTube video ID
  analysis TEXT NOT NULL,               -- 분석 결과 전문
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 빠른 조회를 위한 인덱스
CREATE INDEX IF NOT EXISTS idx_lac_cache_key ON lecture_analysis_cache (cache_key);
CREATE INDEX IF NOT EXISTS idx_lac_video_id ON lecture_analysis_cache (video_id);

-- 30일 지난 캐시 자동 삭제 (선택사항 — pg_cron 사용 시)
-- SELECT cron.schedule('cleanup-lecture-cache', '0 3 * * *', $$DELETE FROM lecture_analysis_cache WHERE created_at < NOW() - INTERVAL '30 days'$$);
