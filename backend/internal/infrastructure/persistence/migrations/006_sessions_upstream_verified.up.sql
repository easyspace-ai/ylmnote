-- 会话与上游 WSS 握手：首帧 update.state.id 与 {"id":hint} 一致（或新会话成功拿到 id）后为 true，便于前端展示「已与官方对齐」
ALTER TABLE sessions ADD COLUMN upstream_verified INTEGER NOT NULL DEFAULT 0;
