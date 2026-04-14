package http

import (
	"log"
	"strings"

	"github.com/easyspace-ai/ylmnote/internal/config"
	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
)

func splitOrigins(raw string) []string {
	parts := strings.Split(raw, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p != "" {
			out = append(out, p)
		}
	}
	return out
}

// CORSMiddleware 非 production 且未配置 CORS_ALLOWED_ORIGINS 时允许任意 Origin；production 必须白名单。
func CORSMiddleware(cfg *config.Config) gin.HandlerFunc {
	origins := splitOrigins(cfg.CORSAllowedOrigins)
	if strings.EqualFold(strings.TrimSpace(cfg.AppEnv), "production") {
		if len(origins) == 0 {
			log.Fatal("CORS_ALLOWED_ORIGINS is required when APP_ENV=production")
		}
		return cors.New(cors.Config{
			AllowOrigins:     origins,
			AllowMethods:     []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"},
			AllowHeaders:     []string{"Origin", "Content-Type", "Accept", "Authorization"},
			ExposeHeaders:    []string{"Content-Length"},
			AllowCredentials: true,
		})
	}
	if len(origins) == 0 {
		return cors.New(cors.Config{
			AllowAllOrigins:  true,
			AllowMethods:     []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"},
			AllowHeaders:     []string{"*"},
			AllowCredentials: false,
		})
	}
	return cors.New(cors.Config{
		AllowOrigins:     origins,
		AllowMethods:     []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Accept", "Authorization"},
		ExposeHeaders:    []string{"Content-Length"},
		AllowCredentials: true,
	})
}
