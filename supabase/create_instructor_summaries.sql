-- 강사·기수별 자료 정리본 저장 테이블.
-- 정리봇이 첨부 자료(PDF/이미지/텍스트)와 추가 컨텍스트를 분석해 markdown으로 정리한 결과.
-- 한 (강사, 기수) 조합당 정리본 1개 (UNIQUE). 사용자가 수정 요청 보내면 기존 row를 UPDATE.
-- 다른 봇(전자책/붐업/채널톡 등)이 본 생성 시 이 정리본을 컨텍스트에 자동 주입.

-- 기존 잘못된 BIGINT 타입 테이블이 있으면 제거 (instructors.id / sessions.id가 UUID라서 타입 매칭 안 됨)
DROP TABLE IF EXISTS instructor_summaries CASCADE;

CREATE TABLE instructor_summaries (
  id BIGSERIAL PRIMARY KEY,
  instructor_id UUID NOT NULL,
  session_id UUID NOT NULL,
  content_md TEXT NOT NULL DEFAULT '',
  version INT NOT NULL DEFAULT 1,
  updated_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT instructor_summaries_unique_session UNIQUE (instructor_id, session_id)
);

CREATE INDEX IF NOT EXISTS idx_instructor_summaries_session
  ON instructor_summaries(session_id);

-- updated_at 자동 갱신 트리거
CREATE OR REPLACE FUNCTION trg_set_instructor_summaries_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS instructor_summaries_set_updated_at ON instructor_summaries;
CREATE TRIGGER instructor_summaries_set_updated_at
BEFORE UPDATE ON instructor_summaries
FOR EACH ROW EXECUTE FUNCTION trg_set_instructor_summaries_updated_at();

-- RLS 비활성화 (서버 라우트에서 verifyApiAuth로 인증, RLS는 중복)
ALTER TABLE instructor_summaries DISABLE ROW LEVEL SECURITY;
