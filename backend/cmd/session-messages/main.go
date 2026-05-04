// session-messages 从数据库或 HTTP API 导出指定会话的消息列表（与 project_handler 列表 JSON 形状一致），用于对照 UI 调试。
package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/easyspace-ai/ylmnote/internal/config"
	"github.com/easyspace-ai/ylmnote/internal/domain/project"
	"github.com/easyspace-ai/ylmnote/internal/infrastructure/persistence"
)

func main() {
	var (
		httpBase    = flag.String("http", "", "若设置则走 HTTP（例如 http://127.0.0.1:8080），不再连库")
		token       = flag.String("token", "", "HTTP 模式下的 Bearer token（也可用环境变量 JWT）")
		projectID   = flag.String("project", "", "笔记 ID（必填）")
		sessionID   = flag.String("session", "", "会话 ID（必填）")
		limit       = flag.Int("limit", 200, "条数上限（与 API 一致，最大 200）")
		skip        = flag.Int("skip", 0, "跳过条数")
		pretty      = flag.Bool("pretty", true, "JSON 缩进输出")
		databaseURL = flag.String("db", "", "仅 DB 模式：SQLite 路径或 DSN，覆盖 .env（设置后可不依赖完整 .env）")
	)
	flag.Parse()

	if *projectID == "" || *sessionID == "" {
		fmt.Fprintln(os.Stderr, "usage: session-messages -project <project_id> -session <session_id> [options]")
		flag.PrintDefaults()
		os.Exit(2)
	}

	if *limit <= 0 {
		*limit = 200
	}
	if *limit > 200 {
		*limit = 200
	}

	if strings.TrimSpace(*httpBase) != "" {
		tok := strings.TrimSpace(*token)
		if tok == "" {
			tok = strings.TrimSpace(os.Getenv("JWT"))
		}
		if tok == "" {
			fmt.Fprintln(os.Stderr, "HTTP 模式需要 -token 或环境变量 JWT")
			os.Exit(2)
		}
		if err := runHTTP(*httpBase, tok, *projectID, *sessionID, *skip, *limit, *pretty); err != nil {
			fmt.Fprintln(os.Stderr, err)
			os.Exit(1)
		}
		return
	}

	dbURL := strings.TrimSpace(*databaseURL)
	if dbURL == "" {
		cfg := config.Load()
		dbURL = cfg.DatabaseURL
	}

	db, err := persistence.New(dbURL)
	if err != nil {
		fmt.Fprintln(os.Stderr, "db open:", err)
		os.Exit(1)
	}
	defer db.Close()

	repo := persistence.NewMessageRepository(db)
	list, err := repo.ListBySessionID(*sessionID, *skip, *limit)
	if err != nil {
		fmt.Fprintln(os.Stderr, "list messages:", err)
		os.Exit(1)
	}

	// 可选：校验 project_id 与消息一致
	for _, m := range list {
		if m.ProjectID != "" && m.ProjectID != *projectID {
			fmt.Fprintf(os.Stderr, "warning: message %s has project_id %q, expected %q\n", m.ID, m.ProjectID, *projectID)
		}
	}

	writeJSON(toMessageListResponse(list), *pretty)
}

func runHTTP(base, tok, projectID, sessionID string, skip, limit int, pretty bool) error {
	base = strings.TrimRight(base, "/")
	u := fmt.Sprintf("%s/api/projects/%s/sessions/%s/messages?skip=%d&limit=%d",
		base, projectID, sessionID, skip, limit)
	req, err := http.NewRequest(http.MethodGet, u, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+tok)
	req.Header.Set("Accept", "application/json")

	client := &http.Client{Timeout: 60 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return err
	}
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("HTTP %d: %s", resp.StatusCode, strings.TrimSpace(string(body)))
	}
	if pretty {
		var raw any
		if err := json.Unmarshal(body, &raw); err != nil {
			return err
		}
		enc := json.NewEncoder(os.Stdout)
		enc.SetIndent("", "  ")
		return enc.Encode(raw)
	}
	_, err = os.Stdout.Write(body)
	if err == nil && len(body) > 0 && body[len(body)-1] != '\n' {
		_, err = fmt.Fprintln(os.Stdout)
	}
	return err
}

// 与 internal/interfaces/http/project_handler.go toMessageResponse / toMessageListResponse 对齐
func toMessageListResponse(list []*project.Message) []map[string]any {
	out := make([]map[string]any, len(list))
	for i, m := range list {
		out[i] = toMessageResponse(m)
	}
	return out
}

func toMessageResponse(m *project.Message) map[string]any {
	h := map[string]any{
		"id":                  m.ID,
		"upstream_message_id": m.UpstreamID,
		"project_id":          m.ProjectID,
		"session_id":          m.SessionID,
		"role":                m.Role,
		"content":             m.Content,
		"skill_id":            m.SkillID,
		"attachments":         m.Attachments,
		"created_at":          m.CreatedAt,
	}
	return h
}

func writeJSON(v any, pretty bool) {
	enc := json.NewEncoder(os.Stdout)
	if pretty {
		enc.SetIndent("", "  ")
	}
	if err := enc.Encode(v); err != nil {
		fmt.Fprintln(os.Stderr, "encode:", err)
		os.Exit(1)
	}
}
