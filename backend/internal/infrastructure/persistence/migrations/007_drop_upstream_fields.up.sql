-- 先删除引用 upstream_session_id 的索引
DROP INDEX IF EXISTS idx_sessions_project_upstream;

-- 删除 sessions 表的 upstream_session_id 和 upstream_verified 字段
-- SQLite 3.35.0+ 支持 DROP COLUMN
ALTER TABLE sessions DROP COLUMN upstream_session_id;
ALTER TABLE sessions DROP COLUMN upstream_verified;
