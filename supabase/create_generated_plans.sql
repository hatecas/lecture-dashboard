-- 프로젝트 기획 봇 생성 결과 자동 저장.
-- 모든 봇(ebook/ppt/boomUp/alimtalk/viralQ/salesPage/groupAnnouncement)의 성공 결과를
-- task_done 시점에 클라이언트가 자동으로 POST 저장 → 다음 접속 시 사이드바 '🗃️ 생성된 기획안'에서 조회.
--
-- 계정별 분리: owner_username으로. 같은 강사·기수에 jinwoo와 admin이 각각 만든 결과가 별개 row.
--
-- RLS는 비활성 (다른 자체 DB 테이블들과 동일 패턴 — § 5-12). 어드민 API gate로 충분.

CREATE TABLE IF NOT EXISTS generated_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 강사·기수 컨텍스트 (참조 — 강사 row 지워져도 보존 위해 이름도 별도 컬럼)
  session_id UUID,
  instructor_id UUID,
  instructor_name TEXT NOT NULL,
  session_name TEXT,

  -- 봇 결과
  task_key TEXT NOT NULL,         -- 'ebook' | 'ppt' | 'boomUp' | 'alimtalk' | 'viralQ' | 'salesPage' | 'groupAnnouncement' | 'summarize' (정리봇)
  topic TEXT,                     -- 생성 당시 topic
  additional_context TEXT,        -- 당시 추가 컨텍스트 (확인용)
  plan JSONB NOT NULL,            -- 봇 결과 plan 객체 그대로
  usage JSONB,                    -- 토큰 사용량 ({ input_tokens, output_tokens, ... })
  model TEXT,                     -- 사용 모델

  -- 계정별 분리
  owner_username TEXT NOT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 인덱스: 사용자별 + 시간순 조회가 가장 흔함
CREATE INDEX IF NOT EXISTS idx_generated_plans_owner_created
  ON generated_plans(owner_username, created_at DESC);

-- 강사·기수 + 봇 종류로 필터하는 경우용
CREATE INDEX IF NOT EXISTS idx_generated_plans_session
  ON generated_plans(session_id, task_key);

-- 봇 종류만으로 필터
CREATE INDEX IF NOT EXISTS idx_generated_plans_task
  ON generated_plans(task_key, created_at DESC);

ALTER TABLE generated_plans DISABLE ROW LEVEL SECURITY;
