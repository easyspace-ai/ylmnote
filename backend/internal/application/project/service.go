package project

import (
	"context"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/easyspace-ai/ylmnote/internal/domain/project"
	"github.com/google/uuid"
	sdkclient "ylmsdk/client"
)

// Service 项目应用服务
type Service struct {
	projectRepo        project.ProjectRepository
	sessionRepo        project.SessionRepository
	messageRepo        project.MessageRepository
	resourceRepo       project.ResourceRepository
	promptTemplateRepo project.PromptTemplateRepository
	aiSDK              *sdkclient.Client
}

func NewService(
	projectRepo project.ProjectRepository,
	sessionRepo project.SessionRepository,
	messageRepo project.MessageRepository,
	resourceRepo project.ResourceRepository,
	promptTemplateRepo project.PromptTemplateRepository,
	aiSDK *sdkclient.Client,
) *Service {
	return &Service{
		projectRepo:        projectRepo,
		sessionRepo:        sessionRepo,
		messageRepo:        messageRepo,
		resourceRepo:       resourceRepo,
		promptTemplateRepo: promptTemplateRepo,
		aiSDK:              aiSDK,
	}
}

// ListProjects 列出用户项目
func (s *Service) ListProjects(userID string, status *string, skip, limit int) ([]*project.Project, error) {
	return s.projectRepo.ListByUserID(userID, status, skip, limit)
}

// GetProject 获取单个项目（校验归属）
func (s *Service) GetProject(projectID, userID string) (*project.Project, error) {
	return s.projectRepo.GetByIDAndUserID(projectID, userID)
}

// CreateProject 创建项目
func (s *Service) CreateProject(ctx context.Context, userID, name string, description, coverImage *string) (*project.Project, error) {
	now := time.Now().UTC()
	p := &project.Project{
		ID:          uuid.NewString(),
		UserID:      userID,
		Name:        name,
		Description: description,
		CoverImage:  coverImage,
		Status:      "active",
		CreatedAt:   now,
		UpdatedAt:   now,
	}
	if err := s.projectRepo.Create(p); err != nil {
		return nil, err
	}
	// 项目创建后立即创建默认会话；若远端会话 ID 申请失败，回滚项目，避免产生无会话孤儿项目。
	if _, err := s.CreateSession(ctx, p.ID, "新对话"); err != nil {
		_ = s.projectRepo.Delete(p.ID, userID)
		return nil, fmt.Errorf("create default session failed: %w", err)
	}
	return p, nil
}

// UpdateProject 更新项目
func (s *Service) UpdateProject(projectID, userID string, name, description, coverImage, status *string) (*project.Project, error) {
	p, err := s.projectRepo.GetByIDAndUserID(projectID, userID)
	if err != nil {
		return nil, err
	}
	if name != nil {
		p.Name = *name
	}
	if description != nil {
		p.Description = description
	}
	if coverImage != nil {
		p.CoverImage = coverImage
	}
	if status != nil {
		p.Status = *status
	}
	p.UpdatedAt = time.Now().UTC()
	if err := s.projectRepo.Update(p); err != nil {
		return nil, err
	}
	return p, nil
}

// DeleteProject 删除项目
func (s *Service) DeleteProject(projectID, userID string) error {
	return s.projectRepo.Delete(projectID, userID)
}

// ListSessions 列出项目下的会话
func (s *Service) ListSessions(projectID string, skip, limit int) ([]*project.Session, error) {
	return s.sessionRepo.ListByProjectID(projectID, skip, limit)
}

// CreateSession 在项目下创建会话
func (s *Service) CreateSession(ctx context.Context, projectID, title string) (*project.Session, error) {
	_ = ctx
	now := time.Now().UTC()
	sessionID := uuid.NewString()
	sess := &project.Session{
		ID:                sessionID,
		ProjectID:         projectID,
		UpstreamSessionID: nil,
		Title:             title,
		CreatedAt:         now,
		UpdatedAt:         now,
	}
	if err := s.sessionRepo.Create(sess); err != nil {
		return nil, err
	}
	return sess, nil
}

func (s *Service) allocateUpstreamSessionID(ctx context.Context) (string, error) {
	if s.aiSDK == nil {
		return "", fmt.Errorf("ai sdk is not configured")
	}
	id, err := s.aiSDK.EnsureSession(ctx, "")
	if err != nil {
		log.Printf("[project-sdk] EnsureSession(new) failed err=%v", err)
		return "", fmt.Errorf("ensure upstream session failed: %w", err)
	}
	id = strings.TrimSpace(id)
	if id == "" {
		return "", fmt.Errorf("upstream session id is empty")
	}
	return id, nil
}

// UpdateSession 更新会话标题
func (s *Service) UpdateSession(projectID, sessionID string, title string) (*project.Session, error) {
	sess, err := s.sessionRepo.GetByIDAndProjectID(sessionID, projectID)
	if err != nil {
		return nil, err
	}
	sess.Title = title
	sess.UpdatedAt = time.Now().UTC()
	if err := s.sessionRepo.Update(sess); err != nil {
		return nil, err
	}
	return sess, nil
}

// DeleteSession 删除会话（及其消息）
func (s *Service) DeleteSession(projectID, sessionID string) error {
	return s.sessionRepo.Delete(sessionID, projectID)
}

// GetSession 获取会话（校验归属项目）
func (s *Service) GetSession(projectID, sessionID string) (*project.Session, error) {
	return s.sessionRepo.GetByIDAndProjectID(sessionID, projectID)
}

// BindSessionUpstreamID 绑定本地会话与远端 upstream 会话 ID。
func (s *Service) BindSessionUpstreamID(projectID, sessionID, upstreamSessionID string) (*project.Session, error) {
	sess, err := s.sessionRepo.GetByIDAndProjectID(sessionID, projectID)
	if err != nil {
		return nil, err
	}
	upstreamSessionID = strings.TrimSpace(upstreamSessionID)
	if upstreamSessionID == "" {
		return nil, fmt.Errorf("upstream_session_id is required")
	}
	sess.UpstreamSessionID = &upstreamSessionID
	sess.UpdatedAt = time.Now().UTC()
	if err := s.sessionRepo.Update(sess); err != nil {
		return nil, err
	}
	return sess, nil
}

// ListMessages 列出项目消息（兼容旧接口，按项目维度）
func (s *Service) ListMessages(projectID string, skip, limit int) ([]*project.Message, error) {
	return s.messageRepo.ListByProjectID(projectID, skip, limit)
}

// ListMessagesBySession 列出某会话的消息
func (s *Service) ListMessagesBySession(projectID, sessionID string, skip, limit int) ([]*project.Message, error) {
	if _, err := s.sessionRepo.GetByIDAndProjectID(sessionID, projectID); err != nil {
		return nil, err
	}
	return s.messageRepo.ListBySessionID(sessionID, skip, limit)
}

// CreateMessage 创建用户消息（需指定会话）
func (s *Service) CreateMessage(projectID, sessionID, content string, skillID *string, attachments map[string]interface{}) (*project.Message, error) {
	if _, err := s.sessionRepo.GetByIDAndProjectID(sessionID, projectID); err != nil {
		return nil, err
	}
	m := &project.Message{
		ID:          uuid.NewString(),
		ProjectID:   projectID,
		SessionID:   sessionID,
		Role:        "user",
		Content:     content,
		SkillID:     skillID,
		Attachments: attachments,
		CreatedAt:   time.Now().UTC(),
	}
	if err := s.messageRepo.Create(m); err != nil {
		return nil, err
	}
	return m, nil
}

// UpdateMessage 更新消息内容
func (s *Service) UpdateMessage(projectID, messageID, content string) (*project.Message, error) {
	return s.messageRepo.UpdateContent(projectID, messageID, content)
}

// DeleteMessage 删除消息
func (s *Service) DeleteMessage(projectID, messageID string) error {
	return s.messageRepo.Delete(projectID, messageID)
}

// ListResources 列出项目资源
func (s *Service) ListResources(projectID string, resourceType *string) ([]*project.Resource, error) {
	return s.resourceRepo.ListByProjectID(projectID, resourceType)
}

// CreateResource 创建资源
func (s *Service) CreateResource(projectID string, sessionID *string, resType, name string, content, url, size *string) (*project.Resource, error) {
	r := &project.Resource{
		ID:        uuid.NewString(),
		ProjectID: projectID,
		SessionID: sessionID,
		Type:      resType,
		Name:      name,
		Content:   content,
		URL:       url,
		Size:      size,
		CreatedAt: time.Now().UTC(),
	}
	if err := s.resourceRepo.Create(r); err != nil {
		return nil, err
	}
	return r, nil
}

// UpdateResource 更新资源
func (s *Service) UpdateResource(projectID, resourceID string, name, content, url *string) (*project.Resource, error) {
	r, err := s.resourceRepo.GetByID(projectID, resourceID)
	if err != nil {
		return nil, err
	}
	if name != nil {
		r.Name = *name
	}
	if content != nil {
		r.Content = content
	}
	if url != nil {
		r.URL = url
	}
	if err := s.resourceRepo.Update(r); err != nil {
		return nil, err
	}
	return r, nil
}

// DeleteResource 删除资源
func (s *Service) DeleteResource(projectID, resourceID string) error {
	return s.resourceRepo.Delete(projectID, resourceID)
}

// EnsureProjectBelongsToUser 校验项目归属，返回 nil 表示属于该用户
func (s *Service) EnsureProjectBelongsToUser(projectID, userID string) error {
	_, err := s.projectRepo.GetByIDAndUserID(projectID, userID)
	return err
}

// GetResource 获取单个资源
func (s *Service) GetResource(projectID, resourceID string) (*project.Resource, error) {
	return s.resourceRepo.GetByID(projectID, resourceID)
}

// PromptTemplateCreateInput 创建 PromptTemplate 的输入参数
type PromptTemplateCreateInput struct {
	ActionType string
	Name       string
	Prompt     string
}

// PromptTemplateUpdateInput 更新 PromptTemplate 的输入参数
type PromptTemplateUpdateInput struct {
	ActionType *string
	Name       *string
	Prompt     *string
}

func defaultStudioPromptTemplates() []PromptTemplateCreateInput {
	return []PromptTemplateCreateInput{
		{
			ActionType: "ppt",
			Name:       "PPT",
			Prompt:     "请基于当前会话与已引用资料，生成一份结构清晰、可直接用于演示的 PPT 大纲。要求包含：标题页、核心观点、关键证据、结论与下一步行动，并按页给出要点。",
		},
		{
			ActionType: "dynamic_web",
			Name:       "动态网页",
			Prompt:     "请把当前主题整理为一个可交互的动态网页方案。输出需包含：页面结构、交互模块、每个模块展示的数据与文案、用户操作路径，以及可直接交给前端实现的组件拆分建议。",
		},
		{
			ActionType: "quiz",
			Name:       "测验",
			Prompt:     "请根据当前资料生成一套测验题。至少包含 10 题，题型覆盖单选/多选/判断，给出标准答案与简要解析，并按难度分级。",
		},
		{
			ActionType: "mind_map",
			Name:       "思维导图",
			Prompt:     "请将当前主题整理为思维导图结构，输出主干、分支、关键概念与它们之间关系；层级清晰，便于直接转成导图节点。",
		},
		{
			ActionType: "image",
			Name:       "图片",
			Prompt:     "请根据当前内容生成高质量配图提示词方案。输出 3 套风格不同的图像生成提示词（主题、构图、色彩、元素、风格细节），并说明适用场景。",
		},
	}
}

// EnsureDefaultPromptTemplates 初始化并补齐默认 Studio 动作模板（固定 5 项）
func (s *Service) EnsureDefaultPromptTemplates(userID string) error {
	existing, err := s.promptTemplateRepo.ListByUserID(userID)
	if err != nil {
		return err
	}
	existingByAction := make(map[string]struct{}, len(existing))
	for _, item := range existing {
		existingByAction[strings.TrimSpace(item.ActionType)] = struct{}{}
	}

	now := time.Now().UTC()
	for _, item := range defaultStudioPromptTemplates() {
		if _, ok := existingByAction[item.ActionType]; ok {
			continue
		}
		template := &project.PromptTemplate{
			ID:         uuid.NewString(),
			UserID:     userID,
			ActionType: item.ActionType,
			Name:       item.Name,
			Prompt:     item.Prompt,
			CreatedAt:  now,
			UpdatedAt:  now,
		}
		if err := s.promptTemplateRepo.Create(template); err != nil {
			return err
		}
	}

	return nil
}

// ListPromptTemplates 列出当前用户的全部模板
func (s *Service) ListPromptTemplates(userID string) ([]*project.PromptTemplate, error) {
	return s.promptTemplateRepo.ListByUserID(userID)
}

// GetPromptTemplate 获取单个模板
func (s *Service) GetPromptTemplate(userID, templateID string) (*project.PromptTemplate, error) {
	return s.promptTemplateRepo.GetByIDAndUserID(templateID, userID)
}

// CreatePromptTemplate 创建模板
func (s *Service) CreatePromptTemplate(userID string, in PromptTemplateCreateInput) (*project.PromptTemplate, error) {
	now := time.Now().UTC()
	template := &project.PromptTemplate{
		ID:         uuid.NewString(),
		UserID:     userID,
		ActionType: in.ActionType,
		Name:       in.Name,
		Prompt:     in.Prompt,
		CreatedAt:  now,
		UpdatedAt:  now,
	}
	if err := s.promptTemplateRepo.Create(template); err != nil {
		return nil, err
	}
	return template, nil
}

// UpdatePromptTemplate 更新模板
func (s *Service) UpdatePromptTemplate(userID, templateID string, in PromptTemplateUpdateInput) (*project.PromptTemplate, error) {
	template, err := s.promptTemplateRepo.GetByIDAndUserID(templateID, userID)
	if err != nil {
		return nil, err
	}
	if in.ActionType != nil {
		template.ActionType = *in.ActionType
	}
	if in.Name != nil {
		template.Name = *in.Name
	}
	if in.Prompt != nil {
		template.Prompt = *in.Prompt
	}
	template.UpdatedAt = time.Now().UTC()
	if err := s.promptTemplateRepo.Update(template); err != nil {
		return nil, err
	}
	return template, nil
}

// DeletePromptTemplate 删除模板
func (s *Service) DeletePromptTemplate(userID, templateID string) error {
	return s.promptTemplateRepo.Delete(templateID, userID)
}
