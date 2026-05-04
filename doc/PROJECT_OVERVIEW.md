# YLMNote 笔记总览

## 笔记介绍

**笔记名称**：YLMNote（YouMind Backend v2）

**定位**：AI 驱动的知识管理平台

**核心功能**：

- **笔记与会话管理** — 创建笔记、管理会话历史、跨笔记检索
- **AI 实时流式对话** — 通过 WebSocket 与上游 AI 服务双向通信，支持流式输出、中断、资源上传
- **资源管理** — 笔记内管理文件、笔记、链接等资源，AI 对话中可引用和生成
- **技能系统** — 可扩展的 Skill 插件体系，定义 AI 行为模式
- **提示词模板** — 可复用的 Prompt Template，标准化 AI 交互流程
- **用户认证与积分系统** — JWT 认证、注册/登录、每轮对话积分扣减与余额检查

## 技术栈总览

### 后端

| 组件 | 技术 | 版本 |
|------|------|------|
| 语言 | Go | 1.25 |
| Web 框架 | Gin | v1.10 |
| ORM | GORM | v1.25 |
| 数据库 | SQLite | via mattn/go-sqlite3 (CGO) |
| 认证 | golang-jwt | v5 |
| WebSocket | Gorilla WebSocket | v1.5 |
| 配置 | godotenv | v1.5 |

### 前端

| 组件 | 技术 | 版本 |
|------|------|------|
| 框架 | React | 18 |
| 语言 | TypeScript | 5.2 |
| 构建 | Vite | 5 |
| 状态管理 | Zustand | 4.4 |
| 数据请求 | TanStack React Query | 5 |
| 样式 | Tailwind CSS | 3.3 |
| 动画 | Framer Motion | 12 |
| 国际化 | i18next | 26 |
| 路由 | React Router | v6 |

### SDK

Go 语言编写的 WebSocket/HTTP 客户端，连接上游 AI 服务（OpenAI 兼容 API），提供重试、超时控制、调试日志等能力。

### 部署

- **进程管理**：PM2（`ecosystem.config.js`）
- **CI**：GitHub Actions（`.github/workflows/ci.yml`），后端 `go test` + 前端 `pnpm build`

## 目录结构说明

```
ylmnote/
├── backend/                    # Go 后端服务
│   ├── cmd/server/             # 程序入口点 (main.go)
│   ├── internal/               # 内部模块（DDD 分层）
│   │   ├── application/        # 应用服务层
│   │   │   ├── auth/           # 认证服务（注册/登录/JWT）
│   │   │   ├── chat/           # 对话服务（WebSocket 流式通信）
│   │   │   ├── project/        # 笔记服务（CRUD + 资源管理）
│   │   │   ├── skill/          # 技能服务
│   │   │   ├── user/           # 用户服务（积分余额）
│   │   │   └── w6/             # W6 AI 网关服务（课程大纲/网页生成）
│   │   ├── applog/             # 结构化日志初始化
│   │   ├── config/             # 配置加载（.env → Config 结构体）
│   │   ├── domain/             # 领域模型层
│   │   │   ├── project/        # 笔记实体 + Repository 接口
│   │   │   ├── skill/          # 技能实体 + Repository 接口
│   │   │   └── user/           # 用户实体 + Repository 接口
│   │   ├── infrastructure/     # 基础设施层
│   │   │   ├── ai/             # AI 客户端（SDK adapter、W6 客户端、WebSocket）
│   │   │   │   └── gateway/    # SDK Gateway（provider + client，重试/超时/调试）
│   │   │   └── persistence/    # 持久化（GORM models、Repository 实现、数据库迁移）
│   │   └── interfaces/         # 接口层
│   │       └── http/           # HTTP/WS 处理器（Gin 路由、中间件、Handler）
│   ├── uploads/                # 用户上传文件目录
│   ├── .env.example            # 环境变量模板
│   └── go.mod
├── frontend/                   # React 前端应用
│   ├── src/
│   │   ├── components/         # UI 组件
│   │   │   ├── ai-elements/    # AI 对话相关组件
│   │   │   ├── layout/         # 布局组件
│   │   │   ├── project-detail/ # 笔记详情组件
│   │   │   └── ui/             # 通用 UI 基础组件
│   │   ├── config/             # 前端配置（AI 配置、API 地址）
│   │   ├── hooks/              # 自定义 React Hooks
│   │   ├── i18n/               # 国际化资源
│   │   ├── lib/                # 工具库（queryClient 等）
│   │   ├── pages/              # 页面组件
│   │   ├── services/           # API 调用服务层
│   │   │   └── ai/             # AI 服务（流式对话客户端）
│   │   ├── stores/             # Zustand 状态管理
│   │   │   └── api/            # API 相关 store
│   │   ├── styles/             # 全局样式
│   │   ├── types/              # TypeScript 类型定义
│   │   └── utils/              # 通用工具函数
│   ├── public/                 # 静态资源
│   ├── vite.config.ts          # Vite 配置（开发代理到后端 :40001）
│   └── package.json
├── sdk/                        # 上游 AI 服务 SDK
│   ├── sdk/client.go           # WebSocket/HTTP 客户端
│   ├── cmd/server/             # SDK 独立测试入口
│   ├── web/                    # SDK 测试页面
│   └── go.mod
├── doc/                        # 笔记文档
├── .github/workflows/          # CI 配置
├── Makefile                    # 构建脚本
└── ecosystem.config.js         # PM2 部署配置
```

## 快速启动指南

### 环境要求

- Go 1.25+
- Node.js 20+
- pnpm 9+
- GCC（SQLite CGO 编译依赖）

### 后端启动

```bash
# 1. 复制环境变量模板到笔记根目录
cp backend/.env.example .env

# 2. 编辑 .env，配置必填项
#    DATABASE_URL=./youmind.db
#    JWT_SECRET=your-secret-here
#    AI_SDK_BASE_URL=https://api.openai.com/v1
#    AI_SDK_SERVICE_API_KEY=your-key

# 3. 启动后端（开发环境需设置 HTTP_PORT=40001 以配合前端 Vite 代理）
cd backend
HTTP_PORT=40001 go run ./cmd/server/main.go
```

后端启动后会自动运行数据库迁移。`.env` 文件应放在笔记根目录（与 `backend/` 同级），程序会自动向上查找。

### 前端启动

```bash
cd frontend
pnpm install
pnpm dev
```

Vite 开发服务器默认监听 `http://0.0.0.0:5173`，API 请求自动代理到 `http://127.0.0.1:40001`。

> **注意**：开发环境需在 `.env` 中配置 `HTTP_PORT=40001`（与 Vite 代理目标一致），生产环境默认端口为 `8080`（由 `HTTP_PORT` 控制）。

### 构建

```bash
# 一键构建前后端（输出 bin/server + bin/static/）
make all

# 单独构建
make frontend   # 前端 → bin/static/
make backend    # 后端 → bin/server

# 清理产物
make clean
```

构建产物说明：

- `bin/server` — Go 后端二进制文件，运行时自动在同目录下查找 `static/` 目录提供前端服务
- `bin/static/` — 前端构建产物，由 `bin/server` 内嵌的 SPA 服务托管

### 生产部署

```bash
make all
pm2 start ecosystem.config.js
```

PM2 配置详见 `ecosystem.config.js`，进程名为 `metanote`，自动重启、内存上限 1G。
