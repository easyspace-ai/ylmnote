ALTER TABLE messages ADD COLUMN upstream_message_id TEXT;

CREATE INDEX IF NOT EXISTS idx_messages_upstream_message_id ON messages (upstream_message_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_session_upstream_unique
ON messages (session_id, upstream_message_id)
WHERE upstream_message_id IS NOT NULL AND upstream_message_id <> '';
