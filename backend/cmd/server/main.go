package main

import (
	"fmt"
	"log/slog"
	"os"
	"os/signal"
	"syscall"

	"github.com/easyspace-ai/ylmnote/internal/applog"
	"github.com/easyspace-ai/ylmnote/internal/config"
	"github.com/easyspace-ai/ylmnote/internal/infrastructure/persistence"
	"github.com/easyspace-ai/ylmnote/internal/interfaces/http"
)

func main() {
	cfg := config.Load()

	if err := applog.Init(cfg.AppEnv, cfg.LogFilePath, cfg.LogToStdout); err != nil {
		fmt.Println("init logger failed:", err)
		os.Exit(1)
	}
	defer applog.Close()
	db, err := persistence.New(cfg.DatabaseURL)
	if err != nil {
		slog.Error("database_init_failed", slog.Any("err", err))
		os.Exit(1)
	}
	defer db.Close()

	router := http.Wire(cfg, db)
	srvAddr := fmt.Sprintf(":%s", cfg.HTTPPort)
	slog.Info("server_listen", slog.String("addr", srvAddr), slog.String("env", cfg.AppEnv))

	go func() {
		if err := router.Run(srvAddr); err != nil {
			slog.Error("http_server_failed", slog.Any("err", err))
			os.Exit(1)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	slog.Info("server_shutdown")
}
