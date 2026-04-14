package client

import (
	"context"
	"errors"
	"testing"
	"time"

	"ylmsdk/types"
)

type fakeProvider struct {
	sendCalls int
	sendErrs  []error
	sendResp  *ChatResponse
}

func (f *fakeProvider) EnsureSession(_ context.Context, sessionID string) (string, error) {
	return sessionID, nil
}

func (f *fakeProvider) Send(_ context.Context, _ ChatRequest) (*ChatResponse, error) {
	f.sendCalls++
	if len(f.sendErrs) >= f.sendCalls {
		if err := f.sendErrs[f.sendCalls-1]; err != nil {
			return nil, err
		}
	}
	return f.sendResp, nil
}

func (f *fakeProvider) Stream(_ context.Context, _ ChatRequest, _ func(types.StreamEvent) error) (*ChatResponse, error) {
	return f.sendResp, nil
}

func (f *fakeProvider) Upload(_ context.Context, _ UploadRequest) (*UploadResponse, error) {
	return &UploadResponse{FileID: "f1"}, nil
}

func (f *fakeProvider) SendStop(_ context.Context, _ string) error { return nil }

func TestClientSendRetryable(t *testing.T) {
	provider := &fakeProvider{
		sendErrs: []error{
			&types.SDKError{Code: types.ErrUpstream5xx, Message: "temp"},
			nil,
		},
		sendResp: &ChatResponse{Content: "ok"},
	}
	c := New(provider, RetryConfig{MaxAttempts: 2, BaseDelay: time.Millisecond})
	got, err := c.Send(context.Background(), ChatRequest{UserMessage: "hello"})
	if err != nil {
		t.Fatalf("Send() error = %v", err)
	}
	if got.Content != "ok" {
		t.Fatalf("unexpected content: %q", got.Content)
	}
	if provider.sendCalls != 2 {
		t.Fatalf("expected 2 calls, got %d", provider.sendCalls)
	}
}

func TestClientSendNoRetryForNonRetryable(t *testing.T) {
	provider := &fakeProvider{
		sendErrs: []error{
			&types.SDKError{Code: types.ErrBadRequest, Message: "bad input"},
		},
	}
	c := New(provider, RetryConfig{MaxAttempts: 3, BaseDelay: time.Millisecond})
	_, err := c.Send(context.Background(), ChatRequest{UserMessage: "hello"})
	if err == nil {
		t.Fatalf("expected error")
	}
	if !errors.Is(err, provider.sendErrs[0]) {
		t.Fatalf("expected original error, got %v", err)
	}
	if provider.sendCalls != 1 {
		t.Fatalf("expected 1 call, got %d", provider.sendCalls)
	}
}
