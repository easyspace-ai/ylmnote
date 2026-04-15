package types

import (
	"errors"
	"fmt"
)

type ResourceRef struct {
	ID      string `json:"id"`
	Name    string `json:"name,omitempty"`
	Type    string `json:"type,omitempty"`
	Content string `json:"content,omitempty"`
	URL     string `json:"url,omitempty"`
}

type StreamEventType string

const (
	StreamEventContent StreamEventType = "content"
	StreamEventStatus  StreamEventType = "status"
	StreamEventTool    StreamEventType = "tool"
	StreamEventDone    StreamEventType = "done"
	StreamEventError   StreamEventType = "error"
	// StreamEventUpstreamHandshake is emitted after WS handshake.
	StreamEventUpstreamHandshake StreamEventType = "upstream_handshake"
)

type StreamEvent struct {
	Type  StreamEventType `json:"type"`
	Value string          `json:"value,omitempty"`
}

type ErrorCode string

const (
	ErrUnauthorized   ErrorCode = "unauthorized"
	ErrRateLimited    ErrorCode = "rate_limited"
	ErrTimeout        ErrorCode = "timeout"
	ErrUpstream4xx    ErrorCode = "upstream_4xx"
	ErrUpstream5xx    ErrorCode = "upstream_5xx"
	ErrProtocol       ErrorCode = "protocol_error"
	ErrTransport      ErrorCode = "transport_error"
	ErrBadRequest     ErrorCode = "bad_request"
	ErrInternal       ErrorCode = "internal"
	ErrNotImplemented ErrorCode = "not_implemented"
)

type SDKError struct {
	Code       ErrorCode
	Message    string
	StatusCode int
	Cause      error
}

func (e *SDKError) Error() string {
	if e == nil {
		return ""
	}
	if e.Cause == nil {
		return fmt.Sprintf("%s: %s", e.Code, e.Message)
	}
	return fmt.Sprintf("%s: %s: %v", e.Code, e.Message, e.Cause)
}

func (e *SDKError) Unwrap() error {
	if e == nil {
		return nil
	}
	return e.Cause
}

func IsRetryable(err error) bool {
	var sdkErr *SDKError
	if !errors.As(err, &sdkErr) {
		return false
	}
	switch sdkErr.Code {
	case ErrRateLimited, ErrTimeout, ErrUpstream5xx, ErrTransport:
		return true
	default:
		return false
	}
}
