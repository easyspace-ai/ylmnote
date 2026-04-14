package main

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/joho/godotenv"
)

type resourceRef struct {
	ID   string `json:"id"`
	Name string `json:"name,omitempty"`
	Type string `json:"type,omitempty"`
}

type chatStreamRequest struct {
	Message      string        `json:"message"`
	ProjectID    string        `json:"project_id"`
	SessionID    string        `json:"session_id,omitempty"`
	Model        string        `json:"model,omitempty"`
	Mode         string        `json:"mode,omitempty"`
	ResourceRefs []resourceRef `json:"resource_refs,omitempty"`
}

type loginResponse struct {
	AccessToken string `json:"access_token"`
	TokenType   string `json:"token_type"`
}

func main() {
	if err := godotenv.Load(); err != nil {
		log.Printf("warning: .env not found or cannot be loaded: %v", err)
	}

	baseURL := envOr("CHAT_TEST_BASE_URL", "http://127.0.0.1:8080")
	projectID := strings.TrimSpace(os.Getenv("CHAT_TEST_PROJECT_ID"))
	if projectID == "" {
		log.Fatal("CHAT_TEST_PROJECT_ID is required")
	}

	message := envOr("CHAT_TEST_MESSAGE", "请先简单自我介绍，再用三点总结这份资料。")
	sessionID := strings.TrimSpace(os.Getenv("CHAT_TEST_SESSION_ID"))
	model := strings.TrimSpace(os.Getenv("CHAT_TEST_MODEL"))
	mode := strings.TrimSpace(os.Getenv("CHAT_TEST_MODE"))
	timeoutSec := envOr("CHAT_TEST_TIMEOUT_SEC", "180")

	timeout, err := time.ParseDuration(timeoutSec + "s")
	if err != nil {
		log.Fatalf("invalid CHAT_TEST_TIMEOUT_SEC: %v", err)
	}

	token := strings.TrimSpace(os.Getenv("CHAT_TEST_TOKEN"))
	if token == "" {
		token, err = loginAndGetToken(baseURL)
		if err != nil {
			log.Fatalf("get auth token failed: %v", err)
		}
	}

	resourceRefs := parseResourceRefs(os.Getenv("CHAT_TEST_RESOURCE_REF_IDS"))

	reqBody := chatStreamRequest{
		Message:      message,
		ProjectID:    projectID,
		SessionID:    sessionID,
		Model:        model,
		Mode:         mode,
		ResourceRefs: resourceRefs,
	}
	if err := streamChat(baseURL, token, reqBody, timeout); err != nil {
		log.Fatalf("stream test failed: %v", err)
	}
}

func streamChat(baseURL, token string, payload chatStreamRequest, timeout time.Duration) error {
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()

	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("marshal request failed: %w", err)
	}

	endpoint := strings.TrimRight(baseURL, "/") + "/api/chat/stream"
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("create request failed: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "text/event-stream")
	req.Header.Set("Authorization", "Bearer "+token)

	client := &http.Client{Timeout: timeout}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		raw, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("bad status %d: %s", resp.StatusCode, strings.TrimSpace(string(raw)))
	}

	fmt.Printf("stream started -> %s\n", endpoint)
	fmt.Printf("project=%s session=%s refs=%d\n", payload.ProjectID, emptyAs(payload.SessionID, "<new>"), len(payload.ResourceRefs))

	start := time.Now()
	scanner := bufio.NewScanner(resp.Body)
	scanner.Buffer(make([]byte, 0, 64*1024), 4*1024*1024)

	var chunkCount int
	var textLen int

	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if !strings.HasPrefix(line, "data:") {
			continue
		}
		data := strings.TrimSpace(strings.TrimPrefix(line, "data:"))
		if data == "" || data == "[DONE]" {
			continue
		}

		chunkCount++
		elapsed := time.Since(start).Truncate(time.Millisecond)

		var evt map[string]any
		if err := json.Unmarshal([]byte(data), &evt); err != nil {
			fmt.Printf("[%s] raw: %s\n", elapsed, data)
			continue
		}
		evtType := toString(evt["type"])
		evtValue := toString(evt["value"])
		if evtType == "content" {
			textLen += len([]rune(evtValue))
			fmt.Printf("[%s] chunk #%d %s: %q\n", elapsed, chunkCount, evtType, evtValue)
		} else {
			fmt.Printf("[%s] chunk #%d %s: %s\n", elapsed, chunkCount, evtType, data)
		}
	}
	if err := scanner.Err(); err != nil {
		return fmt.Errorf("read stream failed: %w", err)
	}

	fmt.Printf("stream finished in %s, chunks=%d, content_runes=%d\n", time.Since(start).Truncate(time.Millisecond), chunkCount, textLen)
	return nil
}

func loginAndGetToken(baseURL string) (string, error) {
	username := strings.TrimSpace(os.Getenv("CHAT_TEST_USERNAME"))
	password := strings.TrimSpace(os.Getenv("CHAT_TEST_PASSWORD"))
	if username == "" || password == "" {
		return "", fmt.Errorf("set CHAT_TEST_TOKEN or both CHAT_TEST_USERNAME/CHAT_TEST_PASSWORD")
	}

	form := url.Values{}
	form.Set("username", username)
	form.Set("password", password)

	endpoint := strings.TrimRight(baseURL, "/") + "/api/auth/login"
	req, err := http.NewRequest(http.MethodPost, endpoint, strings.NewReader(form.Encode()))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := (&http.Client{Timeout: 30 * time.Second}).Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	raw, _ := io.ReadAll(resp.Body)
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", fmt.Errorf("login failed status=%d body=%s", resp.StatusCode, strings.TrimSpace(string(raw)))
	}

	var out loginResponse
	if err := json.Unmarshal(raw, &out); err != nil {
		return "", fmt.Errorf("decode login response failed: %w", err)
	}
	if strings.TrimSpace(out.AccessToken) == "" {
		return "", fmt.Errorf("empty access_token in login response")
	}
	return out.AccessToken, nil
}

func parseResourceRefs(raw string) []resourceRef {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil
	}
	parts := strings.Split(raw, ",")
	out := make([]resourceRef, 0, len(parts))
	for _, p := range parts {
		id := strings.TrimSpace(p)
		if id == "" {
			continue
		}
		out = append(out, resourceRef{ID: id})
	}
	return out
}

func envOr(key, fallback string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return fallback
}

func toString(v any) string {
	s, _ := v.(string)
	return s
}

func emptyAs(v, fallback string) string {
	if strings.TrimSpace(v) == "" {
		return fallback
	}
	return v
}
