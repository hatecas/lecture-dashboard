-- 에러 로그 수집 — 배포 환경에서 발생한 에러를 DB에 저장.
-- 사용자(엔드유저)에게는 친절한 메시지만 보여주고, 개발자(localhost)에서
-- 사이드바 '🐞 에러 로그' 메뉴로 상세 조회.
--
-- 호출자: lib/errorLog.js의 logError 헬퍼.
-- 정책: insert 실패해도 무시 (로그 저장 실패가 본 흐름을 막으면 안 됨).
--
-- RLS 비활성 (자체 DB 다른 테이블과 동일 패턴).

CREATE TABLE IF NOT EXISTS error_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 어디서 발생했는지
  route TEXT,              -- '/api/tools/project-planner' 등 (라우트 경로)
  method TEXT,             -- 'POST' | 'GET' | 'DELETE' 등
  username TEXT,           -- 인증된 사용자명 (없으면 null)

  -- 무엇이 발생했는지
  error_code TEXT,         -- 코드 분류 ('VALIDATION' | 'EXTERNAL_API' | 'DB' | 'INTERNAL' | etc)
  error_message TEXT NOT NULL,     -- 실제 에러 메시지 (개발자 디버깅용 원문)
  user_message TEXT,       -- 엔드유저에게 표시한 친절한 메시지 (있으면 — 메시지 매핑 추적용)
  stack TEXT,              -- 스택 트레이스 (가능하면)

  -- 추가 컨텍스트 — 자유 형식 jsonb
  context JSONB,           -- { instructor, taskKey, sessionId, anthropicStatus, ... } 등 임의 키

  -- 환경 정보
  user_agent TEXT,
  ip TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 시간 역순 조회가 기본 (가장 최근 에러부터)
CREATE INDEX IF NOT EXISTS idx_error_logs_created_at_desc
  ON error_logs(created_at DESC);

-- 라우트별 필터
CREATE INDEX IF NOT EXISTS idx_error_logs_route
  ON error_logs(route, created_at DESC);

-- 에러 코드별 필터
CREATE INDEX IF NOT EXISTS idx_error_logs_code
  ON error_logs(error_code, created_at DESC);

ALTER TABLE error_logs DISABLE ROW LEVEL SECURITY;
