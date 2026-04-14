package youmind

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"log"
	"mime/multipart"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/gorilla/websocket"
	"ylmsdk/client"
	"ylmsdk/types"
)

type Config struct {
	BaseURL       string
	ServiceAPIKey string
	UploadPath    string
	WSPath        string
	Timeout       time.Duration
}

type Provider struct {
	cfg               Config
	httpClient        *http.Client
	debug             bool
	uploadLogFullBody bool
}

func New(cfg Config) *Provider {
	if cfg.BaseURL == "" {
		cfg.BaseURL = "https://api.openai.com/v1"
	}
	if cfg.UploadPath == "" {
		cfg.UploadPath = "/api/upload"
	}
	if cfg.WSPath == "" {
		cfg.WSPath = "/api/ws/run"
	}
	if cfg.Timeout <= 0 {
		cfg.Timeout = 90 * time.Second
	}
	return &Provider{
		cfg:               cfg,
		httpClient:        &http.Client{Timeout: cfg.Timeout},
		debug:             strings.EqualFold(os.Getenv("AI_SDK_DEBUG"), "1") || strings.EqualFold(os.Getenv("AI_SDK_DEBUG"), "true"),
		uploadLogFullBody: strings.EqualFold(os.Getenv("AI_SDK_UPLOAD_LOG_FULL_BODY"), "1") || strings.EqualFold(os.Getenv("AI_SDK_UPLOAD_LOG_FULL_BODY"), "true"),
	}
}

func (p *Provider) EnsureSession(ctx context.Context, sessionID string) (string, error) {
	return p.ensureSessionViaWS(ctx, sessionID)
}

func (p *Provider) ensureSessionViaWS(ctx context.Context, sessionID string) (string, error) {
	expectedSessionID := strings.TrimSpace(sessionID)
	wsURL, err := p.buildWSURL(sessionID)
	if err != nil {
		return "", &types.SDKError{Code: types.ErrBadRequest, Message: "build ws url failed", Cause: err}
	}
	header := http.Header{}
	if p.cfg.ServiceAPIKey != "" {
		header.Set("x-w6service-api-key", p.cfg.ServiceAPIKey)
	}
	conn, _, err := websocket.DefaultDialer.DialContext(ctx, wsURL, header)
	if err != nil {
		return "", mapTransportErr("ws dial failed", err)
	}
	defer conn.Close()
	_ = conn.SetWriteDeadline(time.Now().Add(8 * time.Second))
	if err := conn.WriteJSON(map[string]any{
		"type":    "auth",
		"api_key": p.cfg.ServiceAPIKey,
	}); err != nil {
		return "", mapTransportErr("ws auth write failed", err)
	}

	readUntil := time.Now().Add(10 * time.Second)
	for time.Now().Before(readUntil) {
		_ = conn.SetReadDeadline(readUntil)
		_, msg, err := conn.ReadMessage()
		if err != nil {
			// gorilla/websocket 在读失败后不允许继续 ReadMessage，否则会 panic。
			// 因此这里任何 read error 都立即结束当前连接读取流程。
			break
		}
		var frame map[string]any
		if err := json.Unmarshal(msg, &frame); err != nil {
			continue
		}
		if id := inferUpstreamSessionID(frame); id != "" {
			if expectedSessionID != "" && id != expectedSessionID {
				if p.debug {
					log.Printf("[sdk-ensure] ignore mismatched inferred session id expected=%s got=%s", expectedSessionID, id)
				}
				break
			}
			return id, nil
		}
	}

	// 对已有会话 ID 做一次 API 校验，作为兼容兜底（仅已有会话，不用于新会话创建）。
	if expectedSessionID != "" && p.verifyAgentExists(ctx, expectedSessionID) {
		return expectedSessionID, nil
	}
	return "", &types.SDKError{Code: types.ErrProtocol, Message: "upstream session id not found during ensure-session"}
}

func (p *Provider) verifyAgentExists(ctx context.Context, sessionID string) bool {
	base := strings.TrimRight(strings.TrimSpace(p.cfg.BaseURL), "/")
	if base == "" {
		return false
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, base+"/api/agents/"+url.PathEscape(sessionID), nil)
	if err != nil {
		return false
	}
	p.applyAuth(req)
	resp, err := p.httpClient.Do(req)
	if err != nil {
		return false
	}
	defer resp.Body.Close()
	return resp.StatusCode >= 200 && resp.StatusCode < 300
}

// SendStop opens the upstream run WebSocket, authenticates, and sends {"type":"Stop"} per W6 integration.
func (p *Provider) SendStop(ctx context.Context, sessionID string) error {
	sessionID = strings.TrimSpace(sessionID)
	if sessionID == "" {
		return &types.SDKError{Code: types.ErrBadRequest, Message: "session id is required for stop"}
	}
	wsURL, err := p.buildWSURL(sessionID)
	if err != nil {
		return &types.SDKError{Code: types.ErrBadRequest, Message: "build ws url failed", Cause: err}
	}
	dialCtx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()
	header := http.Header{}
	if p.cfg.ServiceAPIKey != "" {
		header.Set("x-w6service-api-key", p.cfg.ServiceAPIKey)
	}
	conn, _, err := websocket.DefaultDialer.DialContext(dialCtx, wsURL, header)
	if err != nil {
		return mapTransportErr("ws dial failed", err)
	}
	defer conn.Close()

	_ = conn.SetWriteDeadline(time.Now().Add(8 * time.Second))
	if err := conn.WriteJSON(map[string]any{
		"type":    "auth",
		"api_key": p.cfg.ServiceAPIKey,
	}); err != nil {
		return mapTransportErr("ws auth write failed", err)
	}

	// Consume a few post-auth frames so Stop is not dropped on busy gateways.
	readUntil := time.Now().Add(4 * time.Second)
	for i := 0; i < 24 && time.Now().Before(readUntil); i++ {
		_ = conn.SetReadDeadline(time.Now().Add(400 * time.Millisecond))
		_, msg, rerr := conn.ReadMessage()
		if rerr != nil {
			break
		}
		var frame map[string]any
		if json.Unmarshal(msg, &frame) != nil {
			continue
		}
		t := strings.ToLower(toString(frame["type"]))
		if t == "error" {
			errMsg := toString(frame["error"])
			if errMsg == "" {
				errMsg = "upstream ws error before stop"
			}
			return &types.SDKError{Code: types.ErrUpstream4xx, Message: errMsg}
		}
	}

	_ = conn.SetWriteDeadline(time.Now().Add(8 * time.Second))
	if err := conn.WriteJSON(map[string]any{"type": "Stop"}); err != nil {
		return mapTransportErr("ws stop write failed", err)
	}
	return nil
}

func (p *Provider) Send(ctx context.Context, req client.ChatRequest) (*client.ChatResponse, error) {
	return p.sendViaWS(ctx, req)
}

func (p *Provider) Stream(ctx context.Context, req client.ChatRequest, onEvent func(types.StreamEvent) error) (*client.ChatResponse, error) {
	return p.streamViaWS(ctx, req, onEvent)
}

func (p *Provider) Upload(ctx context.Context, req client.UploadRequest) (*client.UploadResponse, error) {
	if len(req.Content) == 0 || strings.TrimSpace(req.FileName) == "" {
		return nil, &types.SDKError{Code: types.ErrBadRequest, Message: "file name and content are required"}
	}

	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	part, err := writer.CreateFormFile("file", req.FileName)
	if err != nil {
		return nil, &types.SDKError{Code: types.ErrInternal, Message: "create upload form failed", Cause: err}
	}
	if _, err := part.Write(req.Content); err != nil {
		return nil, &types.SDKError{Code: types.ErrInternal, Message: "write upload form failed", Cause: err}
	}
	if err := writer.Close(); err != nil {
		return nil, &types.SDKError{Code: types.ErrInternal, Message: "close upload form failed", Cause: err}
	}

	url := strings.TrimRight(p.cfg.BaseURL, "/") + p.cfg.UploadPath
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, url, &body)
	if err != nil {
		return nil, &types.SDKError{Code: types.ErrInternal, Message: "create upload request failed", Cause: err}
	}
	httpReq.Header.Set("Content-Type", writer.FormDataContentType())
	p.applyAuth(httpReq)
	if p.debug {
		log.Printf("[sdk-upload] request url=%s file=%s bytes=%d content_type=%s has_key=%v", url, req.FileName, len(req.Content), req.ContentType, p.cfg.ServiceAPIKey != "")
	}

	resp, err := p.httpClient.Do(httpReq)
	if err != nil {
		return nil, mapTransportErr("upload file to upstream failed", err)
	}
	defer resp.Body.Close()
	rawBody, _ := io.ReadAll(resp.Body)
	bodyLog := strings.TrimSpace(string(rawBody))
	if p.debug {
		if p.uploadLogFullBody {
			log.Printf("[sdk-upload] response status=%d body_bytes=%d body=%s", resp.StatusCode, len(rawBody), bodyLog)
		} else {
			bodyPreview := bodyLog
			if len(bodyPreview) > 300 {
				bodyPreview = bodyPreview[:300] + "..."
			}
			log.Printf("[sdk-upload] response status=%d body_bytes=%d body_preview=%s", resp.StatusCode, len(rawBody), bodyPreview)
			log.Printf("[sdk-upload] tip: set AI_SDK_UPLOAD_LOG_FULL_BODY=true to print full response body")
		}
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		log.Printf("[sdk-upload] non-2xx status=%d raw_body=%s", resp.StatusCode, bodyLog)
		return nil, mapStatusErr(resp.StatusCode, "upstream upload returned non-2xx: "+bodyLog)
	}

	return normalizeUploadResponse(rawBody, req)
}

func (p *Provider) sendViaWS(ctx context.Context, req client.ChatRequest) (*client.ChatResponse, error) {
	return p.streamViaWS(ctx, req, nil)
}

func (p *Provider) streamViaWS(ctx context.Context, req client.ChatRequest, onEvent func(types.StreamEvent) error) (*client.ChatResponse, error) {
	wsURL, err := p.buildWSURL(req.SessionID)
	if err != nil {
		return nil, &types.SDKError{Code: types.ErrBadRequest, Message: "build ws url failed", Cause: err}
	}
	if p.debug {
		log.Printf("[sdk-chat] ws connect url=%s refs=%d msg_len=%d", wsURL, len(req.ResourceRefs), len(req.UserMessage))
	}
	header := http.Header{}
	if p.cfg.ServiceAPIKey != "" {
		header.Set("x-w6service-api-key", p.cfg.ServiceAPIKey)
	}
	conn, _, err := websocket.DefaultDialer.DialContext(ctx, wsURL, header)
	if err != nil {
		if p.debug {
			log.Printf("[sdk-chat] ws dial error: %v", err)
		}
		return nil, mapTransportErr("ws dial failed", err)
	}
	defer conn.Close()

	// Cancel ws read/write when ctx is done.
	go func() {
		<-ctx.Done()
		_ = conn.Close()
	}()

	authFrame := map[string]any{
		"type":    "auth",
		"api_key": p.cfg.ServiceAPIKey,
	}
	if err := conn.WriteJSON(authFrame); err != nil {
		if p.debug {
			log.Printf("[sdk-chat] ws auth write error: %v", err)
		}
		return nil, mapTransportErr("ws auth write failed", err)
	}

	inputFrame := map[string]any{
		"type":    "input",
		"content": req.UserMessage,
		// W6 示例里包含 attachments 字段；即使为空也显式发送，避免上游解析分支差异。
		"attachments": []string{},
	}
	if attachments := extractAttachmentIDs(req.ResourceRefs); len(attachments) > 0 {
		inputFrame["attachments"] = attachments
	}
	if err := conn.WriteJSON(inputFrame); err != nil {
		if p.debug {
			log.Printf("[sdk-chat] ws input write error: %v", err)
		}
		return nil, mapTransportErr("ws input write failed", err)
	}

	var full strings.Builder
	lastUpdateAssistant := ""
	remoteSessionID := strings.TrimSpace(req.SessionID)
	receivedAnyFrame := false
	sawBusyOrRunning := false

	for {
		_ = conn.SetReadDeadline(time.Now().Add(p.cfg.Timeout))
		_, messageBytes, err := conn.ReadMessage()
		if err != nil {
			if p.debug {
				log.Printf("[sdk-chat] ws read end err=%v full_len=%d last_update_len=%d", err, full.Len(), len(lastUpdateAssistant))
			}
			// If we already have content, treat close/timeout as stream end.
			if full.Len() > 0 || lastUpdateAssistant != "" {
				break
			}
			return nil, mapTransportErr("ws read failed", err)
		}
		var frame map[string]any
		if err := json.Unmarshal(messageBytes, &frame); err != nil {
			continue
		}
		receivedAnyFrame = true
		typeLower := strings.ToLower(toString(frame["type"]))
		if p.debug {
			log.Printf("[sdk-chat] ws frame type=%s", typeLower)
		}
		if inferred := inferUpstreamSessionID(frame); inferred != "" {
			expected := strings.TrimSpace(req.SessionID)
			if expected == "" || inferred == expected {
				remoteSessionID = inferred
			} else if p.debug {
				log.Printf("[sdk-chat] ignore mismatched inferred session id expected=%s got=%s", expected, inferred)
			}
		}
		switch typeLower {
		case "thinking":
			chunk := toString(frame["content"])
			if chunk == "" {
				continue
			}
			full.WriteString(chunk)
			if onEvent != nil {
				if err := onEvent(types.StreamEvent{Type: types.StreamEventContent, Value: chunk}); err != nil {
					return nil, err
				}
			}
		case "error":
			errMsg := toString(frame["error"])
			if errMsg == "" {
				errMsg = "ws upstream returned error"
			}
			if p.debug {
				log.Printf("[sdk-chat] ws error frame: %s", errMsg)
			}
			return nil, &types.SDKError{Code: types.ErrUpstream4xx, Message: errMsg}
		case "update":
			if p.debug {
				if preview, err := json.Marshal(frame); err == nil {
					s := string(preview)
					if len(s) > 500 {
						s = s[:500] + "..."
					}
					log.Printf("[sdk-chat] ws update preview=%s", s)
				}
			}
			if assistant := extractAssistantText(frame["messages"]); assistant != "" {
				lastUpdateAssistant = assistant
				emitted := full.String()
				if assistant == emitted {
					continue
				}
				// W6 update 通常是“当前完整助手文本快照”，这里转成增量给前端。
				if strings.HasPrefix(assistant, emitted) {
					delta := assistant[len(emitted):]
					if delta != "" {
						full.WriteString(delta)
						if onEvent != nil {
							if err := onEvent(types.StreamEvent{Type: types.StreamEventContent, Value: delta}); err != nil {
								return nil, err
							}
						}
					}
					continue
				}
				// 若快照非前缀增长（上游可能重写文本），无法在 SSE 里做“替换”，
				// 至少保证首段能看到内容，最终落库仍以 lastUpdateAssistant 为准。
				if emitted == "" {
					full.WriteString(assistant)
					if onEvent != nil {
						if err := onEvent(types.StreamEvent{Type: types.StreamEventContent, Value: assistant}); err != nil {
							return nil, err
						}
					}
				}
			} else if assistant := extractAssistantText(frame); assistant != "" {
				// 兼容某些网关把内容直接放在 update 顶层，不在 messages 内。
				lastUpdateAssistant = assistant
				emitted := full.String()
				if assistant == emitted {
					continue
				}
				if strings.HasPrefix(assistant, emitted) {
					delta := assistant[len(emitted):]
					if delta != "" {
						full.WriteString(delta)
						if onEvent != nil {
							if err := onEvent(types.StreamEvent{Type: types.StreamEventContent, Value: delta}); err != nil {
								return nil, err
							}
						}
					}
				}
			}
			if onEvent != nil {
				if artifacts := extractArtifactsFromUpdateFrame(frame); len(artifacts) > 0 {
					if b, err := json.Marshal(toolPayload{Kind: "artifacts", Artifacts: artifacts}); err == nil {
						if err := onEvent(types.StreamEvent{Type: types.StreamEventTool, Value: string(b)}); err != nil {
							return nil, err
						}
					}
				}
				if todos := extractTodosFromUpdateFrame(frame); len(todos) > 0 {
					if b, err := json.Marshal(toolPayload{Kind: "todos", Todos: todos}); err == nil {
						if err := onEvent(types.StreamEvent{Type: types.StreamEventTool, Value: string(b)}); err != nil {
							return nil, err
						}
					}
				}
			}
		case "status":
			status := strings.ToLower(toString(frame["status"]))
			if status == "busy" || status == "running" {
				sawBusyOrRunning = true
			}
			if onEvent != nil && status != "" {
				if err := onEvent(types.StreamEvent{Type: types.StreamEventStatus, Value: status}); err != nil {
					return nil, err
				}
			}
			if status == "idle" && (full.Len() > 0 || lastUpdateAssistant != "") {
				goto done
			}
			if status == "idle" && sawBusyOrRunning && receivedAnyFrame && full.Len() == 0 && lastUpdateAssistant == "" {
				return nil, &types.SDKError{
					Code:    types.ErrProtocol,
					Message: "ws upstream returned idle without content",
				}
			}
		}
	}

done:
	content := full.String()
	if content == "" {
		content = lastUpdateAssistant
	}
	if p.debug {
		log.Printf("[sdk-chat] ws done content_len=%d upstream_session=%s", len(content), remoteSessionID)
	}
	if onEvent != nil {
		_ = onEvent(types.StreamEvent{Type: types.StreamEventDone})
	}
	return &client.ChatResponse{
		SessionID: remoteSessionID,
		Content:   content,
	}, nil
}

func inferUpstreamSessionID(frame map[string]any) string {
	if state, ok := frame["state"].(map[string]any); ok {
		for _, key := range []string{"id", "session_id", "agent_id", "run_id"} {
			if id := sanitizeSessionID(toString(state[key])); id != "" {
				return id
			}
		}
	}
	if stateDelta, ok := frame["state_delta"].(map[string]any); ok {
		for _, key := range []string{"id", "session_id", "agent_id", "run_id"} {
			if id := sanitizeSessionID(toString(stateDelta[key])); id != "" {
				return id
			}
		}
	}
	// 优先显式字段，避免误把 call_id / msg_id 当成会话 ID。
	for _, key := range []string{"session_id", "agent_id", "run_id", "agentId", "runId"} {
		if id := sanitizeSessionID(toString(frame[key])); id != "" {
			return id
		}
	}
	// 部分网关会把会话 id 放在顶层 id，但该 id 不能是 call_/msg_ 等事件 id。
	if id := sanitizeSessionID(toString(frame["id"])); id != "" {
		return id
	}
	return ""
}

func sanitizeSessionID(v string) string {
	id := strings.TrimSpace(v)
	if id == "" {
		return ""
	}
	lower := strings.ToLower(id)
	if strings.HasPrefix(lower, "call_") || strings.HasPrefix(lower, "msg_") || strings.HasPrefix(lower, "tool_") {
		return ""
	}
	if strings.Contains(id, " ") {
		return ""
	}
	return id
}

func (p *Provider) buildWSURL(sessionID string) (string, error) {
	parsed, err := url.Parse(strings.TrimSpace(p.cfg.BaseURL))
	if err != nil {
		return "", err
	}
	if parsed.Scheme == "" {
		parsed.Scheme = "https"
	}
	switch parsed.Scheme {
	case "https":
		parsed.Scheme = "wss"
	case "http":
		parsed.Scheme = "ws"
	}
	wsPath := strings.TrimSpace(p.cfg.WSPath)
	if wsPath == "" {
		wsPath = "/api/ws/run"
	}
	if !strings.HasPrefix(wsPath, "/") {
		wsPath = "/" + wsPath
	}
	pathURL, err := url.Parse(wsPath)
	if err != nil {
		return "", err
	}
	parsed.Path = pathURL.Path

	// Keep WSPath query params and append id when available.
	q := pathURL.Query()
	if strings.TrimSpace(sessionID) != "" && q.Get("id") == "" {
		q.Set("id", strings.TrimSpace(sessionID))
	}
	parsed.RawQuery = q.Encode()
	return parsed.String(), nil
}

func extractAttachmentIDs(refs []types.ResourceRef) []string {
	seen := make(map[string]struct{}, len(refs))
	out := make([]string, 0, len(refs))
	for _, ref := range refs {
		candidates := []string{}
		if strings.HasPrefix(ref.ID, "file_") || strings.HasPrefix(ref.ID, "src_") {
			candidates = append(candidates, ref.ID)
		}
		if strings.HasPrefix(ref.URL, "sdk-file:") {
			candidates = append(candidates, strings.TrimPrefix(ref.URL, "sdk-file:"))
		}
		if idx := strings.Index(ref.URL, "/api/source/"); idx >= 0 {
			candidates = append(candidates, strings.TrimPrefix(ref.URL[idx:], "/api/source/"))
		}
		for _, c := range candidates {
			c = strings.TrimSpace(c)
			if c == "" {
				continue
			}
			// 兼容两类真实 ID：
			// 1) file_/src_ 前缀；
			// 2) 来自 sdk-file: 的短 ID（如 dDuUc7r828SX），通常不带固定前缀。
			if !strings.HasPrefix(c, "file_") && !strings.HasPrefix(c, "src_") {
				if len(c) < 8 || strings.Contains(c, "-") || strings.Contains(c, "/") || strings.Contains(c, " ") {
					continue
				}
			}
			if strings.Contains(c, ":") {
				continue
			}
			if _, ok := seen[c]; ok {
				continue
			}
			seen[c] = struct{}{}
			out = append(out, c)
		}
	}
	return out
}

type toolPayload struct {
	Kind      string             `json:"kind"`
	Artifacts []artifactSnapshot `json:"artifacts,omitempty"`
	Todos     []todoSnapshot     `json:"todos,omitempty"`
}

type artifactSnapshot struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	Kind    string `json:"kind"`
	Path    string `json:"path,omitempty"`
	Content string `json:"content,omitempty"`
}

type todoSnapshot struct {
	Text string `json:"text"`
	Done bool   `json:"done"`
}

func extractArtifactsFromUpdateFrame(frame map[string]any) []artifactSnapshot {
	rawMessages, ok := frame["messages"].([]any)
	if !ok {
		return nil
	}
	seen := map[string]struct{}{}
	out := make([]artifactSnapshot, 0)
	for _, raw := range rawMessages {
		msg, ok := raw.(map[string]any)
		if !ok {
			continue
		}
		parts, _ := msg["message_parts"].([]any)
		for _, rawPart := range parts {
			part, ok := rawPart.(map[string]any)
			if !ok || strings.ToLower(toString(part["type"])) != "resource" {
				continue
			}
			resource, ok := part["resource"].(map[string]any)
			if !ok {
				continue
			}
			name := ""
			path := ""
			if data, ok := resource["data"].(map[string]any); ok {
				name = strings.TrimSpace(toString(data["filename"]))
				path = strings.TrimSpace(toString(data["path"]))
			}
			if name == "" {
				name = strings.TrimSpace(toString(resource["id"]))
			}
			if name == "" {
				continue
			}
			id := strings.TrimSpace(toString(resource["id"]))
			if id == "" {
				id = "artifact::" + name
			}
			if _, exists := seen[id]; exists {
				continue
			}
			seen[id] = struct{}{}
			out = append(out, artifactSnapshot{
				ID:   id,
				Name: name,
				Kind: strings.TrimSpace(toString(resource["kind"])),
				Path: path,
			})
		}
	}
	return out
}

func extractTodosFromUpdateFrame(frame map[string]any) []todoSnapshot {
	state, _ := frame["state"].(map[string]any)
	if state == nil {
		state, _ = frame["state_delta"].(map[string]any)
	}
	rawTodos, _ := state["todos"].([]any)
	if len(rawTodos) == 0 {
		return nil
	}
	out := make([]todoSnapshot, 0, len(rawTodos))
	for _, raw := range rawTodos {
		item, ok := raw.(map[string]any)
		if !ok {
			continue
		}
		text := strings.TrimSpace(toString(item["text"]))
		if text == "" {
			continue
		}
		done, _ := item["done"].(bool)
		out = append(out, todoSnapshot{Text: text, Done: done})
	}
	return out
}

func extractAssistantText(messages any) string {
	list, ok := messages.([]any)
	if !ok {
		if wrapped, ok := messages.(map[string]any); ok {
			// 兼容 update 顶层直接包含 assistant/user_facing 文本。
			role := strings.ToLower(toString(wrapped["role"]))
			kind := strings.ToLower(toString(wrapped["kind"]))
			if role == "assistant" || role == "ai" || role == "bot" || role == "model" ||
				kind == "user_facing" || kind == "assistant" || kind == "from_assistant" {
				if content := extractText(wrapped["content"]); content != "" {
					return content
				}
				if text := extractText(wrapped["text"]); text != "" {
					return text
				}
				if output := extractText(wrapped["output"]); output != "" {
					return output
				}
				if parts := extractText(wrapped["message_parts"]); parts != "" {
					return parts
				}
			}
			if inner, ok := wrapped["messages"]; ok {
				return extractAssistantText(inner)
			}
		}
		return ""
	}
	for i := len(list) - 1; i >= 0; i-- {
		msg, ok := list[i].(map[string]any)
		if !ok {
			continue
		}
		role := strings.ToLower(toString(msg["role"]))
		kind := strings.ToLower(toString(msg["kind"]))
		isAssistantLike := role == "assistant" || role == "ai" || role == "bot" || role == "model" ||
			kind == "user_facing" || kind == "assistant" || kind == "from_assistant"
		if !isAssistantLike {
			continue
		}
		if content := extractText(msg["content"]); content != "" {
			return content
		}
		if text := extractText(msg["text"]); text != "" {
			return text
		}
		if output := extractText(msg["output"]); output != "" {
			return output
		}
		if parts, ok := msg["message_parts"].([]any); ok {
			var b strings.Builder
			for _, p := range parts {
				part, ok := p.(map[string]any)
				if !ok {
					continue
				}
				if strings.ToLower(toString(part["type"])) == "text" {
					b.WriteString(extractText(part["content"]))
				}
			}
			if b.Len() > 0 {
				return b.String()
			}
		}
		if parts, ok := msg["parts"].([]any); ok {
			if s := extractText(parts); s != "" {
				return s
			}
		}
	}
	return ""
}

func extractText(v any) string {
	switch t := v.(type) {
	case string:
		return strings.TrimSpace(t)
	case []any:
		var b strings.Builder
		for _, item := range t {
			if s := extractText(item); s != "" {
				b.WriteString(s)
			}
		}
		return strings.TrimSpace(b.String())
	case map[string]any:
		for _, key := range []string{"text", "content", "value", "output"} {
			if val, ok := t[key]; ok {
				if s := extractText(val); s != "" {
					return s
				}
			}
		}
		if parts, ok := t["parts"]; ok {
			if s := extractText(parts); s != "" {
				return s
			}
		}
		if parts, ok := t["message_parts"]; ok {
			if s := extractText(parts); s != "" {
				return s
			}
		}
		return ""
	default:
		return ""
	}
}

func toString(v any) string {
	if s, ok := v.(string); ok {
		return s
	}
	return ""
}

func (p *Provider) applyAuth(req *http.Request) {
	if p.cfg.ServiceAPIKey != "" {
		req.Header.Set("x-w6service-api-key", p.cfg.ServiceAPIKey)
	}
}

func mapTransportErr(msg string, err error) error {
	if errorsIsContext(err) {
		return &types.SDKError{Code: types.ErrTimeout, Message: msg, Cause: err}
	}
	return &types.SDKError{Code: types.ErrTransport, Message: msg, Cause: err}
}

func mapStatusErr(statusCode int, msg string) error {
	switch {
	case statusCode == http.StatusUnauthorized || statusCode == http.StatusForbidden:
		return &types.SDKError{Code: types.ErrUnauthorized, Message: msg, StatusCode: statusCode}
	case statusCode == http.StatusTooManyRequests:
		return &types.SDKError{Code: types.ErrRateLimited, Message: msg, StatusCode: statusCode}
	case statusCode >= 500:
		return &types.SDKError{Code: types.ErrUpstream5xx, Message: msg, StatusCode: statusCode}
	default:
		return &types.SDKError{Code: types.ErrUpstream4xx, Message: msg, StatusCode: statusCode}
	}
}

func errorsIsContext(err error) bool {
	if err == nil {
		return false
	}
	return err == context.Canceled || err == context.DeadlineExceeded || strings.Contains(err.Error(), "context canceled") || strings.Contains(err.Error(), "context deadline exceeded")
}

type uploadPayload struct {
	ID          string `json:"id"`
	FileName    string `json:"filename"`
	ContentType string `json:"content_type"`
	Size        int64  `json:"size"`
	URL         string `json:"url"`
}

func normalizeUploadResponse(raw []byte, req client.UploadRequest) (*client.UploadResponse, error) {
	if len(raw) == 0 {
		return nil, &types.SDKError{Code: types.ErrProtocol, Message: "empty upload response"}
	}

	var arr []uploadPayload
	if err := json.Unmarshal(raw, &arr); err == nil && len(arr) > 0 {
		first := arr[0]
		return toUploadResponse(first, req), nil
	}
	var stringArr []string
	if err := json.Unmarshal(raw, &stringArr); err == nil && len(stringArr) > 0 {
		return &client.UploadResponse{
			FileID:      stringArr[0],
			FileName:    req.FileName,
			ContentType: req.ContentType,
			Size:        int64(len(req.Content)),
			URL:         "sdk-file:" + stringArr[0],
		}, nil
	}
	var single uploadPayload
	if err := json.Unmarshal(raw, &single); err == nil && single.ID != "" {
		return toUploadResponse(single, req), nil
	}
	return nil, &types.SDKError{
		Code:    types.ErrProtocol,
		Message: "unsupported upload response format",
	}
}

func toUploadResponse(src uploadPayload, req client.UploadRequest) *client.UploadResponse {
	out := &client.UploadResponse{
		FileID:      src.ID,
		FileName:    src.FileName,
		ContentType: src.ContentType,
		Size:        src.Size,
		URL:         src.URL,
	}
	if out.FileName == "" {
		out.FileName = req.FileName
	}
	if out.ContentType == "" {
		out.ContentType = req.ContentType
	}
	if out.Size == 0 {
		out.Size = int64(len(req.Content))
	}
	if out.URL == "" && out.FileID != "" {
		out.URL = "sdk-file:" + out.FileID
	}
	return out
}
