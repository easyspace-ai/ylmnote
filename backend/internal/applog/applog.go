package applog

import (
	"io"
	"log"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"sync"
)

var (
	logFileMu sync.Mutex
	logFile   *os.File
)

// Init 配置全局 JSON slog；development 下为 Debug 级别。
// 可同时输出到 stdout 与本地文件（append 模式）。
func Init(appEnv, logFilePath string, logToStdout bool) error {
	level := slog.LevelInfo
	if strings.EqualFold(strings.TrimSpace(appEnv), "development") {
		level = slog.LevelDebug
	}
	writers := make([]io.Writer, 0, 2)
	if logToStdout {
		writers = append(writers, os.Stdout)
	}
	if strings.TrimSpace(logFilePath) != "" {
		if err := os.MkdirAll(filepath.Dir(logFilePath), 0o755); err != nil {
			return err
		}
		f, err := os.OpenFile(logFilePath, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o644)
		if err != nil {
			return err
		}
		logFileMu.Lock()
		logFile = f
		logFileMu.Unlock()
		writers = append(writers, f)
	}
	if len(writers) == 0 {
		// 兜底：至少输出到 stdout，避免“静默无日志”。
		writers = append(writers, os.Stdout)
	}
	h := slog.NewJSONHandler(io.MultiWriter(writers...), &slog.HandlerOptions{Level: level})
	slog.SetDefault(slog.New(h))
	return nil
}

func Close() {
	logFileMu.Lock()
	defer logFileMu.Unlock()
	if logFile != nil {
		if err := logFile.Close(); err != nil {
			log.Printf("warning: close log file failed: %v", err)
		}
		logFile = nil
	}
}
