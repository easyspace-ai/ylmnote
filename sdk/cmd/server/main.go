package main

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/gorilla/websocket"

	"ws-chat-tester/sdk"
)

type app struct {
	sdk      *sdk.Client
	upgrader websocket.Upgrader
}

func main() {
	envPath := flag.String("env", ".env", "Path to .env file")
	addr := flag.String("addr", ":8080", "HTTP server address")
	flag.Parse()

	if err := loadDotEnv(*envPath); err != nil {
		log.Fatalf("load .env failed: %v", err)
	}

	client, err := sdk.NewClient(sdk.Config{
		BaseURL: os.Getenv("AI_SDK_BASE_URL"),
		APIKey:  os.Getenv("AI_SDK_SERVICE_API_KEY"),
		Timeout: 15 * time.Second,
	})
	if err != nil {
		log.Fatalf("init sdk failed: %v", err)
	}

	a := &app{
		sdk: client,
		upgrader: websocket.Upgrader{
			CheckOrigin: func(_ *http.Request) bool { return true },
		},
	}

	mux := http.NewServeMux()
	mux.Handle("GET /", http.FileServer(http.Dir("./web")))
	mux.HandleFunc("GET /api/sessions", a.handleSessions)
	mux.HandleFunc("GET /api/sessions/{id}/messages", a.handleSessionMessages)
	mux.HandleFunc("POST /api/sessions/{id}/messages", a.handleSessionSendMessage)
	mux.HandleFunc("GET /api/sessions/{id}/ws", a.handleSessionWS)
	mux.HandleFunc("GET /api/sessions/{id}/sse", a.handleSessionSSE)

	server := &http.Server{
		Addr:        *addr,
		Handler:     withCORS(mux),
		ReadTimeout: 20 * time.Second,
		// SSE is a long-lived stream; non-zero WriteTimeout will kill it.
		WriteTimeout: 0,
	}

	log.Printf("server started at http://localhost%s", *addr)
	log.Printf("open http://localhost%s", *addr)
	if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatalf("server failed: %v", err)
	}
}

func (a *app) handleSessions(w http.ResponseWriter, r *http.Request) {
	resp, err := a.sdk.ListAgents(r.Context())
	if err != nil {
		writeErr(w, http.StatusBadGateway, err)
		return
	}
	writeJSON(w, http.StatusOK, resp)
}

func (a *app) handleSessionMessages(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))
	resp, err := a.sdk.AgentMessages(r.Context(), id, limit, offset)
	if err != nil {
		writeErr(w, http.StatusBadGateway, err)
		return
	}
	writeJSON(w, http.StatusOK, resp)
}

type sendMessageRequest struct {
	Content     string   `json:"content"`
	Attachments []string `json:"attachments"`
}

func (a *app) handleSessionSendMessage(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimSpace(r.PathValue("id"))
	if id == "" {
		writeErr(w, http.StatusBadRequest, fmt.Errorf("missing session id"))
		return
	}

	var req sendMessageRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, fmt.Errorf("invalid json body: %w", err))
		return
	}
	req.Content = strings.TrimSpace(req.Content)
	if req.Content == "" {
		writeErr(w, http.StatusBadRequest, fmt.Errorf("content is required"))
		return
	}
	if req.Attachments == nil {
		req.Attachments = []string{}
	}

	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()

	if err := a.sdk.SendInput(ctx, id, req.Content, req.Attachments); err != nil {
		writeErr(w, http.StatusBadGateway, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"ok":      true,
		"message": "sent",
	})
}

func (a *app) handleSessionWS(w http.ResponseWriter, r *http.Request) {
	sessionID := strings.TrimSpace(r.PathValue("id"))
	if sessionID == "" {
		writeErr(w, http.StatusBadRequest, fmt.Errorf("missing session id"))
		return
	}

	frontendConn, err := a.upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("upgrade frontend ws failed: %v", err)
		return
	}
	defer frontendConn.Close()

	upstreamConn, err := a.sdk.DialSession(r.Context(), sessionID)
	if err != nil {
		_ = frontendConn.WriteJSON(map[string]any{"type": "error", "error": err.Error()})
		return
	}
	defer upstreamConn.Close()

	done := make(chan struct{}, 2)

	go func() {
		defer func() { done <- struct{}{} }()
		for {
			msgType, payload, readErr := upstreamConn.ReadMessage()
			if readErr != nil {
				return
			}
			if writeErr := frontendConn.WriteMessage(msgType, payload); writeErr != nil {
				return
			}
		}
	}()

	go func() {
		defer func() { done <- struct{}{} }()
		for {
			_, payload, readErr := frontendConn.ReadMessage()
			if readErr != nil {
				return
			}
			normalized := normalizeUserPayload(payload, sessionID)
			if writeErr := upstreamConn.WriteJSON(normalized); writeErr != nil {
				return
			}
		}
	}()

	<-done
}

func (a *app) handleSessionSSE(w http.ResponseWriter, r *http.Request) {
	sessionID := strings.TrimSpace(r.PathValue("id"))
	if sessionID == "" {
		writeErr(w, http.StatusBadRequest, fmt.Errorf("missing session id"))
		return
	}

	flusher, ok := w.(http.Flusher)
	if !ok {
		writeErr(w, http.StatusInternalServerError, fmt.Errorf("streaming unsupported"))
		return
	}

	timeoutSeconds, _ := strconv.Atoi(r.URL.Query().Get("timeout"))
	if timeoutSeconds <= 0 {
		timeoutSeconds = 120
	}

	ctx, cancel := context.WithTimeout(r.Context(), time.Duration(timeoutSeconds)*time.Second)
	defer cancel()

	upstreamConn, err := a.sdk.DialSession(ctx, sessionID)
	if err != nil {
		writeErr(w, http.StatusBadGateway, err)
		return
	}
	defer upstreamConn.Close()

	message := strings.TrimSpace(r.URL.Query().Get("message"))
	if message != "" {
		if err := upstreamConn.WriteJSON(map[string]any{
			"type":        "input",
			"id":          sessionID,
			"content":     message,
			"attachments": []string{},
		}); err != nil {
			writeErr(w, http.StatusBadGateway, fmt.Errorf("send input to upstream failed: %w", err))
			return
		}
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")

	writeSSEEvent(w, flusher, "ready", map[string]any{
		"session_id": sessionID,
		"message":    "sse stream established",
	})

	heartbeat := time.NewTicker(20 * time.Second)
	defer heartbeat.Stop()

	for {
		select {
		case <-ctx.Done():
			writeSSEEvent(w, flusher, "end", map[string]any{
				"reason": "context_done",
			})
			return
		case <-heartbeat.C:
			_, _ = fmt.Fprint(w, ": ping\n\n")
			flusher.Flush()
		}

		_ = upstreamConn.SetReadDeadline(time.Now().Add(1 * time.Second))
		_, payload, readErr := upstreamConn.ReadMessage()
		if readErr != nil {
			if ne, ok := readErr.(net.Error); ok && ne.Timeout() {
				continue
			}
			writeSSEEvent(w, flusher, "error", map[string]any{
				"error": readErr.Error(),
			})
			return
		}

		eventName := "message"
		var frame map[string]any
		if err := json.Unmarshal(payload, &frame); err == nil {
			if v, ok := frame["type"].(string); ok && strings.TrimSpace(v) != "" {
				eventName = strings.ToLower(strings.TrimSpace(v))
			}
			writeSSEEvent(w, flusher, eventName, frame)
		} else {
			writeSSEEvent(w, flusher, eventName, map[string]any{
				"raw": string(payload),
			})
		}
	}
}

func normalizeUserPayload(raw []byte, sessionID string) map[string]any {
	in := map[string]any{}
	if err := json.Unmarshal(raw, &in); err != nil {
		return map[string]any{
			"type":    "input",
			"id":      sessionID,
			"content": string(raw),
		}
	}

	if _, ok := in["type"]; !ok {
		in["type"] = "input"
	}
	if _, ok := in["id"]; !ok {
		in["id"] = sessionID
	}
	if _, ok := in["attachments"]; !ok && strings.EqualFold(fmt.Sprint(in["type"]), "input") {
		in["attachments"] = []string{}
	}
	return in
}

func withCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func writeSSEEvent(w http.ResponseWriter, flusher http.Flusher, event string, data any) {
	raw, err := json.Marshal(data)
	if err != nil {
		raw = []byte(`{"error":"marshal event failed"}`)
	}
	_, _ = fmt.Fprintf(w, "event: %s\n", event)
	_, _ = fmt.Fprintf(w, "data: %s\n\n", raw)
	flusher.Flush()
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeErr(w http.ResponseWriter, status int, err error) {
	writeJSON(w, status, map[string]any{
		"error": err.Error(),
	})
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
