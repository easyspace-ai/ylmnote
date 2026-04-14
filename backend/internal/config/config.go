package config

import (
	"log"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/joho/godotenv"
)

type Config struct {
	AppName              string
	AppEnv               string
	HTTPPort             string
	DatabaseURL          string
	JWTSecret            string
	AccessTokenExpireMin int

	// W6 is configuration for the IECube W6 AI gateway.
	// All fields are loaded from environment variables (see .env.example).
	W6  W6Config
	SDK AISDKConfig

	// CORSAllowedOrigins 逗号分隔；非 production 且为空时允许任意 Origin（开发便利）。
	CORSAllowedOrigins string
	// RateLimitAPIPerMinute 全站 /api（除 /api/auth 外）每 IP 每分钟请求上限。
	RateLimitAPIPerMinute int
	// RateLimitAuthPerMinute /api/auth 每 IP 每分钟上限（防爆破）。
	RateLimitAuthPerMinute int
	// ChatCreditCost 每轮成功对话结束后扣减的积分；0 表示关闭扣费。
	ChatCreditCost int
}

// W6Config holds settings for the third-party W6 AI service.
type W6Config struct {
	BaseURL        string
	WSSBaseURL     string
	AuthHeaderKey  string
	AuthHeaderVal  string
	ModelProcedure string
	ModelLLM       string
	ModelLLMShort  string
	ModuleName     string
}

type AISDKConfig struct {
	BaseURL       string
	ServiceAPIKey string
	UploadPath    string
	TimeoutSec    int
	RetryMax      int
	LegacyMode    bool
	// Debug 为 true 时打印 SDK / 上游 HTTP 详细日志（环境变量 AI_SDK_DEBUG=true）
	Debug bool
}

// monorepoRoot 从 start 目录向上查找含有 backend/go.mod 的目录（即仓库根）。
func monorepoRoot(start string) string {
	d := start
	for range 16 {
		if _, err := os.Stat(filepath.Join(d, "backend", "go.mod")); err == nil {
			return d
		}
		parent := filepath.Dir(d)
		if parent == d {
			break
		}
		d = parent
	}
	return ""
}

func loadDotEnv() {
	if p := strings.TrimSpace(os.Getenv("DOTENV_PATH")); p != "" {
		if err := godotenv.Load(p); err != nil {
			log.Printf("warning: DOTENV_PATH load failed: %v", err)
		}
		return
	}

	if wd, err := os.Getwd(); err == nil {
		if root := monorepoRoot(wd); root != "" {
			envFile := filepath.Join(root, ".env")
			if err := godotenv.Load(envFile); err == nil {
				return
			}
		}
	}
	if exe, err := os.Executable(); err == nil {
		if sym, err := filepath.EvalSymlinks(exe); err == nil {
			exe = sym
		}
		if root := monorepoRoot(filepath.Dir(exe)); root != "" {
			envFile := filepath.Join(root, ".env")
			if err := godotenv.Load(envFile); err == nil {
				return
			}
		}
	}
	if err := godotenv.Load(".env"); err != nil {
		log.Printf("warning: .env not found (repo root .env or DOTENV_PATH): %v", err)
	}
}

// Load 从 .env 加载配置，所有配置以 .env 为准，无代码内默认值（除端口为空时用 8080 以便启动）
func Load() *Config {
	loadDotEnv()
	cfg := &Config{
		AppName:              getEnv("APP_NAME"),
		AppEnv:               getEnv("APP_ENV"),
		HTTPPort:             getEnv("HTTP_PORT"),
		DatabaseURL:          getEnv("DATABASE_URL"),
		JWTSecret:            getEnv("JWT_SECRET"),
		AccessTokenExpireMin: getEnvInt("ACCESS_TOKEN_EXPIRE_MINUTES"),
		W6: W6Config{
			BaseURL:        getEnv("W6_BASE_URL"),
			WSSBaseURL:     getEnv("W6_WSS_BASE_URL"),
			AuthHeaderKey:  getEnv("W6_AUTH_HEADER_FIELD"),
			AuthHeaderVal:  getEnv("W6_AUTH_HEADER_VALUE"),
			ModelProcedure: getEnv("W6_MODEL_PROCEDURE"),
			ModelLLM:       getEnv("W6_MODEL_LLM"),
			ModelLLMShort:  getEnv("W6_MODEL_LLM_SHORT"),
			ModuleName:     getEnv("W6_MODULE_NAME"),
		},
		SDK: AISDKConfig{
			BaseURL:       getEnv("AI_SDK_BASE_URL"),
			ServiceAPIKey: firstNonEmpty(getEnv("AI_SDK_SERVICE_API_KEY"), getEnv("AI_SDK_AUTH_HEADER_VAL")),
			UploadPath:    getEnv("AI_SDK_UPLOAD_PATH"),
			TimeoutSec:    getEnvInt("AI_SDK_TIMEOUT_SEC"),
			RetryMax:      getEnvInt("AI_SDK_RETRY_MAX"),
			LegacyMode:    getEnvBool("AI_SDK_LEGACY_MODE"),
			Debug:         getEnvBool("AI_SDK_DEBUG"),
		},
		CORSAllowedOrigins:     strings.TrimSpace(getEnv("CORS_ALLOWED_ORIGINS")),
		RateLimitAPIPerMinute:  getEnvIntDefault("RATE_LIMIT_API_PER_MINUTE", 180),
		RateLimitAuthPerMinute: getEnvIntDefault("RATE_LIMIT_AUTH_PER_MINUTE", 30),
		ChatCreditCost:         getEnvIntDefault("CHAT_CREDIT_COST", 1),
	}
	if cfg.DatabaseURL == "" {
		log.Fatal("DATABASE_URL is required (set in .env)")
	}
	if cfg.JWTSecret == "" {
		log.Fatal("JWT_SECRET is required (set in .env)")
	}
	if cfg.HTTPPort == "" {
		cfg.HTTPPort = "8080"
	}
	if cfg.AppName == "" {
		cfg.AppName = "YouMind Backend v2"
	}
	if cfg.AppEnv == "" {
		cfg.AppEnv = "development"
	}
	if cfg.AccessTokenExpireMin == 0 {
		cfg.AccessTokenExpireMin = 60
	}
	if cfg.SDK.BaseURL == "" {
		cfg.SDK.BaseURL = getEnv("OPENAI_COMPAT_BASE_URL")
	}
	if cfg.SDK.UploadPath == "" {
		cfg.SDK.UploadPath = "/api/upload"
	}
	if cfg.SDK.TimeoutSec <= 0 {
		cfg.SDK.TimeoutSec = 120
	}
	if cfg.SDK.RetryMax <= 0 {
		cfg.SDK.RetryMax = 2
	}

	// W6 configuration is optional at startup; but if BaseURL is set, we require
	// the essential auth fields to be present to avoid confusing runtime errors.
	if cfg.W6.BaseURL != "" {
		if cfg.W6.AuthHeaderKey == "" || cfg.W6.AuthHeaderVal == "" {
			log.Fatal("W6_BASE_URL is set but W6_AUTH_HEADER_FIELD or W6_AUTH_HEADER_VALUE is missing in .env")
		}
		if cfg.W6.WSSBaseURL == "" {
			log.Fatal("W6_WSS_BASE_URL is required when using W6 AI")
		}
		if cfg.W6.ModelProcedure == "" {
			cfg.W6.ModelProcedure = "raw"
		}
	}
	return cfg
}

func getEnv(key string) string {
	return os.Getenv(key)
}

func getEnvInt(key string) int {
	v := os.Getenv(key)
	if v == "" {
		return 0
	}
	n, err := strconv.Atoi(v)
	if err != nil {
		return 0
	}
	return n
}

func getEnvIntDefault(key string, def int) int {
	v := strings.TrimSpace(os.Getenv(key))
	if v == "" {
		return def
	}
	n, err := strconv.Atoi(v)
	if err != nil {
		return def
	}
	return n
}

func getEnvBool(key string) bool {
	v := strings.TrimSpace(strings.ToLower(os.Getenv(key)))
	return v == "1" || v == "true" || v == "yes" || v == "on"
}

func firstNonEmpty(values ...string) string {
	for _, v := range values {
		if strings.TrimSpace(v) != "" {
			return v
		}
	}
	return ""
}
