package http

import (
	"errors"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/easyspace-ai/ylmnote/internal/application/chat"
	"github.com/gin-gonic/gin"
	sdkclient "ylmsdk/client"
	sdkstream "ylmsdk/stream"
	sdktypes "ylmsdk/types"
)

// ChatHandler 对话 HTTP 处理
type ChatHandler struct {
	svc *chat.Service
}

func NewChatHandler(svc *chat.Service) *ChatHandler {
	return &ChatHandler{svc: svc}
}

func (h *ChatHandler) RegisterRoutes(r *gin.RouterGroup) {
	r.POST("", h.chat)
	r.POST("/stream", h.chatStream)
	r.POST("/sync-state", h.syncState)
	r.GET("/remote-messages", h.remoteMessages)
	r.GET("/upstream-gate", h.upstreamGate)
	r.POST("/upstream-stop", h.upstreamStop)
	r.GET("/source/:source_id", h.sourceFile)
}

type chatRequest struct {
	Message      string                  `json:"message" binding:"required"`
	ProjectID    *string                 `json:"project_id"` // 必填，会话归属项目
	SessionID    *string                 `json:"session_id"` // 可选，不传则新建会话
	SkillID      *string                 `json:"skill_id"`
	Attachments  map[string]interface{}  `json:"attachments"`
	ResourceRefs []chat.ResourceRefInput `json:"resource_refs"`
	Model        *string                 `json:"model"`
	Mode         *string                 `json:"mode"`
}

type syncStateRequest struct {
	ProjectID         string  `json:"project_id" binding:"required"`
	SessionID         string  `json:"session_id" binding:"required"`
	UpstreamSessionID *string `json:"upstream_session_id"`
}

type upstreamStopRequest struct {
	ProjectID string `json:"project_id" binding:"required"`
	SessionID string `json:"session_id" binding:"required"`
}

func (h *ChatHandler) chat(c *gin.Context) {
	u, ok := GetCurrentUser(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"detail": "Not authenticated"})
		return
	}
	var req chatRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": "invalid request body"})
		return
	}
	result, err := h.svc.Chat(c.Request.Context(), u.ID, chat.ChatInput{
		Message:      req.Message,
		ProjectID:    req.ProjectID,
		SessionID:    req.SessionID,
		SkillID:      req.SkillID,
		Attachments:  req.Attachments,
		ResourceRefs: req.ResourceRefs,
		Model:        req.Model,
	})
	if err != nil {
		if errors.Is(err, chat.ErrUpstreamSessionConflict) {
			c.JSON(http.StatusConflict, gin.H{"detail": err.Error()})
			return
		}
		if errors.Is(err, chat.ErrUpstreamSessionUnbound) {
			c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"detail": "ai error: " + err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"id":         result.ID,
		"project_id": result.ProjectID,
		"session_id": result.SessionID,
		"role":       result.Role,
		"content":    result.Content,
		"skill_id":   result.SkillID,
		"created_at": result.CreatedAt,
	})
}

// chatStream 流式对话：先鉴权、解析/创建会话、保存用户消息并自动更新会话标题，再流式返回，最后持久化助手消息。
func (h *ChatHandler) chatStream(c *gin.Context) {
	u, ok := GetCurrentUser(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"detail": "Not authenticated"})
		return
	}
	var req chatRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": "invalid request body"})
		return
	}
	if req.ProjectID == nil || *req.ProjectID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"detail": "project_id is required"})
		return
	}
	start := time.Now()
	log.Printf("[chat-stream] start user=%s project=%s session=%v msg_len=%d refs=%d",
		u.ID, *req.ProjectID, req.SessionID, len(req.Message), len(req.ResourceRefs))

	flusher, ok := c.Writer.(http.Flusher)
	if !ok {
		c.JSON(http.StatusInternalServerError, gin.H{"detail": "streaming not supported"})
		return
	}
	sdkstream.InitSSEHeaders(c.Writer)
	flusher.Flush()
	_ = sdkstream.WriteEvent(c.Writer, sdktypes.StreamEvent{
		Type:  sdktypes.StreamEventStatus,
		Value: "connecting_upstream",
	})

	eventCount := 0
	result, err := h.svc.Stream(c.Request.Context(), u.ID, chat.ChatInput{
		Message:      req.Message,
		ProjectID:    req.ProjectID,
		SessionID:    req.SessionID,
		SkillID:      req.SkillID,
		Attachments:  req.Attachments,
		ResourceRefs: req.ResourceRefs,
		Model:        req.Model,
	}, func(evt sdktypes.StreamEvent) error {
		eventCount++
		return sdkstream.WriteEvent(c.Writer, evt)
	})
	if err != nil {
		if errors.Is(err, chat.ErrUpstreamSessionConflict) {
			_ = sdkstream.WriteEvent(c.Writer, sdktypes.StreamEvent{
				Type:  sdktypes.StreamEventError,
				Value: err.Error(),
			})
			return
		}
		if errors.Is(err, chat.ErrUpstreamSessionUnbound) {
			_ = sdkstream.WriteEvent(c.Writer, sdktypes.StreamEvent{
				Type:  sdktypes.StreamEventError,
				Value: err.Error(),
			})
			return
		}
		log.Printf("[chat-stream] error user=%s project=%s session=%v after=%s events=%d err=%v",
			u.ID, *req.ProjectID, req.SessionID, time.Since(start).Truncate(time.Millisecond), eventCount, err)
		_ = sdkstream.WriteEvent(c.Writer, sdktypes.StreamEvent{
			Type:  sdktypes.StreamEventError,
			Value: "ai error: " + err.Error(),
		})
		return
	}
	_ = sdkstream.WriteEvent(c.Writer, sdktypes.StreamEvent{
		Type:  sdktypes.StreamEventType("session_id"),
		Value: result.SessionID,
	})
	_ = sdkstream.WriteEvent(c.Writer, sdktypes.StreamEvent{
		Type:  sdktypes.StreamEventType("status_clear"),
		Value: "",
	})
	_ = sdkstream.WriteEvent(c.Writer, sdktypes.StreamEvent{
		Type:  sdktypes.StreamEventStatus,
		Value: fmt.Sprintf("session:%s", result.SessionID),
	})
	log.Printf("[chat-stream] done user=%s project=%s session=%s after=%s events=%d content_len=%d",
		u.ID, result.ProjectID, result.SessionID, time.Since(start).Truncate(time.Millisecond), eventCount, len(result.Content))
}

func (h *ChatHandler) syncState(c *gin.Context) {
	u, ok := GetCurrentUser(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"detail": "Not authenticated"})
		return
	}
	var req syncStateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": "invalid request body"})
		return
	}
	if err := h.svc.EnsureProjectBelongsToUser(req.ProjectID, u.ID); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"detail": "Project not found"})
		return
	}

	result, err := h.svc.SyncSessionState(c.Request.Context(), req.ProjectID, req.SessionID, req.UpstreamSessionID)
	if err != nil {
		log.Printf("[chat-sync-state] user=%s project=%s session=%s err=%v", u.ID, req.ProjectID, req.SessionID, err)
		if errors.Is(err, chat.ErrUpstreamSessionConflict) {
			c.JSON(http.StatusConflict, gin.H{"detail": err.Error()})
			return
		}
		if errors.Is(err, chat.ErrUpstreamSessionUnbound) {
			c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
			return
		}
		c.JSON(http.StatusBadGateway, gin.H{"detail": "sync session state failed"})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"artifact_count": result.ArtifactCount,
		"todo_count":     result.TodoCount,
	})
}

func (h *ChatHandler) upstreamGate(c *gin.Context) {
	u, ok := GetCurrentUser(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"detail": "Not authenticated"})
		return
	}
	projectID := strings.TrimSpace(c.Query("project_id"))
	sessionID := strings.TrimSpace(c.Query("session_id"))
	if projectID == "" || sessionID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"detail": "project_id and session_id are required"})
		return
	}
	view, err := h.svc.GetUpstreamGate(c.Request.Context(), u.ID, projectID, sessionID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"detail": "Project or session not found"})
		return
	}
	c.JSON(http.StatusOK, view)
}

func (h *ChatHandler) upstreamStop(c *gin.Context) {
	u, ok := GetCurrentUser(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"detail": "Not authenticated"})
		return
	}
	var req upstreamStopRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": "invalid request body"})
		return
	}
	err := h.svc.StopUpstreamSession(c.Request.Context(), u.ID, strings.TrimSpace(req.ProjectID), strings.TrimSpace(req.SessionID))
	if err != nil {
		if errors.Is(err, chat.ErrUpstreamSessionUnbound) {
			c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
			return
		}
		if errors.Is(err, chat.ErrUpstreamStopUnavailable) {
			c.JSON(http.StatusServiceUnavailable, gin.H{"detail": err.Error()})
			return
		}
		if sdkclient.IsNotImplemented(err) {
			c.JSON(http.StatusNotImplemented, gin.H{"detail": "upstream stop not supported in this deployment"})
			return
		}
		log.Printf("[chat-upstream-stop] user=%s project=%s session=%s err=%v", u.ID, req.ProjectID, req.SessionID, err)
		c.JSON(http.StatusBadGateway, gin.H{"detail": "upstream stop failed"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *ChatHandler) remoteMessages(c *gin.Context) {
	u, ok := GetCurrentUser(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"detail": "Not authenticated"})
		return
	}
	projectID := strings.TrimSpace(c.Query("project_id"))
	sessionID := strings.TrimSpace(c.Query("session_id"))
	if projectID == "" || sessionID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"detail": "project_id and session_id are required"})
		return
	}
	if err := h.svc.EnsureProjectBelongsToUser(projectID, u.ID); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"detail": "Project not found"})
		return
	}
	skip, limit := parseSkipLimit(c)
	if limit > 200 {
		limit = 200
	}
	list, err := h.svc.ListRemoteMessages(c.Request.Context(), projectID, sessionID, skip, limit)
	if err != nil {
		if errors.Is(err, chat.ErrUpstreamSessionConflict) {
			c.JSON(http.StatusConflict, gin.H{"detail": err.Error()})
			return
		}
		if errors.Is(err, chat.ErrUpstreamSessionUnbound) {
			c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
			return
		}
		c.JSON(http.StatusBadGateway, gin.H{"detail": "remote message fetch failed"})
		return
	}
	c.JSON(http.StatusOK, toMessageListResponse(list))
}

func (h *ChatHandler) sourceFile(c *gin.Context) {
	_, ok := GetCurrentUser(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"detail": "Not authenticated"})
		return
	}
	sourceID := strings.TrimSpace(c.Param("source_id"))
	if sourceID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"detail": "source_id is required"})
		return
	}
	source, err := h.svc.GetSourceFile(c.Request.Context(), sourceID)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"detail": "failed to fetch source"})
		return
	}
	filename := source.FileName
	if strings.TrimSpace(filename) == "" {
		filename = sourceID
	}
	disposition := "inline"
	if c.Query("download") == "1" {
		disposition = "attachment"
	}
	c.Header("Content-Type", source.ContentType)
	c.Header("Content-Disposition", fmt.Sprintf("%s; filename=%q", disposition, filename))
	c.Data(http.StatusOK, source.ContentType, source.Content)
}
