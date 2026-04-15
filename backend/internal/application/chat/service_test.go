package chat

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/easyspace-ai/ylmnote/internal/domain/project"
	sdkclient "github.com/easyspace-ai/ylmnote/internal/infrastructure/ai/gateway/client"
	sdktypes "github.com/easyspace-ai/ylmnote/internal/infrastructure/ai/gateway/types"
)

type testProjectRepo struct {
	projects map[string]*project.Project
}

func (r *testProjectRepo) Create(p *project.Project) error             { r.projects[p.ID] = p; return nil }
func (r *testProjectRepo) GetByID(id string) (*project.Project, error) { return r.projects[id], nil }
func (r *testProjectRepo) ListByUserID(_ string, _ *string, _, _ int) ([]*project.Project, error) {
	return nil, nil
}
func (r *testProjectRepo) Update(_ *project.Project) error { return nil }
func (r *testProjectRepo) Delete(_, _ string) error        { return nil }
func (r *testProjectRepo) GetByIDAndUserID(id, userID string) (*project.Project, error) {
	p := r.projects[id]
	if p == nil || p.UserID != userID {
		return nil, errNotFound
	}
	return p, nil
}

type testSessionRepo struct {
	sessions map[string]*project.Session
}

func (r *testSessionRepo) Create(s *project.Session) error { r.sessions[s.ID] = s; return nil }
func (r *testSessionRepo) GetByID(id string) (*project.Session, error) {
	if s, ok := r.sessions[id]; ok {
		return s, nil
	}
	return nil, errNotFound
}
func (r *testSessionRepo) ListByProjectID(_ string, _, _ int) ([]*project.Session, error) {
	return nil, nil
}
func (r *testSessionRepo) Update(s *project.Session) error { r.sessions[s.ID] = s; return nil }
func (r *testSessionRepo) Delete(_, _ string) error        { return nil }
func (r *testSessionRepo) GetByIDAndProjectID(id, projectID string) (*project.Session, error) {
	s, ok := r.sessions[id]
	if !ok || s.ProjectID != projectID {
		return nil, errNotFound
	}
	return s, nil
}

type testMessageRepo struct {
	created []*project.Message
}

func (r *testMessageRepo) Create(m *project.Message) error {
	r.created = append(r.created, m)
	return nil
}
func (r *testMessageRepo) UpsertByUpstreamID(m *project.Message) (*project.Message, error) {
	r.created = append(r.created, m)
	return m, nil
}
func (r *testMessageRepo) GetByID(_, _ string) (*project.Message, error) { return nil, nil }
func (r *testMessageRepo) ListByProjectID(_ string, _, _ int) ([]*project.Message, error) {
	return nil, nil
}
func (r *testMessageRepo) ListBySessionID(_ string, _, _ int) ([]*project.Message, error) {
	return nil, nil
}
func (r *testMessageRepo) UpdateContent(_, _, _ string) (*project.Message, error) { return nil, nil }
func (r *testMessageRepo) Delete(_, _ string) error                               { return nil }

type testResourceRepo struct {
	resources map[string]*project.Resource
}

func (r *testResourceRepo) Create(_ *project.Resource) error { return nil }
func (r *testResourceRepo) GetByID(projectID, resourceID string) (*project.Resource, error) {
	res := r.resources[resourceID]
	if res == nil || res.ProjectID != projectID {
		return nil, errNotFound
	}
	return res, nil
}
func (r *testResourceRepo) ListByProjectID(_ string, _ *string) ([]*project.Resource, error) {
	return nil, nil
}
func (r *testResourceRepo) Update(_ *project.Resource) error { return nil }
func (r *testResourceRepo) Delete(_, _ string) error         { return nil }

type testProvider struct {
	lastReq sdkclient.ChatRequest
}

func (p *testProvider) EnsureSession(_ context.Context, sessionID string) (*sdkclient.SessionConnectResult, error) {
	if strings.TrimSpace(sessionID) == "" {
		return &sdkclient.SessionConnectResult{SessionID: "allocated-upstream-id", HandshakeStateIDMatched: true}, nil
	}
	return &sdkclient.SessionConnectResult{SessionID: sessionID, HandshakeStateIDMatched: true}, nil
}

func (p *testProvider) Send(_ context.Context, req sdkclient.ChatRequest) (*sdkclient.ChatResponse, error) {
	p.lastReq = req
	return &sdkclient.ChatResponse{SessionID: req.SessionID, Content: "assistant reply"}, nil
}

func (p *testProvider) Stream(_ context.Context, req sdkclient.ChatRequest, _ func(sdktypes.StreamEvent) error) (*sdkclient.ChatResponse, error) {
	p.lastReq = req
	return &sdkclient.ChatResponse{SessionID: req.SessionID, Content: "assistant reply"}, nil
}

func (p *testProvider) Upload(_ context.Context, _ sdkclient.UploadRequest) (*sdkclient.UploadResponse, error) {
	return &sdkclient.UploadResponse{FileID: "f1"}, nil
}

func (p *testProvider) SendStop(_ context.Context, _ string) error { return nil }

func TestChatInjectsResourceRefs(t *testing.T) {
	now := time.Now().UTC()
	projectRepo := &testProjectRepo{
		projects: map[string]*project.Project{
			"p1": {ID: "p1", UserID: "u1", CreatedAt: now, UpdatedAt: now},
		},
	}
	sessionRepo := &testSessionRepo{sessions: map[string]*project.Session{}}
	messageRepo := &testMessageRepo{}
	resourceRepo := &testResourceRepo{
		resources: map[string]*project.Resource{
			"r1": {ID: "r1", ProjectID: "p1", Name: "doc1", Type: "document", Content: strPtr("hello")},
		},
	}
	provider := &testProvider{}
	sdk := sdkclient.New(provider, sdkclient.RetryConfig{MaxAttempts: 1})
	svc := NewService(projectRepo, sessionRepo, messageRepo, resourceRepo, nil, 0, sdk, UpstreamSyncConfig{})

	projectID := "p1"
	result, err := svc.Chat(context.Background(), "u1", ChatInput{
		Message:   "test message",
		ProjectID: &projectID,
		ResourceRefs: []ResourceRefInput{
			{ID: "r1"},
		},
	})
	if err != nil {
		t.Fatalf("Chat() error = %v", err)
	}
	if result.Content != "assistant reply" {
		t.Fatalf("unexpected chat result: %q", result.Content)
	}
	if len(provider.lastReq.ResourceRefs) != 1 {
		t.Fatalf("expected 1 resource ref, got %d", len(provider.lastReq.ResourceRefs))
	}
	if provider.lastReq.ResourceRefs[0].Content != "hello" {
		t.Fatalf("expected resolved resource content")
	}
}

func TestGetUpstreamGateUnboundWithSDKUnlocksInput(t *testing.T) {
	now := time.Now().UTC()
	projectRepo := &testProjectRepo{
		projects: map[string]*project.Project{
			"p1": {ID: "p1", UserID: "u1", CreatedAt: now, UpdatedAt: now},
		},
	}
	sid := "sess-unbound"
	sessionRepo := &testSessionRepo{sessions: map[string]*project.Session{
		sid: {ID: sid, ProjectID: "p1", Title: "新对话", CreatedAt: now, UpdatedAt: now},
	}}
	messageRepo := &testMessageRepo{}
	resourceRepo := &testResourceRepo{resources: map[string]*project.Resource{}}
	provider := &testProvider{}
	sdk := sdkclient.New(provider, sdkclient.RetryConfig{MaxAttempts: 1})
	svc := NewService(projectRepo, sessionRepo, messageRepo, resourceRepo, nil, 0, sdk, UpstreamSyncConfig{
		BaseURL:       "https://upstream.example",
		ServiceAPIKey: "secret",
	})

	gate, err := svc.GetUpstreamGate(context.Background(), "u1", "p1", sid)
	if err != nil {
		t.Fatalf("GetUpstreamGate: %v", err)
	}
	if gate.InputLocked {
		t.Fatal("expected input unlocked when upstream unbound but SDK is configured")
	}
	if gate.Phase != "unbound" {
		t.Fatalf("expected phase unbound, got %q", gate.Phase)
	}
	if gate.Detail != "" {
		t.Fatalf("expected empty detail for quiet unbound gate, got %q", gate.Detail)
	}
}

func TestSyncSessionStateUnboundReturnsEmpty(t *testing.T) {
	now := time.Now().UTC()
	projectRepo := &testProjectRepo{
		projects: map[string]*project.Project{
			"p1": {ID: "p1", UserID: "u1", CreatedAt: now, UpdatedAt: now},
		},
	}
	sid := "sess-noup"
	sessionRepo := &testSessionRepo{sessions: map[string]*project.Session{
		sid: {ID: sid, ProjectID: "p1", Title: "新对话", CreatedAt: now, UpdatedAt: now},
	}}
	messageRepo := &testMessageRepo{}
	resourceRepo := &testResourceRepo{resources: map[string]*project.Resource{}}
	provider := &testProvider{}
	sdk := sdkclient.New(provider, sdkclient.RetryConfig{MaxAttempts: 1})
	svc := NewService(projectRepo, sessionRepo, messageRepo, resourceRepo, nil, 0, sdk, UpstreamSyncConfig{
		BaseURL:       "https://upstream.example",
		ServiceAPIKey: "secret",
	})

	res, err := svc.SyncSessionState(context.Background(), "p1", sid, nil)
	if err != nil {
		t.Fatalf("SyncSessionState: %v", err)
	}
	if res == nil || res.ArtifactCount != 0 || res.TodoCount != 0 {
		t.Fatalf("unexpected result: %+v", res)
	}
}

func TestChatParsesLegacyResourceReference(t *testing.T) {
	now := time.Now().UTC()
	projectRepo := &testProjectRepo{
		projects: map[string]*project.Project{
			"p1": {ID: "p1", UserID: "u1", CreatedAt: now, UpdatedAt: now},
		},
	}
	sessionRepo := &testSessionRepo{sessions: map[string]*project.Session{}}
	messageRepo := &testMessageRepo{}
	resourceRepo := &testResourceRepo{
		resources: map[string]*project.Resource{
			"r2": {ID: "r2", ProjectID: "p1", Name: "note", Type: "note", Content: strPtr("legacy text")},
		},
	}
	provider := &testProvider{}
	sdk := sdkclient.New(provider, sdkclient.RetryConfig{MaxAttempts: 1})
	svc := NewService(projectRepo, sessionRepo, messageRepo, resourceRepo, nil, 0, sdk, UpstreamSyncConfig{})

	projectID := "p1"
	_, err := svc.Chat(context.Background(), "u1", ChatInput{
		Message:   "please use [ref](resource:r2)",
		ProjectID: &projectID,
	})
	if err != nil {
		t.Fatalf("Chat() error = %v", err)
	}
	if len(provider.lastReq.ResourceRefs) != 1 || provider.lastReq.ResourceRefs[0].ID != "r2" {
		t.Fatalf("legacy ref not resolved: %#v", provider.lastReq.ResourceRefs)
	}
}

var errNotFound = &sdktypes.SDKError{Code: sdktypes.ErrBadRequest, Message: "not found"}

func strPtr(s string) *string { return &s }
