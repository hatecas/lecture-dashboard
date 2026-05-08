-- 강사·기수별 프로젝트 기획 입력값 저장 (무료 강의 주제 + 추가 컨텍스트).
-- 사용자가 저장 버튼 클릭 → 다음 접속 시 자동 로드.
-- (instructor_summaries는 정리본 — 자동 생성 결과. 이 테이블은 사용자 수동 입력값.)

CREATE TABLE IF NOT EXISTS session_planner_inputs (
  session_id UUID PRIMARY KEY,
  instructor_id UUID NOT NULL,
  topic TEXT NOT NULL DEFAULT '',
  additional_context TEXT NOT NULL DEFAULT '',
  updated_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_session_planner_inputs_instructor
  ON session_planner_inputs(instructor_id);

-- updated_at 자동 갱신
CREATE OR REPLACE FUNCTION trg_set_session_planner_inputs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS session_planner_inputs_set_updated_at ON session_planner_inputs;
CREATE TRIGGER session_planner_inputs_set_updated_at
BEFORE UPDATE ON session_planner_inputs
FOR EACH ROW EXECUTE FUNCTION trg_set_session_planner_inputs_updated_at();

ALTER TABLE session_planner_inputs DISABLE ROW LEVEL SECURITY;
