package http

import (
	"context"
	"log/slog"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type ctxKey int

const requestIDCtxKey ctxKey = 1

// RequestIDFromContext 供业务层打日志时附带 request id。
func RequestIDFromContext(ctx context.Context) string {
	v, ok := ctx.Value(requestIDCtxKey).(string)
	if !ok {
		return ""
	}
	return v
}

// RequestLogMiddleware 注入 X-Request-ID 并在结束时打一条结构化访问日志。
func RequestLogMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		rid := strings.TrimSpace(c.GetHeader("X-Request-ID"))
		if rid == "" {
			rid = uuid.NewString()
		}
		c.Writer.Header().Set("X-Request-ID", rid)
		ctx := context.WithValue(c.Request.Context(), requestIDCtxKey, rid)
		c.Request = c.Request.WithContext(ctx)
		start := time.Now()
		c.Next()
		slog.InfoContext(ctx, "http_request",
			slog.String("method", c.Request.Method),
			slog.String("path", c.Request.URL.Path),
			slog.Int("status", c.Writer.Status()),
			slog.Int64("duration_ms", time.Since(start).Milliseconds()),
			slog.String("request_id", rid),
		)
	}
}
