package client

import (
	"context"
	"errors"
	"time"

	"ylmsdk/types"
)

type ChatRequest struct {
	SessionID    string
	Model        string
	UserMessage  string
	ResourceRefs []types.ResourceRef
}

type ChatResponse struct {
	SessionID string
	Content   string
}

type UploadRequest struct {
	FileName    string
	ContentType string
	Content     []byte
}

type UploadResponse struct {
	FileID      string
	FileName    string
	ContentType string
	Size        int64
	URL         string
}

type Provider interface {
	EnsureSession(ctx context.Context, sessionID string) (string, error)
	Send(ctx context.Context, req ChatRequest) (*ChatResponse, error)
	Stream(ctx context.Context, req ChatRequest, onEvent func(types.StreamEvent) error) (*ChatResponse, error)
	Upload(ctx context.Context, req UploadRequest) (*UploadResponse, error)
	// SendStop asks the upstream run WebSocket to stop the current agent turn (W6: {"type":"Stop"}).
	SendStop(ctx context.Context, sessionID string) error
}

type RetryConfig struct {
	MaxAttempts int
	BaseDelay   time.Duration
}

type Client struct {
	provider Provider
	retry    RetryConfig
}

func New(provider Provider, retry RetryConfig) *Client {
	if retry.MaxAttempts <= 0 {
		retry.MaxAttempts = 1
	}
	if retry.BaseDelay <= 0 {
		retry.BaseDelay = 300 * time.Millisecond
	}
	return &Client{
		provider: provider,
		retry:    retry,
	}
}

func (c *Client) EnsureSession(ctx context.Context, sessionID string) (string, error) {
	return c.provider.EnsureSession(ctx, sessionID)
}

func (c *Client) Send(ctx context.Context, req ChatRequest) (*ChatResponse, error) {
	var lastErr error
	for attempt := 1; attempt <= c.retry.MaxAttempts; attempt++ {
		resp, err := c.provider.Send(ctx, req)
		if err == nil {
			return resp, nil
		}
		lastErr = err
		if !types.IsRetryable(err) || attempt == c.retry.MaxAttempts {
			break
		}
		if err := sleepBackoff(ctx, c.retry.BaseDelay, attempt); err != nil {
			return nil, err
		}
	}
	return nil, lastErr
}

func (c *Client) Stream(ctx context.Context, req ChatRequest, onEvent func(types.StreamEvent) error) (*ChatResponse, error) {
	var lastErr error
	for attempt := 1; attempt <= c.retry.MaxAttempts; attempt++ {
		resp, err := c.provider.Stream(ctx, req, onEvent)
		if err == nil {
			return resp, nil
		}
		lastErr = err
		if !types.IsRetryable(err) || attempt == c.retry.MaxAttempts {
			break
		}
		if err := sleepBackoff(ctx, c.retry.BaseDelay, attempt); err != nil {
			return nil, err
		}
	}
	return nil, lastErr
}

func (c *Client) SendStop(ctx context.Context, sessionID string) error {
	return c.provider.SendStop(ctx, sessionID)
}

func (c *Client) Upload(ctx context.Context, req UploadRequest) (*UploadResponse, error) {
	var lastErr error
	for attempt := 1; attempt <= c.retry.MaxAttempts; attempt++ {
		resp, err := c.provider.Upload(ctx, req)
		if err == nil {
			return resp, nil
		}
		lastErr = err
		if !types.IsRetryable(err) || attempt == c.retry.MaxAttempts {
			break
		}
		if err := sleepBackoff(ctx, c.retry.BaseDelay, attempt); err != nil {
			return nil, err
		}
	}
	return nil, lastErr
}

func sleepBackoff(ctx context.Context, base time.Duration, attempt int) error {
	timer := time.NewTimer(time.Duration(attempt) * base)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-timer.C:
		return nil
	}
}

func IsNotImplemented(err error) bool {
	var sdkErr *types.SDKError
	if !errors.As(err, &sdkErr) {
		return false
	}
	return sdkErr.Code == types.ErrNotImplemented
}
