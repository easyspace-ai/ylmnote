package http

import (
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/easyspace-ai/ylmnote/internal/application/auth"
	"github.com/easyspace-ai/ylmnote/internal/application/chat"
	"github.com/easyspace-ai/ylmnote/internal/application/project"
	"github.com/easyspace-ai/ylmnote/internal/application/skill"
	"github.com/easyspace-ai/ylmnote/internal/application/user"
	"github.com/easyspace-ai/ylmnote/internal/config"
	sdkclient "github.com/easyspace-ai/ylmnote/internal/infrastructure/ai/gateway/client"
	sdkprovider "github.com/easyspace-ai/ylmnote/internal/infrastructure/ai/gateway/provider"
	"github.com/easyspace-ai/ylmnote/internal/infrastructure/persistence"
	"github.com/gin-gonic/gin"
	wsdk "ws-chat-tester/sdk"
)

// Wire 组装路由与依赖（可后续改为 wire/codegen）
func Wire(cfg *config.Config, db *persistence.DB) *gin.Engine {
	r := gin.New()
	r.Use(gin.Recovery())
	r.Use(RequestLogMiddleware())
	r.Use(CORSMiddleware(cfg))

	r.GET("/health", Health)

	apiLimiter := newMinuteLimiter(cfg.RateLimitAPIPerMinute)
	authLimiter := newMinuteLimiter(cfg.RateLimitAuthPerMinute)

	api := r.Group("/api")
	api.Use(apiLimiter.Middleware())
	userRepo := persistence.NewUserRepository(db)
	authSvc := auth.NewService(cfg, userRepo)
	authHandler := NewAuthHandler(authSvc, cfg)
	authRoutes := api.Group("/auth")
	authRoutes.Use(authLimiter.Middleware())
	authHandler.RegisterRoutes(authRoutes)

	projectRepo := persistence.NewProjectRepository(db)
	sessionRepo := persistence.NewSessionRepository(db)
	messageRepo := persistence.NewMessageRepository(db)
	resourceRepo := persistence.NewResourceRepository(db)
	promptTemplateRepo := persistence.NewPromptTemplateRepository(db)

	provider := sdkprovider.New(sdkprovider.Config{
		BaseURL:       cfg.SDK.BaseURL,
		ServiceAPIKey: cfg.SDK.ServiceAPIKey,
		UploadPath:    cfg.SDK.UploadPath,
		Timeout:       time.Duration(cfg.SDK.TimeoutSec) * time.Second,
		Debug:         cfg.SDK.Debug,
	})
	aiSDK := sdkclient.New(provider, sdkclient.RetryConfig{
		MaxAttempts: cfg.SDK.RetryMax,
		BaseDelay:   400 * time.Millisecond,
		Debug:       cfg.SDK.Debug,
	})
	if cfg.SDK.Debug {
		slog.Info("ai_sdk_debug_enabled")
	}

	// 创建原始 SDK client 供 WebSocket 代理使用
	rawSDKClient, err := wsdk.NewClient(wsdk.Config{
		BaseURL: cfg.SDK.BaseURL,
		APIKey:  cfg.SDK.ServiceAPIKey,
		Timeout: time.Duration(cfg.SDK.TimeoutSec) * time.Second,
	})
	if err != nil {
		slog.Error("failed to init ws sdk client", slog.Any("err", err))
	}

	projectSvc := project.NewService(projectRepo, sessionRepo, messageRepo, resourceRepo, promptTemplateRepo, aiSDK)

	projectHandler := NewProjectHandler(projectSvc, aiSDK, rawSDKClient, resourceRepo)
	projectsGroup := api.Group("/projects")
	projectsGroup.Use(AuthMiddleware(authSvc))
	projectHandler.RegisterRoutes(projectsGroup)
	// artifact 下载和预览端点
	projectsGroup.GET("/:project_id/artifacts/:artifactId/download", projectHandler.downloadArtifact)
	projectsGroup.GET("/:project_id/artifacts/:artifactId/preview", projectHandler.previewArtifact)

	promptTemplateHandler := NewPromptTemplateHandler(projectSvc)
	promptTemplateGroup := api.Group("/prompt-templates")
	promptTemplateGroup.Use(AuthMiddleware(authSvc))
	promptTemplateHandler.RegisterRoutes(promptTemplateGroup)

	chatSvc := chat.NewService(projectRepo, sessionRepo, messageRepo, resourceRepo, userRepo, cfg.ChatCreditCost, aiSDK, cfg.SDK.Debug)

	chatHandler := NewChatHandler(chatSvc)
	chatGroup := api.Group("/chat")
	chatGroup.Use(AuthMiddleware(authSvc))
	chatHandler.RegisterRoutes(chatGroup)

	skillRepo := persistence.NewSkillRepository(db)
	skillSvc := skill.NewService(skillRepo)
	skillHandler := NewSkillHandler(skillSvc)
	skillsGroup := api.Group("/skills")
	skillsGroup.Use(AuthMiddleware(authSvc))
	skillHandler.RegisterRoutes(skillsGroup)

	modelsGroup := api.Group("/models")
	modelsHandler := NewModelsHandler()
	modelsHandler.RegisterRoutes(modelsGroup)

	userSvc := user.NewService(userRepo)
	userHandler := NewUserHandler(userSvc)
	userGroup := api.Group("/user")
	userGroup.Use(AuthMiddleware(authSvc))
	userHandler.RegisterRoutes(userGroup)

	// WebSocket 代理端点 - 透传前端到上游 SDK 的连接
	// 注意：不使用 AuthMiddleware，token 从 query 参数获取
	wsHandler := NewWSHandler(rawSDKClient, authSvc, resourceRepo, sessionRepo)
	api.GET("/ws/chat", wsHandler.HandleChat)

	// 静态文件服务 - 前端集成
	slog.Info("spa_static_root", slog.String("dir", staticRoot()))
	r.NoRoute(serveSPA)

	return r
}

var (
	staticRootOnce sync.Once
	staticRootVal  string
)

// staticRoot 解析 SPA 静态目录：优先 STATIC_DIR；否则若可执行文件同目录下存在 static/ 则用之（适配 make 产物 bin/server + bin/static）；否则为当前工作目录下的 static/（适配 go run / pnpm build 到 backend/static）。
func staticRoot() string {
	staticRootOnce.Do(func() {
		if d := strings.TrimSpace(os.Getenv("STATIC_DIR")); d != "" {
			staticRootVal = d
			return
		}
		exe, err := os.Executable()
		if err == nil {
			if sym, err := filepath.EvalSymlinks(exe); err == nil {
				exe = sym
			}
			candidate := filepath.Join(filepath.Dir(exe), "static")
			if st, err := os.Stat(candidate); err == nil && st.IsDir() {
				staticRootVal = candidate
				return
			}
		}
		staticRootVal = "static"
	})
	return staticRootVal
}

// serveSPA 为 SPA 应用提供前端文件服务
func serveSPA(c *gin.Context) {
	root := staticRoot()
	rel := strings.TrimPrefix(c.Request.URL.Path, "/")
	candidate := filepath.Join(root, rel)
	if relPath, err := filepath.Rel(root, candidate); err != nil || strings.HasPrefix(relPath, "..") {
		c.AbortWithStatus(http.StatusForbidden)
		return
	}
	if fi, err := os.Stat(candidate); err == nil && !fi.IsDir() {
		c.File(candidate)
		return
	}
	c.File(filepath.Join(root, "index.html"))
}
