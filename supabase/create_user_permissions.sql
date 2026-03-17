-- 사용자별 기능 권한 관리 테이블
CREATE TABLE IF NOT EXISTS user_permissions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  feature_key TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, feature_key)
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_user_permissions_user_id ON user_permissions(user_id);

-- RLS 비활성화 (서버 사이드에서만 접근)
ALTER TABLE user_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for authenticated" ON user_permissions FOR ALL USING (true);
