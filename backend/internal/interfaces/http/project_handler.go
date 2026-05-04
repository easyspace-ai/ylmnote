package http

import (
	"context"
	"fmt"
	"io"
	"log"
	"log/slog"
	"net/http"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/easyspace-ai/ylmnote/internal/application/project"
	projectdomain "github.com/easyspace-ai/ylmnote/internal/domain/project"
	sdkclient "github.com/easyspace-ai/ylmnote/internal/infrastructure/ai/gateway/client"
	"github.com/easyspace-ai/ylmnote/internal/infrastructure/persistence"
	"github.com/gin-gonic/gin"
	wsdk "ws-chat-tester/sdk"
)

// ResourceRepository 资源仓储接口别名
type ResourceRepository = projectdomain.ResourceRepository

// ProjectHandler 笔记/消息/资源/上传 HTTP 处理
type ProjectHandler struct {
	svc          *project.Service
	aiSDK        *sdkclient.Client
	wsSDK        *wsdk.Client
	resourceRepo ResourceRepository
}

func NewProjectHandler(svc *project.Service, aiSDK *sdkclient.Client, wsSDK *wsdk.Client, resourceRepo ResourceRepository) *ProjectHandler {
	return &ProjectHandler{svc: svc, aiSDK: aiSDK, wsSDK: wsSDK, resourceRepo: resourceRepo}
}

func (h *ProjectHandler) RegisterRoutes(r *gin.RouterGroup) {
	r.GET("", h.listProjects)
	r.POST("", h.createProject)
	r.GET("/:project_id", h.getProject)
	r.PATCH("/:project_id", h.updateProject)
	r.DELETE("/:project_id", h.deleteProject)
	// 会话：一个笔记下多个会话
	r.GET("/:project_id/sessions", h.listSessions)
	r.POST("/:project_id/sessions", h.createSession)
	r.PATCH("/:project_id/sessions/:session_id", h.updateSession)

	r.DELETE("/:project_id/sessions/:session_id", h.deleteSession)
	r.GET("/:project_id/sessions/:session_id/messages", h.listMessagesBySession)
	r.GET("/:project_id/sessions/:session_id/history", h.getSessionHistory) // 代理上游历史消息
	// 消息（按笔记维度保留兼容；按会话维度用上面）
	r.GET("/:project_id/messages", h.listMessages)
	r.POST("/:project_id/messages", h.createMessage)
	r.PATCH("/:project_id/messages/:message_id", h.updateMessage)
	r.DELETE("/:project_id/messages/:message_id", h.deleteMessage)
	r.GET("/:project_id/resources", h.listResources)
	r.POST("/:project_id/resources", h.createResource)
	r.PATCH("/:project_id/resources/:resource_id", h.updateResource)
	r.DELETE("/:project_id/resources/:resource_id", h.deleteResource)
	r.POST("/:project_id/upload", h.uploadFile)
}

func parseSkipLimit(c *gin.Context) (skip, limit int) {
	skip, limit = 0, 20
	if v := c.Query("skip"); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			skip = n
		}
	}
	if v := c.Query("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			limit = n
		}
	}
	if skip < 0 {
		skip = 0
	}
	if limit <= 0 {
		limit = 20
	}
	return skip, limit
}

func (h *ProjectHandler) listProjects(c *gin.Context) {
	u, ok := GetCurrentUser(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"detail": "Not authenticated"})
		return
	}
	status := c.Query("status")
	var statusPtr *string
	if status != "" {
		statusPtr = &status
	}
	skip, limit := parseSkipLimit(c)
	list, err := h.svc.ListProjects(u.ID, statusPtr, skip, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"detail": "failed to list projects"})
		return
	}
	c.JSON(http.StatusOK, toProjectListResponse(list))
}

func (h *ProjectHandler) getProject(c *gin.Context) {
	u, ok := GetCurrentUser(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"detail": "Not authenticated"})
		return
	}
	p, err := h.svc.GetProject(c.Param("project_id"), u.ID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"detail": "Project not found"})
		return
	}
	c.JSON(http.StatusOK, toProjectResponse(p))
}

func (h *ProjectHandler) createProject(c *gin.Context) {
	u, ok := GetCurrentUser(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"detail": "Not authenticated"})
		return
	}
	var req struct {
		Name        string  `json:"name" binding:"required"`
		Description *string `json:"description"`
		CoverImage  *string `json:"cover_image"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": "invalid request body"})
		return
	}
	p, err := h.svc.CreateProject(c.Request.Context(), u.ID, req.Name, req.Description, req.CoverImage)
	if err != nil {
		log.Printf("[project-create] user=%s name=%s err=%v", u.ID, req.Name, err)
		c.JSON(http.StatusBadGateway, gin.H{"detail": "failed to create project: " + err.Error()})
		return
	}
	c.JSON(http.StatusOK, toProjectResponse(p))
}

func (h *ProjectHandler) updateProject(c *gin.Context) {
	u, ok := GetCurrentUser(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"detail": "Not authenticated"})
		return
	}
	var req struct {
		Name        *string `json:"name"`
		Description *string `json:"description"`
		CoverImage  *string `json:"cover_image"`
		Status      *string `json:"status"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": "invalid request body"})
		return
	}
	p, err := h.svc.UpdateProject(c.Param("project_id"), u.ID, req.Name, req.Description, req.CoverImage, req.Status)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"detail": "Project not found"})
		return
	}
	c.JSON(http.StatusOK, toProjectResponse(p))
}

func (h *ProjectHandler) deleteProject(c *gin.Context) {
	u, ok := GetCurrentUser(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"detail": "Not authenticated"})
		return
	}
	if err := h.svc.DeleteProject(c.Param("project_id"), u.ID); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"detail": "Project not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Project deleted"})
}

func toProjectResponse(p *projectdomain.Project) gin.H {
	return gin.H{
		"id":          p.ID,
		"name":        p.Name,
		"description": p.Description,
		"cover_image": p.CoverImage,
		"status":      p.Status,
		"created_at":  p.CreatedAt,
		"updated_at":  p.UpdatedAt,
	}
}

func toProjectListResponse(list []*projectdomain.Project) []gin.H {
	out := make([]gin.H, len(list))
	for i, p := range list {
		out[i] = toProjectResponse(p)
	}
	return out
}

func (h *ProjectHandler) listSessions(c *gin.Context) {
	u, ok := GetCurrentUser(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"detail": "Not authenticated"})
		return
	}
	projectID := c.Param("project_id")
	if err := h.svc.EnsureProjectBelongsToUser(projectID, u.ID); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"detail": "Project not found"})
		return
	}
	skip, limit := parseSkipLimit(c)
	if limit > 500 {
		limit = 500
	}
	list, err := h.svc.ListSessions(projectID, skip, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"detail": "failed to list sessions"})
		return
	}
	c.JSON(http.StatusOK, toSessionListResponse(list))
}

func (h *ProjectHandler) createSession(c *gin.Context) {
	u, ok := GetCurrentUser(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"detail": "Not authenticated"})
		return
	}
	projectID := c.Param("project_id")
	if err := h.svc.EnsureProjectBelongsToUser(projectID, u.ID); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"detail": "Project not found"})
		return
	}
	var req struct {
		Title string `json:"title"`
	}
	_ = c.ShouldBindJSON(&req)
	if req.Title == "" {
		req.Title = "新对话"
	}
	sess, err := h.svc.CreateSession(c.Request.Context(), projectID, req.Title)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"detail": "failed to create session"})
		return
	}
	c.JSON(http.StatusOK, toSessionResponse(sess))
}

func (h *ProjectHandler) updateSession(c *gin.Context) {
	u, ok := GetCurrentUser(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"detail": "Not authenticated"})
		return
	}
	projectID := c.Param("project_id")
	sessionID := c.Param("session_id")
	if err := h.svc.EnsureProjectBelongsToUser(projectID, u.ID); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"detail": "Project not found"})
		return
	}
	var req struct {
		Title string `json:"title" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": "invalid request body"})
		return
	}
	sess, err := h.svc.UpdateSession(projectID, sessionID, req.Title)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"detail": "Session not found"})
		return
	}
	c.JSON(http.StatusOK, toSessionResponse(sess))
}

func (h *ProjectHandler) deleteSession(c *gin.Context) {
	u, ok := GetCurrentUser(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"detail": "Not authenticated"})
		return
	}
	projectID := c.Param("project_id")
	sessionID := c.Param("session_id")
	if err := h.svc.EnsureProjectBelongsToUser(projectID, u.ID); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"detail": "Project not found"})
		return
	}
	if err := h.svc.DeleteSession(projectID, sessionID); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"detail": "Session not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Session deleted"})
}

func (h *ProjectHandler) listMessagesBySession(c *gin.Context) {
	u, ok := GetCurrentUser(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"detail": "Not authenticated"})
		return
	}
	projectID := c.Param("project_id")
	sessionID := c.Param("session_id")
	if err := h.svc.EnsureProjectBelongsToUser(projectID, u.ID); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"detail": "Project not found"})
		return
	}
	skip, limit := parseSkipLimit(c)
	if limit > 200 {
		limit = 200
	}
	list, err := h.svc.ListMessagesBySession(projectID, sessionID, skip, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"detail": "failed to list messages"})
		return
	}
	c.JSON(http.StatusOK, toMessageListResponse(list))
}

func toSessionResponse(s *projectdomain.Session) gin.H {
	return gin.H{
		"id":         s.ID,
		"project_id": s.ProjectID,
		"title":      s.Title,
		"created_at": s.CreatedAt,
		"updated_at": s.UpdatedAt,
	}
}

func toSessionListResponse(list []*projectdomain.Session) []gin.H {
	out := make([]gin.H, len(list))
	for i, s := range list {
		out[i] = toSessionResponse(s)
	}
	return out
}

func (h *ProjectHandler) listMessages(c *gin.Context) {
	u, ok := GetCurrentUser(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"detail": "Not authenticated"})
		return
	}
	projectID := c.Param("project_id")
	if err := h.svc.EnsureProjectBelongsToUser(projectID, u.ID); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"detail": "Project not found"})
		return
	}
	skip, limit := parseSkipLimit(c)
	if limit > 50 {
		limit = 50
	}
	list, err := h.svc.ListMessages(projectID, skip, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"detail": "failed to list messages"})
		return
	}
	c.JSON(http.StatusOK, toMessageListResponse(list))
}

func (h *ProjectHandler) createMessage(c *gin.Context) {
	u, ok := GetCurrentUser(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"detail": "Not authenticated"})
		return
	}
	projectID := c.Param("project_id")
	if err := h.svc.EnsureProjectBelongsToUser(projectID, u.ID); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"detail": "Project not found"})
		return
	}
	var req struct {
		SessionID   string                 `json:"session_id" binding:"required"`
		Content     string                 `json:"content" binding:"required"`
		SkillID     *string                `json:"skill_id"`
		Attachments map[string]interface{} `json:"attachments"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": "invalid request body"})
		return
	}
	m, err := h.svc.CreateMessage(projectID, req.SessionID, req.Content, req.SkillID, req.Attachments)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"detail": "failed to create message"})
		return
	}
	c.JSON(http.StatusOK, toMessageResponse(m))
}

func (h *ProjectHandler) updateMessage(c *gin.Context) {
	u, ok := GetCurrentUser(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"detail": "Not authenticated"})
		return
	}
	projectID := c.Param("project_id")
	if err := h.svc.EnsureProjectBelongsToUser(projectID, u.ID); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"detail": "Project not found"})
		return
	}
	var req struct {
		Content string `json:"content" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": "invalid request body"})
		return
	}
	m, err := h.svc.UpdateMessage(projectID, c.Param("message_id"), req.Content)
	if err != nil || m == nil {
		c.JSON(http.StatusNotFound, gin.H{"detail": "Message not found"})
		return
	}
	c.JSON(http.StatusOK, toMessageResponse(m))
}

func (h *ProjectHandler) deleteMessage(c *gin.Context) {
	u, ok := GetCurrentUser(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"detail": "Not authenticated"})
		return
	}
	projectID := c.Param("project_id")
	if err := h.svc.EnsureProjectBelongsToUser(projectID, u.ID); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"detail": "Project not found"})
		return
	}
	if err := h.svc.DeleteMessage(projectID, c.Param("message_id")); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"detail": "Message not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Message deleted"})
}

func toMessageResponse(m *projectdomain.Message) gin.H {
	return gin.H{
		"id":                  m.ID,
		"upstream_message_id": m.UpstreamID,
		"project_id":          m.ProjectID,
		"session_id":          m.SessionID,
		"role":                m.Role,
		"content":             m.Content,
		"skill_id":            m.SkillID,
		"attachments":         m.Attachments,
		"created_at":          m.CreatedAt,
	}
}

func toMessageListResponse(list []*projectdomain.Message) []gin.H {
	out := make([]gin.H, len(list))
	for i, m := range list {
		out[i] = toMessageResponse(m)
	}
	return out
}

func (h *ProjectHandler) listResources(c *gin.Context) {
	u, ok := GetCurrentUser(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"detail": "Not authenticated"})
		return
	}
	projectID := c.Param("project_id")
	if err := h.svc.EnsureProjectBelongsToUser(projectID, u.ID); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"detail": "Project not found"})
		return
	}
	typ := c.Query("type")
	var typPtr *string
	if typ != "" {
		typPtr = &typ
	}
	list, err := h.svc.ListResources(projectID, typPtr)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"detail": "failed to list resources"})
		return
	}
	c.JSON(http.StatusOK, toResourceListResponse(list))
}

func (h *ProjectHandler) createResource(c *gin.Context) {
	u, ok := GetCurrentUser(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"detail": "Not authenticated"})
		return
	}
	projectID := c.Param("project_id")
	if err := h.svc.EnsureProjectBelongsToUser(projectID, u.ID); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"detail": "Project not found"})
		return
	}
	var req struct {
		Type      string  `json:"type" binding:"required"`
		Name      string  `json:"name" binding:"required"`
		Content   *string `json:"content"`
		URL       *string `json:"url"`
		Size      *string `json:"size"`
		SessionID *string `json:"session_id"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": "invalid request body"})
		return
	}
	r, err := h.svc.CreateResource(projectID, req.SessionID, req.Type, req.Name, req.Content, req.URL, req.Size)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"detail": "failed to create resource"})
		return
	}
	c.JSON(http.StatusOK, toResourceResponse(r))
}

func (h *ProjectHandler) updateResource(c *gin.Context) {
	u, ok := GetCurrentUser(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"detail": "Not authenticated"})
		return
	}
	projectID := c.Param("project_id")
	if err := h.svc.EnsureProjectBelongsToUser(projectID, u.ID); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"detail": "Project not found"})
		return
	}
	var req struct {
		Name    *string `json:"name"`
		Content *string `json:"content"`
		URL     *string `json:"url"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": "invalid request body"})
		return
	}
	r, err := h.svc.UpdateResource(projectID, c.Param("resource_id"), req.Name, req.Content, req.URL)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"detail": "Resource not found"})
		return
	}
	c.JSON(http.StatusOK, toResourceResponse(r))
}

func (h *ProjectHandler) deleteResource(c *gin.Context) {
	u, ok := GetCurrentUser(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"detail": "Not authenticated"})
		return
	}
	projectID := c.Param("project_id")
	if err := h.svc.EnsureProjectBelongsToUser(projectID, u.ID); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"detail": "Project not found"})
		return
	}
	if err := h.svc.DeleteResource(projectID, c.Param("resource_id")); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"detail": "Resource not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Resource deleted"})
}

func toResourceResponse(r *projectdomain.Resource) gin.H {
	return gin.H{
		"id":         r.ID,
		"project_id": r.ProjectID,
		"session_id": r.SessionID,
		"type":       r.Type,
		"name":       r.Name,
		"content":    r.Content,
		"url":        r.URL,
		"size":       r.Size,
		"created_at": r.CreatedAt,
	}
}

func toResourceListResponse(list []*projectdomain.Resource) []gin.H {
	out := make([]gin.H, len(list))
	for i, r := range list {
		out[i] = toResourceResponse(r)
	}
	return out
}

func (h *ProjectHandler) uploadFile(c *gin.Context) {
	u, ok := GetCurrentUser(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"detail": "Not authenticated"})
		return
	}
	projectID := c.Param("project_id")
	if err := h.svc.EnsureProjectBelongsToUser(projectID, u.ID); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"detail": "Project not found"})
		return
	}
	file, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": "file is required"})
		return
	}
	const maxUploadBytes int64 = 20 * 1024 * 1024
	if file.Size <= 0 || file.Size > maxUploadBytes {
		c.JSON(http.StatusBadRequest, gin.H{"detail": "file size must be between 1B and 20MB"})
		return
	}
	// 简单实现：保存到本地并创建 resource（与旧版一致）
	// 可后续抽成 application 的 UploadFile use case
	allowedExt := map[string]bool{
		".pdf": true, ".doc": true, ".docx": true, ".txt": true, ".md": true,
		".jpg": true, ".jpeg": true, ".png": true,
	}
	ext := strings.ToLower(filepath.Ext(file.Filename))
	if !allowedExt[ext] {
		c.JSON(http.StatusBadRequest, gin.H{"detail": "unsupported file type"})
		return
	}
	src, err := file.Open()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"detail": "failed to open upload stream"})
		return
	}
	defer src.Close()
	contentBytes, err := io.ReadAll(src)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"detail": "failed to read upload stream"})
		return
	}
	if h.aiSDK == nil {
		c.JSON(http.StatusInternalServerError, gin.H{"detail": "ai sdk uploader is not configured"})
		return
	}
	uploadResp, err := h.aiSDK.Upload(c.Request.Context(), sdkclient.UploadRequest{
		FileName:    file.Filename,
		ContentType: file.Header.Get("Content-Type"),
		Content:     contentBytes,
	})
	if err != nil {
		log.Printf("[upload] sdk upload failed project=%s user=%s file=%s size=%d err=%v", projectID, u.ID, file.Filename, file.Size, err)
		c.JSON(http.StatusBadGateway, gin.H{"detail": "sdk upload failed: " + err.Error()})
		return
	}
	log.Printf("[upload] sdk upload success project=%s user=%s file=%s file_id=%s", projectID, u.ID, file.Filename, uploadResp.FileID)

	// 仅在本地数据库持久化清单，文件内容由第三方 SDK 存储。
	url := uploadResp.URL
	if strings.TrimSpace(url) == "" && uploadResp.FileID != "" {
		url = "sdk-file:" + uploadResp.FileID
	}
	urlPtr := &url
	if strings.TrimSpace(url) == "" {
		urlPtr = nil
	}
	sizeStr := strconv.FormatInt(file.Size, 10)
	r, err := h.svc.CreateResource(projectID, nil, "document", file.Filename, nil, urlPtr, &sizeStr)
	if err != nil {
		log.Printf("[upload] persist resource failed project=%s user=%s file=%s err=%v", projectID, u.ID, file.Filename, err)
		c.JSON(http.StatusInternalServerError, gin.H{"detail": "failed to create resource for upload"})
		return
	}
	// 记录 resource_id 与 file_id 的映射，方便调试附件转换问题
	log.Printf("[upload] resource created project=%s user=%s resource_id=%s file_id=%s url=%s",
		projectID, u.ID, r.ID, uploadResp.FileID, url)
	c.JSON(http.StatusOK, toResourceResponse(r))
}

// downloadArtifact GET /api/projects/:id/artifacts/:artifactId/download
func (h *ProjectHandler) downloadArtifact(c *gin.Context) {
	u, ok := GetCurrentUser(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"detail": "Not authenticated"})
		return
	}
	projectID := c.Param("project_id")
	if err := h.svc.EnsureProjectBelongsToUser(projectID, u.ID); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"detail": "Project not found"})
		return
	}
	artifactID := c.Param("artifactId")

	// 1. 从数据库获取资源记录
	resource, err := h.resourceRepo.GetByID(projectID, artifactID)
	if err != nil || resource == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "artifact not found"})
		return
	}

	data, contentType, err := h.getArtifactData(c.Request.Context(), resource)
	if err != nil || len(data) == 0 {
		if err != nil {
			log.Printf("[downloadArtifact] getArtifactData failed resource=%s name=%q err=%v", resource.ID, resource.Name, err)
		}
		c.JSON(http.StatusNotFound, gin.H{"error": "artifact content not available"})
		return
	}
	if contentType == "" {
		contentType = inferContentTypeFromExt(resource.Name)
	}
	c.Header("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, resource.Name))
	c.Data(http.StatusOK, contentType, data)
}

// inferContentTypeFromExt 根据文件扩展名推断 Content-Type
func inferContentTypeFromExt(filename string) string {
	ext := strings.ToLower(filepath.Ext(filename))
	switch ext {
	case ".html", ".htm":
		return "text/html; charset=utf-8"
	case ".css":
		return "text/css; charset=utf-8"
	case ".js":
		return "application/javascript; charset=utf-8"
	case ".json":
		return "application/json; charset=utf-8"
	case ".txt", ".md":
		return "text/plain; charset=utf-8"
	case ".png":
		return "image/png"
	case ".jpg", ".jpeg":
		return "image/jpeg"
	case ".gif":
		return "image/gif"
	case ".svg":
		return "image/svg+xml"
	case ".webp":
		return "image/webp"
	case ".pdf":
		return "application/pdf"
	case ".mp3":
		return "audio/mpeg"
	case ".wav":
		return "audio/wav"
	case ".ogg":
		return "audio/ogg"
	case ".mp4":
		return "video/mp4"
	case ".webm":
		return "video/webm"
	case ".ppt":
		return "application/vnd.ms-powerpoint"
	case ".pptx":
		return "application/vnd.openxmlformats-officedocument.presentationml.presentation"
	default:
		return "application/octet-stream"
	}
}

// previewArtifact GET /api/projects/:id/artifacts/:artifactId/preview
func (h *ProjectHandler) previewArtifact(c *gin.Context) {
	u, ok := GetCurrentUser(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"detail": "Not authenticated"})
		return
	}
	projectID := c.Param("project_id")
	if err := h.svc.EnsureProjectBelongsToUser(projectID, u.ID); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"detail": "Project not found"})
		return
	}
	artifactID := c.Param("artifactId")

	resource, err := h.resourceRepo.GetByID(projectID, artifactID)
	if err != nil || resource == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "artifact not found"})
		return
	}

	ext := strings.ToLower(filepath.Ext(resource.Name))

	// 1. HTML 类型（.html/.htm）：返回 HTML 内容用于 iframe 加载
	if ext == ".html" || ext == ".htm" || resource.Type == "html_page" {
		// 优先从 content 字段返回
		if resource.Content != nil && *resource.Content != "" {
			c.Data(200, "text/html; charset=utf-8", []byte(*resource.Content))
			return
		}
		// 从 file: 路径读取
		if resource.URL != nil && strings.HasPrefix(*resource.URL, "file:") {
			filePath := strings.TrimPrefix(*resource.URL, "file:")
			absPath, err := filepath.Abs(filePath)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "invalid file path"})
				return
			}
			data, err := persistence.ReadFileSafe(absPath)
			if err != nil {
				c.JSON(http.StatusNotFound, gin.H{"error": "file not found"})
				return
			}
			c.Data(200, "text/html; charset=utf-8", data)
			return
		}
		// 尝试从 source: 路径通过 SDK 获取
		if resource.URL != nil && strings.HasPrefix(*resource.URL, "source:") {
			sourceID := strings.TrimPrefix(*resource.URL, "source:")
			if h.wsSDK != nil && sourceID != "" {
				ctx, cancel := context.WithTimeout(c.Request.Context(), 30*time.Second)
				defer cancel()
				data, _, err := h.wsSDK.DownloadSource(ctx, sourceID)
				if err == nil && len(data) > 0 {
					c.Data(200, "text/html; charset=utf-8", data)
					return
				}
			}
		}
		c.JSON(http.StatusNotFound, gin.H{"error": "HTML content not available"})
		return
	}

	// 2. Markdown 类型（.md）：返回原始内容，前端会自行渲染
	if ext == ".md" {
		if resource.Content != nil && *resource.Content != "" {
			c.Data(200, "text/plain; charset=utf-8", []byte(*resource.Content))
			return
		}
		if resource.URL != nil && strings.HasPrefix(*resource.URL, "file:") {
			filePath := strings.TrimPrefix(*resource.URL, "file:")
			absPath, err := filepath.Abs(filePath)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "invalid file path"})
				return
			}
			data, err := persistence.ReadFileSafe(absPath)
			if err != nil {
				c.JSON(http.StatusNotFound, gin.H{"error": "file not found"})
				return
			}
			c.Data(200, "text/plain; charset=utf-8", data)
			return
		}
		// 尝试从 source: 路径通过 SDK 获取
		if resource.URL != nil && strings.HasPrefix(*resource.URL, "source:") {
			sourceID := strings.TrimPrefix(*resource.URL, "source:")
			if h.wsSDK != nil && sourceID != "" {
				ctx, cancel := context.WithTimeout(c.Request.Context(), 30*time.Second)
				defer cancel()
				data, _, err := h.wsSDK.DownloadSource(ctx, sourceID)
				if err == nil && len(data) > 0 {
					c.Data(200, "text/plain; charset=utf-8", data)
					return
				}
			}
		}
		c.JSON(http.StatusNotFound, gin.H{"error": "Markdown content not available"})
		return
	}

	// 3. 图片类型（.png/.jpg/.jpeg/.gif/.svg/.webp）：返回文件内容
	if isImageExt(ext) {
		data, contentType, err := h.getArtifactData(c.Request.Context(), resource)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
			return
		}
		c.Data(200, contentType, data)
		return
	}

	// 4. 音频类型（.mp3/.wav/.ogg）：返回文件流
	if isAudioExt(ext) {
		data, contentType, err := h.getArtifactData(c.Request.Context(), resource)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
			return
		}
		c.Data(200, contentType, data)
		return
	}

	// 5. 视频类型（.mp4/.webm）：返回文件流
	if isVideoExt(ext) {
		data, contentType, err := h.getArtifactData(c.Request.Context(), resource)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
			return
		}
		c.Data(200, contentType, data)
		return
	}

	// 6. PDF：返回原始字节供前端 pdf.js / react-pdf 渲染（此前落入「其他类型」返回 JSON 会导致 Invalid PDF structure）
	if ext == ".pdf" || resource.Type == "pdf" {
		data, contentType, err := h.getArtifactData(c.Request.Context(), resource)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
			return
		}
		if contentType == "" {
			contentType = "application/pdf"
		}
		c.Data(http.StatusOK, contentType, data)
		return
	}

	// 7. PPT/PPTX 类型：不支持预览
	if ext == ".ppt" || ext == ".pptx" {
		c.JSON(200, gin.H{
			"preview_supported": false,
			"message":           "该文件类型不支持预览，请下载后查看",
		})
		return
	}

	// 8. 其他类型：不支持预览
	c.JSON(200, gin.H{
		"preview_supported": false,
		"message":           "该文件类型不支持预览，请下载后查看",
	})
}

// isImageExt 检查是否为图片扩展名
func isImageExt(ext string) bool {
	switch ext {
	case ".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp":
		return true
	}
	return false
}

// isAudioExt 检查是否为音频扩展名
func isAudioExt(ext string) bool {
	switch ext {
	case ".mp3", ".wav", ".ogg":
		return true
	}
	return false
}

// isVideoExt 检查是否为视频扩展名
func isVideoExt(ext string) bool {
	switch ext {
	case ".mp4", ".webm":
		return true
	}
	return false
}

// getArtifactData 获取 artifact 的字节与 Content-Type（下载与预览共用）
// 顺序：file: → w6-file: → DB content → sdk-file（经 SDK 按 file_id 拉取）→ source: → http(s) 直链
func (h *ProjectHandler) getArtifactData(ctx context.Context, resource *projectdomain.Resource) ([]byte, string, error) {
	if resource.URL != nil && strings.HasPrefix(*resource.URL, "file:") {
		filePath := strings.TrimPrefix(*resource.URL, "file:")
		absPath, err := filepath.Abs(filePath)
		if err != nil {
			return nil, "", fmt.Errorf("invalid file path")
		}
		data, err := persistence.ReadFileSafe(absPath)
		if err != nil {
			return nil, "", fmt.Errorf("file not found")
		}
		return data, inferContentTypeFromExt(resource.Name), nil
	}

	if resource.URL != nil && strings.HasPrefix(*resource.URL, "w6-file:") {
		p := strings.TrimPrefix(*resource.URL, "w6-file:")
		absPath, err := filepath.Abs(p)
		if err == nil {
			if data, err := persistence.ReadFileSafe(absPath); err == nil && len(data) > 0 {
				return data, inferContentTypeFromExt(resource.Name), nil
			}
		}
	}

	if resource.Content != nil && *resource.Content != "" {
		return []byte(*resource.Content), inferContentTypeFromExt(resource.Name), nil
	}

	if resource.URL != nil && strings.HasPrefix(*resource.URL, "sdk-file:") {
		fileID := strings.TrimSpace(strings.TrimPrefix(*resource.URL, "sdk-file:"))
		if h.wsSDK != nil && fileID != "" {
			dlCtx, cancel := context.WithTimeout(ctx, 90*time.Second)
			defer cancel()
			data, contentType, err := h.wsSDK.DownloadSource(dlCtx, fileID)
			if err == nil && len(data) > 0 {
				if strings.TrimSpace(contentType) == "" {
					contentType = inferContentTypeFromExt(resource.Name)
				}
				return data, contentType, nil
			}
			log.Printf("[getArtifactData] sdk-file DownloadSource failed file_id=%s err=%v", fileID, err)
		}
		return nil, "", fmt.Errorf("content not available")
	}

	if resource.URL != nil && strings.HasPrefix(*resource.URL, "source:") {
		sourceID := strings.TrimSpace(strings.TrimPrefix(*resource.URL, "source:"))
		if h.wsSDK != nil && sourceID != "" {
			dlCtx, cancel := context.WithTimeout(ctx, 90*time.Second)
			defer cancel()
			data, contentType, err := h.wsSDK.DownloadSource(dlCtx, sourceID)
			if err == nil && len(data) > 0 {
				if strings.TrimSpace(contentType) == "" {
					contentType = inferContentTypeFromExt(resource.Name)
				}
				return data, contentType, nil
			}
			log.Printf("[getArtifactData] source DownloadSource failed id=%s err=%v", sourceID, err)
		}
		return nil, "", fmt.Errorf("content not available")
	}

	if resource.URL != nil {
		raw := strings.TrimSpace(*resource.URL)
		if strings.HasPrefix(raw, "http://") || strings.HasPrefix(raw, "https://") {
			dlCtx, cancel := context.WithTimeout(ctx, 90*time.Second)
			defer cancel()
			req, err := http.NewRequestWithContext(dlCtx, http.MethodGet, raw, nil)
			if err != nil {
				return nil, "", fmt.Errorf("invalid url")
			}
			resp, err := http.DefaultClient.Do(req)
			if err != nil {
				return nil, "", err
			}
			defer resp.Body.Close()
			if resp.StatusCode != http.StatusOK {
				return nil, "", fmt.Errorf("remote fetch failed: %s", resp.Status)
			}
			data, err := io.ReadAll(resp.Body)
			if err != nil || len(data) == 0 {
				return nil, "", fmt.Errorf("content not available")
			}
			ct := strings.TrimSpace(resp.Header.Get("Content-Type"))
			if ct == "" {
				ct = inferContentTypeFromExt(resource.Name)
			}
			return data, ct, nil
		}
	}

	return nil, "", fmt.Errorf("content not available")
}

// getSessionHistory GET /api/projects/:project_id/sessions/:session_id/history
// 代理上游 /api/agents/:session_id/messages 接口，用于前端缓存历史消息
func (h *ProjectHandler) getSessionHistory(c *gin.Context) {
	u, ok := GetCurrentUser(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"detail": "Not authenticated"})
		return
	}
	projectID := c.Param("project_id")
	sessionID := c.Param("session_id")

	// 验证笔记归属
	if err := h.svc.EnsureProjectBelongsToUser(projectID, u.ID); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"detail": "Project not found"})
		return
	}

	// 解析分页参数
	limit, _ := strconv.Atoi(c.Query("limit"))
	offset, _ := strconv.Atoi(c.Query("offset"))
	if limit <= 0 || limit > 1000 {
		limit = 1000 // 最多 1000 条
	}
	if offset < 0 {
		offset = 0
	}

	// 检查 wsSDK 是否可用
	if h.wsSDK == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"detail": "SDK client not initialized"})
		return
	}

	// 调用上游获取历史消息
	ctx, cancel := context.WithTimeout(c.Request.Context(), 30*time.Second)
	defer cancel()

	resp, err := h.wsSDK.AgentMessages(ctx, sessionID, limit, offset)
	if err != nil {
		slog.Error("history_fetch_failed",
			slog.String("project_id", projectID),
			slog.String("session_id", sessionID),
			slog.String("user_id", u.ID),
			slog.String("error", err.Error()),
		)
		c.JSON(http.StatusBadGateway, gin.H{"detail": "failed to fetch history from upstream: " + err.Error()})
		return
	}

	slog.Info("history_fetched",
		slog.String("project_id", projectID),
		slog.String("session_id", sessionID),
		slog.String("user_id", u.ID),
		slog.Int("count", len(resp.Messages)),
		slog.Int("limit", limit),
		slog.Int("offset", offset),
	)

	c.JSON(http.StatusOK, resp)
}
