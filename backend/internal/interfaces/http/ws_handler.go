package http

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/easyspace-ai/ylmnote/internal/application/auth"
	"github.com/easyspace-ai/ylmnote/internal/domain/project"
	"github.com/easyspace-ai/ylmnote/internal/domain/user"
	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/gorilla/websocket"
	wsdk "ws-chat-tester/sdk"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

// WSHandler 处理 WebSocket 代理连接
type WSHandler struct {
	sdkClient    *wsdk.Client
	authSvc      *auth.Service
	resourceRepo project.ResourceRepository
	sessionRepo  project.SessionRepository
}

// NewWSHandler 创建新的 WebSocket 处理器（对话内容不落库，见 tryExtractArtifacts 注释）
func NewWSHandler(sdkClient *wsdk.Client, authSvc *auth.Service, resourceRepo project.ResourceRepository, sessionRepo project.SessionRepository) *WSHandler {
	return &WSHandler{
		sdkClient:    sdkClient,
		authSvc:      authSvc,
		resourceRepo: resourceRepo,
		sessionRepo:  sessionRepo,
	}
}

// HandleChat 处理前端 WebSocket 连接并代理到上游
// GET /api/ws/chat?session_id=xxx&project_id=xxx&token=xxx
func (h *WSHandler) HandleChat(c *gin.Context) {
	sessionID := c.Query("session_id")
	if sessionID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "session_id is required"})
		return
	}

	// JWT 认证（从 query 参数获取 token）
	tokenStr := c.Query("token")
	if tokenStr == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "token is required"})
		return
	}

	// 验证 token
	u, err := h.validateToken(tokenStr)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid token"})
		return
	}

	// 将用户信息存入 context（供后续使用）
	c.Set(currentUserKey, u)

	// 解析 project_id：优先从 query 获取，否则从 session 表反查
	projectID := c.Query("project_id")
	if projectID == "" {
		projectID, _ = h.resolveProjectIDFromSession(sessionID)
	}

	// 升级为 WebSocket
	clientConn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		return
	}
	defer clientConn.Close()

	// 检查 SDK 客户端是否初始化
	if h.sdkClient == nil {
		clientConn.WriteJSON(map[string]string{
			"type":  "error",
			"error": "SDK client not initialized",
		})
		return
	}

	// 连接上游 SDK WebSocket
	upstreamConn, err := h.sdkClient.DialSession(c.Request.Context(), sessionID)
	if err != nil {
		clientConn.WriteJSON(map[string]string{
			"type":  "error",
			"error": "failed to connect upstream: " + err.Error(),
		})
		return
	}
	defer upstreamConn.Close()

	// 双向透传
	errCh := make(chan error, 2)
	doneCh := make(chan struct{})

	// 上游 -> 前端
	go func() {
		defer func() { close(doneCh) }()
		for {
			msgType, msg, err := upstreamConn.ReadMessage()
			if err != nil {
				select {
				case errCh <- err:
				case <-doneCh:
				}
				return
			}

			// 1. 先转发给前端（不阻塞）
			if err := clientConn.WriteMessage(msgType, msg); err != nil {
				select {
				case errCh <- err:
				case <-doneCh:
				}
				return
			}

			// 2. 异步提取 artifact（仅文本消息 + 有 projectID）
			if msgType == websocket.TextMessage && projectID != "" {
				go h.tryExtractArtifacts(projectID, sessionID, msg)
			}
		}
	}()

	// 前端 -> 上游
	go func() {
		for {
			msgType, msg, err := clientConn.ReadMessage()
			if err != nil {
				select {
				case errCh <- err:
				case <-doneCh:
				}
				return
			}
			// 文本消息需要处理 attachments：前端传的是 resource.id，需要转换为 file_id
			if msgType == websocket.TextMessage && projectID != "" {
				msg = h.transformInputAttachments(projectID, msg)
			}
			if err := upstreamConn.WriteMessage(msgType, msg); err != nil {
				select {
				case errCh <- err:
				case <-doneCh:
				}
				return
			}
		}
	}()

	// 等待任一方向出错
	<-errCh
}

// resolveProjectIDFromSession 从 session 表反查 project_id
func (h *WSHandler) resolveProjectIDFromSession(sessionID string) (string, error) {
	if h.sessionRepo == nil {
		return "", nil
	}
	sess, err := h.sessionRepo.GetByID(sessionID)
	if err != nil {
		return "", err
	}
	return sess.ProjectID, nil
}

// transformInputAttachments 将前端 input 消息中的 resource.id 转换为上游需要的 file_id。
// 前端上传文件后得到 resource 记录，但上游 SDK 需要原始的 file_id。
func (h *WSHandler) transformInputAttachments(projectID string, rawMsg []byte) []byte {
	var frame map[string]any
	if err := json.Unmarshal(rawMsg, &frame); err != nil {
		slog.Debug("transform_attachments_parse_failed", slog.String("error", err.Error()))
		return rawMsg
	}
	// 只处理 input 类型的消息
	msgType, _ := frame["type"].(string)
	if msgType != "input" {
		return rawMsg
	}
	attachmentsRaw, ok := frame["attachments"].([]any)
	if !ok || len(attachmentsRaw) == 0 {
		return rawMsg
	}
	slog.Info("transform_attachments_start", slog.String("project_id", projectID), slog.Int("count", len(attachmentsRaw)))
	transformed := make([]string, 0, len(attachmentsRaw))
	for _, raw := range attachmentsRaw {
		id, ok := raw.(string)
		if !ok || id == "" {
			continue
		}
		// 如果已经是 file_ 或 src_ 开头，直接使用
		if strings.HasPrefix(id, "file_") || strings.HasPrefix(id, "src_") {
			transformed = append(transformed, id)
			slog.Debug("transform_attachments_use_direct", slog.String("id", id))
			continue
		}
		// 查询 resource 获取 URL，从中提取 file_id
		fileID := h.resolveResourceToFileID(projectID, id)
		if fileID != "" {
			transformed = append(transformed, fileID)
			slog.Info("transform_attachments_success", slog.String("resource_id", id), slog.String("file_id", fileID))
		} else {
			// 转换失败但保留原始 ID（可能上游能处理）
			transformed = append(transformed, id)
			slog.Warn("transform_attachments_failed", slog.String("resource_id", id))
		}
	}
	frame["attachments"] = transformed
	out, err := json.Marshal(frame)
	if err != nil {
		slog.Error("transform_attachments_marshal_failed", slog.String("error", err.Error()))
		return rawMsg
	}
	return out
}

// resolveResourceToFileID 根据 resource ID 解析出 file_id。
// 优先从 URL 字段的 "sdk-file:" 或 "/api/source/" 格式提取，失败则返回空字符串。
func (h *WSHandler) resolveResourceToFileID(projectID, resourceID string) string {
	if h.resourceRepo == nil {
		return ""
	}
	r, err := h.resourceRepo.GetByID(projectID, resourceID)
	if err != nil || r == nil {
		slog.Debug("resolve_resource_not_found", slog.String("project_id", projectID), slog.String("resource_id", resourceID))
		return ""
	}
	// URL 格式: "sdk-file:{file_id}" 或 "source:{file_id}" 或 "/api/source/{file_id}"
	if r.URL != nil && *r.URL != "" {
		url := *r.URL
		if strings.HasPrefix(url, "sdk-file:") {
			return strings.TrimPrefix(url, "sdk-file:")
		}
		if strings.HasPrefix(url, "source:") {
			return strings.TrimPrefix(url, "source:")
		}
		if idx := strings.Index(url, "/api/source/"); idx >= 0 {
			return strings.TrimPrefix(url[idx:], "/api/source/")
		}
	}
	// 如果 URL 为空或无法解析，尝试从 resource ID 本身推断（如果它已经是 file_ 格式）
	if strings.HasPrefix(resourceID, "file_") || strings.HasPrefix(resourceID, "src_") {
		return resourceID
	}
	slog.Debug("resolve_resource_url_unrecognized", slog.String("resource_id", resourceID), slog.String("url", func() string {
		if r.URL == nil {
			return ""
		}
		return *r.URL
	}()))
	return ""
}

// tryExtractArtifacts 从上游消息中异步提取 artifact 并落库。
// 必须在 goroutine 中调用，不可阻塞消息转发。
func (h *WSHandler) tryExtractArtifacts(projectID, sessionID string, rawMsg []byte) {
	defer func() {
		if r := recover(); r != nil {
			slog.Error("artifact_extract_panic", slog.Any("recover", r), slog.String("project_id", projectID), slog.String("session_id", sessionID))
		}
	}()

	slog.Info("artifact_extract_start", slog.String("project_id", projectID), slog.String("session_id", sessionID), slog.Int("msg_len", len(rawMsg)))

	// 1. JSON 解析
	var frame map[string]any
	if err := json.Unmarshal(rawMsg, &frame); err != nil {
		slog.Error("artifact_extract_parse_failed", slog.String("error", err.Error()))
		return
	}

	// 2. 检查 type == "update"
	msgType, _ := frame["type"].(string)
	if msgType != "update" {
		slog.Debug("artifact_extract_skip_non_update", slog.String("type", msgType))
		return
	}

	slog.Info("artifact_extract_processing_update", slog.String("project_id", projectID), slog.String("session_id", sessionID))

	// 3. 提取 messages 中的 resource parts
	messages, ok := frame["messages"].([]any)
	resourceCount := 0
	if !ok {
		slog.Debug("artifact_extract_no_messages")
	} else {
		slog.Info("artifact_extract_found_messages", slog.Int("count", len(messages)))

		for _, rawMsg := range messages {
			msg, ok := rawMsg.(map[string]any)
			if !ok {
				continue
			}

			// 过滤：只处理 AI 生成的消息（kind != "from_user"）
			kind, _ := msg["kind"].(string)
			if kind == "from_user" {
				continue
			}

			parts, ok := msg["message_parts"].([]any)
			if !ok {
				continue
			}

			for _, rawPart := range parts {
				part, ok := rawPart.(map[string]any)
				if !ok {
					continue
				}

				partType, _ := part["type"].(string)
				if partType != "resource" {
					continue
				}

				// 提取 resource 信息
				resource, ok := part["resource"].(map[string]any)
				if !ok {
					slog.Warn("artifact_extract_resource_not_map")
					continue
				}

				resourceCount++
				slog.Info("artifact_extract_found_resource", slog.Int("index", resourceCount), slog.Any("resource_keys", getMapKeys(resource)))
				h.processArtifactResource(projectID, sessionID, resource)
			}
		}

		slog.Info("artifact_extract_complete", slog.String("project_id", projectID), slog.Int("resources_found", resourceCount))

		// 不在此将上游对话写入 messages 表：产品约定聊天为实时展示，不以本地库作会话缓存。
	}

	// 4. 处理 todos 和会话标题同步
	if state, ok := frame["state"].(map[string]any); ok {
		// 同步会话标题
		if title, ok := state["title"].(string); ok && strings.TrimSpace(title) != "" && h.sessionRepo != nil {
			if sess, err := h.sessionRepo.GetByID(sessionID); err == nil && sess.Title != title {
				sess.Title = title
				sess.UpdatedAt = time.Now().UTC()
				if err := h.sessionRepo.Update(sess); err != nil {
					slog.Error("session_title_sync_failed", slog.String("session_id", sessionID), slog.String("error", err.Error()))
				} else {
					slog.Info("session_title_synced", slog.String("session_id", sessionID), slog.String("title", title))
				}
			}
		}

		// 处理 todos（现有逻辑不变）
		if todos, ok := state["todos"]; ok {
			h.persistTodos(projectID, sessionID, todos)
		}
	}
}

// getMapKeys 获取 map 的所有 key（用于日志）
func getMapKeys(m map[string]any) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	return keys
}

// processArtifactResource 处理单个 artifact resource 并 upsert 到数据库
// 如果有 content，会保存到本地文件系统；如果 content 为空但有 id，会尝试从上游获取内容
func (h *WSHandler) processArtifactResource(projectID, sessionID string, resource map[string]any) {
	id, _ := resource["id"].(string)
	kind, _ := resource["kind"].(string)
	_ = kind // 保留供后续扩展

	var filename, path string
	if data, ok := resource["data"].(map[string]any); ok {
		filename, _ = data["filename"].(string)
		path, _ = data["path"].(string)
	}
	// 如果 data.filename 为空，尝试 resource.name
	if filename == "" {
		filename, _ = resource["name"].(string)
	}

	slog.Info("processArtifactResource_start",
		slog.String("resource_id", id),
		slog.String("filename", filename),
		slog.String("path", path),
		slog.String("project_id", projectID),
	)

	if id == "" && filename == "" {
		slog.Warn("processArtifactResource_skip_no_id_and_filename")
		return
	}

	// 推断资源类型
	resourceType := inferArtifactResourceType(filename)

	// 生成资源 ID
	resourceID := id
	if resourceID == "" {
		resourceID = "artifact::" + filename
	}

	// 尝试提取 content（支持字符串和字节数组两种格式）
	var content *string

	if c, ok := resource["content"].(string); ok && strings.TrimSpace(c) != "" {
		// Case 1: content 是字符串
		content = &c
		slog.Info("processArtifactResource_content_string", slog.String("resource_id", resourceID), slog.Int("content_len", len(c)))
	} else if byteArr, ok := resource["content"].([]interface{}); ok && len(byteArr) > 0 {
		// Case 2: content 是字节码数组 [60, 33, 68, ...]（上游常用格式）
		byteSlice := make([]byte, 0, len(byteArr))
		for _, b := range byteArr {
			if num, ok := b.(float64); ok {
				byteSlice = append(byteSlice, byte(int(num)))
			}
		}
		if len(byteSlice) > 0 {
			decoded := string(byteSlice)
			content = &decoded
			slog.Info("processArtifactResource_content_bytes", slog.String("resource_id", resourceID), slog.Int("byte_count", len(byteSlice)))
		}
	} else {
		slog.Info("processArtifactResource_no_content_in_ws", slog.String("resource_id", resourceID))
	}

	// 如果 WS 消息中没有 content，但有 source id，尝试从上游获取
	fetchedFromUpstream := false
	if content == nil && id != "" && !strings.HasPrefix(id, "artifact::") {
		slog.Info("processArtifactResource_fetching_from_upstream", slog.String("source_id", id))
		if h.sdkClient != nil {
			ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
			defer cancel()
			data, contentType, err := h.sdkClient.DownloadSource(ctx, id)
			if err == nil && len(data) > 0 {
				c := string(data)
				content = &c
				fetchedFromUpstream = true
				slog.Info("processArtifactResource_fetched_from_upstream",
					slog.String("source_id", id),
					slog.Int("data_len", len(data)),
					slog.String("content_type", contentType),
				)
			} else {
				slog.Error("processArtifactResource_fetch_failed",
					slog.String("source_id", id),
					slog.String("error", err.Error()),
				)
			}
		} else {
			slog.Warn("processArtifactResource_sdk_client_nil")
		}
	}

	// URL：优先使用本地文件路径（如果有 content）
	url := ""
	if content != nil {
		// 有 content，保存到本地文件
		savedPath, err := saveArtifactContent(projectID, filename, *content)
		if err == nil && savedPath != "" {
			url = "file:" + savedPath
			slog.Info("processArtifactResource_saved_to_file",
				slog.String("resource_id", resourceID),
				slog.String("path", savedPath),
				slog.Bool("from_upstream", fetchedFromUpstream),
			)
		} else {
			slog.Error("processArtifactResource_save_failed",
				slog.String("resource_id", resourceID),
				slog.String("error", err.Error()),
			)
		}
	}
	// 如果没有成功保存文件，使用 source 或 sdk-file 作为 fallback
	if url == "" {
		if id != "" && !strings.HasPrefix(id, "artifact::") {
			url = "source:" + id
		} else if path != "" {
			url = "sdk-file:" + path
		}
		slog.Info("processArtifactResource_using_fallback_url",
			slog.String("resource_id", resourceID),
			slog.String("url", url),
		)
	}

	// Upsert 到数据库
	existing, err := h.resourceRepo.GetByID(projectID, resourceID)
	if err == nil && existing != nil {
		// 更新
		existing.Name = filename
		if url != "" {
			existing.URL = &url
		}
		if content != nil {
			existing.Content = content
		}
		existing.SessionID = &sessionID
		existing.Type = resourceType
		if err := h.resourceRepo.Update(existing); err != nil {
			slog.Error("artifact_update_failed", slog.String("resource_id", resourceID), slog.Any("err", err))
		} else {
			slog.Info("artifact_updated", slog.String("resource_id", resourceID), slog.String("url", url))
		}
	} else {
		// 创建
		sid := sessionID
		entity := &project.Resource{
			ID:        resourceID,
			ProjectID: projectID,
			SessionID: &sid,
			Type:      resourceType,
			Name:      filename,
			URL:       nil,
			Content:   content,
			CreatedAt: time.Now().UTC(),
		}
		if url != "" {
			entity.URL = &url
		}
		if err := h.resourceRepo.Create(entity); err != nil {
			slog.Error("artifact_create_failed", slog.String("resource_id", resourceID), slog.Any("err", err))
		} else {
			slog.Info("artifact_created", slog.String("resource_id", resourceID), slog.String("url", url))
		}
	}
}

// saveArtifactContent 将 artifact content 保存到本地文件系统
// 返回相对路径（相对于 backend 工作目录）
func saveArtifactContent(projectID, filename, content string) (string, error) {
	// 清理文件名，防止路径遍历
	filename = filepath.Base(filename)
	if filename == "" || filename == "." || filename == ".." {
		return "", fmt.Errorf("invalid filename")
	}

	// 处理文件名冲突：添加时间戳前缀
	timestamp := time.Now().Unix()
	ext := filepath.Ext(filename)
	nameWithoutExt := strings.TrimSuffix(filename, ext)
	filename = fmt.Sprintf("%s_%d%s", nameWithoutExt, timestamp, ext)

	// 构建目录路径：backend/artifacts/{projectID}/
	// 使用绝对路径确保文件保存位置正确
	workDir, err := os.Getwd()
	if err != nil {
		workDir = "."
	}
	dirPath := filepath.Join(workDir, "artifacts", projectID)
	if err := os.MkdirAll(dirPath, 0755); err != nil {
		return "", fmt.Errorf("failed to create directory: %w", err)
	}

	// 完整文件路径
	filePath := filepath.Join(dirPath, filename)

	// 写入文件内容
	if err := os.WriteFile(filePath, []byte(content), 0644); err != nil {
		return "", fmt.Errorf("failed to write file: %w", err)
	}

	// 返回相对路径（用于数据库存储）：artifacts/{projectID}/{filename}
	relPath := filepath.Join("artifacts", projectID, filename)
	return relPath, nil
}

// inferArtifactResourceType 根据文件名推断资源类型
func inferArtifactResourceType(filename string) string {
	lower := strings.ToLower(filename)
	if strings.HasSuffix(lower, ".html") || strings.HasSuffix(lower, ".htm") {
		return "html_page"
	}
	return "artifact"
}

// persistTodos 持久化 todos 状态
func (h *WSHandler) persistTodos(projectID, sessionID string, todos any) {
	todosJSON, err := json.Marshal(todos)
	if err != nil {
		return
	}

	todoID := "todo-state::" + sessionID
	content := string(todosJSON)

	existing, err := h.resourceRepo.GetByID(projectID, todoID)
	if err == nil && existing != nil {
		existing.Content = &content
		existing.SessionID = &sessionID
		existing.Name = "会话待办"
		existing.Type = "todo_state"
		if err := h.resourceRepo.Update(existing); err != nil {
			slog.Error("todo_update_failed", slog.String("todo_id", todoID), slog.Any("err", err))
		}
	} else {
		sid := sessionID
		entity := &project.Resource{
			ID:        todoID,
			ProjectID: projectID,
			SessionID: &sid,
			Type:      "todo_state",
			Name:      "会话待办",
			Content:   &content,
			CreatedAt: time.Now().UTC(),
		}
		if err := h.resourceRepo.Create(entity); err != nil {
			slog.Error("todo_create_failed", slog.String("todo_id", todoID), slog.Any("err", err))
		}
	}
}

// validateToken 验证 JWT token 并返回用户
func (h *WSHandler) validateToken(tokenStr string) (*user.User, error) {
	parsed, err := jwt.Parse(tokenStr, func(token *jwt.Token) (interface{}, error) {
		if token.Method.Alg() != jwt.SigningMethodHS256.Alg() {
			return nil, jwt.ErrTokenSignatureInvalid
		}
		return []byte(h.authSvc.Secret()), nil
	})
	if err != nil || !parsed.Valid {
		return nil, err
	}

	claims, ok := parsed.Claims.(jwt.MapClaims)
	if !ok {
		return nil, jwt.ErrTokenInvalidClaims
	}

	sub, _ := claims["sub"].(string)
	if sub == "" {
		return nil, jwt.ErrTokenInvalidClaims
	}

	u, err := h.authSvc.GetUserByID(sub)
	if err != nil {
		return nil, err
	}

	return u, nil
}
