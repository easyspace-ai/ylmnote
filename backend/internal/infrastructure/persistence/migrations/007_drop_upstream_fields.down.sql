-- 恢复 sessions 表的 upstream_session_id 和 upstream_verified 字段
ALTER TABLE sessions ADD COLUMN upstream_session_id TEXT;
ALTER TABLE sessions ADD COLUMN upstream_verified BOOLEAN NOT NULL DEFAULT FALSE;

-- 为 upstream_session_id 创建索引
CREATE INDEX IF NOT EXISTS idx_sessions_upstream_session_id ON sessions(upstream_session_id);
