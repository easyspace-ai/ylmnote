package main

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/gorilla/websocket"
)

const (
	headerAPIKey = "x-w6service-api-key"
)

type inputMessage struct {
	Type        string   `json:"type"`
	ID          string   `json:"id,omitempty"`
	Content     string   `json:"content"`
	Attachments []string `json:"attachments,omitempty"`
}

type sessionInitMessage struct {
	ID string `json:"id"`
}

func main() {
	envPath := flag.String("env", ".env", "Path to .env file")
	testMessage := flag.String("message", "你好，请用一句话介绍你自己。", "Message used for chat test")
	receiveWindow := flag.Duration("receive-window", 1000*time.Second, "How long to wait for server messages after sending")
	flag.Parse()

	if err := loadDotEnv(*envPath); err != nil {
		log.Fatalf("load .env failed: %v", err)
	}

	baseURL := requireEnv("AI_SDK_BASE_URL")
	apiKey := requireEnv("AI_SDK_SERVICE_API_KEY")
	chatID := requireEnv("AI_CHAT_ID")

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	if err := verifyWhoAmI(ctx, baseURL, apiKey); err != nil {
		log.Fatalf("whoami check failed: %v", err)
	}

	if err := runWebSocketChatTest(ctx, baseURL, apiKey, chatID, *testMessage, *receiveWindow); err != nil {
		log.Fatalf("websocket chat test failed: %v", err)
	}
}

func runWebSocketChatTest(ctx context.Context, baseURL, apiKey, chatID, testMessage string, receiveWindow time.Duration) error {
	wsEndpoint, err := websocketEndpoint(baseURL)
	if err != nil {
		return err
	}

	headers := make(http.Header)
	headers.Set(headerAPIKey, apiKey)

	dialer := websocket.Dialer{
		HandshakeTimeout: 10 * time.Second,
		Proxy:            http.ProxyFromEnvironment,
	}

	log.Printf("connecting websocket: %s", wsEndpoint)
	conn, resp, err := dialer.DialContext(ctx, wsEndpoint, headers)
	if err != nil {
		if resp != nil {
			return fmt.Errorf("dial websocket failed: %w (status=%s)", err, resp.Status)
		}
		return fmt.Errorf("dial websocket failed: %w", err)
	}
	defer conn.Close()

	conn.SetReadLimit(2 * 1024 * 1024)
	_ = conn.SetReadDeadline(time.Now().Add(60 * time.Second))
	conn.SetPongHandler(func(string) error {
		return conn.SetReadDeadline(time.Now().Add(60 * time.Second))
	})

	readDone := make(chan error, 1)
	go func() {
		for {
			_, payload, readErr := conn.ReadMessage()
			if readErr != nil {
				readDone <- readErr
				return
			}
			log.Printf("recv: %s", prettyJSON(payload))
		}
	}()

	if err := writeJSON(conn, sessionInitMessage{
		ID: chatID,
	}); err != nil {
		return fmt.Errorf("send AI_CHAT_ID init failed: %w", err)
	}
	log.Printf("sent AI_CHAT_ID init message")

	if err := writeJSON(conn, inputMessage{
		Type:    "input",
		ID:      chatID,
		Content: testMessage,
	}); err != nil {
		return fmt.Errorf("send test message failed: %w", err)
	}
	log.Printf("sent chat test message with id")

	timer := time.NewTimer(receiveWindow)
	defer timer.Stop()

	select {
	case <-ctx.Done():
		return ctx.Err()
		// case <-timer.C:
		// 	log.Printf("receive window elapsed: %s", receiveWindow)
	case readErr := <-readDone:
		return fmt.Errorf("read loop stopped: %w", readErr)
	}

	closeFrame := websocket.FormatCloseMessage(websocket.CloseNormalClosure, "chat test done")
	_ = conn.WriteControl(websocket.CloseMessage, closeFrame, time.Now().Add(2*time.Second))
	return nil
}

func writeJSON(conn *websocket.Conn, v any) error {
	if err := conn.SetWriteDeadline(time.Now().Add(10 * time.Second)); err != nil {
		return err
	}
	return conn.WriteJSON(v)
}

func verifyWhoAmI(ctx context.Context, baseURL, apiKey string) error {
	endpoint := strings.TrimRight(baseURL, "/") + "/api/whoami"

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return err
	}
	req.Header.Set(headerAPIKey, apiKey)

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("status=%d", resp.StatusCode)
	}

	var user map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&user); err != nil {
		return err
	}

	userJSON, _ := json.Marshal(user)
	log.Printf("whoami success: %s", prettyJSON(userJSON))
	return nil
}

func websocketEndpoint(baseURL string) (string, error) {
	u, err := url.Parse(strings.TrimSpace(baseURL))
	if err != nil {
		return "", fmt.Errorf("invalid AI_SDK_BASE_URL: %w", err)
	}

	switch u.Scheme {
	case "http":
		u.Scheme = "ws"
	case "https":
		u.Scheme = "wss"
	default:
		return "", fmt.Errorf("unsupported URL scheme %q", u.Scheme)
	}

	u.Path = strings.TrimRight(u.Path, "/") + "/api/ws/run"
	u.RawQuery = ""
	u.Fragment = ""
	return u.String(), nil
}

func loadDotEnv(path string) error {
	file, err := os.Open(path)
	if err != nil {
		return err
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}

		parts := strings.SplitN(line, "=", 2)
		if len(parts) != 2 {
			continue
		}

		key := strings.TrimSpace(parts[0])
		value := strings.Trim(strings.TrimSpace(parts[1]), `"'`)
		if key != "" {
			_ = os.Setenv(key, value)
		}
	}

	return scanner.Err()
}

func requireEnv(key string) string {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		log.Fatalf("missing required environment variable: %s", key)
	}
	return value
}

func prettyJSON(raw []byte) string {
	var out bytes.Buffer
	if err := json.Indent(&out, raw, "", "  "); err != nil {
		return string(raw)
	}
	return out.String()
}
