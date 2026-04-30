-- 자료를 강사 + 기수 조합에 묶기 위한 컬럼 추가.
-- 기존 데이터는 session_id NULL (= 강사 공통 자료, 모든 기수에서 보임).
-- 신규 업로드는 session_id 필수.
--
-- 실행 위치: 자체 대시보드 Supabase
--   https://supabase.com/dashboard/project/aznxzcpcsraqsvkoozfc/sql

ALTER TABLE instructor_attachments
  ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES sessions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_instructor_attachments_session_id
  ON instructor_attachments(session_id);

-- 검증 쿼리 (선택)
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_name = 'instructor_attachments'
-- ORDER BY ordinal_position;
