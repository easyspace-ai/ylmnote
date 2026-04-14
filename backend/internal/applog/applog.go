package applog

import (
	"log/slog"
	"os"
	"strings"
)

// Init 配置全局 JSON slog；development 下为 Debug 级别。
func Init(appEnv string) {
	level := slog.LevelInfo
	if strings.EqualFold(strings.TrimSpace(appEnv), "development") {
		level = slog.LevelDebug
	}
	h := slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: level})
	slog.SetDefault(slog.New(h))
}
