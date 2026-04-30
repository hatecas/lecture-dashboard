-- 프로젝트 기획 봇별 지침 + 레퍼런스 저장.
-- 각 기능(feature_key)당 지침은 1행, 레퍼런스는 N행.
-- DB가 비어있으면 lib/planners/<key>.js 의 폴백 텍스트 사용.
--
-- 실행 위치: 자체 대시보드 Supabase
--   https://supabase.com/dashboard/project/aznxzcpcsraqsvkoozfc/sql

-- 1) 봇별 지침 (1:1)
CREATE TABLE IF NOT EXISTS ai_prompts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_key TEXT NOT NULL UNIQUE,           -- 'ebook', 'boomUp', 'alimtalk' 등
  instructions TEXT NOT NULL DEFAULT '',      -- 봇에 전달될 지침 본문
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by TEXT
);

-- 2) 봇별 레퍼런스 (1:N)
CREATE TABLE IF NOT EXISTS ai_references (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_key TEXT NOT NULL,                  -- 'ebook', 'boomUp', ...
  title TEXT NOT NULL,                        -- 짧은 식별 이름 ("청담언니 루시 - 유튜브 수익화")
  content TEXT NOT NULL,                      -- 본문 (모범 사례 텍스트)
  tags TEXT[] NOT NULL DEFAULT '{}',          -- 분야 태그 (선택, 향후 필터용)
  meta JSONB NOT NULL DEFAULT '{}',           -- 작성자/성과 등 메타
  enabled BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_references_feature
  ON ai_references(feature_key);
CREATE INDEX IF NOT EXISTS idx_ai_references_enabled
  ON ai_references(feature_key, enabled);

-- updated_at 자동 갱신 트리거 (선택)
CREATE OR REPLACE FUNCTION trg_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ai_prompts_updated_at ON ai_prompts;
CREATE TRIGGER ai_prompts_updated_at
  BEFORE UPDATE ON ai_prompts
  FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

DROP TRIGGER IF EXISTS ai_references_updated_at ON ai_references;
CREATE TRIGGER ai_references_updated_at
  BEFORE UPDATE ON ai_references
  FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();
