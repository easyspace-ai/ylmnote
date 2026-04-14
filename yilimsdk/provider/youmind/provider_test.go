package youmind

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gorilla/websocket"
	"ylmsdk/client"
	"ylmsdk/types"
)

func TestProviderUploadParsesStringArray(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/upload" {
			t.Fatalf("unexpected upload path %s", r.URL.Path)
		}
		_, _ = w.Write([]byte(`["file_123"]`))
	}))
	defer srv.Close()

	p := New(Config{BaseURL: srv.URL})
	resp, err := p.Upload(context.Background(), client.UploadRequest{
		FileName:    "a.txt",
		ContentType: "text/plain",
		Content:     []byte("hello"),
	})
	if err != nil {
		t.Fatalf("Upload() error = %v", err)
	}
	if resp.FileID != "file_123" {
		t.Fatalf("unexpected file id: %q", resp.FileID)
	}
}

func TestProviderSendViaWSWithAttachments(t *testing.T) {
	upgrader := websocket.Upgrader{}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/ws/run" {
			t.Fatalf("unexpected path %s", r.URL.Path)
		}
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			t.Fatalf("upgrade failed: %v", err)
		}
		defer conn.Close()

		var auth map[string]any
		if err := conn.ReadJSON(&auth); err != nil {
			t.Fatalf("read auth frame failed: %v", err)
		}
		if auth["type"] != "auth" || auth["api_key"] != "k1" {
			t.Fatalf("unexpected auth frame: %#v", auth)
		}

		var input map[string]any
		if err := conn.ReadJSON(&input); err != nil {
			t.Fatalf("read input frame failed: %v", err)
		}
		if input["type"] != "input" || input["content"] != "what is this?" {
			t.Fatalf("unexpected input frame: %#v", input)
		}
		attachments, ok := input["attachments"].([]any)
		if !ok || len(attachments) != 1 || attachments[0] != "file_123" {
			t.Fatalf("unexpected attachments: %#v", input["attachments"])
		}

		_ = conn.WriteJSON(map[string]any{"type": "thinking", "content": "hel"})
		_ = conn.WriteJSON(map[string]any{"type": "thinking", "content": "lo"})
		_ = conn.WriteJSON(map[string]any{"type": "status", "status": "idle"})
	}))
	defer srv.Close()

	p := New(Config{BaseURL: srv.URL, ServiceAPIKey: "k1"})
	resp, err := p.Send(context.Background(), client.ChatRequest{
		UserMessage: "what is this?",
		ResourceRefs: []types.ResourceRef{
			{ID: "file_123", Name: "doc", Content: "content A"},
		},
	})
	if err != nil {
		t.Fatalf("Send() error = %v", err)
	}
	if resp.Content != "hello" {
		t.Fatalf("unexpected content: %q", resp.Content)
	}
}

func TestProviderStreamParsesWSFrames(t *testing.T) {
	upgrader := websocket.Upgrader{}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			t.Fatalf("upgrade failed: %v", err)
		}
		defer conn.Close()

		var sink map[string]any
		_ = conn.ReadJSON(&sink) // auth
		_ = conn.ReadJSON(&sink) // input
		_ = conn.WriteJSON(map[string]any{"type": "thinking", "content": "Hel"})
		_ = conn.WriteJSON(map[string]any{"type": "thinking", "content": "lo"})
		_ = conn.WriteJSON(map[string]any{"type": "status", "status": "idle"})
	}))
	defer srv.Close()

	p := New(Config{BaseURL: srv.URL, ServiceAPIKey: "k1"})
	var parts []string
	resp, err := p.Stream(context.Background(), client.ChatRequest{UserMessage: "ping"}, func(evt types.StreamEvent) error {
		if evt.Type == types.StreamEventContent {
			parts = append(parts, evt.Value)
		}
		return nil
	})
	if err != nil {
		t.Fatalf("Stream() error = %v", err)
	}
	if strings.Join(parts, "") != "Hello" {
		t.Fatalf("unexpected chunks: %#v", parts)
	}
	if resp.Content != "Hello" {
		t.Fatalf("unexpected stream content: %q", resp.Content)
	}
}

func TestProviderStreamParsesUpdateSnapshotAsDelta(t *testing.T) {
	upgrader := websocket.Upgrader{}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			t.Fatalf("upgrade failed: %v", err)
		}
		defer conn.Close()

		var sink map[string]any
		_ = conn.ReadJSON(&sink) // auth
		_ = conn.ReadJSON(&sink) // input

		_ = conn.WriteJSON(map[string]any{
			"type": "update",
			"messages": []map[string]any{
				{"role": "assistant", "content": "你"},
			},
		})
		_ = conn.WriteJSON(map[string]any{
			"type": "update",
			"messages": []map[string]any{
				{"role": "assistant", "content": "你好"},
			},
		})
		_ = conn.WriteJSON(map[string]any{"type": "status", "status": "idle"})
	}))
	defer srv.Close()

	p := New(Config{BaseURL: srv.URL, ServiceAPIKey: "k1"})
	var parts []string
	resp, err := p.Stream(context.Background(), client.ChatRequest{UserMessage: "ping"}, func(evt types.StreamEvent) error {
		if evt.Type == types.StreamEventContent {
			parts = append(parts, evt.Value)
		}
		return nil
	})
	if err != nil {
		t.Fatalf("Stream() error = %v", err)
	}
	if strings.Join(parts, "") != "你好" {
		t.Fatalf("unexpected chunks: %#v", parts)
	}
	if resp.Content != "你好" {
		t.Fatalf("unexpected stream content: %q", resp.Content)
	}
}

func TestProviderStreamReturnsErrorWhenIdleAfterBusyWithoutContent(t *testing.T) {
	upgrader := websocket.Upgrader{}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			t.Fatalf("upgrade failed: %v", err)
		}
		defer conn.Close()

		var sink map[string]any
		_ = conn.ReadJSON(&sink) // auth
		_ = conn.ReadJSON(&sink) // input
		_ = conn.WriteJSON(map[string]any{"type": "status", "status": "busy"})
		_ = conn.WriteJSON(map[string]any{"type": "status", "status": "idle"})
	}))
	defer srv.Close()

	p := New(Config{BaseURL: srv.URL, ServiceAPIKey: "k1"})
	_, err := p.Stream(context.Background(), client.ChatRequest{UserMessage: "ping"}, nil)
	if err == nil {
		t.Fatalf("expected error, got nil")
	}
	var sdkErr *types.SDKError
	if !errors.As(err, &sdkErr) {
		t.Fatalf("expected SDKError, got %T", err)
	}
	if sdkErr.Code != types.ErrProtocol {
		t.Fatalf("unexpected error code: %v", sdkErr.Code)
	}
}

func TestProviderStreamParsesUpdateWithNestedContent(t *testing.T) {
	upgrader := websocket.Upgrader{}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			t.Fatalf("upgrade failed: %v", err)
		}
		defer conn.Close()

		var sink map[string]any
		_ = conn.ReadJSON(&sink) // auth
		_ = conn.ReadJSON(&sink) // input
		_ = conn.WriteJSON(map[string]any{
			"type": "update",
			"messages": []map[string]any{
				{"role": "ai", "content": map[string]any{"text": "你好，"}},
			},
		})
		_ = conn.WriteJSON(map[string]any{
			"type": "update",
			"messages": []map[string]any{
				{"role": "ai", "content": map[string]any{"text": "你好，世界"}},
			},
		})
		_ = conn.WriteJSON(map[string]any{"type": "status", "status": "idle"})
	}))
	defer srv.Close()

	p := New(Config{BaseURL: srv.URL, ServiceAPIKey: "k1"})
	var parts []string
	resp, err := p.Stream(context.Background(), client.ChatRequest{UserMessage: "ping"}, func(evt types.StreamEvent) error {
		if evt.Type == types.StreamEventContent {
			parts = append(parts, evt.Value)
		}
		return nil
	})
	if err != nil {
		t.Fatalf("Stream() error = %v", err)
	}
	if strings.Join(parts, "") != "你好，世界" {
		t.Fatalf("unexpected chunks: %#v", parts)
	}
	if resp.Content != "你好，世界" {
		t.Fatalf("unexpected stream content: %q", resp.Content)
	}
}

func TestProviderStreamParsesUpdateWithUserFacingKind(t *testing.T) {
	upgrader := websocket.Upgrader{}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			t.Fatalf("upgrade failed: %v", err)
		}
		defer conn.Close()

		var sink map[string]any
		_ = conn.ReadJSON(&sink) // auth
		_ = conn.ReadJSON(&sink) // input
		_ = conn.WriteJSON(map[string]any{
			"type": "update",
			"messages": []map[string]any{
				{
					"kind": "user_facing",
					"message_parts": []map[string]any{
						{"type": "text", "content": "你好"},
					},
				},
			},
		})
		_ = conn.WriteJSON(map[string]any{"type": "status", "status": "idle"})
	}))
	defer srv.Close()

	p := New(Config{BaseURL: srv.URL, ServiceAPIKey: "k1"})
	resp, err := p.Stream(context.Background(), client.ChatRequest{UserMessage: "ping"}, nil)
	if err != nil {
		t.Fatalf("Stream() error = %v", err)
	}
	if resp.Content != "你好" {
		t.Fatalf("unexpected stream content: %q", resp.Content)
	}
}

func TestBuildWSURLAppendsSessionIDAsQuery(t *testing.T) {
	p := New(Config{
		BaseURL: "https://w6.hc.infhis.cn",
		WSPath:  "/api/ws/run",
	})
	u, err := p.buildWSURL("sess_123")
	if err != nil {
		t.Fatalf("buildWSURL() error = %v", err)
	}
	if u != "wss://w6.hc.infhis.cn/api/ws/run?id=sess_123" {
		t.Fatalf("unexpected ws url: %s", u)
	}
}

func TestBuildWSURLKeepsExplicitQueryID(t *testing.T) {
	p := New(Config{
		BaseURL: "https://w6.hc.infhis.cn",
		WSPath:  "/api/ws/run?id=agent_fixed",
	})
	u, err := p.buildWSURL("sess_123")
	if err != nil {
		t.Fatalf("buildWSURL() error = %v", err)
	}
	if u != "wss://w6.hc.infhis.cn/api/ws/run?id=agent_fixed" {
		t.Fatalf("unexpected ws url: %s", u)
	}
}

func TestExtractAttachmentIDsFromSDKFileURL(t *testing.T) {
	refs := []types.ResourceRef{
		{ID: "local-resource-uuid-like", URL: "sdk-file:dDuUc7r828SX"},
		{ID: "another-local-id", URL: "sdk-file:hqXgoRB3WAps"},
	}
	got := extractAttachmentIDs(refs)
	if len(got) != 2 {
		t.Fatalf("expected 2 attachment ids, got %d (%#v)", len(got), got)
	}
	if got[0] != "dDuUc7r828SX" || got[1] != "hqXgoRB3WAps" {
		t.Fatalf("unexpected attachment ids: %#v", got)
	}
}
