package http

import (
	"github.com/easyspace-ai/ylmnote/internal/application/chat"
	"github.com/gin-gonic/gin"
)

// ChatHandler 对话 HTTP 处理
type ChatHandler struct {
	svc *chat.Service
}

func NewChatHandler(svc *chat.Service) *ChatHandler {
	return &ChatHandler{svc: svc}
}

func (h *ChatHandler) RegisterRoutes(r *gin.RouterGroup) {
	// 所有 upstream 相关路由已在新架构下移除
}
