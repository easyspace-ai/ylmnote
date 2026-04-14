package http

import (
	"net/http"
	"strings"

	"github.com/easyspace-ai/ylmnote/internal/application/project"
	projectdomain "github.com/easyspace-ai/ylmnote/internal/domain/project"
	"github.com/gin-gonic/gin"
)

// PromptTemplateHandler Studio 提示词模板 HTTP 处理
type PromptTemplateHandler struct {
	svc *project.Service
}

func NewPromptTemplateHandler(svc *project.Service) *PromptTemplateHandler {
	return &PromptTemplateHandler{svc: svc}
}

func (h *PromptTemplateHandler) RegisterRoutes(r *gin.RouterGroup) {
	r.GET("", h.listTemplates)
	r.POST("", h.createTemplate)
	r.GET("/:id", h.getTemplate)
	r.PATCH("/:id", h.updateTemplate)
	r.DELETE("/:id", h.deleteTemplate)
}

func (h *PromptTemplateHandler) listTemplates(c *gin.Context) {
	u, ok := GetCurrentUser(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"detail": "Not authenticated"})
		return
	}
	if err := h.svc.EnsureDefaultPromptTemplates(u.ID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"detail": "failed to initialize prompt templates"})
		return
	}
	list, err := h.svc.ListPromptTemplates(u.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"detail": "failed to list prompt templates"})
		return
	}
	c.JSON(http.StatusOK, toPromptTemplateListResponse(list))
}

type createPromptTemplateRequest struct {
	ActionType string `json:"action_type" binding:"required"`
	Name       string `json:"name" binding:"required"`
	Prompt     string `json:"prompt" binding:"required"`
}

func (h *PromptTemplateHandler) createTemplate(c *gin.Context) {
	u, ok := GetCurrentUser(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"detail": "Not authenticated"})
		return
	}
	var req createPromptTemplateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": "invalid request body"})
		return
	}
	if strings.TrimSpace(req.ActionType) == "" || strings.TrimSpace(req.Name) == "" || strings.TrimSpace(req.Prompt) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"detail": "action_type, name and prompt are required"})
		return
	}

	template, err := h.svc.CreatePromptTemplate(u.ID, project.PromptTemplateCreateInput{
		ActionType: strings.TrimSpace(req.ActionType),
		Name:       strings.TrimSpace(req.Name),
		Prompt:     strings.TrimSpace(req.Prompt),
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"detail": "failed to create prompt template"})
		return
	}
	c.JSON(http.StatusCreated, toPromptTemplateResponse(template))
}

func (h *PromptTemplateHandler) getTemplate(c *gin.Context) {
	u, ok := GetCurrentUser(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"detail": "Not authenticated"})
		return
	}
	template, err := h.svc.GetPromptTemplate(u.ID, c.Param("id"))
	if err != nil || template == nil {
		c.JSON(http.StatusNotFound, gin.H{"detail": "PromptTemplate not found"})
		return
	}
	c.JSON(http.StatusOK, toPromptTemplateResponse(template))
}

type updatePromptTemplateRequest struct {
	ActionType *string `json:"action_type"`
	Name       *string `json:"name"`
	Prompt     *string `json:"prompt"`
}

func (h *PromptTemplateHandler) updateTemplate(c *gin.Context) {
	u, ok := GetCurrentUser(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"detail": "Not authenticated"})
		return
	}
	var req updatePromptTemplateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": "invalid request body"})
		return
	}

	normalize := func(v *string) *string {
		if v == nil {
			return nil
		}
		s := strings.TrimSpace(*v)
		return &s
	}

	in := project.PromptTemplateUpdateInput{
		ActionType: normalize(req.ActionType),
		Name:       normalize(req.Name),
		Prompt:     normalize(req.Prompt),
	}
	template, err := h.svc.UpdatePromptTemplate(u.ID, c.Param("id"), in)
	if err != nil || template == nil {
		c.JSON(http.StatusNotFound, gin.H{"detail": "PromptTemplate not found"})
		return
	}
	c.JSON(http.StatusOK, toPromptTemplateResponse(template))
}

func (h *PromptTemplateHandler) deleteTemplate(c *gin.Context) {
	u, ok := GetCurrentUser(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"detail": "Not authenticated"})
		return
	}
	if err := h.svc.DeletePromptTemplate(u.ID, c.Param("id")); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"detail": "PromptTemplate not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "PromptTemplate deleted"})
}

func toPromptTemplateResponse(t *projectdomain.PromptTemplate) gin.H {
	return gin.H{
		"id":          t.ID,
		"action_type": t.ActionType,
		"name":        t.Name,
		"prompt":      t.Prompt,
		"created_at":  t.CreatedAt,
		"updated_at":  t.UpdatedAt,
	}
}

func toPromptTemplateListResponse(list []*projectdomain.PromptTemplate) []gin.H {
	out := make([]gin.H, len(list))
	for i, item := range list {
		out[i] = toPromptTemplateResponse(item)
	}
	return out
}
