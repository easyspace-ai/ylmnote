ALTER TABLE sessions ADD COLUMN upstream_session_id TEXT;
UPDATE sessions SET upstream_session_id = id WHERE upstream_session_id IS NULL OR upstream_session_id = '';

CREATE INDEX IF NOT EXISTS idx_sessions_project_upstream ON sessions (project_id, upstream_session_id);
