-- admins 테이블에 알림용 연락처 컬럼 추가
ALTER TABLE admins ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE admins ADD COLUMN IF NOT EXISTS slack_email TEXT;

-- 알림 발송 로그 테이블
CREATE TABLE IF NOT EXISTS notification_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID REFERENCES task_requests(id) ON DELETE CASCADE,
  recipient_id UUID REFERENCES admins(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('sms', 'slack')),
  trigger_reason TEXT NOT NULL CHECK (trigger_reason IN ('new_task', 'deadline_soon', 'urgent_daily')),
  success BOOLEAN DEFAULT false,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notification_logs_task ON notification_logs(task_id);
CREATE INDEX IF NOT EXISTS idx_notification_logs_recipient ON notification_logs(recipient_id);
CREATE INDEX IF NOT EXISTS idx_notification_logs_created ON notification_logs(created_at);

ALTER TABLE notification_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for authenticated" ON notification_logs
  FOR ALL USING (true) WITH CHECK (true);

-- 사용 예시: 각 사용자의 연락처 업데이트
-- UPDATE admins SET phone = '01012345678', slack_email = 'user@company.slack.com' WHERE username = 'admin';
