package ai

import (
	"context"
	"log"

	sdkclient "ylmsdk/client"
	sdktypes "ylmsdk/types"
)

type LegacySDKAdapter struct {
	client *Client
}

func NewLegacySDKAdapter(client *Client) *LegacySDKAdapter {
	return &LegacySDKAdapter{client: client}
}

func (a *LegacySDKAdapter) EnsureSession(_ context.Context, sessionID string) (string, error) {
	return sessionID, nil
}

func (a *LegacySDKAdapter) Send(ctx context.Context, req sdkclient.ChatRequest) (*sdkclient.ChatResponse, error) {
	reply, err := a.client.Chat(ctx, req.UserMessage, strPtrOrNil(req.Model))
	if err != nil {
		log.Printf("[sdk-legacy] Chat failed model=%v err=%v", req.Model, err)
		return nil, &sdktypes.SDKError{Code: sdktypes.ErrTransport, Message: "legacy ai client call failed", Cause: err}
	}
	return &sdkclient.ChatResponse{
		SessionID: req.SessionID,
		Content:   reply,
	}, nil
}

func (a *LegacySDKAdapter) Stream(ctx context.Context, req sdkclient.ChatRequest, onEvent func(sdktypes.StreamEvent) error) (*sdkclient.ChatResponse, error) {
	resp, err := a.Send(ctx, req)
	if err != nil {
		return nil, err
	}
	if onEvent != nil {
		if err := onEvent(sdktypes.StreamEvent{Type: sdktypes.StreamEventContent, Value: resp.Content}); err != nil {
			return nil, err
		}
		if err := onEvent(sdktypes.StreamEvent{Type: sdktypes.StreamEventDone}); err != nil {
			return nil, err
		}
	}
	return resp, nil
}

func (a *LegacySDKAdapter) Upload(_ context.Context, _ sdkclient.UploadRequest) (*sdkclient.UploadResponse, error) {
	return nil, &sdktypes.SDKError{
		Code:    sdktypes.ErrNotImplemented,
		Message: "legacy adapter does not support file upload",
	}
}

func (a *LegacySDKAdapter) SendStop(_ context.Context, _ string) error {
	return &sdktypes.SDKError{
		Code:    sdktypes.ErrNotImplemented,
		Message: "legacy adapter does not support upstream stop",
	}
}

func strPtrOrNil(v string) *string {
	if v == "" {
		return nil
	}
	return &v
}
