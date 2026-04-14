# CLAUDE.md — ylmnote 项目开发指南

> 本文件是 Claude Code 的项目上下文文件，供 AI 辅助开发时自动加载。

---

## 项目概览

**ylmnote**（内部名 YouMind）是一个类 NotebookLM 的 AI 知识笔记平台，支持：
- 多项目管理，每个项目下可有多个会话（Session）
- 文档/链接/笔记等多种资源上传与引用
- 基于 Skills（System Prompt 模板）的 AI 对话
- 流式 SSE 输出、Tool Call 展示、ThinkingProcess 渲染
- 积分/订阅体系（数据库层已存在，业务层待完善）

---

## 技术栈

### 后端 (`/backend`)
| 层次 | 技术 |
|------|------|
| 语言 | Go 1.23 |
| 框架 | Gin（HTTP）、GORM（ORM） |
| 数据库 | SQLite（开发）→ 迁移 PostgreSQL（生产） |
| 架构 | DDD 四层：domain / application / infrastructure / interfaces |
| 认证 | JWT（`golang-jwt/jwt/v5`） |
| AI | 自研 `yilimsdk`（SSE 流式）+ OpenAI 兼容 API |
| 迁移 | 手动 SQL migration 文件（`/migrations/*.sql`） |

### 前端 (`/frontend`)
| 层次 | 技术 |
|------|------|
| 语言 | TypeScript 5 |
| 框架 | React 18 + Vite 5 |
| 状态 | Zustand（`/stores/`） |
| 样式 | Tailwind CSS 3 + tailwindcss-animate |
| 路由 | React Router v6 |
| Markdown | react-markdown + remark-gfm |
| 图标 | lucide-react |
| 动画 | framer-motion |

### AI SDK (`/yilimsdk`)
- 自研 Go SDK，封装 Provider 接口
- 支持 SSE 流式事件：`content / status / tool / done / error`
- 带重试机制（`RetryConfig`）
- 可对接任意 OpenAI 兼容 API

---

## 目录结构

```
ylmnote/
├── backend/
│   ├── cmd/server/main.go          # 入口
│   ├── internal/
│   │   ├── domain/                 # 领域实体 & 仓储接口
│   │   │   ├── project/            # Project / Session / Message / Resource / PromptTemplate
│   │   │   ├── skill/
│   │   │   └── user/
│   │   ├── application/            # 用例服务（无框架依赖）
│   │   │   ├── auth/
│   │   │   ├── chat/               # 核心对话逻辑、upstream 同步
│   │   │   ├── project/
│   │   │   ├── skill/
│   │   │   ├── user/
│   │   │   └── w6/                 # W6 AI 网关（页面生成）
│   │   ├── infrastructure/
│   │   │   ├── ai/                 # AI 客户端封装
│   │   │   └── persistence/        # GORM SQLite 仓储实现 + 迁移
│   │   ├── interfaces/http/        # Gin Handler + Router + Middleware
│   │   └── config/
│   ├── .env.example
│   └── static/                    # 前端构建产物（SPA 内嵌）
│
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── ai-elements/        # AI 聊天子组件（MessageBubble/ThinkingProcess 等）
│   │   │   ├── project-detail/     # 项目详情三栏布局
│   │   │   ├── layout/             # Sidebar / MainLayout
│   │   │   └── ui/                 # 通用 UI 组件
│   │   ├── pages/                  # 路由页面
│   │   ├── stores/                 # Zustand stores
│   │   ├── services/               # API 调用封装
│   │   ├── hooks/                  # useSessionSync 等
│   │   ├── types/index.ts          # 全局类型定义
│   │   └── config/                 # API 地址 / AI 配置
│   └── vite.config.ts
│
└── yilimsdk/                       # 自研 AI SDK（Go module）
    ├── client/                     # Client + RetryConfig
    ├── provider/                   # Provider 接口实现
    ├── stream/                     # SSE 解析
    └── types/                      # 公共类型 + 错误码
```

---

## 核心领域模型

```
User
└── Project (1:N)
    ├── Session (1:N)            # 每个 Session 是一段对话历史
    │   └── Message (1:N)       # role: user / assistant / system
    ├── Resource (1:N)           # 文档/链接/笔记/输出/HTML 等
    └── PromptTemplate (global, per-user)

Skill                            # 全局 System Prompt 模板
Transaction                      # 积分消费记录
```

---

## API 路由一览

```
GET  /health

POST /api/auth/register
POST /api/auth/login

GET  /api/projects
POST /api/projects
GET  /api/projects/:id
PUT  /api/projects/:id
DELETE /api/projects/:id
GET  /api/projects/:id/sessions
GET  /api/projects/:id/messages
GET  /api/projects/:id/resources
POST /api/projects/:id/resources
DELETE /api/projects/:id/resources/:rid

POST /api/chat                     # 非流式对话
POST /api/chat/stream              # SSE 流式对话 ← 主要使用
POST /api/chat/sync-state
GET  /api/chat/remote-messages
GET  /api/chat/upstream-gate
POST /api/chat/upstream-stop
GET  /api/chat/source/:source_id

GET  /api/skills
POST /api/skills
POST /api/skills/:id/install
DELETE /api/skills/:id/install

GET  /api/prompt-templates
POST /api/prompt-templates
PUT  /api/prompt-templates/:id
DELETE /api/prompt-templates/:id

GET  /api/models
GET  /api/user/profile
PUT  /api/user/profile
```

---

## 环境变量（必填）

```bash
# 数据库（路径以本机 `.env` 为准，可与 youmind.db / metanote.db 等文件名并存）
DATABASE_URL=./youmind.db

# JWT
JWT_SECRET=your-secret-here

# AI SDK（推荐）
AI_SDK_BASE_URL=https://api.openai.com/v1
AI_SDK_SERVICE_API_KEY=sk-xxx
AI_SDK_TIMEOUT_SEC=120
AI_SDK_RETRY_MAX=2
AI_SDK_LEGACY_MODE=false

# 兜底 OpenAI 兼容（legacy mode 时使用）
OPENAI_COMPAT_BASE_URL=https://api.openai.com/v1
OPENAI_COMPAT_API_KEY=sk-xxx
OPENAI_COMPAT_MODEL=gpt-4.1-mini
```

---

## 开发命令

### 后端
```bash
cd backend
cp .env.example .env       # 填写配置
go run ./cmd/server        # 启动开发服务器 :8080
go test ./...              # 运行测试
```

### 前端
```bash
cd frontend
pnpm install
cp .env.example .env.development
pnpm dev                   # Vite 开发服务器，代理到 :8080
pnpm build                 # 构建 → 输出到 ../backend/static/
```

### SDK
```bash
cd yilimsdk
go test ./...
```

---

## 编码规范

### 后端（Go）

1. **严格遵守 DDD 分层**：Handler 只做参数绑定/错误映射；业务逻辑在 application 层；domain 层不依赖任何框架；infrastructure 层实现仓储接口。
2. **错误处理**：application 层返回领域错误（`errors.New`），Handler 层负责映射到 HTTP 状态码。
3. **Context 贯穿**：所有数据库操作和外部 IO 必须传递 `context.Context`。
4. **新增 API**：在对应 Handler 中注册路由，通过 `Wire()` 组装依赖，不直接构造依赖。
5. **数据库迁移**：新增表或字段，在 `/migrations/` 下创建新的 `00X_xxx.up.sql`，不修改历史文件。
6. **模型名称**：不在代码中硬编码模型名称，通过配置或前端传参控制。

### 前端（TypeScript / React）

1. **组件粒度**：AI 对话相关组件放在 `components/ai-elements/`，页面级组件放在 `pages/`，通用 UI 放在 `components/ui/`。
2. **状态管理**：业务状态用 Zustand（`stores/`），本地 UI 状态用 `useState`，异步请求在 `services/api.ts` 封装。
3. **类型**：所有 API 响应/请求类型定义在 `types/index.ts`，与后端模型保持一致。
4. **流式输出**：使用 `EventSource` 或 `fetch` + ReadableStream 处理 SSE，不能用 polling 代替。
5. **异步与状态**：不要在组件内直接调用 `fetch`。**现状**：主对话流式与同步逻辑在 [`stores/apiStore.ts`](frontend/src/stores/apiStore.ts)；长期可将重异步迁到 hooks/services，再让 store 变薄。
6. **Markdown**：统一使用 `react-markdown + remark-gfm`。

---

## 关键注意事项

- **CORS**：由环境变量控制（`APP_ENV` + `CORS_ALLOWED_ORIGINS`）；生产必须配置白名单，勿依赖 `*`。
- **认证**：所有 `/api/*` 路由（除 `/api/auth/*` 和 `/api/models`）必须通过 `AuthMiddleware`。
- **文件上传**：当前保存在 `backend/uploads/`，生产环境应替换为对象存储（S3/OSS）。
- **SQLite**：多进程并发写入会有锁竞争，生产环境使用 PostgreSQL。
- **积分扣减**：环境变量 `CHAT_CREDIT_COST`（默认 1，设为 0 关闭）控制每轮成功对话后的扣费；`transactions` 表记录流水；余额不足时在调用上游前拒绝（非流式 HTTP 402，流式 SSE error 事件）。
- **W6 集成**：`W6_AUTH_HEADER_VALUE` 不配置时，`pageMakerSvc` 静默禁用，不影响主流程。

---

## 已知技术债务

| 问题 | 位置 | 优先级 |
|------|------|--------|
| `apiStore.ts` 体量过大、职责过多（聊天/资源/会话等耦合） | `frontend/src/stores/apiStore.ts` | 中 |
| 多实例部署时节流需共享后端（当前默认可为进程内令牌桶） | `backend/internal/interfaces/http` | 低 |
| 硬编码中文字符串，i18n 仅起步 | `frontend/src/` | 低 |

已缓解项（实现见仓库）：`.patch` 清理、未引用 `useChat` 移除、`markdown-it` 移除、根目录 CI、Rate limit + CORS 配置、`slog` 结构化日志、路由级 Error Boundary、TanStack Query（项目列表）、chat 路径积分扣减占位。

---

## 与 AI 协作的提示

- **聊天数据流**：前端主路径为 `apiStore` → `services/api` 中 `chatApi.stream`（SSE），非 `hooks/useChat.ts`（已移除未引用实现）。
- **新增功能**前，先确认目标层（domain / application / infrastructure / interfaces）。
- **修改 chat 流程**时，注意 `upstream session id` 绑定机制——Session 创建后异步绑定上游 SessionID。
- **调试 SSE**：后端 `/api/chat/stream` 返回 `text/event-stream`，每条事件格式为 `data: {"type":"content","value":"..."}\n\n`。
- **Skills**：`system_prompt` 字段是 Skill 的核心，在 chat service 中被注入为对话的 system message。
- **Resources**：`type` 字段决定前端渲染方式（document/link/note/output/html_page/artifact/todo_state）。
