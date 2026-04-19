package chat

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"log/slog"
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
	projectRepo    project.ProjectRepository
	sessionRepo    project.SessionRepository
	messageRepo    project.MessageRepository
	resourceRepo   project.ResourceRepository
	userRepo       user.Repository
	chatCreditCost int
	sdkClient      *sdkclient.Client
	sdkDebug       bool
}

func NewService(
	projectRepo project.ProjectRepository,
	sessionRepo project.SessionRepository,
	messageRepo project.MessageRepository,
	resourceRepo project.ResourceRepository,
	userRepo user.Repository,
	chatCreditCost int,
	sdkClient *sdkclient.Client,
	sdkDebug bool,
) *Service {
	return &Service{
		projectRepo:    projectRepo,
		sessionRepo:    sessionRepo,
		messageRepo:    messageRepo,
		resourceRepo:   resourceRepo,
		userRepo:       userRepo,
		chatCreditCost: chatCreditCost,
		sdkClient:      sdkClient,
		sdkDebug:       sdkDebug,
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



const maxTitleRunes = 28

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
func (s *Service) prepareSessionAndSaveUserMessage(ctx context.Context, userID string, in ChatInput) (projectID, sessionID string, err error) {
	_ = ctx
	if in.ProjectID == nil || *in.ProjectID == "" {
		return "", "", fmt.Errorf("project_id is required")
	}
	projectID = *in.ProjectID
	if _, err := s.projectRepo.GetByIDAndUserID(projectID, userID); err != nil {
		if isRepoNotFound(err) {
			return "", "", fmt.Errorf("项目不存在或无权访问")
		}
		return "", "", err
	}

	titleFromMessage := truncateTitle(in.Message, maxTitleRunes)

	if in.SessionID != nil && *in.SessionID != "" {
		sess, err := s.sessionRepo.GetByIDAndProjectID(*in.SessionID, projectID)
		if err != nil {
			if isRepoNotFound(err) {
				return "", "", fmt.Errorf("会话不存在或已删除，请返回项目页刷新后再试")
			}
			return "", "", err
		}
		sessionID = *in.SessionID
		// 若当前标题仍是「新对话」，用首条消息更新
		if sess.Title == "新对话" && strings.TrimSpace(in.Message) != "" {
			sess.Title = titleFromMessage
			sess.UpdatedAt = time.Now().UTC()
			_ = s.sessionRepo.Update(sess)
		}
	} else {
		now := time.Now().UTC()
		localSessionID := uuid.NewString()
		sess := &project.Session{
			ID:        localSessionID,
			ProjectID: projectID,
			Title:     titleFromMessage,
			CreatedAt: now,
			UpdatedAt: now,
		}
		if err := s.sessionRepo.Create(sess); err != nil {
			return "", "", err
		}
		sessionID = sess.ID
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
		return "", "", err
	}
	return projectID, sessionID, nil
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



func toString(v any) string {
	s, _ := v.(string)
	return s
}
