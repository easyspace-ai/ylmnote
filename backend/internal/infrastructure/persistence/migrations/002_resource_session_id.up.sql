ALTER TABLE resources ADD COLUMN session_id TEXT;
CREATE INDEX IF NOT EXISTS idx_resources_session_id ON resources (session_id);
