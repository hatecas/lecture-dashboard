-- instructor_attachments 에 file_role 컬럼 추가.
-- 'material'(기본) = 일반 자료(녹음본, 메모, 노션 링크 등)
-- 'ebook'           = 강사가 제공한 무료 전자책 원문 — 전자책 기획안 봇이 핵심 입력으로 사용
--
-- 실행 위치: 자체 대시보드 Supabase
--   https://supabase.com/dashboard/project/aznxzcpcsraqsvkoozfc/sql

ALTER TABLE instructor_attachments
  ADD COLUMN IF NOT EXISTS file_role TEXT NOT NULL DEFAULT 'material';

CREATE INDEX IF NOT EXISTS idx_instructor_attachments_role
  ON instructor_attachments(instructor_id, file_role);

-- 검증 (선택)
-- SELECT column_name, data_type, column_default FROM information_schema.columns
-- WHERE table_name = 'instructor_attachments' AND column_name = 'file_role';
