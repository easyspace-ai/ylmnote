package main

import (
	"bufio"
	"context"
	"crypto/tls"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/gorilla/websocket"
	sdkclient "ylmsdk/client"
	"ylmsdk/provider/youmind"
	"ylmsdk/types"
)

type runMode string

const (
	modeRaw  runMode = "raw"
	modeSDK  runMode = "sdk"
	modeBoth runMode = "both"
)

func main() {
	log.SetFlags(0)

	envPath := flag.String("env", defaultBackendEnvPath(), "backend .env file path")
	message := flag.String("message", "总结一下这本书", "user message to send")
	sessionID := flag.String("session", "", "session id (optional; sent as ws ?id=...)")
	timeoutSec := flag.Int("timeout", 0, "timeout in seconds (0 means read from AI_SDK_TIMEOUT_SEC)")
	retryMax := flag.Int("retry", 0, "retry max (0 means read from AI_SDK_RETRY_MAX)")
	baseURLOverride := flag.String("base-url", "", "AI base URL override")
	apiKeyOverride := flag.String("api-key", "", "service api key override")
	wsPath := flag.String("ws-path", "/api/ws/run", "ws path")
	attachmentsFlag := flag.String("attachments", "", "comma separated attachment ids, e.g. file_xxx,src_xxx")
	waitSec := flag.Int("wait", 20, "raw ws read idle window in seconds")
	authWaitMS := flag.Int("auth-wait-ms", 0, "raw mode: wait/read frames for N ms after auth before sending input")
	inputWithStateID := flag.Bool("input-with-state-id", false, "raw mode: include pre-read update.state.id in Input payload")
	skipAuth := flag.Bool("skip-auth", false, "raw mode: skip sending auth frame, only rely on ws header api key")
	run := flag.String("run", string(modeBoth), "run mode: raw|sdk|both")
	flag.Parse()

	cfg, err := loadBackendConfig(*envPath)
	if err != nil {
		log.Fatalf("load backend config failed: %v", err)
	}

	baseURL := firstNonEmpty(*baseURLOverride, cfg["AI_SDK_BASE_URL"], cfg["OPENAI_COMPAT_BASE_URL"])
	apiKey := firstNonEmpty(*apiKeyOverride, cfg["AI_SDK_SERVICE_API_KEY"], cfg["AI_SDK_AUTH_HEADER_VAL"])
	if baseURL == "" {
		log.Fatal("missing AI_SDK_BASE_URL in backend config (or pass -base-url)")
	}
	if apiKey == "" {
		log.Fatal("missing AI_SDK_SERVICE_API_KEY in backend config (or pass -api-key)")
	}

	timeout := time.Duration(firstInt(*timeoutSec, atoi(cfg["AI_SDK_TIMEOUT_SEC"]), 120)) * time.Second
	retry := firstInt(*retryMax, atoi(cfg["AI_SDK_RETRY_MAX"]), 1)
	attachments := parseAttachments(*attachmentsFlag)
	selectedMode := runMode(strings.ToLower(strings.TrimSpace(*run)))
	if selectedMode != modeRaw && selectedMode != modeSDK && selectedMode != modeBoth {
		log.Fatalf("invalid -run mode: %s", *run)
	}

	fmt.Printf("== ws stream test ==\n")
	fmt.Printf("env: %s\n", *envPath)
	fmt.Printf("base_url: %s\n", baseURL)
	sessionLabel := strings.TrimSpace(*sessionID)
	if sessionLabel == "" {
		sessionLabel = "(empty)"
	}
	fmt.Printf("ws_path: %s session: %s\n", *wsPath, sessionLabel)
	fmt.Printf("timeout: %s retry: %d run: %s\n", timeout, retry, selectedMode)
	fmt.Printf("attachments: %v\n\n", attachments)

	if selectedMode == modeRaw || selectedMode == modeBoth {
		fmt.Println("---- RAW WS (official protocol) ----")
		if err := runRawWS(
			baseURL, *wsPath, apiKey, *sessionID, *message, attachments,
			time.Duration(*waitSec)*time.Second, time.Duration(*authWaitMS)*time.Millisecond, *inputWithStateID, *skipAuth,
		); err != nil {
			log.Printf("raw ws failed: %v", err)
		}
		fmt.Println()
	}

	if selectedMode == modeSDK || selectedMode == modeBoth {
		fmt.Println("---- SDK Stream ----")
		if err := runSDKStream(baseURL, apiKey, timeout, retry, *sessionID, *message, attachments); err != nil {
			log.Printf("sdk stream failed: %v", err)
		}
	}
}

func runRawWS(baseURL, wsPath, apiKey, sessionID, message string, attachments []string, wait time.Duration, authWait time.Duration, inputWithStateID bool, skipAuth bool) error {
	wsURL, origin, err := buildWSConnectURL(baseURL, wsPath, sessionID)
	if err != nil {
		return err
	}

	dialer := websocket.Dialer{
		TLSClientConfig:   &tls.Config{MinVersion: tls.VersionTLS12},
		EnableCompression: false,
		HandshakeTimeout:  15 * time.Second,
	}
	hdr := http.Header{}
	hdr.Set("Origin", origin)
	hdr.Set("Host", hostOfURL(baseURL))
	hdr.Set("x-w6service-api-key", apiKey)
	hdr.Set("User-Agent", "ylmsdk-ws-stream-test/1")

	fmt.Printf("dial: %s\n", wsURL)
	conn, resp, err := dialer.Dial(wsURL, hdr)
	if err != nil {
		if resp != nil {
			b, _ := io.ReadAll(io.LimitReader(resp.Body, 800))
			_ = resp.Body.Close()
			return fmt.Errorf("dial failed: %v (%s) body=%q", err, resp.Status, strings.TrimSpace(string(b)))
		}
		return fmt.Errorf("dial failed: %w", err)
	}
	defer conn.Close()
	fmt.Println("connected (101)")

	if !skipAuth {
		authFrame := map[string]any{"type": "auth", "api_key": apiKey}
		if err := conn.WriteJSON(authFrame); err != nil {
			return fmt.Errorf("write auth failed: %w", err)
		}
		fmt.Println("-> auth")
	} else {
		fmt.Println("-> auth (skipped)")
	}
	inputFrameID := ""
	if authWait > 0 {
		fmt.Printf("auth wait/read: %s\n", authWait)
		end := time.Now().Add(authWait)
		stateID := ""
		for {
			remain := time.Until(end)
			if remain <= 0 {
				break
			}
			_ = conn.SetReadDeadline(time.Now().Add(remain))
			_, msg, err := conn.ReadMessage()
			if err != nil {
				// timeout in pre-read window is expected.
				break
			}
			s := string(msg)
			if len(s) > 1200 {
				s = s[:1200] + "..."
			}
			fmt.Printf("<- pre %s\n", s)
			var frame map[string]any
			if err := json.Unmarshal(msg, &frame); err == nil {
				if st, ok := frame["state"].(map[string]any); ok {
					if id, ok := st["id"].(string); ok && strings.TrimSpace(id) != "" {
						stateID = id
					}
				}
			}
		}
		if inputWithStateID && stateID != "" {
			fmt.Printf("pre state.id=%s\n", stateID)
			inputFrameID = stateID
		}
	}

	inputFrame := map[string]any{
		"type":        "input",
		"content":     message,
		"attachments": attachments,
	}
	if inputFrameID != "" {
		inputFrame["id"] = inputFrameID
	}
	if err := conn.WriteJSON(inputFrame); err != nil {
		return fmt.Errorf("write input failed: %w", err)
	}
	fmt.Println("-> input")

	deadline := time.Now().Add(wait)
	frameCount := 0
	for {
		_ = conn.SetReadDeadline(deadline)
		_, msg, err := conn.ReadMessage()
		if err != nil {
			fmt.Printf("read end: %v\n", err)
			break
		}
		frameCount++
		s := string(msg)
		if len(s) > 1200 {
			s = s[:1200] + "..."
		}
		fmt.Printf("<- frame %02d %s\n", frameCount, s)
		deadline = time.Now().Add(wait)
	}
	return nil
}

func runSDKStream(baseURL, apiKey string, timeout time.Duration, retry int, sessionID, message string, attachments []string) error {
	provider := youmind.New(youmind.Config{
		BaseURL:       baseURL,
		ServiceAPIKey: apiKey,
		Timeout:       timeout,
	})
	cli := sdkclient.New(provider, sdkclient.RetryConfig{
		MaxAttempts: retry,
		BaseDelay:   300 * time.Millisecond,
	})

	refs := make([]types.ResourceRef, 0, len(attachments))
	for _, id := range attachments {
		refs = append(refs, types.ResourceRef{ID: id})
	}

	ctx, cancel := context.WithTimeout(context.Background(), timeout+20*time.Second)
	defer cancel()

	start := time.Now()
	chunkCount := 0
	resp, err := cli.Stream(ctx, sdkclient.ChatRequest{
		SessionID:    sessionID,
		UserMessage:  message,
		ResourceRefs: refs,
	}, func(evt types.StreamEvent) error {
		switch evt.Type {
		case types.StreamEventContent:
			chunkCount++
			fmt.Printf("[chunk %02d] %s\n", chunkCount, evt.Value)
		case types.StreamEventStatus:
			fmt.Printf("[status] %s\n", evt.Value)
		case types.StreamEventTool:
			fmt.Printf("[tool] %s\n", evt.Value)
		case types.StreamEventError:
			fmt.Printf("[event error] %s\n", evt.Value)
		case types.StreamEventDone:
			fmt.Println("[done]")
		default:
			if evt.Value != "" {
				fmt.Printf("[%s] %s\n", evt.Type, evt.Value)
			} else {
				fmt.Printf("[%s]\n", evt.Type)
			}
		}
		return nil
	})
	if err != nil {
		return fmt.Errorf("stream failed after %s: %w", time.Since(start).Round(time.Millisecond), err)
	}

	fmt.Printf("final elapsed=%s chunks=%d content_len=%d\n", time.Since(start).Round(time.Millisecond), chunkCount, len(resp.Content))
	if resp.Content != "" {
		fmt.Printf("final content:\n%s\n", resp.Content)
	}
	return nil
}

func buildWSConnectURL(baseURL, wsPath, sessionID string) (wsURL, origin string, err error) {
	base, err := url.Parse(strings.TrimSpace(baseURL))
	if err != nil || base.Host == "" {
		return "", "", fmt.Errorf("bad base url: %s", baseURL)
	}
	if base.Scheme == "" {
		base.Scheme = "https"
	}
	origin = base.Scheme + "://" + base.Host

	p := strings.TrimSpace(wsPath)
	if p == "" {
		p = "/api/ws/run"
	}
	if !strings.HasPrefix(p, "/") {
		p = "/" + p
	}
	pathURL, err := url.Parse(p)
	if err != nil {
		return "", "", fmt.Errorf("bad ws path: %s", wsPath)
	}
	q := pathURL.Query()
	if strings.TrimSpace(sessionID) != "" && q.Get("id") == "" {
		q.Set("id", strings.TrimSpace(sessionID))
	}

	scheme := "wss"
	if base.Scheme == "http" || base.Scheme == "ws" {
		scheme = "ws"
	}
	final := &url.URL{
		Scheme:   scheme,
		Host:     base.Host,
		Path:     pathURL.Path,
		RawQuery: q.Encode(),
	}
	return final.String(), origin, nil
}

func hostOfURL(baseURL string) string {
	u, err := url.Parse(strings.TrimSpace(baseURL))
	if err != nil {
		return ""
	}
	return u.Host
}

func parseAttachments(raw string) []string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return []string{}
	}
	parts := strings.Split(raw, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		id := strings.TrimSpace(p)
		if id != "" {
			out = append(out, id)
		}
	}
	return out
}

func defaultBackendEnvPath() string {
	candidates := []string{
		filepath.Join("backend", ".env"),
		filepath.Join("..", "backend", ".env"),
		filepath.Join("..", "..", "backend", ".env"),
	}
	for _, path := range candidates {
		if _, err := os.Stat(path); err == nil {
			return path
		}
	}
	return filepath.Join("..", "..", "backend", ".env")
}

func loadBackendConfig(path string) (map[string]string, error) {
	values := map[string]string{}
	file, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		idx := strings.Index(line, "=")
		if idx <= 0 {
			continue
		}
		key := strings.TrimSpace(line[:idx])
		val := strings.TrimSpace(line[idx+1:])
		values[key] = trimQuotes(val)
	}
	if err := scanner.Err(); err != nil {
		return nil, err
	}

	// Environment variables have higher precedence.
	for key, val := range values {
		if envVal, ok := os.LookupEnv(key); ok && strings.TrimSpace(envVal) != "" {
			values[key] = envVal
			continue
		}
		values[key] = val
	}
	return values, nil
}

func trimQuotes(v string) string {
	if len(v) >= 2 {
		if (v[0] == '"' && v[len(v)-1] == '"') || (v[0] == '\'' && v[len(v)-1] == '\'') {
			return v[1 : len(v)-1]
		}
	}
	return v
}

func firstNonEmpty(values ...string) string {
	for _, v := range values {
		if strings.TrimSpace(v) != "" {
			return strings.TrimSpace(v)
		}
	}
	return ""
}

func atoi(v string) int {
	n, err := strconv.Atoi(strings.TrimSpace(v))
	if err != nil {
		return 0
	}
	return n
}

func firstInt(values ...int) int {
	for _, v := range values {
		if v > 0 {
			return v
		}
	}
	return 0
}
