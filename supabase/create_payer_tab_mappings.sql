-- 결제자 시트 탭 매핑 테이블
-- Supabase SQL Editor에서 실행하세요

CREATE TABLE IF NOT EXISTS payer_tab_mappings (
  id BIGSERIAL PRIMARY KEY,
  year TEXT NOT NULL,           -- '25' 또는 '26'
  tab_raw TEXT NOT NULL,        -- 원본 시트 탭 이름 (예: '260106_쇼츠반장&쩡쌤')
  instructor TEXT NOT NULL,     -- 수동 설정한 강사명 (예: '쇼츠반장')
  cohort TEXT DEFAULT '',       -- 수동 설정한 기수 (예: '1기')
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(year, tab_raw)         -- 연도+탭이름 조합은 유니크
);

-- RLS 비활성화 (서버 사이드에서만 접근)
ALTER TABLE payer_tab_mappings ENABLE ROW LEVEL SECURITY;

-- anon 키로 접근 허용 정책
CREATE POLICY "Allow all access for anon" ON payer_tab_mappings
  FOR ALL USING (true) WITH CHECK (true);
