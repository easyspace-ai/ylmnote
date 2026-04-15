package provider

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"mime/multipart"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/gorilla/websocket"
	wsdk "ws-chat-tester/sdk"

	"github.com/easyspace-ai/ylmnote/internal/infrastructure/ai/gateway/client"
	"github.com/easyspace-ai/ylmnote/internal/infrastructure/ai/gateway/types"
)

type Config struct {
	BaseURL            string
	ServiceAPIKey      string
	UploadPath         string
	Timeout            time.Duration
	WSWriteTimeout     time.Duration
	WSHandshakeTimeout time.Duration
	Debug              bool
}

type Provider struct {
	cfg               Config
	httpClient        *http.Client
	upstream          *wsdk.Client
	initErr           error
	debug             bool
	uploadLogFullBody bool
}

func New(cfg Config) *Provider {
	if cfg.UploadPath == "" {
		cfg.UploadPath = "/api/upload"
	}
	if cfg.Timeout <= 0 {
		cfg.Timeout = 90 * time.Second
	}
	if cfg.WSWriteTimeout <= 0 {
		cfg.WSWriteTimeout = 8 * time.Second
	}
	if cfg.WSHandshakeTimeout <= 0 {
		cfg.WSHandshakeTimeout = 15 * time.Second
	}
	envDebug := strings.EqualFold(os.Getenv("AI_SDK_DEBUG"), "1") || strings.EqualFold(os.Getenv("AI_SDK_DEBUG"), "true")
	upstream, err := wsdk.NewClient(wsdk.Config{
		BaseURL: cfg.BaseURL,
		APIKey:  cfg.ServiceAPIKey,
		Timeout: cfg.Timeout,
	})
	return &Provider{
		cfg:               cfg,
		httpClient:        &http.Client{Timeout: cfg.Timeout},
		upstream:          upstream,
		initErr:           err,
		debug:             cfg.Debug || envDebug,
		uploadLogFullBody: strings.EqualFold(os.Getenv("AI_SDK_UPLOAD_LOG_FULL_BODY"), "1") || strings.EqualFold(os.Getenv("AI_SDK_UPLOAD_LOG_FULL_BODY"), "true"),
	}
}

func (p *Provider) EnsureSession(ctx context.Context, sessionID string) (*client.SessionConnectResult, error) {
	if err := p.ensureReady(); err != nil {
		return nil, err
	}
	hint := strings.TrimSpace(sessionID)
	conn, err := p.upstream.DialSession(ctx, hint)
	if err != nil {
		return nil, mapTransportErr("ws dial failed", err)
	}
	defer conn.Close()

	resolved, matched, err := p.w6WaitRunHandshake(ctx, conn, hint)
	if err != nil {
		if hint != "" && p.verifyAgentExists(ctx, hint) {
			return &client.SessionConnectResult{SessionID: hint, HandshakeStateIDMatched: false}, nil
		}
		return nil, err
	}
	if hint != "" {
		resolved = hint
	}
	return &client.SessionConnectResult{
		SessionID:               resolved,
		HandshakeStateIDMatched: matched,
	}, nil
}

func (p *Provider) SendStop(ctx context.Context, sessionID string) error {
	if err := p.ensureReady(); err != nil {
		return err
	}
	sessionID = strings.TrimSpace(sessionID)
	if sessionID == "" {
		return &types.SDKError{Code: types.ErrBadRequest, Message: "session id is required for stop"}
	}
	conn, err := p.upstream.DialSession(ctx, sessionID)
	if err != nil {
		return mapTransportErr("ws dial failed", err)
	}
	defer conn.Close()
	if _, _, err := p.w6WaitRunHandshake(ctx, conn, sessionID); err != nil {
		return err
	}
	_ = conn.SetWriteDeadline(time.Now().Add(p.cfg.WSWriteTimeout))
	if err := conn.WriteJSON(map[string]any{"type": "Stop"}); err != nil {
		return mapTransportErr("ws stop write failed", err)
	}
	return nil
}

func (p *Provider) Send(ctx context.Context, req client.ChatRequest) (*client.ChatResponse, error) {
	return p.streamViaWS(ctx, req, nil)
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

	resp, err := p.httpClient.Do(httpReq)
	if err != nil {
		return nil, mapTransportErr("upload file to upstream failed", err)
	}
	defer resp.Body.Close()
	rawBody, _ := io.ReadAll(resp.Body)
	bodyLog := strings.TrimSpace(string(rawBody))
	if p.debug {
		if p.uploadLogFullBody {
			log.Printf("[gateway-upload] response status=%d body=%s", resp.StatusCode, bodyLog)
		} else {
			bodyPreview := bodyLog
			if len(bodyPreview) > 300 {
				bodyPreview = bodyPreview[:300] + "..."
			}
			log.Printf("[gateway-upload] response status=%d body_preview=%s", resp.StatusCode, bodyPreview)
		}
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, mapStatusErr(resp.StatusCode, "upstream upload returned non-2xx: "+bodyLog)
	}
	return normalizeUploadResponse(rawBody, req)
}

func (p *Provider) streamViaWS(ctx context.Context, req client.ChatRequest, onEvent func(types.StreamEvent) error) (*client.ChatResponse, error) {
	if err := p.ensureReady(); err != nil {
		return nil, err
	}
	hint := strings.TrimSpace(req.SessionID)
	conn, err := p.upstream.DialSession(ctx, hint)
	if err != nil {
		return nil, mapTransportErr("ws dial failed", err)
	}
	defer conn.Close()

	go func() {
		<-ctx.Done()
		_ = conn.Close()
	}()

	resolvedHandshake, handshakeMatched, err := p.w6WaitRunHandshake(ctx, conn, hint)
	if err != nil {
		return nil, err
	}
	if hint != "" && !handshakeMatched {
		return nil, &types.SDKError{
			Code:    types.ErrProtocol,
			Message: fmt.Sprintf("w6 handshake state.id mismatch: hint=%s resolved=%s", hint, resolvedHandshake),
		}
	}

	remoteSessionID := resolvedHandshake
	if hint != "" {
		remoteSessionID = hint
	}
	if onEvent != nil {
		hs, _ := json.Marshal(map[string]any{
			"upstream_session_id": remoteSessionID,
			"handshake_verified":  handshakeMatched,
		})
		if err := onEvent(types.StreamEvent{Type: types.StreamEventUpstreamHandshake, Value: string(hs)}); err != nil {
			return nil, err
		}
	}

	inputFrame := map[string]any{
		"type":        "input",
		"content":     req.UserMessage,
		"attachments": []string{},
	}
	if remoteSessionID != "" {
		inputFrame["id"] = remoteSessionID
	}
	attachments := extractAttachmentIDs(req.ResourceRefs)
	if len(attachments) > 0 {
		inputFrame["attachments"] = attachments
	}
	_ = conn.SetWriteDeadline(time.Now().Add(p.cfg.WSWriteTimeout))
	if err := conn.WriteJSON(inputFrame); err != nil {
		return nil, mapTransportErr("ws input write failed", err)
	}

	var full strings.Builder
	lastUpdateAssistant := ""
	receivedAnyFrame := false
	sawBusyOrRunning := false
	for {
		_ = conn.SetReadDeadline(time.Now().Add(p.cfg.Timeout))
		_, messageBytes, err := conn.ReadMessage()
		if err != nil {
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
		if inferred := inferUpstreamSessionID(frame); inferred != "" {
			expected := strings.TrimSpace(req.SessionID)
			if expected == "" || inferred == expected {
				remoteSessionID = inferred
			} else {
				return nil, &types.SDKError{
					Code:    types.ErrProtocol,
					Message: fmt.Sprintf("ws upstream session mismatch expected=%s got=%s", expected, inferred),
				}
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
			return nil, &types.SDKError{Code: types.ErrUpstream4xx, Message: errMsg}
		case "update":
			if assistant := extractAssistantText(frame["messages"]); assistant != "" {
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
					continue
				}
				if emitted == "" {
					full.WriteString(assistant)
					if onEvent != nil {
						if err := onEvent(types.StreamEvent{Type: types.StreamEventContent, Value: assistant}); err != nil {
							return nil, err
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
	if onEvent != nil {
		_ = onEvent(types.StreamEvent{Type: types.StreamEventDone})
	}
	return &client.ChatResponse{
		SessionID:               remoteSessionID,
		Content:                 content,
		HandshakeStateIDMatched: handshakeMatched,
	}, nil
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

func w6HandshakeTerminalStatus(st string) bool {
	switch strings.ToLower(strings.TrimSpace(st)) {
	case "idle", "ready", "normal", "paused", "running", "busy", "waiting", "stopped", "completed", "done":
		return true
	default:
		return false
	}
}

func (p *Provider) w6WaitRunHandshake(ctx context.Context, conn *websocket.Conn, expectedID string) (resolvedID string, handshakeMatched bool, err error) {
	expectedID = strings.TrimSpace(expectedID)
	deadline := time.Now().Add(p.cfg.WSHandshakeTimeout)
	if dl, ok := ctx.Deadline(); ok && dl.Before(deadline) {
		deadline = dl
	}
	var sawUpdateWithID bool
	for time.Now().Before(deadline) {
		select {
		case <-ctx.Done():
			return "", false, ctx.Err()
		default:
		}
		rem := time.Until(deadline)
		if rem <= 0 {
			break
		}
		_ = conn.SetReadDeadline(time.Now().Add(rem))
		_, msg, rerr := conn.ReadMessage()
		if rerr != nil {
			return "", false, mapTransportErr("w6 handshake read failed", rerr)
		}
		var frame map[string]any
		if err := json.Unmarshal(msg, &frame); err != nil {
			continue
		}
		t := strings.ToLower(toString(frame["type"]))
		if t == "error" {
			errMsg := toString(frame["error"])
			if errMsg == "" {
				errMsg = "upstream error during w6 handshake"
			}
			return "", false, &types.SDKError{Code: types.ErrUpstream4xx, Message: errMsg}
		}
		if t == "update" {
			inf := inferUpstreamSessionID(frame)
			if inf == "" {
				continue
			}
			sawUpdateWithID = true
			if expectedID != "" {
				resolvedID = expectedID
				handshakeMatched = (inf == expectedID)
			} else {
				resolvedID = inf
				handshakeMatched = true
			}
			continue
		}
		if t == "status" {
			st := strings.ToLower(toString(frame["status"]))
			if sawUpdateWithID && w6HandshakeTerminalStatus(st) {
				if resolvedID == "" {
					resolvedID = expectedID
				}
				return resolvedID, handshakeMatched, nil
			}
		}
	}
	return "", false, &types.SDKError{Code: types.ErrProtocol, Message: "w6 handshake timeout (expected update with session id then status)"}
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
	for _, key := range []string{"session_id", "agent_id", "run_id", "agentId", "runId"} {
		if id := sanitizeSessionID(toString(frame[key])); id != "" {
			return id
		}
	}
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
			if !strings.HasPrefix(c, "file_") && !strings.HasPrefix(c, "src_") {
				if len(c) < 8 || strings.Contains(c, "/") || strings.Contains(c, " ") {
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

func (p *Provider) ensureReady() error {
	if p.initErr == nil && p.upstream != nil {
		return nil
	}
	cause := p.initErr
	if cause == nil {
		cause = fmt.Errorf("upstream sdk client is not initialized")
	}
	return &types.SDKError{
		Code:    types.ErrBadRequest,
		Message: "invalid sdk upstream configuration",
		Cause:   cause,
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
