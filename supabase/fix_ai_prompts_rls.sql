-- ai_prompts / ai_references 테이블의 RLS 비활성.
--
-- 사유:
-- - Supabase는 새 테이블에 RLS를 자동 활성화(Postgres 17 default).
-- - 우리 /api/admin/planner-config 라우트는 application 레벨에서
--   verifyApiAuth + jinwoo 권한을 강제하므로 DB RLS는 중복.
-- - SUPABASE_SERVICE_ROLE_KEY 가 설정 안 된 환경에서 anon 키로 폴백되면
--   RLS에 막혀 "new row violates row-level security policy" 에러 발생.
--
-- 두 테이블 모두 사용자 비밀이 아닌 기획 봇 설정(텍스트)만 담음.
-- 이 테이블에 직접 클라이언트가 접근하지 않고 API만 거쳐서 안전.
--
-- 실행 위치: 자체 대시보드 Supabase
--   https://supabase.com/dashboard/project/aznxzcpcsraqsvkoozfc/sql

ALTER TABLE ai_prompts DISABLE ROW LEVEL SECURITY;
ALTER TABLE ai_references DISABLE ROW LEVEL SECURITY;

-- 검증 (선택)
-- SELECT tablename, rowsecurity FROM pg_tables
-- WHERE tablename IN ('ai_prompts', 'ai_references');
-- → rowsecurity = false 두 행
