-- 업무 요청 테이블
CREATE TABLE IF NOT EXISTS task_requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  requester_id UUID NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  assignee_id UUID NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  priority TEXT DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  deadline DATE NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'rejected')),
  rejection_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_task_requests_requester ON task_requests(requester_id);
CREATE INDEX IF NOT EXISTS idx_task_requests_assignee ON task_requests(assignee_id);
CREATE INDEX IF NOT EXISTS idx_task_requests_status ON task_requests(status);
CREATE INDEX IF NOT EXISTS idx_task_requests_deadline ON task_requests(deadline);

-- RLS 정책 (Supabase)
ALTER TABLE task_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for authenticated" ON task_requests
  FOR ALL USING (true) WITH CHECK (true);
