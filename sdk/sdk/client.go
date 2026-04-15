package sdk

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/gorilla/websocket"
)

const apiKeyHeader = "x-w6service-api-key"

// Config defines upstream gateway configuration for SDK client.
type Config struct {
	BaseURL string
	APIKey  string
	Timeout time.Duration
}

// Client wraps HTTP and WebSocket access to the upstream service.
type Client struct {
	baseHTTP string
	baseWS   string
	apiKey   string
	http     *http.Client
	dialer   websocket.Dialer
}

// Agent describes one upstream session/agent item.
type Agent struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
	SOP         string `json:"sop"`
}

// AgentListResponse is /api/agents response.
type AgentListResponse struct {
	Agents []Agent `json:"agents"`
}

// AgentMessage holds one timeline message frame from upstream.
type AgentMessage struct {
	ID          string      `json:"id,omitempty"`
	Role        string      `json:"role,omitempty"`
	Content     string      `json:"content,omitempty"`
	Kind        string      `json:"kind,omitempty"`
	MessagePart interface{} `json:"message_parts,omitempty"`
}

// AgentMessagesResponse is /api/agents/{id}/messages response.
type AgentMessagesResponse struct {
	Messages []AgentMessage `json:"messages"`
}

// SendInputRequest describes one user input frame.
type SendInputRequest struct {
	Type        string   `json:"type"`
	ID          string   `json:"id"`
	Content     string   `json:"content"`
	Attachments []string `json:"attachments,omitempty"`
}

// NewClient creates a validated SDK client.
func NewClient(cfg Config) (*Client, error) {
	if strings.TrimSpace(cfg.BaseURL) == "" {
		return nil, fmt.Errorf("base url is required")
	}
	if strings.TrimSpace(cfg.APIKey) == "" {
		return nil, fmt.Errorf("api key is required")
	}

	u, err := url.Parse(strings.TrimRight(strings.TrimSpace(cfg.BaseURL), "/"))
	if err != nil {
		return nil, fmt.Errorf("parse base url: %w", err)
	}

	httpBase := *u
	wsBase := *u
	switch u.Scheme {
	case "http":
		wsBase.Scheme = "ws"
	case "https":
		wsBase.Scheme = "wss"
	default:
		return nil, fmt.Errorf("unsupported scheme %q", u.Scheme)
	}

	timeout := cfg.Timeout
	if timeout <= 0 {
		timeout = 15 * time.Second
	}

	return &Client{
		baseHTTP: strings.TrimRight(httpBase.String(), "/"),
		baseWS:   strings.TrimRight(wsBase.String(), "/"),
		apiKey:   strings.TrimSpace(cfg.APIKey),
		http:     &http.Client{Timeout: timeout},
		dialer: websocket.Dialer{
			HandshakeTimeout: 10 * time.Second,
			Proxy:            http.ProxyFromEnvironment,
		},
	}, nil
}

// ListAgents fetches available sessions from upstream.
func (c *Client) ListAgents(ctx context.Context) (AgentListResponse, error) {
	raw, err := c.doRaw(ctx, http.MethodGet, c.baseHTTP+"/api/agents", nil)
	if err != nil {
		return AgentListResponse{}, err
	}

	var wrapped AgentListResponse
	if err := json.Unmarshal(raw, &wrapped); err == nil && wrapped.Agents != nil {
		return wrapped, nil
	}

	var list []Agent
	if err := json.Unmarshal(raw, &list); err == nil {
		return AgentListResponse{Agents: list}, nil
	}

	return AgentListResponse{}, fmt.Errorf("unsupported /api/agents response shape")
}

// AgentMessages fetches timeline/history for one session.
func (c *Client) AgentMessages(ctx context.Context, sessionID string, limit, offset int) (AgentMessagesResponse, error) {
	var out AgentMessagesResponse
	if limit <= 0 {
		limit = 200
	}
	if offset < 0 {
		offset = 0
	}
	u := fmt.Sprintf("%s/api/agents/%s/messages?limit=%d&offset=%d",
		c.baseHTTP, url.PathEscape(strings.TrimSpace(sessionID)), limit, offset)
	err := c.doJSON(ctx, http.MethodGet, u, nil, &out)
	return out, err
}

// DialSession opens upstream websocket and sends initial {"id": "<sessionID>"} frame.
func (c *Client) DialSession(ctx context.Context, sessionID string) (*websocket.Conn, error) {
	endpoint := c.baseWS + "/api/ws/run"
	headers := make(http.Header)
	headers.Set(apiKeyHeader, c.apiKey)

	conn, resp, err := c.dialer.DialContext(ctx, endpoint, headers)
	if err != nil {
		if resp != nil {
			return nil, fmt.Errorf("dial websocket: %w (status=%s)", err, resp.Status)
		}
		return nil, fmt.Errorf("dial websocket: %w", err)
	}

	initFrame := map[string]string{"id": strings.TrimSpace(sessionID)}
	if writeErr := conn.WriteJSON(initFrame); writeErr != nil {
		_ = conn.Close()
		return nil, fmt.Errorf("send init frame: %w", writeErr)
	}
	return conn, nil
}

// SendInput sends one input message to a session through upstream websocket.
func (c *Client) SendInput(ctx context.Context, sessionID, content string, attachments []string) error {
	conn, err := c.DialSession(ctx, sessionID)
	if err != nil {
		return err
	}
	defer conn.Close()

	req := SendInputRequest{
		Type:        "input",
		ID:          strings.TrimSpace(sessionID),
		Content:     content,
		Attachments: attachments,
	}
	if len(req.Attachments) == 0 {
		req.Attachments = []string{}
	}

	if err := conn.WriteJSON(req); err != nil {
		return fmt.Errorf("write input frame: %w", err)
	}
	return nil
}

func (c *Client) doJSON(ctx context.Context, method, endpoint string, body any, out any) error {
	raw, err := c.doRaw(ctx, method, endpoint, body)
	if err != nil {
		return err
	}
	if out == nil {
		return nil
	}
	if err := json.Unmarshal(raw, out); err != nil {
		return fmt.Errorf("decode response: %w", err)
	}
	return nil
}

func (c *Client) doRaw(ctx context.Context, method, endpoint string, body any) ([]byte, error) {
	var reqBodyReader *strings.Reader
	if body == nil {
		reqBodyReader = strings.NewReader("")
	} else {
		raw, err := json.Marshal(body)
		if err != nil {
			return nil, fmt.Errorf("marshal request: %w", err)
		}
		reqBodyReader = strings.NewReader(string(raw))
	}

	req, err := http.NewRequestWithContext(ctx, method, endpoint, reqBodyReader)
	if err != nil {
		return nil, fmt.Errorf("new request: %w", err)
	}
	req.Header.Set(apiKeyHeader, c.apiKey)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("do request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("http status %d", resp.StatusCode)
	}
	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read response body: %w", err)
	}
	return raw, nil
}
