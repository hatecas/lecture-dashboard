-- session_planner_inputs 테이블 RLS 비활성 (hot-fix).
-- create_session_planner_inputs.sql에 이미 DISABLE 구문이 있지만 Supabase가 새 테이블 생성 시
-- 자동으로 RLS를 켜는 케이스가 있음. 이 파일만 다시 실행해도 되고 재실행 안전.
--
-- 인증은 verifyApiAuth(jinwoo / 일반 관리자 토큰)에서 처리하므로 DB RLS는 중복.
-- (instructor_summaries, ai_prompts, ai_references와 동일 패턴.)

ALTER TABLE session_planner_inputs DISABLE ROW LEVEL SECURITY;
