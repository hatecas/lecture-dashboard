-- instructor_summaries 테이블 RLS 비활성 (hot-fix).
-- 본 마이그레이션 create_instructor_summaries.sql에 이미 DISABLE 구문이 있지만,
-- Supabase가 새 테이블 생성 시 자동으로 RLS를 켜는 경우(또는 마이그레이션을 부분 실행한 경우)
-- 이 파일만 다시 실행해도 됨. 재실행 안전.
--
-- 이 프로젝트는 모든 DB 쓰기 라우트가 verifyApiAuth로 인증 게이트를 거치므로
-- DB RLS는 중복. ai_prompts / ai_references의 fix_ai_prompts_rls.sql과 동일 패턴.

ALTER TABLE instructor_summaries DISABLE ROW LEVEL SECURITY;
