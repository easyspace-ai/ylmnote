// ws-concurrent-sessions 直连远程 AI SDK（W6）网关：仅用 AI_SDK_BASE_URL + AI_SDK_SERVICE_API_KEY，
// 并发建立多条 WebSocket（/api/ws/run），握手后发送随机消息，验证是否均能收到上游回复；各会话原始帧写入独立文件。
package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/joho/godotenv"
	wsdk "ws-chat-tester/sdk"
)

func main() {
	var (
		envFile          = flag.String("env", "", "可选：加载该 .env（仅用于读取 AI_SDK_*），例如 backend/.env")
		baseURL          = flag.String("base", "", "AI_SDK_BASE_URL（默认环境变量 AI_SDK_BASE_URL）")
		apiKey           = flag.String("api-key", "", "AI_SDK_SERVICE_API_KEY（默认环境变量 AI_SDK_SERVICE_API_KEY）")
		timeoutSec       = flag.Int("sdk-timeout-sec", 120, "SDK HTTP 超时（秒），与 Dial 等共用")
		n                = flag.Int("n", 5, "并发会话数；为每个会话随机生成 session id")
		outDir           = flag.String("out", "ws-concurrent-sessions-out", "各会话 WebSocket 文本帧写入此目录")
		handshakeTimeout = flag.Duration("handshake-timeout", 90*time.Second, "等待上游握手（update+status）")
		replyTimeout     = flag.Duration("reply-timeout", 180*time.Second, "发送 input 后等待助手可见回复")
		startStagger     = flag.Duration("start-stagger", 0, "各连接发起间隔（错开建连）")
		skipInput        = flag.Bool("dry-run-handshake-only", false, "仅握手+记录帧，不发送 input")
	)
	flag.Parse()

	if strings.TrimSpace(*envFile) != "" {
		if err := godotenv.Load(*envFile); err != nil {
			fmt.Fprintf(os.Stderr, "加载 -env %q: %v\n", *envFile, err)
			os.Exit(2)
		}
	}

	b := strings.TrimSpace(*baseURL)
	if b == "" {
		b = strings.TrimSpace(os.Getenv("AI_SDK_BASE_URL"))
	}
	k := strings.TrimSpace(*apiKey)
	if k == "" {
		k = strings.TrimSpace(os.Getenv("AI_SDK_SERVICE_API_KEY"))
	}
	if b == "" || k == "" {
		fmt.Fprintln(os.Stderr, "需要 AI_SDK_BASE_URL 与 AI_SDK_SERVICE_API_KEY（-base/-api-key 或环境变量，也可先用 -env 指向 .env）")
		os.Exit(2)
	}

	if *n <= 0 {
		*n = 5
	}
	if *timeoutSec <= 0 {
		*timeoutSec = 120
	}

	client, err := wsdk.NewClient(wsdk.Config{
		BaseURL: b,
		APIKey:  k,
		Timeout: time.Duration(*timeoutSec) * time.Second,
	})
	if err != nil {
		fmt.Fprintf(os.Stderr, "SDK 客户端: %v\n", err)
		os.Exit(1)
	}

	sessionIDs := make([]string, *n)
	for i := 0; i < *n; i++ {
		sessionIDs[i] = uuid.NewString()
		fmt.Printf("session %d: %s\n", i, sessionIDs[i])
	}

	if err := os.MkdirAll(*outDir, 0755); err != nil {
		fmt.Fprintf(os.Stderr, "创建输出目录: %v\n", err)
		os.Exit(1)
	}

	var okCount, failCount int32
	var wg sync.WaitGroup

	for i, sid := range sessionIDs {
		wg.Add(1)
		go func(idx int, sessionID string) {
			defer wg.Done()
			if *startStagger > 0 {
				time.Sleep(time.Duration(idx) * *startStagger)
			}
			safe := sessionID
			if len(safe) > 12 {
				safe = safe[:12]
			}
			outPath := filepath.Join(*outDir, fmt.Sprintf("%02d-%s.log", idx, safe))
			err := runSession(context.Background(), client, sessionID, outPath, *handshakeTimeout, *replyTimeout, *skipInput)
			if err != nil {
				atomic.AddInt32(&failCount, 1)
				fmt.Fprintf(os.Stderr, "[session %s] FAIL: %v\n", sessionID, err)
				return
			}
			atomic.AddInt32(&okCount, 1)
			fmt.Printf("[session %s] OK — log %s\n", sessionID, outPath)
		}(i, sid)
	}

	wg.Wait()
	fmt.Printf("\n完成: 成功 %d / 失败 %d / 总计 %d\n", okCount, failCount, len(sessionIDs))
	if failCount > 0 {
		os.Exit(1)
	}
}

func runSession(
	ctx context.Context,
	client *wsdk.Client,
	sessionID, outPath string,
	handshakeTimeout, replyTimeout time.Duration,
	skipInput bool,
) error {
	f, err := os.Create(outPath)
	if err != nil {
		return err
	}
	defer f.Close()

	logLine := func(msg string) {
		_, _ = fmt.Fprintf(f, "[%s] %s\n", time.Now().Format(time.RFC3339Nano), msg)
	}

	logLine("UPSTREAM DialSession session_id=" + sessionID)

	conn, err := client.DialSession(ctx, sessionID)
	if err != nil {
		return fmt.Errorf("DialSession: %w", err)
	}
	defer conn.Close()

	hctx, cancel := context.WithTimeout(ctx, handshakeTimeout)
	if err := waitUpstreamHandshake(hctx, conn, logLine); err != nil {
		cancel()
		return fmt.Errorf("handshake: %w", err)
	}
	cancel()
	logLine("HANDSHAKE_OK")

	if skipInput {
		_ = conn.WriteMessage(websocket.CloseMessage, websocket.FormatCloseMessage(websocket.CloseNormalClosure, ""))
		return nil
	}

	short := sessionID
	if len(short) > 8 {
		short = short[:8]
	}
	content := fmt.Sprintf("并发探针 #%s 随机消息: %d", short, time.Now().UnixNano())
	input := map[string]any{
		"type":        "input",
		"id":          sessionID,
		"content":     content,
		"attachments": []string{},
	}
	raw, _ := json.Marshal(input)
	if err := conn.WriteMessage(websocket.TextMessage, raw); err != nil {
		return fmt.Errorf("write input: %w", err)
	}
	logLine("SENT_INPUT " + string(raw))

	rctx, rcancel := context.WithTimeout(ctx, replyTimeout)
	defer rcancel()
	if err := waitAssistantReply(rctx, conn, logLine); err != nil {
		return fmt.Errorf("reply: %w", err)
	}
	logLine("REPLY_OK")
	_ = conn.WriteMessage(websocket.CloseMessage, websocket.FormatCloseMessage(websocket.CloseNormalClosure, ""))
	return nil
}

func waitUpstreamHandshake(ctx context.Context, conn *websocket.Conn, logLine func(string)) error {
	deadline, ok := ctx.Deadline()
	if !ok {
		deadline = time.Now().Add(90 * time.Second)
	}
	var sawUpdateWithID bool
	for {
		if err := ctx.Err(); err != nil {
			return err
		}
		rem := time.Until(deadline)
		if rem <= 0 {
			return errors.New("handshake timeout")
		}
		_ = conn.SetReadDeadline(time.Now().Add(rem))
		_, msg, err := conn.ReadMessage()
		if err != nil {
			return fmt.Errorf("read: %w", err)
		}
		logLine("RECV " + truncateForLog(string(msg), 8000))

		var frame map[string]any
		if err := json.Unmarshal(msg, &frame); err != nil {
			continue
		}
		t := strings.ToLower(fmt.Sprint(frame["type"]))
		if t == "error" {
			return fmt.Errorf("upstream error: %v", frame["error"])
		}
		if t == "update" {
			if inferUpstreamSessionID(frame) != "" {
				sawUpdateWithID = true
			}
			continue
		}
		if t == "status" {
			st := strings.ToLower(fmt.Sprint(frame["status"]))
			if sawUpdateWithID && terminalStatus(st) {
				return nil
			}
		}
	}
}

func waitAssistantReply(ctx context.Context, conn *websocket.Conn, logLine func(string)) error {
	deadline, ok := ctx.Deadline()
	if !ok {
		deadline = time.Now().Add(120 * time.Second)
	}
	for {
		if err := ctx.Err(); err != nil {
			return err
		}
		rem := time.Until(deadline)
		if rem <= 0 {
			return errors.New("timeout waiting for assistant reply")
		}
		_ = conn.SetReadDeadline(time.Now().Add(rem))
		_, msg, err := conn.ReadMessage()
		if err != nil {
			return fmt.Errorf("read: %w", err)
		}
		logLine("RECV " + truncateForLog(string(msg), 8000))

		var frame map[string]any
		if err := json.Unmarshal(msg, &frame); err != nil {
			continue
		}
		t := strings.ToLower(fmt.Sprint(frame["type"]))
		if t == "error" {
			return fmt.Errorf("upstream error: %v", frame["error"])
		}
		if t == "update" && updateHasAssistantVisibleText(frame) {
			return nil
		}
	}
}

func updateHasAssistantVisibleText(frame map[string]any) bool {
	msgs, ok := frame["messages"].([]any)
	if !ok {
		return false
	}
	for _, raw := range msgs {
		m, ok := raw.(map[string]any)
		if !ok {
			continue
		}
		kind, _ := m["kind"].(string)
		if kind == "from_user" || kind == "reasoning" || kind == "internal_thought" {
			continue
		}
		parts, ok := m["message_parts"].([]any)
		if !ok {
			continue
		}
		for _, pr := range parts {
			p, ok := pr.(map[string]any)
			if !ok {
				continue
			}
			if fmt.Sprint(p["type"]) != "text" {
				continue
			}
			if s, ok := p["content"].(string); ok && strings.TrimSpace(s) != "" {
				return true
			}
		}
	}
	return false
}

func inferUpstreamSessionID(frame map[string]any) string {
	if state, ok := frame["state"].(map[string]any); ok {
		for _, key := range []string{"id", "session_id", "agent_id", "run_id"} {
			if id := sanitizeSessionID(fmt.Sprint(state[key])); id != "" {
				return id
			}
		}
	}
	if sd, ok := frame["state_delta"].(map[string]any); ok {
		for _, key := range []string{"id", "session_id", "agent_id", "run_id"} {
			if id := sanitizeSessionID(fmt.Sprint(sd[key])); id != "" {
				return id
			}
		}
	}
	for _, key := range []string{"session_id", "agent_id", "run_id", "agentId", "runId"} {
		if id := sanitizeSessionID(fmt.Sprint(frame[key])); id != "" {
			return id
		}
	}
	if id := sanitizeSessionID(fmt.Sprint(frame["id"])); id != "" {
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

func terminalStatus(st string) bool {
	switch strings.ToLower(strings.TrimSpace(st)) {
	case "idle", "ready", "normal", "paused", "running", "busy", "waiting", "stopped", "completed", "done":
		return true
	default:
		return false
	}
}

func truncateForLog(s string, max int) string {
	if len(s) <= max {
		return s
	}
	return s[:max] + fmt.Sprintf("…(%d bytes total)", len(s))
}
