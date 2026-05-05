-- instructors / sessions / instructor_attachments 테이블 RLS 비활성.
--
-- 증상:
--   "테스트" 같은 신규 강사를 추가해도 드롭다운에 안 나타남.
--   같은 이름으로 여러 번 추가해도 에러 없음 (중복 INSERT 성공).
--
-- 원인:
--   Supabase에서 RLS가 활성화되어 있고, INSERT는 통과하지만 SELECT
--   정책이 신규 행을 필터링해서 .select() 응답에서 빠짐.
--   (loadInstructors의 SELECT도 같은 이유로 새 행 안 보임)
--
-- 해결:
--   이 세 테이블 모두 어드민(jinwoo)/관리자만 접근하므로 앱 레벨 인증으로
--   충분. DB RLS는 중복이라 비활성화.
--
-- 실행 위치: 자체 대시보드 Supabase
--   https://supabase.com/dashboard/project/aznxzcpcsraqsvkoozfc/sql

ALTER TABLE instructors DISABLE ROW LEVEL SECURITY;
ALTER TABLE sessions DISABLE ROW LEVEL SECURITY;
ALTER TABLE instructor_attachments DISABLE ROW LEVEL SECURITY;

-- 메모/유튜브 링크 같은 부속 테이블도 같은 이유로 비활성 권장
ALTER TABLE memos DISABLE ROW LEVEL SECURITY;
ALTER TABLE youtube_links DISABLE ROW LEVEL SECURITY;

-- 검증 (선택)
-- SELECT tablename, rowsecurity FROM pg_tables
-- WHERE tablename IN ('instructors', 'sessions', 'instructor_attachments', 'memos', 'youtube_links');
-- → rowsecurity = false 다섯 행이 떠야 정상.
