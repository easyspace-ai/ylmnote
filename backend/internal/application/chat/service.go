package chat

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"log/slog"
	"mime"
	"net/http"
	neturl "net/url"
	"path/filepath"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/easyspace-ai/ylmnote/internal/domain/project"
	"github.com/easyspace-ai/ylmnote/internal/domain/user"
	sdkclient "github.com/easyspace-ai/ylmnote/internal/infrastructure/ai/gateway/client"
	sdktypes "github.com/easyspace-ai/ylmnote/internal/infrastructure/ai/gateway/types"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

// Service 对话应用服务
type Service struct {
	projectRepo     project.ProjectRepository
	sessionRepo     project.SessionRepository
	messageRepo     project.MessageRepository
	resourceRepo    project.ResourceRepository
	userRepo        user.Repository
	chatCreditCost  int
	sdkClient       *sdkclient.Client
	upstreamBaseURL string
	upstreamAPIKey  string
	httpClient      *http.Client
	sdkDebug        bool
}

type UpstreamSyncConfig struct {
	BaseURL       string
	ServiceAPIKey string
	Debug         bool
}

var (
	ErrUpstreamSessionUnbound  = errors.New("upstream session id is not bound yet")
	ErrUpstreamSessionConflict = errors.New("session upstream id conflict")
	ErrUpstreamStopUnavailable = errors.New("upstream stop is not available")
)

func NewService(
	projectRepo project.ProjectRepository,
	sessionRepo project.SessionRepository,
	messageRepo project.MessageRepository,
	resourceRepo project.ResourceRepository,
	userRepo user.Repository,
	chatCreditCost int,
	sdkClient *sdkclient.Client,
	syncCfg UpstreamSyncConfig,
) *Service {
	baseURL := strings.TrimRight(strings.TrimSpace(syncCfg.BaseURL), "/")
	return &Service{
		projectRepo:     projectRepo,
		sessionRepo:     sessionRepo,
		messageRepo:     messageRepo,
		resourceRepo:    resourceRepo,
		userRepo:        userRepo,
		chatCreditCost:  chatCreditCost,
		sdkClient:       sdkClient,
		upstreamBaseURL: baseURL,
		upstreamAPIKey:  strings.TrimSpace(syncCfg.ServiceAPIKey),
		httpClient:      &http.Client{Timeout: 20 * time.Second},
		sdkDebug:        syncCfg.Debug,
	}
}

// isRepoNotFound 兼容 GORM 原生错误与 persistence 层返回的 "not found" 哨兵。
func isRepoNotFound(err error) bool {
	if err == nil {
		return false
	}
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return true
	}
	return strings.TrimSpace(err.Error()) == "not found"
}

func (s *Service) preflightChatCredits(userID string) error {
	if s.chatCreditCost <= 0 || s.userRepo == nil {
		return nil
	}
	u, err := s.userRepo.GetByID(userID)
	if err != nil {
		if isRepoNotFound(err) {
			return fmt.Errorf("登录状态异常，请重新登录")
		}
		return err
	}
	if u.CreditsBalance < s.chatCreditCost {
		return user.ErrInsufficientCredits
	}
	return nil
}

func (s *Service) chargeAfterSuccessfulChat(userID, projectID, assistantMsgID string, model *string) {
	if s.chatCreditCost <= 0 || s.userRepo == nil {
		return
	}
	pid := projectID
	mid := assistantMsgID
	if err := s.userRepo.ChargeCredits(userID, s.chatCreditCost, "chat_completion", &pid, &mid, model); err != nil {
		slog.Error("chat_charge_credits_failed", slog.String("user_id", userID), slog.Any("err", err))
	}
}

func (s *Service) sdkLogf(format string, args ...any) {
	if !s.sdkDebug {
		return
	}
	log.Printf("[sdk-upstream] "+format, args...)
}

type ResourceRefInput struct {
	ID   string `json:"id"`
	Name string `json:"name,omitempty"`
	Type string `json:"type,omitempty"`
}

// ChatInput 对话入参
type ChatInput struct {
	Message      string
	ProjectID    *string // 必填，会话归属项目
	SessionID    *string // 可选，不传则新建会话
	SkillID      *string
	Attachments  map[string]interface{}
	ResourceRefs []ResourceRefInput
	Model        *string
}

// ChatResult 对话结果（返回助手消息）
type ChatResult struct {
	ID        string
	ProjectID string
	SessionID string
	Role      string
	Content   string
	SkillID   *string
	CreatedAt time.Time
}

// Chat 必须传入 project_id；可选 session_id。若无 session 则新建会话。消息归属到会话。
func (s *Service) Chat(ctx context.Context, userID string, in ChatInput) (*ChatResult, error) {
	if err := s.preflightChatCredits(userID); err != nil {
		return nil, err
	}
	projectID, sessionID, upstreamSessionID, err := s.prepareSessionAndSaveUserMessage(ctx, userID, in)
	if err != nil {
		return nil, err
	}
	upstreamSessionID, err = s.activateUpstreamSession(ctx, projectID, sessionID, upstreamSessionID)
	if err != nil {
		return nil, err
	}
	refs, err := s.resolveResourceRefs(projectID, in)
	if err != nil {
		return nil, err
	}
	s.sdkLogf("Chat Send project=%s session=%s upstream=%s model=%q msg_len=%d refs=%d",
		projectID, sessionID, upstreamSessionID, strOrEmpty(in.Model), len(in.Message), len(refs))
	assistantResp, err := s.sdkClient.Send(ctx, sdkclient.ChatRequest{
		SessionID:    upstreamSessionID,
		Model:        strOrEmpty(in.Model),
		UserMessage:  in.Message,
		ResourceRefs: refs,
	})
	if err != nil {
		return nil, mapSDKError(err)
	}
	s.sdkLogf("Chat Send ok project=%s session=%s resp_upstream=%s content_len=%d",
		projectID, sessionID, assistantResp.SessionID, len(assistantResp.Content))
	if err := s.ensureUpstreamSessionBinding(projectID, sessionID, assistantResp.SessionID); err != nil {
		return nil, err
	}
	if assistantResp.HandshakeStateIDMatched {
		if err := s.markSessionUpstreamVerified(projectID, sessionID); err != nil {
			log.Printf("[chat] markSessionUpstreamVerified failed project=%s session=%s err=%v", projectID, sessionID, err)
		}
	}
	if err := s.refreshSessionMetaFromUpstream(ctx, projectID, sessionID); err != nil {
		log.Printf("[chat] refresh session meta failed project=%s session=%s err=%v", projectID, sessionID, err)
	}
	assistantContent := assistantResp.Content

	assistantMsg := &project.Message{
		ID:        uuid.NewString(),
		ProjectID: projectID,
		SessionID: sessionID,
		Role:      "assistant",
		Content:   assistantContent,
		SkillID:   in.SkillID,
		CreatedAt: time.Now().UTC(),
	}
	if err := s.messageRepo.Create(assistantMsg); err != nil {
		return nil, err
	}

	s.chargeAfterSuccessfulChat(userID, projectID, assistantMsg.ID, in.Model)
	s.triggerAsyncSessionBackfill(projectID, sessionID)

	return &ChatResult{
		ID:        assistantMsg.ID,
		ProjectID: projectID,
		SessionID: sessionID,
		Role:      "assistant",
		Content:   assistantContent,
		SkillID:   in.SkillID,
		CreatedAt: assistantMsg.CreatedAt,
	}, nil
}

func (s *Service) Stream(ctx context.Context, userID string, in ChatInput, onEvent func(sdktypes.StreamEvent) error) (*ChatResult, error) {
	if err := s.preflightChatCredits(userID); err != nil {
		return nil, err
	}
	projectID, sessionID, upstreamSessionID, err := s.prepareSessionAndSaveUserMessage(ctx, userID, in)
	if err != nil {
		return nil, err
	}
	upstreamSessionID, err = s.activateUpstreamSession(ctx, projectID, sessionID, upstreamSessionID)
	if err != nil {
		return nil, err
	}
	refs, err := s.resolveResourceRefs(projectID, in)
	if err != nil {
		return nil, err
	}
	s.sdkLogf("Stream start project=%s session=%s upstream=%s model=%q msg_len=%d refs=%d",
		projectID, sessionID, upstreamSessionID, strOrEmpty(in.Model), len(in.Message), len(refs))
	if strings.TrimSpace(upstreamSessionID) == "" {
		log.Printf("[chat] Stream upstream_session_id empty project=%s local_session=%s — yilimsdk will omit WSS {\"id\"} frame until upstream assigns id", projectID, sessionID)
	}
	streamCapture := newStreamCapture()
	assistantDraft := &project.Message{
		ID:        uuid.NewString(),
		ProjectID: projectID,
		SessionID: sessionID,
		Role:      "assistant",
		Content:   "",
		SkillID:   in.SkillID,
		CreatedAt: time.Now().UTC(),
	}
	if err := s.messageRepo.Create(assistantDraft); err != nil {
		return nil, err
	}
	var draftContent strings.Builder
	lastFlushed := ""
	lastFlushAt := time.Now().UTC()
	flushDraft := func(force bool) error {
		current := draftContent.String()
		if current == lastFlushed {
			return nil
		}
		if !force && time.Since(lastFlushAt) < 700*time.Millisecond && len(current)-len(lastFlushed) < 120 {
			return nil
		}
		if _, err := s.messageRepo.UpdateContent(projectID, assistantDraft.ID, current); err != nil {
			return err
		}
		lastFlushed = current
		lastFlushAt = time.Now().UTC()
		return nil
	}
	resp, err := s.sdkClient.Stream(ctx, sdkclient.ChatRequest{
		SessionID:    upstreamSessionID,
		Model:        strOrEmpty(in.Model),
		UserMessage:  in.Message,
		ResourceRefs: refs,
	}, func(evt sdktypes.StreamEvent) error {
		if evt.Type == sdktypes.StreamEventTool {
			streamCapture.consumeToolEvent(evt.Value)
			return nil
		}
		if evt.Type == sdktypes.StreamEventContent && evt.Value != "" {
			draftContent.WriteString(evt.Value)
			if err := flushDraft(false); err != nil {
				return err
			}
		}
		if onEvent == nil {
			return nil
		}
		return onEvent(evt)
	})
	if err != nil {
		_ = flushDraft(true)
		return nil, mapSDKError(err)
	}
	s.sdkLogf("Stream done project=%s session=%s resp_upstream=%s content_len=%d",
		projectID, sessionID, resp.SessionID, len(resp.Content))
	if err := s.ensureUpstreamSessionBinding(projectID, sessionID, resp.SessionID); err != nil {
		return nil, err
	}
	if resp.HandshakeStateIDMatched {
		if err := s.markSessionUpstreamVerified(projectID, sessionID); err != nil {
			log.Printf("[chat-stream] markSessionUpstreamVerified failed project=%s session=%s err=%v", projectID, sessionID, err)
		}
	}
	if err := s.refreshSessionMetaFromUpstream(ctx, projectID, sessionID); err != nil {
		log.Printf("[chat-stream] refresh session meta failed project=%s session=%s err=%v", projectID, sessionID, err)
	}
	finalContent := strings.TrimSpace(resp.Content)
	if finalContent == "" {
		finalContent = strings.TrimSpace(draftContent.String())
	}
	if _, err := s.messageRepo.UpdateContent(projectID, assistantDraft.ID, finalContent); err != nil {
		return nil, err
	}
	if err := s.persistStreamCapture(projectID, sessionID, streamCapture); err != nil {
		log.Printf("[chat-stream] persist stream capture failed project=%s session=%s err=%v", projectID, sessionID, err)
	}
	s.chargeAfterSuccessfulChat(userID, projectID, assistantDraft.ID, in.Model)
	s.triggerAsyncSessionBackfill(projectID, sessionID)
	return &ChatResult{
		ID:        "",
		ProjectID: projectID,
		SessionID: sessionID,
		Role:      "assistant",
		Content:   finalContent,
		SkillID:   in.SkillID,
		CreatedAt: time.Now().UTC(),
	}, nil
}

const maxTitleRunes = 28
const syncStateMessageLimit = 200
const postChatSyncTimeout = 12 * time.Second

func (s *Service) triggerAsyncSessionBackfill(projectID, sessionID string) {
	// 对话完成后由后端异步回填远端 timeline（reasoning/system/tool）。
	// 这样前端切会话或刷新后，历史消息能够与远端对齐。
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), postChatSyncTimeout)
		defer cancel()
		if _, err := s.SyncSessionState(ctx, projectID, sessionID, nil); err != nil {
			log.Printf("[chat] async session backfill failed project=%s session=%s err=%v", projectID, sessionID, err)
		}
	}()
}

// truncateTitle 截取为会话标题，最多 maxRunes 个字符
func truncateTitle(s string, maxRunes int) string {
	s = strings.TrimSpace(s)
	if s == "" {
		return "新对话"
	}
	if utf8.RuneCountInString(s) <= maxRunes {
		return s
	}
	runes := []rune(s)
	return string(runes[:maxRunes]) + "…"
}

// PrepareSessionAndSaveUserMessage 解析/创建会话、保存用户消息，并视情况用首条消息更新会话标题。用于流式接口。
func (s *Service) prepareSessionAndSaveUserMessage(ctx context.Context, userID string, in ChatInput) (projectID, sessionID, upstreamSessionID string, err error) {
	_ = ctx
	if in.ProjectID == nil || *in.ProjectID == "" {
		return "", "", "", fmt.Errorf("project_id is required")
	}
	projectID = *in.ProjectID
	if _, err := s.projectRepo.GetByIDAndUserID(projectID, userID); err != nil {
		if isRepoNotFound(err) {
			return "", "", "", fmt.Errorf("项目不存在或无权访问")
		}
		return "", "", "", err
	}

	titleFromMessage := truncateTitle(in.Message, maxTitleRunes)

	if in.SessionID != nil && *in.SessionID != "" {
		sess, err := s.sessionRepo.GetByIDAndProjectID(*in.SessionID, projectID)
		if err != nil {
			if isRepoNotFound(err) {
				return "", "", "", fmt.Errorf("会话不存在或已删除，请返回项目页刷新后再试")
			}
			return "", "", "", err
		}
		sessionID = *in.SessionID
		if sess.UpstreamSessionID != nil && strings.TrimSpace(*sess.UpstreamSessionID) != "" {
			upstreamSessionID = strings.TrimSpace(*sess.UpstreamSessionID)
		}
		// 若当前标题仍是「新对话」，用首条消息更新
		if sess.Title == "新对话" && strings.TrimSpace(in.Message) != "" {
			sess.Title = titleFromMessage
			sess.UpdatedAt = time.Now().UTC()
			_ = s.sessionRepo.Update(sess)
		}
	} else {
		now := time.Now().UTC()
		localSessionID := uuid.NewString()
		upstreamHint := generateUpstreamSessionID()
		sess := &project.Session{
			ID:                localSessionID,
			ProjectID:         projectID,
			UpstreamSessionID: &upstreamHint,
			UpstreamVerified:  false,
			Title:             titleFromMessage,
			CreatedAt:         now,
			UpdatedAt:         now,
		}
		if err := s.sessionRepo.Create(sess); err != nil {
			return "", "", "", err
		}
		sessionID = sess.ID
		upstreamSessionID = upstreamHint
	}

	userMsg := &project.Message{
		ID:          uuid.NewString(),
		ProjectID:   projectID,
		SessionID:   sessionID,
		Role:        "user",
		Content:     in.Message,
		SkillID:     in.SkillID,
		Attachments: in.Attachments,
		CreatedAt:   time.Now().UTC(),
	}
	if err := s.messageRepo.Create(userMsg); err != nil {
		return "", "", "", err
	}
	return projectID, sessionID, upstreamSessionID, nil
}

func generateUpstreamSessionID() string {
	const alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
	const n = 12
	buf := make([]byte, n)
	if _, err := rand.Read(buf); err != nil {
		fallback := strings.ReplaceAll(uuid.NewString(), "-", "")
		if len(fallback) >= n {
			return fallback[:n]
		}
		return fallback
	}
	for i := range buf {
		buf[i] = alphabet[int(buf[i])%len(alphabet)]
	}
	return string(buf)
}

// SaveAssistantMessage 流式结束后保存助手消息
func (s *Service) SaveAssistantMessage(projectID, sessionID, content string, skillID *string) error {
	_, err := s.sessionRepo.GetByIDAndProjectID(sessionID, projectID)
	if err != nil {
		return err
	}
	m := &project.Message{
		ID:        uuid.NewString(),
		ProjectID: projectID,
		SessionID: sessionID,
		Role:      "assistant",
		Content:   content,
		SkillID:   skillID,
		CreatedAt: time.Now().UTC(),
	}
	return s.messageRepo.Create(m)
}

var resourceRefRegex = regexp.MustCompile(`resource:([a-zA-Z0-9-]+)`)

func (s *Service) resolveResourceRefs(projectID string, in ChatInput) ([]sdktypes.ResourceRef, error) {
	out := make([]sdktypes.ResourceRef, 0, len(in.ResourceRefs))
	seen := map[string]struct{}{}
	for _, ref := range in.ResourceRefs {
		refID := strings.TrimSpace(ref.ID)
		if refID == "" {
			continue
		}
		if _, ok := seen[refID]; ok {
			continue
		}
		loaded, err := s.loadResourceRef(projectID, refID)
		if err != nil {
			// 前端可能仍带着已删除资料、或跨项目残留 id；跳过以免整轮对话失败。
			if isRepoNotFound(err) {
				slog.Warn("chat_skip_missing_resource_ref", slog.String("project_id", projectID), slog.String("resource_id", refID))
				continue
			}
			return nil, err
		}
		out = append(out, loaded)
		seen[refID] = struct{}{}
	}
	if len(out) > 0 {
		return out, nil
	}
	// Backward compatibility: parse resource:id from legacy message text.
	matches := resourceRefRegex.FindAllStringSubmatch(in.Message, -1)
	for _, m := range matches {
		if len(m) < 2 {
			continue
		}
		refID := m[1]
		if _, ok := seen[refID]; ok {
			continue
		}
		loaded, err := s.loadResourceRef(projectID, refID)
		if err != nil {
			continue
		}
		out = append(out, loaded)
		seen[refID] = struct{}{}
	}
	return out, nil
}

func (s *Service) loadResourceRef(projectID, resourceID string) (sdktypes.ResourceRef, error) {
	res, err := s.resourceRepo.GetByID(projectID, resourceID)
	if err != nil {
		return sdktypes.ResourceRef{}, err
	}
	ref := sdktypes.ResourceRef{
		ID:   res.ID,
		Name: res.Name,
		Type: res.Type,
	}
	if res.Content != nil {
		ref.Content = *res.Content
	}
	if res.URL != nil {
		ref.URL = *res.URL
	}
	return ref, nil
}

type streamArtifact struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	Kind    string `json:"kind"`
	Path    string `json:"path,omitempty"`
	Content string `json:"content,omitempty"`
}

type streamTodo struct {
	Text string `json:"text"`
	Done bool   `json:"done"`
}

type streamToolPayload struct {
	Kind      string           `json:"kind"`
	Artifacts []streamArtifact `json:"artifacts,omitempty"`
	Todos     []streamTodo     `json:"todos,omitempty"`
}

type streamCapture struct {
	artifacts map[string]streamArtifact
	todos     []streamTodo
}

func newStreamCapture() *streamCapture {
	return &streamCapture{
		artifacts: map[string]streamArtifact{},
	}
}

func (c *streamCapture) consumeToolEvent(raw string) {
	if strings.TrimSpace(raw) == "" {
		return
	}
	var payload streamToolPayload
	if err := json.Unmarshal([]byte(raw), &payload); err != nil {
		return
	}
	switch payload.Kind {
	case "artifacts":
		for _, a := range payload.Artifacts {
			name := strings.TrimSpace(a.Name)
			if name == "" {
				continue
			}
			id := strings.TrimSpace(a.ID)
			if id == "" {
				id = "artifact::" + name
			}
			c.artifacts[id] = a
		}
	case "todos":
		if len(payload.Todos) > 0 {
			c.todos = payload.Todos
		}
	}
}

func (s *Service) persistStreamCapture(projectID, sessionID string, capture *streamCapture) error {
	if capture == nil {
		return nil
	}
	if err := s.persistArtifacts(projectID, sessionID, capture.artifacts); err != nil {
		return err
	}
	if len(capture.todos) > 0 {
		if err := s.persistTodos(projectID, sessionID, capture.todos); err != nil {
			return err
		}
	}
	return nil
}

func (s *Service) persistArtifacts(projectID, sessionID string, artifacts map[string]streamArtifact) error {
	for key, item := range artifacts {
		resourceID := strings.TrimSpace(key)
		if resourceID == "" {
			resourceID = uuid.NewString()
		}
		name := strings.TrimSpace(item.Name)
		if name == "" {
			continue
		}
		content := strings.TrimSpace(item.Content)
		var contentPtr *string
		if content != "" {
			contentPtr = &content
		}
		path := strings.TrimSpace(item.Path)
		var urlPtr *string
		if resourceID != "" && !strings.HasPrefix(resourceID, "artifact::") {
			url := "source:" + resourceID
			urlPtr = &url
		} else if path != "" {
			url := "w6-file:" + path
			urlPtr = &url
		}
		sid := sessionID
		entity := &project.Resource{
			ID:        resourceID,
			ProjectID: projectID,
			SessionID: &sid,
			Type:      inferArtifactResourceType(name),
			Name:      name,
			Content:   contentPtr,
			URL:       urlPtr,
			CreatedAt: time.Now().UTC(),
		}
		if existing, err := s.resourceRepo.GetByID(projectID, resourceID); err == nil && existing != nil {
			existing.SessionID = &sid
			existing.Type = entity.Type
			existing.Name = entity.Name
			existing.Content = entity.Content
			existing.URL = entity.URL
			if err := s.resourceRepo.Update(existing); err != nil {
				return err
			}
			continue
		}
		if err := s.resourceRepo.Create(entity); err != nil {
			return err
		}
	}
	return nil
}

func (s *Service) persistTodos(projectID, sessionID string, todos []streamTodo) error {
	if len(todos) == 0 {
		return nil
	}
	b, err := json.Marshal(todos)
	if err != nil {
		return err
	}
	content := string(b)
	resourceID := "todo-state::" + sessionID
	sid := sessionID
	entity := &project.Resource{
		ID:        resourceID,
		ProjectID: projectID,
		SessionID: &sid,
		Type:      "todo_state",
		Name:      "会话待办",
		Content:   &content,
		CreatedAt: time.Now().UTC(),
	}
	if existing, err := s.resourceRepo.GetByID(projectID, resourceID); err == nil && existing != nil {
		existing.Content = &content
		existing.SessionID = &sid
		existing.Name = entity.Name
		existing.Type = entity.Type
		return s.resourceRepo.Update(existing)
	}
	return s.resourceRepo.Create(entity)
}

func inferArtifactResourceType(name string) string {
	ext := strings.ToLower(filepath.Ext(name))
	switch ext {
	case ".html", ".htm":
		return "html_page"
	default:
		return "artifact"
	}
}

type SyncSessionStateResult struct {
	ArtifactCount int `json:"artifact_count"`
	TodoCount     int `json:"todo_count"`
}

type upstreamTimelineMessage struct {
	UpstreamID string
	Role       string
	Kind       string
	IsProcess  bool
	Content    string
	CreatedAt  *time.Time
}

func (s *Service) SyncSessionState(ctx context.Context, projectID, sessionID string, upstreamOverride *string) (*SyncSessionStateResult, error) {
	return s.syncSessionStateInternal(ctx, projectID, sessionID, upstreamOverride, false)
}

// SyncSessionStateWithActivation 在同步前先执行一次 upstream 激活（EnsureSession+waitReady），
// 用于“打开会话立即校准远端会话并刷新本地缓存”的场景。
func (s *Service) SyncSessionStateWithActivation(ctx context.Context, projectID, sessionID string, upstreamOverride *string) (*SyncSessionStateResult, error) {
	return s.syncSessionStateInternal(ctx, projectID, sessionID, upstreamOverride, true)
}

func (s *Service) syncSessionStateInternal(ctx context.Context, projectID, sessionID string, upstreamOverride *string, activateUpstream bool) (*SyncSessionStateResult, error) {
	if strings.TrimSpace(s.upstreamBaseURL) == "" || strings.TrimSpace(s.upstreamAPIKey) == "" {
		return &SyncSessionStateResult{}, nil
	}
	sess, err := s.sessionRepo.GetByIDAndProjectID(sessionID, projectID)
	if err != nil {
		return nil, err
	}
	upstreamSessionID := ""
	if sess.UpstreamSessionID != nil {
		upstreamSessionID = strings.TrimSpace(*sess.UpstreamSessionID)
	}
	if upstreamOverride != nil && strings.TrimSpace(*upstreamOverride) != "" {
		override := strings.TrimSpace(*upstreamOverride)
		switch {
		case upstreamSessionID == "":
			upstreamSessionID = override
			sess.UpstreamSessionID = &upstreamSessionID
			sess.UpdatedAt = time.Now().UTC()
			if err := s.sessionRepo.Update(sess); err != nil {
				return nil, err
			}
		case upstreamSessionID != override:
			return nil, fmt.Errorf("%w: expected=%s got=%s", ErrUpstreamSessionConflict, upstreamSessionID, override)
		}
	}
	if upstreamSessionID == "" {
		slog.Info("sync_session_state_skip",
			slog.String("project_id", projectID),
			slog.String("local_session_id", sessionID),
			slog.String("reason", "upstream_unbound"),
		)
		return &SyncSessionStateResult{ArtifactCount: 0, TodoCount: 0}, nil
	}
	if activateUpstream && s.sdkClient != nil {
		activatedID, err := s.activateUpstreamSession(ctx, projectID, sessionID, upstreamSessionID)
		if err != nil {
			return nil, err
		}
		upstreamSessionID = strings.TrimSpace(activatedID)
	}
	if err := s.refreshSessionMetaFromUpstream(ctx, projectID, sessionID); err != nil {
		log.Printf("[chat-sync] refresh session meta failed project=%s session=%s err=%v", projectID, sessionID, err)
	}

	agentDetail, err := s.fetchUpstreamJSON(ctx, fmt.Sprintf("/api/agents/%s", neturl.PathEscape(upstreamSessionID)))
	if err != nil {
		return nil, err
	}
	messagePayload, err := s.fetchUpstreamJSON(ctx, fmt.Sprintf("/api/agents/%s/messages?limit=%d&offset=0", neturl.PathEscape(upstreamSessionID), syncStateMessageLimit))
	if err != nil {
		return nil, err
	}

	artifacts := extractArtifactsFromMessagesPayload(messagePayload)
	s.hydrateArtifactsFromSource(ctx, artifacts)
	todos := extractTodosFromAgentDetail(agentDetail)
	timelineMessages := extractTimelineMessagesFromMessagesPayload(messagePayload)
	if err := s.persistArtifacts(projectID, sessionID, artifacts); err != nil {
		return nil, err
	}
	if len(todos) > 0 {
		if err := s.persistTodos(projectID, sessionID, todos); err != nil {
			return nil, err
		}
	}
	if err := s.persistTimelineMessages(projectID, sessionID, timelineMessages); err != nil {
		return nil, err
	}
	slog.Info("sync_session_state_done",
		slog.String("project_id", projectID),
		slog.String("local_session_id", sessionID),
		slog.String("upstream_session_id", upstreamSessionID),
		slog.Int("artifact_count", len(artifacts)),
		slog.Int("todo_count", len(todos)),
		slog.Int("timeline_frame_count", len(timelineMessages)),
	)
	return &SyncSessionStateResult{
		ArtifactCount: len(artifacts),
		TodoCount:     len(todos),
	}, nil
}

func (s *Service) ListRemoteMessages(ctx context.Context, projectID, sessionID string, skip, limit int) ([]*project.Message, error) {
	if strings.TrimSpace(s.upstreamBaseURL) == "" || strings.TrimSpace(s.upstreamAPIKey) == "" {
		return nil, nil
	}
	if limit <= 0 {
		limit = 20
	}
	if limit > 200 {
		limit = 200
	}
	if skip < 0 {
		skip = 0
	}
	sess, err := s.sessionRepo.GetByIDAndProjectID(sessionID, projectID)
	if err != nil {
		return nil, err
	}
	upstreamSessionID := ""
	if sess.UpstreamSessionID != nil {
		upstreamSessionID = strings.TrimSpace(*sess.UpstreamSessionID)
	}
	if upstreamSessionID == "" {
		return nil, ErrUpstreamSessionUnbound
	}

	fetchLimit := skip + limit
	if fetchLimit < 200 {
		fetchLimit = 200
	}
	if fetchLimit > 5000 {
		fetchLimit = 5000
	}
	messagePayload, err := s.fetchUpstreamJSON(ctx, fmt.Sprintf("/api/agents/%s/messages?limit=%d&offset=0", neturl.PathEscape(upstreamSessionID), fetchLimit))
	if err != nil {
		return nil, err
	}
	timeline := extractTimelineMessagesFromMessagesPayload(messagePayload)
	window := paginateTimelineLatest(timeline, skip, limit)
	out := make([]*project.Message, 0, len(window))
	base := time.Now().UTC().Add(-time.Duration(len(window)) * time.Millisecond)
	for idx, item := range window {
		createdAt := base.Add(time.Duration(idx) * time.Millisecond)
		if item.CreatedAt != nil && !item.CreatedAt.IsZero() {
			createdAt = item.CreatedAt.UTC()
		}
		msgID := item.UpstreamID
		if strings.TrimSpace(msgID) == "" {
			msgID = fmt.Sprintf("remote-%s-%d", sessionID, idx+skip)
		}
		var upstreamID *string
		if strings.TrimSpace(item.UpstreamID) != "" {
			id := strings.TrimSpace(item.UpstreamID)
			upstreamID = &id
		}
		out = append(out, &project.Message{
			ID:         msgID,
			UpstreamID: upstreamID,
			ProjectID:  projectID,
			SessionID:  sessionID,
			Role:       item.Role,
			Content:    item.Content,
			Attachments: map[string]any{
				"upstream_kind": item.Kind,
				"is_process":    item.IsProcess,
			},
			CreatedAt: createdAt,
		})
	}
	return out, nil
}

func (s *Service) hydrateArtifactsFromSource(ctx context.Context, artifacts map[string]streamArtifact) {
	for id, item := range artifacts {
		sourceID := strings.TrimSpace(id)
		if sourceID == "" || strings.HasPrefix(sourceID, "artifact::") {
			continue
		}
		source, err := s.GetSourceFile(ctx, sourceID)
		if err != nil || source == nil {
			continue
		}
		if item.Name == "" && source.FileName != "" {
			item.Name = source.FileName
		}
		if item.Path == "" && source.Path != "" {
			item.Path = source.Path
		}
		if item.Content == "" && isTextualArtifact(item.Name, source.ContentType) {
			item.Content = string(source.Content)
		}
		artifacts[id] = item
	}
}

type SourceFile struct {
	ID          string
	FileName    string
	Path        string
	ContentType string
	Content     []byte
}

func (s *Service) GetSourceFile(ctx context.Context, sourceID string) (*SourceFile, error) {
	sourceID = strings.TrimSpace(sourceID)
	if sourceID == "" {
		return nil, fmt.Errorf("source id is empty")
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, s.upstreamBaseURL+"/api/source/"+neturl.PathEscape(sourceID), nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("x-w6service-api-key", s.upstreamAPIKey)
	resp, err := s.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("upstream status %d for /api/source/%s", resp.StatusCode, sourceID)
	}
	var payload any
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return nil, err
	}
	item := pickSourcePayloadItem(payload)
	if item == nil {
		return nil, fmt.Errorf("source payload not found")
	}
	file := &SourceFile{ID: sourceID}
	if id := strings.TrimSpace(toString(item["id"])); id != "" {
		file.ID = id
	}
	if data, ok := item["data"].(map[string]any); ok {
		file.FileName = strings.TrimSpace(toString(data["filename"]))
		file.Path = strings.TrimSpace(toString(data["path"]))
	}
	contentBytes, err := decodeSourceContent(item["content"])
	if err != nil {
		return nil, err
	}
	file.Content = contentBytes
	ext := strings.ToLower(filepath.Ext(file.FileName))
	file.ContentType = mime.TypeByExtension(ext)
	if file.ContentType == "" && isLikelyUTF8(contentBytes) {
		file.ContentType = "text/plain; charset=utf-8"
	}
	if file.ContentType == "" {
		file.ContentType = "application/octet-stream"
	}
	return file, nil
}

func pickSourcePayloadItem(payload any) map[string]any {
	switch v := payload.(type) {
	case map[string]any:
		return v
	case []any:
		for _, raw := range v {
			if item, ok := raw.(map[string]any); ok {
				return item
			}
		}
	}
	return nil
}

func decodeSourceContent(v any) ([]byte, error) {
	switch val := v.(type) {
	case string:
		return []byte(val), nil
	case []any:
		out := make([]byte, 0, len(val))
		for _, item := range val {
			switch n := item.(type) {
			case float64:
				if n < 0 || n > 255 {
					continue
				}
				out = append(out, byte(int(n)))
			case int:
				if n < 0 || n > 255 {
					continue
				}
				out = append(out, byte(n))
			}
		}
		return out, nil
	case nil:
		return nil, nil
	default:
		return nil, fmt.Errorf("unsupported source content shape")
	}
}

func isLikelyUTF8(data []byte) bool {
	if len(data) == 0 {
		return false
	}
	for _, b := range data {
		if b == 0 {
			return false
		}
	}
	return utf8.Valid(data)
}

func isTextualArtifact(name, contentType string) bool {
	ext := strings.ToLower(filepath.Ext(name))
	switch ext {
	case ".txt", ".md", ".markdown", ".html", ".htm", ".json", ".xml", ".csv", ".js", ".ts", ".tsx", ".jsx", ".css":
		return true
	}
	ct := strings.ToLower(strings.TrimSpace(contentType))
	return strings.HasPrefix(ct, "text/") || strings.Contains(ct, "json") || strings.Contains(ct, "xml")
}

func (s *Service) fetchUpstreamJSON(ctx context.Context, path string) (map[string]any, error) {
	fullURL := s.upstreamBaseURL + path
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, fullURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("x-w6service-api-key", s.upstreamAPIKey)
	resp, err := s.httpClient.Do(req)
	if err != nil {
		log.Printf("[sdk-upstream] GET %s err=%v", path, err)
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		log.Printf("[sdk-upstream] GET %s status=%d", path, resp.StatusCode)
		return nil, fmt.Errorf("upstream status %d for %s", resp.StatusCode, path)
	}
	var out map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		log.Printf("[sdk-upstream] GET %s json decode err=%v", path, err)
		return nil, err
	}
	if s.sdkDebug {
		st := strings.ToLower(strings.TrimSpace(extractUpstreamAgentStatus(out)))
		log.Printf("[sdk-upstream] GET %s ok inferred_status=%q", path, st)
	}
	return out, nil
}

func extractArtifactsFromMessagesPayload(payload map[string]any) map[string]streamArtifact {
	out := map[string]streamArtifact{}
	rawMessages, ok := payload["messages"].([]any)
	if !ok {
		return out
	}
	for _, raw := range rawMessages {
		msg, ok := raw.(map[string]any)
		if !ok {
			continue
		}
		kind := strings.ToLower(strings.TrimSpace(toString(msg["kind"])))
		if kind != "user_facing" {
			continue
		}
		parts, _ := msg["message_parts"].([]any)
		for _, p := range parts {
			part, ok := p.(map[string]any)
			if !ok || strings.ToLower(toString(part["type"])) != "resource" {
				continue
			}
			resource, ok := part["resource"].(map[string]any)
			if !ok {
				continue
			}
			name := ""
			path := ""
			if data, ok := resource["data"].(map[string]any); ok {
				name = strings.TrimSpace(toString(data["filename"]))
				path = strings.TrimSpace(toString(data["path"]))
			}
			if name == "" {
				name = strings.TrimSpace(toString(resource["id"]))
			}
			if name == "" {
				continue
			}
			id := strings.TrimSpace(toString(resource["id"]))
			if id == "" {
				id = "artifact::" + name
			}
			out[id] = streamArtifact{
				ID:   id,
				Name: name,
				Kind: strings.TrimSpace(toString(resource["kind"])),
				Path: path,
			}
		}
	}
	return out
}

func extractTodosFromAgentDetail(payload map[string]any) []streamTodo {
	state, _ := payload["state"].(map[string]any)
	rawTodos, _ := state["todos"].([]any)
	out := make([]streamTodo, 0, len(rawTodos))
	for _, raw := range rawTodos {
		item, ok := raw.(map[string]any)
		if !ok {
			continue
		}
		text := strings.TrimSpace(toString(item["text"]))
		if text == "" {
			continue
		}
		done, _ := item["done"].(bool)
		out = append(out, streamTodo{Text: text, Done: done})
	}
	return out
}

func extractTimelineMessagesFromMessagesPayload(payload map[string]any) []upstreamTimelineMessage {
	rawMessages, ok := payload["messages"].([]any)
	if !ok || len(rawMessages) == 0 {
		return nil
	}
	out := make([]upstreamTimelineMessage, 0, len(rawMessages))
	for _, raw := range rawMessages {
		msg, ok := raw.(map[string]any)
		if !ok {
			continue
		}
		kind, role, include, isProcess := classifyUpstreamKind(msg["kind"])
		if !include || role == "" {
			continue
		}
		content := extractMessageContent(msg)
		if content == "" {
			continue
		}
		upstreamID := strings.TrimSpace(firstNonEmptyString(
			toString(msg["item_id"]),
			toString(msg["id"]),
			toString(msg["message_id"]),
		))
		out = append(out, upstreamTimelineMessage{
			UpstreamID: upstreamID,
			Role:       role,
			Kind:       kind,
			IsProcess:  isProcess,
			Content:    content,
			CreatedAt:  extractMessageCreatedAt(msg),
		})
	}
	return out
}

func paginateTimelineLatest(list []upstreamTimelineMessage, skip, limit int) []upstreamTimelineMessage {
	if len(list) == 0 || limit <= 0 {
		return nil
	}
	if skip < 0 {
		skip = 0
	}
	end := len(list) - skip
	if end <= 0 {
		return nil
	}
	start := end - limit
	if start < 0 {
		start = 0
	}
	if start >= end {
		return nil
	}
	out := make([]upstreamTimelineMessage, end-start)
	copy(out, list[start:end])
	return out
}

func classifyUpstreamKind(v any) (kind, role string, include, isProcess bool) {
	kind = strings.ToLower(strings.TrimSpace(toString(v)))
	switch kind {
	case "from_user":
		return kind, "user", true, false
	case "user_facing":
		return kind, "assistant", true, false
	case "reasoning", "internal_thought", "subliminal_thought":
		return kind, "assistant", true, true
	case "system":
		return kind, "assistant", true, true
	case "episodic_marker":
		// Marker frames are low-signal for UI and can be noisy.
		return kind, "", false, false
	default:
		return kind, "", false, false
	}
}

func extractMessageContent(msg map[string]any) string {
	parts, _ := msg["message_parts"].([]any)
	chunks := make([]string, 0, len(parts))
	for _, rawPart := range parts {
		part, ok := rawPart.(map[string]any)
		if !ok {
			continue
		}
		partType := strings.ToLower(strings.TrimSpace(toString(part["type"])))
		if partType != "" && partType != "text" {
			continue
		}
		text := extractTextValue(part["text"])
		if text == "" {
			text = extractTextValue(part["content"])
		}
		if text == "" {
			text = extractTextValue(part)
		}
		text = strings.TrimSpace(text)
		if text != "" {
			chunks = append(chunks, text)
		}
	}
	if len(chunks) == 0 {
		return strings.TrimSpace(firstNonEmptyString(
			extractTextValue(msg["text"]),
			extractTextValue(msg["content"]),
		))
	}
	return strings.TrimSpace(strings.Join(chunks, "\n"))
}

func extractTextValue(v any) string {
	switch val := v.(type) {
	case string:
		return strings.TrimSpace(val)
	case map[string]any:
		if text := strings.TrimSpace(toString(val["text"])); text != "" {
			return text
		}
		if value := strings.TrimSpace(toString(val["value"])); value != "" {
			return value
		}
		if content := strings.TrimSpace(toString(val["content"])); content != "" {
			return content
		}
	}
	return ""
}

func (s *Service) persistTimelineMessages(projectID, sessionID string, timeline []upstreamTimelineMessage) error {
	if len(timeline) == 0 {
		return nil
	}
	// Use deterministic fallback timestamps to preserve remote order in pagination.
	base := time.Now().UTC().Add(-time.Duration(len(timeline)) * time.Millisecond)
	for idx, item := range timeline {
		content := strings.TrimSpace(item.Content)
		if content == "" || (item.Role != "user" && item.Role != "assistant") {
			continue
		}
		createdAt := base.Add(time.Duration(idx) * time.Millisecond)
		if item.CreatedAt != nil && !item.CreatedAt.IsZero() {
			createdAt = item.CreatedAt.UTC()
		}
		var upstreamID *string
		if strings.TrimSpace(item.UpstreamID) != "" {
			id := strings.TrimSpace(item.UpstreamID)
			upstreamID = &id
		}
		// Backup-only persistence: skip frames without stable upstream id to avoid refresh duplicates.
		if upstreamID == nil {
			continue
		}
		attachments := map[string]interface{}{
			"upstream_kind": item.Kind,
			"is_process":    item.IsProcess,
		}
		if _, err := s.messageRepo.UpsertByUpstreamID(&project.Message{
			ID:          uuid.NewString(),
			UpstreamID:  upstreamID,
			ProjectID:   projectID,
			SessionID:   sessionID,
			Role:        item.Role,
			Content:     content,
			Attachments: attachments,
			CreatedAt:   createdAt,
		}); err != nil {
			return err
		}
	}
	return nil
}

func extractMessageCreatedAt(msg map[string]any) *time.Time {
	candidates := []any{
		msg["created_at"],
		msg["createdAt"],
		msg["created"],
		msg["timestamp"],
		msg["time"],
	}
	for _, candidate := range candidates {
		if ts := parseTimeValue(candidate); ts != nil {
			return ts
		}
	}
	return nil
}

func parseTimeValue(v any) *time.Time {
	switch t := v.(type) {
	case string:
		val := strings.TrimSpace(t)
		if val == "" {
			return nil
		}
		layouts := []string{time.RFC3339Nano, time.RFC3339, "2006-01-02 15:04:05"}
		for _, layout := range layouts {
			if parsed, err := time.Parse(layout, val); err == nil {
				out := parsed.UTC()
				return &out
			}
		}
	case float64:
		if t <= 0 {
			return nil
		}
		sec := int64(t)
		ns := int64((t - float64(sec)) * float64(time.Second))
		out := time.Unix(sec, ns).UTC()
		return &out
	case int64:
		if t <= 0 {
			return nil
		}
		out := time.Unix(t, 0).UTC()
		return &out
	case int:
		if t <= 0 {
			return nil
		}
		out := time.Unix(int64(t), 0).UTC()
		return &out
	}
	return nil
}

func firstNonEmptyString(values ...string) string {
	for _, v := range values {
		if strings.TrimSpace(v) != "" {
			return v
		}
	}
	return ""
}

func strOrEmpty(v *string) string {
	if v == nil {
		return ""
	}
	return *v
}

func mapSDKError(err error) error {
	if err == nil {
		return nil
	}
	var sdkErr *sdktypes.SDKError
	if !errors.As(err, &sdkErr) {
		log.Printf("[sdk-error] non-sdk err=%v", err)
		return err
	}
	log.Printf("[sdk-error] code=%q http_status=%d message=%q cause=%v", sdkErr.Code, sdkErr.StatusCode, sdkErr.Message, sdkErr.Cause)
	return fmt.Errorf("%s", sdkErr.Error())
}

func (s *Service) EnsureProjectBelongsToUser(projectID, userID string) error {
	_, err := s.projectRepo.GetByIDAndUserID(projectID, userID)
	return err
}

func (s *Service) markSessionUpstreamVerified(projectID, sessionID string) error {
	sess, err := s.sessionRepo.GetByIDAndProjectID(sessionID, projectID)
	if err != nil {
		return err
	}
	if sess.UpstreamVerified {
		return nil
	}
	sess.UpstreamVerified = true
	sess.UpdatedAt = time.Now().UTC()
	return s.sessionRepo.Update(sess)
}

func (s *Service) ensureUpstreamSessionBinding(projectID, sessionID, upstreamSessionID string) error {
	upstreamSessionID = strings.TrimSpace(upstreamSessionID)
	if upstreamSessionID == "" {
		return ErrUpstreamSessionUnbound
	}
	sess, err := s.sessionRepo.GetByIDAndProjectID(sessionID, projectID)
	if err != nil {
		return err
	}
	current := ""
	if sess.UpstreamSessionID != nil {
		current = strings.TrimSpace(*sess.UpstreamSessionID)
	}
	switch {
	case current == "":
		sess.UpstreamSessionID = &upstreamSessionID
		sess.UpdatedAt = time.Now().UTC()
		if err := s.sessionRepo.Update(sess); err != nil {
			return err
		}
		slog.Info("upstream_session_binding",
			slog.String("project_id", projectID),
			slog.String("local_session_id", sessionID),
			slog.String("upstream_session_id", upstreamSessionID),
			slog.String("action", "set"),
		)
		return nil
	case current == upstreamSessionID:
		return nil
	default:
		// 库内已有绑定：忽略 SDK 报告的另一条 upstream id（常与 W6 首帧 state 展示不一致），防止每次流式/刷新都改写 sessions.upstream_session_id。
		slog.Warn("upstream_session_binding_ignored_incoming",
			slog.String("project_id", projectID),
			slog.String("local_session_id", sessionID),
			slog.String("kept_upstream_session_id", current),
			slog.String("ignored_incoming_upstream_session_id", upstreamSessionID),
		)
		return nil
	}
}

const upstreamActivateMaxAttempts = 5

func sleepWithContext(ctx context.Context, d time.Duration) error {
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-time.After(d):
		return nil
	}
}

func activateRetryBackoff(attempt int) time.Duration {
	// attempt is 1-based index of the retry (second try => attempt 2); cap spacing.
	if attempt < 2 {
		return 0
	}
	d := time.Duration(200*(attempt-1)) * time.Millisecond
	if d > 2*time.Second {
		d = 2 * time.Second
	}
	return d
}

func (s *Service) activateUpstreamSession(ctx context.Context, projectID, sessionID, upstreamSessionID string) (string, error) {
	upstreamSessionID = strings.TrimSpace(upstreamSessionID)
	if s.sdkClient == nil {
		// Legacy mode or tests without SDK client: use local session id for upstream-less chat.
		if upstreamSessionID == "" {
			return sessionID, nil
		}
		return upstreamSessionID, nil
	}
	var ensuredID string
	var ensureErr error
	var connectRes *sdkclient.SessionConnectResult
	for attempt := 1; attempt <= upstreamActivateMaxAttempts; attempt++ {
		if d := activateRetryBackoff(attempt); d > 0 {
			if err := sleepWithContext(ctx, d); err != nil {
				return "", err
			}
		}
		s.sdkLogf("activate EnsureSession attempt=%d/%d project=%s session=%s hint=%q",
			attempt, upstreamActivateMaxAttempts, projectID, sessionID, upstreamSessionID)
		connectRes, ensureErr = s.sdkClient.EnsureSession(ctx, upstreamSessionID)
		if ensureErr != nil {
			s.sdkLogf("activate EnsureSession err attempt=%d err=%v", attempt, ensureErr)
			if attempt == upstreamActivateMaxAttempts {
				return "", mapSDKError(ensureErr)
			}
			continue
		}
		if connectRes == nil {
			s.sdkLogf("activate EnsureSession nil result attempt=%d", attempt)
			if attempt == upstreamActivateMaxAttempts {
				return "", ErrUpstreamSessionUnbound
			}
			continue
		}
		if upstreamSessionID != "" && !connectRes.HandshakeStateIDMatched {
			s.sdkLogf("activate EnsureSession mismatch attempt=%d hint=%q ensured=%q", attempt, upstreamSessionID, connectRes.SessionID)
			if attempt == upstreamActivateMaxAttempts {
				return "", mapSDKError(&sdktypes.SDKError{
					Code:    sdktypes.ErrProtocol,
					Message: fmt.Sprintf("upstream handshake mismatch for bound session hint=%s got=%s", upstreamSessionID, strings.TrimSpace(connectRes.SessionID)),
				})
			}
			continue
		}
		ensuredID = strings.TrimSpace(connectRes.SessionID)
		if ensuredID == "" {
			s.sdkLogf("activate EnsureSession empty id attempt=%d", attempt)
			if attempt == upstreamActivateMaxAttempts {
				return "", ErrUpstreamSessionUnbound
			}
			continue
		}
		s.sdkLogf("activate EnsureSession ok upstream=%s handshake_matched=%v", ensuredID, connectRes.HandshakeStateIDMatched)
		break
	}
	if err := s.ensureUpstreamSessionBinding(projectID, sessionID, ensuredID); err != nil {
		return "", err
	}
	if connectRes != nil && connectRes.HandshakeStateIDMatched {
		if err := s.markSessionUpstreamVerified(projectID, sessionID); err != nil {
			log.Printf("[chat] markSessionUpstreamVerified (activate) failed project=%s session=%s err=%v", projectID, sessionID, err)
		}
	}
	var waitErr error
	for attempt := 1; attempt <= upstreamActivateMaxAttempts; attempt++ {
		if d := activateRetryBackoff(attempt); d > 0 {
			if err := sleepWithContext(ctx, d); err != nil {
				return "", err
			}
		}
		s.sdkLogf("activate waitReady attempt=%d/%d upstream=%s", attempt, upstreamActivateMaxAttempts, ensuredID)
		waitErr = s.waitUpstreamSessionReady(ctx, ensuredID)
		if waitErr == nil {
			s.sdkLogf("activate waitReady ok upstream=%s", ensuredID)
			return ensuredID, nil
		}
		s.sdkLogf("activate waitReady err attempt=%d err=%v", attempt, waitErr)
		if attempt == upstreamActivateMaxAttempts {
			return "", waitErr
		}
	}
	return "", waitErr
}

func (s *Service) waitUpstreamSessionReady(ctx context.Context, upstreamSessionID string) error {
	upstreamSessionID = strings.TrimSpace(upstreamSessionID)
	if upstreamSessionID == "" {
		return ErrUpstreamSessionUnbound
	}
	if strings.TrimSpace(s.upstreamBaseURL) == "" || strings.TrimSpace(s.upstreamAPIKey) == "" {
		return nil
	}
	waitCtx, cancel := context.WithTimeout(ctx, 8*time.Second)
	defer cancel()
	ticker := time.NewTicker(300 * time.Millisecond)
	defer ticker.Stop()

	lastStatus := ""
	for {
		payload, err := s.fetchUpstreamJSON(waitCtx, fmt.Sprintf("/api/agents/%s", neturl.PathEscape(upstreamSessionID)))
		if err == nil {
			status := strings.ToLower(strings.TrimSpace(extractUpstreamAgentStatus(payload)))
			if status == "" {
				// Unknown payload format: don't block chat on readiness gate.
				return nil
			}
			lastStatus = status
			switch status {
			case "idle", "running", "busy", "ready", "normal":
				return nil
			// 远端 paused / 等待输入 / 已结束：不阻塞激活，避免一直等到超时
			case "paused", "waiting", "stopped", "completed", "done":
				return nil
			}
		}
		select {
		case <-waitCtx.Done():
			if lastStatus != "" {
				return fmt.Errorf("upstream agent not ready (status=%s)", lastStatus)
			}
			return waitCtx.Err()
		case <-ticker.C:
		}
	}
}

func extractUpstreamAgentStatus(payload map[string]any) string {
	if payload == nil {
		return ""
	}
	if status := strings.TrimSpace(toString(payload["status"])); status != "" {
		return status
	}
	if status := strings.TrimSpace(toString(payload["agent_status"])); status != "" {
		return status
	}
	for _, k := range []string{"run_status", "lifecycle", "agent_state", "runState"} {
		if status := strings.TrimSpace(toString(payload[k])); status != "" {
			return status
		}
	}
	if state, _ := payload["state"].(map[string]any); state != nil {
		if status := strings.TrimSpace(toString(state["status"])); status != "" {
			return status
		}
		if status := strings.TrimSpace(toString(state["agent_status"])); status != "" {
			return status
		}
		for _, k := range []string{"run_status", "phase", "lifecycle"} {
			if status := strings.TrimSpace(toString(state[k])); status != "" {
				return status
			}
		}
	}
	if data, _ := payload["data"].(map[string]any); data != nil {
		if status := strings.TrimSpace(toString(data["status"])); status != "" {
			return status
		}
	}
	return ""
}

// UpstreamGateView describes whether the UI should allow composing/sending against the bound upstream session.
type UpstreamGateView struct {
	UpstreamSessionID string `json:"upstream_session_id"`
	Status            string `json:"status"`
	Phase             string `json:"phase"`
	InputLocked       bool   `json:"input_locked"`
	CanStop           bool   `json:"can_stop"`
	Detail            string `json:"detail,omitempty"`
}

// GetUpstreamGate polls upstream agent metadata so the client can disable input while remote is busy or unreachable.
func (s *Service) GetUpstreamGate(ctx context.Context, userID, projectID, sessionID string) (UpstreamGateView, error) {
	var out UpstreamGateView
	if err := s.EnsureProjectBelongsToUser(projectID, userID); err != nil {
		return out, err
	}
	sess, err := s.sessionRepo.GetByIDAndProjectID(sessionID, projectID)
	if err != nil {
		return out, err
	}
	up := ""
	if sess.UpstreamSessionID != nil {
		up = strings.TrimSpace(*sess.UpstreamSessionID)
	}
	out.UpstreamSessionID = up
	if up == "" {
		hasUpstreamCfg := strings.TrimSpace(s.upstreamBaseURL) != "" && strings.TrimSpace(s.upstreamAPIKey) != ""
		switch {
		case !hasUpstreamCfg:
			out.Phase = "ready"
			out.Status = "local"
			out.InputLocked = false
			out.CanStop = false
		case s.sdkClient != nil:
			out.Phase = "unbound"
			out.InputLocked = false
			// No detail: connection runs on first send with server-side retries; avoid noisy UI.
		default:
			out.Phase = "unbound"
			out.InputLocked = true
			out.Detail = "已配置远端但未启用对话 SDK，无法自动分配会话；请配置 SDK 或通过接口绑定 upstream_session_id"
		}
		return out, nil
	}
	if strings.TrimSpace(s.upstreamBaseURL) == "" || strings.TrimSpace(s.upstreamAPIKey) == "" {
		out.Phase = "ready"
		out.Status = "local"
		out.InputLocked = false
		out.CanStop = false
		return out, nil
	}

	payload, err := s.fetchUpstreamJSON(ctx, fmt.Sprintf("/api/agents/%s", neturl.PathEscape(up)))
	if err != nil {
		log.Printf("[sdk-upstream] upstream-gate offline project=%s session=%s upstream=%s err=%v", projectID, sessionID, up, err)
		out.Phase = "offline"
		out.InputLocked = true
		out.Detail = "无法连接远端状态"
		return out, nil
	}

	status := strings.ToLower(strings.TrimSpace(extractUpstreamAgentStatus(payload)))
	out.Status = status
	canSDK := s.sdkClient != nil
	s.sdkLogf("upstream-gate project=%s session=%s upstream=%s status=%q phase_will_resolve", projectID, sessionID, up, status)
	switch status {
	case "":
		out.Phase = "ready"
		out.InputLocked = false
	// 空闲或等待用户侧操作：允许本地继续输入（paused 等勿落入 default 否则无限「请稍候」）
	case "idle", "ready", "normal", "paused", "waiting", "stopped", "completed", "done":
		out.Phase = "ready"
		out.InputLocked = false
	// 与 W6 / OpenAI-compatible Agent 常见状态对齐；未知字符串见 default
	case "running", "busy", "executing", "processing", "generating", "active",
		"in_progress", "working", "streaming", "thinking", "tool_running", "tool_calling":
		out.Phase = "busy"
		out.InputLocked = true
		out.CanStop = canSDK
	default:
		// 上游若返回未列出的状态，仍锁输入但允许 Stop，避免刷新后永无停止入口
		out.Phase = "blocked"
		out.InputLocked = true
		out.CanStop = canSDK
	}
	s.sdkLogf("upstream-gate resolved project=%s session=%s phase=%s input_locked=%v can_stop=%v",
		projectID, sessionID, out.Phase, out.InputLocked, out.CanStop)
	return out, nil
}

// StopUpstreamSession sends a Stop frame on the upstream run WebSocket for the session's bound upstream id.
func (s *Service) StopUpstreamSession(ctx context.Context, userID, projectID, sessionID string) error {
	if err := s.EnsureProjectBelongsToUser(projectID, userID); err != nil {
		return err
	}
	sess, err := s.sessionRepo.GetByIDAndProjectID(sessionID, projectID)
	if err != nil {
		return err
	}
	up := ""
	if sess.UpstreamSessionID != nil {
		up = strings.TrimSpace(*sess.UpstreamSessionID)
	}
	if up == "" {
		return ErrUpstreamSessionUnbound
	}
	if s.sdkClient == nil {
		return ErrUpstreamStopUnavailable
	}
	s.sdkLogf("StopUpstream project=%s session=%s upstream=%s", projectID, sessionID, up)
	if stopErr := s.sdkClient.SendStop(ctx, up); stopErr != nil {
		log.Printf("[sdk-upstream] StopUpstream failed project=%s session=%s upstream=%s err=%v", projectID, sessionID, up, stopErr)
		return stopErr
	}
	s.sdkLogf("StopUpstream ok project=%s session=%s upstream=%s", projectID, sessionID, up)
	return nil
}

func (s *Service) refreshSessionMetaFromUpstream(ctx context.Context, projectID, sessionID string) error {
	sess, err := s.sessionRepo.GetByIDAndProjectID(sessionID, projectID)
	if err != nil {
		return err
	}
	upstreamID := sessionID
	if sess.UpstreamSessionID != nil && strings.TrimSpace(*sess.UpstreamSessionID) != "" {
		upstreamID = strings.TrimSpace(*sess.UpstreamSessionID)
	}
	remoteTitle, err := s.fetchUpstreamSessionTitle(ctx, upstreamID)
	if err != nil {
		return err
	}
	remoteTitle = strings.TrimSpace(remoteTitle)
	changed := false
	if remoteTitle != "" && remoteTitle != sess.Title {
		sess.Title = remoteTitle
		changed = true
	}
	if changed {
		sess.UpdatedAt = time.Now().UTC()
		return s.sessionRepo.Update(sess)
	}
	return nil
}

func (s *Service) fetchUpstreamSessionTitle(ctx context.Context, upstreamSessionID string) (string, error) {
	if strings.TrimSpace(upstreamSessionID) == "" {
		return "", nil
	}
	agentDetail, err := s.fetchUpstreamJSON(ctx, fmt.Sprintf("/api/agents/%s", neturl.PathEscape(upstreamSessionID)))
	if err == nil {
		if title := strings.TrimSpace(toString(agentDetail["title"])); title != "" {
			return title, nil
		}
		if state, _ := agentDetail["state"].(map[string]any); state != nil {
			if title := strings.TrimSpace(toString(state["title"])); title != "" {
				return title, nil
			}
		}
	}

	req, reqErr := http.NewRequestWithContext(ctx, http.MethodGet, s.upstreamBaseURL+"/api/agents", nil)
	if reqErr != nil {
		return "", reqErr
	}
	req.Header.Set("x-w6service-api-key", s.upstreamAPIKey)
	resp, doErr := s.httpClient.Do(req)
	if doErr != nil {
		return "", doErr
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", fmt.Errorf("upstream status %d for /api/agents", resp.StatusCode)
	}
	var payload any
	if decodeErr := json.NewDecoder(resp.Body).Decode(&payload); decodeErr != nil {
		return "", decodeErr
	}
	var agents []any
	switch v := payload.(type) {
	case []any:
		agents = v
	case map[string]any:
		agents, _ = v["agents"].([]any)
	}
	for _, raw := range agents {
		item, ok := raw.(map[string]any)
		if !ok {
			continue
		}
		if strings.TrimSpace(toString(item["id"])) != upstreamSessionID {
			continue
		}
		if title := strings.TrimSpace(toString(item["title"])); title != "" {
			return title, nil
		}
		break
	}
	return "", nil
}

func toString(v any) string {
	s, _ := v.(string)
	return s
}
