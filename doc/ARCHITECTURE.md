# YLMNote 架构设计文档

## 1. 系统架构总览

YLMNote 采用经典的三层架构，前端 SPA 通过 REST API + SSE 与后端通信，后端集成多种上游 AI 服务提供智能对话能力。

```
┌─────────────────────────────────────────────────────────────────────┐
│                         前端 React SPA                              │
│  Zustand 状态管理 │ React Query │ SSE 流式读取 │ useSessionSync     │
└──────────────────────────┬──────────────────────────────────────────┘
                           │ HTTP REST / SSE (text/event-stream)
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    后端 Go/Gin REST API                              │
│  interfaces/http ─ application ─ domain ─ infrastructure            │
│  (Handler+Middleware) (Service) (Entity+Repo) (Persistence+AI)     │
└──────────┬──────────────────┬──────────────────┬───────────────────┘
           │                  │                  │
           ▼                  ▼                  ▼
┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│  AI SDK 网关      │ │  旧版 OpenAI 兼容 │ │  W6 AI 网关      │
│  (WebSocket+HTTP) │ │  (legacy adapter) │ │  (HTTP+WebSocket)│
│  provider/client  │ │  LegacySDKAdapter │ │  W6Client/W6WS  │
└──────────────────┘ └──────────────────┘ └──────────────────┘
```

**各层职责：**

| 层 | 技术栈 | 职责 |
|---|---|---|
| 前端 | React + TypeScript + Zustand + Vite | UI 渲染、状态管理、SSE 流式接收、会话同步 |
| 后端 | Go + Gin + GORM + SQLite | 业务逻辑、数据持久化、AI 服务集成、SSE 事件转发 |
| 上游 AI | AI SDK / OpenAI / W6 | 大语言模型推理、会话管理、工具调用、文件生成 |

---

## 2. 后端分层架构（DDD）

后端采用领域驱动设计（DDD）的四层架构，依赖方向为 **interfaces → application → domain ← infrastructure**：

```
┌─────────────────────────────────────────────────────────────┐
│                   interfaces/http                            │
│  router.go (Wire 依赖注入)                                    │
│  chat_handler.go / project_handler.go / skill_handler.go ... │
│  middleware.go / cors.go / ratelimit.go / requestlog.go      │
└──────────────────────────┬──────────────────────────────────┘
                           │ 调用
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                     application                              │
│  auth/service.go   - JWT 认证、用户注册登录                    │
│  chat/service.go   - 核心对话逻辑（Chat/Stream/Sync）          │
│  project/service.go - 笔记/会话/消息/资源 CRUD                 │
│  skill/service.go   - 技能安装/卸载                            │
│  user/service.go    - 用户信息、积分管理                        │
│  w6/service.go      - W6 动态讲义生成                          │
└──────────────────────────┬──────────────────────────────────┘
                           │ 依赖
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                       domain                                 │
│  project/  - Project（聚合根）、Session、Message、Resource、    │
│              PromptTemplate 实体 + Repository 接口             │
│  user/     - User（聚合根）、Repository 接口、Errors            │
│  skill/    - Skill 实体 + Repository 接口                     │
└──────────────────────────┬──────────────────────────────────┘
                           ▲ 实现
                           │
┌─────────────────────────────────────────────────────────────┐
│                    infrastructure                            │
│  persistence/ - GORM 实现 (SQLite)                           │
│    db.go / user_repo.go / project_repo.go / session_repo.go  │
│    message_repo.go / resource_repo.go / skill_repo.go ...    │
│  ai/ - AI 服务集成                                           │
│    gateway/  - 新版 AI SDK 网关 (provider/client/stream/types)│
│    client.go - 旧版 OpenAI 兼容客户端                         │
│    legacy_sdk_adapter.go - 旧版适配器                         │
│    w6_client.go / w6_ws.go - W6 AI 网关                     │
└─────────────────────────────────────────────────────────────┘
```

### 领域模型

**project 领域（核心聚合）：**

```
Project (聚合根)
 ├── Session (会话实体)
 │    ├── UpstreamSessionID  ← 上游会话 ID（首次对话后绑定）
 │    ├── UpstreamVerified    ← 上游握手 ID 一致性标记
 │    └── Title               ← 会话标题（自动从首条消息截取）
 ├── Message (消息实体)
 │    ├── UpstreamID          ← 上游消息 ID（用于增量 upsert）
 │    ├── Role                ← user / assistant
 │    ├── Content             ← 消息内容
 │    └── Attachments         ← 扩展附件数据
 ├── Resource (资源实体)
 │    ├── Type                ← html_page / artifact / todo_state / ...
 │    ├── Content             ← 文本内容（可选）
 │    └── URL                 ← 引用地址（source: / w6-file: / sdk-file:）
 └── PromptTemplate (提示词模板)
```

**user 领域：**
- User 聚合根：包含积分余额（CreditsBalance）、订阅计划（SubscriptionPlan）
- 积分扣减通过 `ChargeCredits` 方法在对话成功后执行

**skill 领域：**
- Skill 实体：独立聚合，读多写少，包含安装状态和评分信息

### 依赖注入

后端使用手工 Wire 模式（`router.go#Wire`），组装流程：

```go
func Wire(cfg *config.Config, db *persistence.DB) *gin.Engine {
    // 1. 基础设施：创建 Repository 实现
    userRepo := persistence.NewUserRepository(db)
    projectRepo := persistence.NewProjectRepository(db)
    sessionRepo := persistence.NewSessionRepository(db)
    // ...

    // 2. AI SDK：根据配置选择引擎
    if cfg.SDK.LegacyMode {
        aiClient := ai.NewFromEnv()
        legacyAdapter := ai.NewLegacySDKAdapter(aiClient)
        aiSDK = sdkclient.New(legacyAdapter, ...)
    } else {
        provider := sdkprovider.New(...)
        aiSDK = sdkclient.New(provider, ...)
    }

    // 3. 应用服务：注入 Repo + SDK
    projectSvc := project.NewService(projectRepo, sessionRepo, ...)
    chatSvc := chat.NewService(projectRepo, sessionRepo, ..., aiSDK, ...)
    w6PageMakerSvc := w6app.NewPageMakerService(w6Client, w6WS, resourceRepo)

    // 4. HTTP Handler：注入 Service
    chatHandler := NewChatHandler(chatSvc)
    projectHandler := NewProjectHandler(projectSvc, pageMakerSvc, aiSDK)
    // ...

    // 5. 路由注册 + 中间件
    api := r.Group("/api")
    chatGroup := api.Group("/chat")
    chatGroup.Use(AuthMiddleware(authSvc))
    chatHandler.RegisterRoutes(chatGroup)
}
```

---

## 3. 前端架构

### 技术栈

- **框架**: React 18 + TypeScript + Vite
- **路由**: React Router v6（BrowserRouter）
- **状态管理**: Zustand（多 Store + Slice 模式）
- **数据缓存**: React Query（部分场景）
- **样式**: Tailwind CSS
- **国际化**: i18next

### 状态管理

前端使用三个 Zustand Store，职责划分清晰：

```
┌─────────────────────────────────────────────────────────┐
│                    authStore                             │
│  token: string | null        ← JWT 令牌                  │
│  user: User | null           ← 当前用户信息               │
│  logout()                    ← 清空认证状态               │
│  持久化: localStorage (youmind-auth)                      │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│                   appStore (UI)                          │
│  sidebarCollapsed / theme   ← UI 偏好状态                │
│  projects[] / currentProject← 笔记数据（轻量级场景）        │
│  skills[] / messages[]      ← 通用数据缓存                │
│  无持久化                                                 │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│                  useAppStore (apiStore)                  │
│  笔记/会话/消息/资源 CRUD    ← 核心业务数据与操作          │
│  sendMessageStream()         ← 流式对话入口               │
│  syncSessionState()          ← 会话同步                  │
│  liveTodosBySession          ← 实时待办                   │
│  sessionSyncMeta             ← 同步元数据                 │
│  streamingBySession          ← 按会话追踪流式状态          │
│  messagePagination           ← 消息分页游标               │
│  chatConversationSlice       ← 对话切片（独立模块）        │
└─────────────────────────────────────────────────────────┘
```

**apiStore** 是最核心的 Store，融合了数据获取和状态管理，通过 `createChatConversationSlice` 将对话相关逻辑拆分为独立切片以减轻单文件体积。

### React Query 数据缓存

React Query 在部分列表查询场景中使用（如 `useProjectsList` hook），提供自动缓存和刷新策略。核心对话流程则直接通过 Zustand Store 管理，避免双重缓存冲突。

### 路由结构

```
/                            → HomePage（受保护）
/login                       → Login
/register                    → Register
/search                      → SearchPage
/boards                      → ProjectList
/boards/new                  → NewProject
/boards/:id                  → ProjectDetail
/boards/:id/sessions/:sessionId → ProjectDetail（指定会话）
/skills                      → SkillList
/settings                    → Settings
```

所有业务路由通过 `ProtectedRoute` 组件守卫，未登录重定向至 `/login`。

### 服务层设计

`services/api.ts` 封装了所有后端 API 调用，按领域拆分为多个 API 对象：

| API 对象 | 职责 | 关键方法 |
|---|---|---|
| `projectApi` | 笔记/会话/消息/资源 CRUD | list, create, uploadResource, generatePageFromOutlineStream |
| `chatApi` | 对话与同步 | send, stream（AsyncGenerator SSE）, syncState, stopUpstream |
| `skillApi` | 技能管理 | list, install, uninstall |
| `authApi` | 认证 | login, register, getMe |
| `promptTemplateApi` | 提示词模板 | list, create, update, delete |
| `searchApi` | 全局搜索 | search |

`chatApi.stream()` 使用 `AsyncGenerator` 模式封装 SSE 读取，支持 `AbortSignal` 取消：

```typescript
async function* stream(data, signal?): AsyncGenerator<SSEEvent> {
  // fetch POST /api/chat/stream
  // 解析 SSE data: 块，yield 解析后的 JSON 事件
}
```

---

## 4. SDK 与后端关系

### go.mod replace 引用

后端 `go.mod` 通过 `replace` 指令引用本地 SDK 模块：

```go
// backend/go.mod
module github.com/easyspace-ai/ylmnote

require ws-chat-tester v0.0.0

replace ws-chat-tester => ../sdk
```

SDK 模块路径为 `sdk/`，提供与上游 AI 网关的底层 HTTP 和 WebSocket 通信能力。

### SDK 在后端中的使用

SDK 在后端的 `gateway/provider` 中被使用：

```go
// gateway/provider/provider.go
import wsdk "ws-chat-tester/sdk"

type Provider struct {
    upstream *wsdk.Client  // SDK 客户端实例
}

func New(cfg Config) *Provider {
    upstream, err := wsdk.NewClient(wsdk.Config{
        BaseURL: cfg.BaseURL,
        APIKey:  cfg.ServiceAPIKey,
        Timeout: cfg.Timeout,
    })
    // ...
}
```

SDK Client 提供的核心方法：
- `DialSession(ctx, sessionID)` — 建立 WebSocket 连接并发送 `{"id": sessionID}` 初始帧
- `ListAgents(ctx)` — 获取上游会话列表
- `AgentMessages(ctx, sessionID, limit, offset)` — 获取上游消息历史
- `SendInput(ctx, sessionID, content, attachments)` — 发送输入消息

Provider 在 SDK Client 之上实现了 W6 握手协议（`w6WaitRunHandshake`）、流式帧解析（thinking/update/status/error）、文件上传等高级功能。

---

## 5. AI 集成架构（双引擎）

后端支持三种 AI 引擎，通过环境变量切换：

### 5.1 新版 AI SDK 网关（默认模式）

当 `AI_SDK_LEGACY_MODE` 未设置或为 `false` 时启用。

```
┌─────────────────────────────────────────────────────────┐
│                gateway/ 子模块架构                        │
│                                                          │
│  types/types.go                                           │
│    StreamEvent (content/status/tool/done/error/handshake) │
│    SDKError (ErrorCode + Message + StatusCode + Cause)   │
│    IsRetryable() — 可重试错误判断                          │
│                                                          │
│  client/client.go                                         │
│    Provider 接口 (EnsureSession/Send/Stream/Upload/Stop)  │
│    Client — 封装 Provider + RetryConfig（指数退避重试）     │
│                                                          │
│  provider/provider.go                                     │
│    Provider 实现 — 核心 WSS 协议                           │
│    streamViaWS() — WebSocket 流式对话                     │
│    w6WaitRunHandshake() — W6 握手等待                     │
│    Upload() — 文件上传至上游                               │
│    SendStop() — 发送 Stop 帧中止上游运行                   │
│                                                          │
│  stream/sse.go                                            │
│    InitSSEHeaders() — 设置 SSE 响应头                     │
│    WriteEvent() — 写入 SSE 事件块 (event: + data:)        │
└─────────────────────────────────────────────────────────┘
```

**配置项：**

| 环境变量 | 说明 | 默认值 |
|---|---|---|
| `AI_SDK_BASE_URL` | 上游 AI 网关地址（同时回退到 `OPENAI_COMPAT_BASE_URL`） | - |
| `AI_SDK_SERVICE_API_KEY` | 服务认证密钥（回退到 `AI_SDK_AUTH_HEADER_VAL`） | - |
| `AI_SDK_UPLOAD_PATH` | 文件上传路径 | `/api/upload` |
| `AI_SDK_TIMEOUT_SEC` | HTTP/WS 读取超时 | 120s |
| `AI_SDK_WS_WRITE_TIMEOUT_SEC` | WS 写入超时 | 8s |
| `AI_SDK_WS_HANDSHAKE_TIMEOUT_SEC` | WS 握手超时 | 15s |
| `AI_SDK_WS_DIAL_TIMEOUT_SEC` | WS 拨号超时 | 15s |
| `AI_SDK_RETRY_MAX` | 最大重试次数 | 2 |
| `AI_SDK_DEBUG` | 调试日志 | false |

**WebSocket 流式协议（streamViaWS）：**

```
1. DialSession → 建立 WS 连接，发送 {"id": sessionID}
2. w6WaitRunHandshake → 等待 update 帧（获取 upstream session id）+ status 帧（确认就绪）
3. 发送 input 帧 → {"type":"input", "id": sessionID, "content": "...", "attachments": [...]}
4. 循环读取帧：
   - thinking → 追加内容，发射 content 事件
   - update   → 提取 assistant 文本增量 + artifacts/todos，发射 content/tool 事件
   - status   → 发射 status 事件，idle 时结束
   - error    → 返回 SDKError
5. 结束 → 发射 done 事件
```

### 5.2 旧版 OpenAI 兼容客户端

当 `AI_SDK_LEGACY_MODE=true` 时启用，通过 `LegacySDKAdapter` 适配到新版 `Provider` 接口。

```
ai/client.go (Client)
    ↓ 实现
ai/legacy_sdk_adapter.go (LegacySDKAdapter)
    ↓ 适配
gateway/client/client.go (Provider 接口)
```

**适配行为：**
- `EnsureSession` → 直接返回，不连接上游
- `Send` → 调用 `Client.Chat()`，走 OpenAI 兼容 `/chat/completions`
- `Stream` → 调用 `Send()` 获取完整回复，一次性发射 content + done 事件（伪流式）
- `Upload` / `SendStop` → 返回 `ErrNotImplemented`

### 5.3 W6 AI 网关

W6 是第三方 IECube AI 服务，独立于主对话流程，专用于"动态讲义"（HTML 页面）生成。

```
┌────────────────────────────────────────────┐
│            W6 集成架构                      │
│                                             │
│  w6_client.go (W6Client)                    │
│    StartChat()   → POST /interact/chat      │
│    CallAgent()   → POST /interact/agent      │
│    GetArtefact() → GET  /interact/artefact/  │
│                                             │
│  w6_ws.go (W6WS)                            │
│    ConnectAndStream() → WSS 监听事件流       │
│                                             │
│  application/w6/service.go                   │
│    PageMakerService — 动态讲义生成编排        │
│    StartChat → CallAgent(pagemaker) → WS    │
│    → GetArtefact → 保存为 Resource           │
└────────────────────────────────────────────┘
```

**配置项：**

| 环境变量 | 说明 |
|---|---|
| `W6_BASE_URL` | W6 HTTP 地址 |
| `W6_WSS_BASE_URL` | W6 WebSocket 地址 |
| `W6_AUTH_HEADER_FIELD` | 认证头字段名 |
| `W6_AUTH_HEADER_VALUE` | 认证头值 |
| `W6_MODEL_PROCEDURE` | 模型过程名（默认 `raw`） |
| `W6_MODEL_LLM` | LLM 模型名 |
| `W6_MODEL_LLM_SHORT` | LLM 短模型名 |
| `W6_MODULE_NAME` | 模块名 |

---

## 6. 流式对话数据流（核心）

完整的流式对话从用户发送消息到 UI 更新，经历以下链路：

```
┌──────────┐    ┌───────────┐    ┌──────────────┐    ┌───────────────┐
│  前端 UI  │    │ HTTP 层   │    │  Service 层  │    │  AI 基础设施  │
│  Zustand  │    │ Handler   │    │  chat.Service│    │  SDK Provider │
└────┬─────┘    └─────┬─────┘    └──────┬───────┘    └───────┬───────┘
     │                │                  │                     │
     │ sendMessageStream()               │                     │
     │───────────────▶│                  │                     │
     │                │ POST /api/chat/stream                  │
     │                │──────────────▶│                        │
     │                │               │                        │
     │                │               │ 1. preflightChatCredits()  ← 积分校验
     │                │               │ 2. prepareSessionAndSaveUserMessage()
     │                │               │    ├── 校验笔记归属
     │                │               │    ├── 创建/查找会话
     │                │               │    └── 保存用户消息
     │                │               │ 3. activateUpstreamSession()
     │                │               │    ├── sdkClient.EnsureSession()  ← WS 握手
     │                │               │    ├── ensureUpstreamSessionBinding()
     │                │               │    ├── markSessionUpstreamVerified()
     │                │               │    └── waitUpstreamSessionReady()
     │                │               │ 4. resolveResourceRefs()    ← 解析资料引用
     │                │               │                        │
     │                │               │ 5. sdkClient.Stream()  │
     │                │               │───────────────────────▶│
     │                │               │                        │ DialSession()
     │                │               │                        │ w6WaitRunHandshake()
     │                │               │                        │ WriteJSON(inputFrame)
     │                │               │                        │
     │                │               │         onEvent(evt)   │ ReadMessage() 循环
     │                │◀──────────────│◀──────────────────────│
     │                │               │                        │
     │                │ WriteEvent(SSE)│ 6. 流式回调处理：     │
     │                │──────────────▶│    ├── content → 追加  │
     │◀───────────────│               │    ├── tool → 捕获    │
     │ Zustand set()  │               │    └── status → 状态  │
     │ messages 更新  │               │                        │
     │                │               │ 7. 流式结束后：        │
     │                │               │    ├── flushDraft()     ← 最终持久化
     │                │               │    ├── persistStreamCapture() ← 保存 artifacts/todos
     │                │               │    ├── chargeAfterSuccessfulChat() ← 扣减积分
     │                │               │    └── triggerAsyncSessionBackfill() ← 异步回填
     │                │               │                        │
     │                │ session_id 事件│                        │
     │◀───────────────│ status_clear  │                        │
     │ 更新 session_id │               │                        │
```

**关键步骤说明：**

1. **积分校验** (`preflightChatCredits`)：检查用户积分余额是否足够（`CHAT_CREDIT_COST` 配置，0 表示免费）
2. **会话准备** (`prepareSessionAndSaveUserMessage`)：
   - 若无 session_id 则创建新会话，生成 12 位随机 upstream hint
   - 保存用户消息到数据库
   - 自动用首条消息截取会话标题（最多 28 个字符）
3. **上游激活** (`activateUpstreamSession`)：
   - 调用 SDK `EnsureSession` 建立 WebSocket 连接
   - 最多重试 5 次，指数退避
   - 等待上游 agent 状态变为 idle/ready/running 等就绪状态
4. **流式传输**：通过 WebSocket 接收上游事件，实时通过 SSE 转发前端
5. **消息持久化**：流式过程中每 700ms 或每 120 字符增量 flush 草稿到数据库，流结束后写入最终内容
6. **积分扣减**：仅在对话成功完成后执行，避免流式中断时误扣
7. **异步回填** (`triggerAsyncSessionBackfill`)：对话完成后异步调用 `SyncSessionState`，将上游 reasoning/system/tool 等非对话消息同步到本地

---

## 7. 会话同步双轨机制

YLMNote 的会话同时存在本地 ID 和上游 ID，需要双向同步保持一致性。

### 双 ID 设计

```
┌─────────────────────────────────────────────────────────┐
│                    Session 实体                          │
│                                                          │
│  ID                   ← 本地 UUID（主键）                  │
│  UpstreamSessionID    ← 上游 AI 网关的会话 ID              │
│  UpstreamVerified     ← 上游握手 ID 一致性验证标记          │
│                                                          │
│  首次对话时：                                            │
│    1. 生成 12 位随机 upstream_hint 作为初始 UpstreamID     │
│    2. SDK EnsureSession 时发送 hint                       │
│    3. 上游返回确认 ID → ensureUpstreamSessionBinding()     │
│    4. 握手 ID 一致 → markSessionUpstreamVerified()        │
└─────────────────────────────────────────────────────────┘
```

### 绑定流程

```
首次对话（无 upstream_session_id）:
  generateUpstreamSessionID() → 12 位随机字符串
  → 创建 Session(upstream_hint, UpstreamVerified=false)
  → activateUpstreamSession()
    → EnsureSession(hint)
    → w6WaitRunHandshake: 等待上游 update 帧
    → 上游返回实际 session_id
    → ensureUpstreamSessionBinding(): 绑定到 Session
    → HandshakeStateIDMatched=true → markSessionUpstreamVerified()

后续对话（已有 upstream_session_id）:
  → activateUpstreamSession(upstream_id)
  → EnsureSession(upstream_id)
  → w6WaitRunHandshake: 验证上游 state.id == 发出的 id
  → 一致 → markSessionUpstreamVerified()
  → 不一致 → 重试（最多 5 次）
```

### UpstreamVerified 状态

`UpstreamVerified` 标识本地会话是否已与上游成功握手并确认 ID 一致：
- `false`：新会话或未完成首次上游同步
- `true`：上游握手 ID 匹配，后续同步可安全进行

### 前端定期同步（useSessionSync）

```
┌─────────────────────────────────────────────────────────┐
│               useSessionSync Hook                        │
│                                                          │
│  挂载时：                                                │
│    skipInitialSync=false → 立即执行一次 syncSessionState │
│                                                          │
│  定期轮询：                                              │
│    interval = 45_000ms（45 秒）                           │
│    仅在 document.visibilityState === 'visible' 时执行     │
│                                                          │
│  同步流程 (syncSessionState):                             │
│    1. 检查 inFlight → 防止并发                           │
│    2. 检查 isTerminal → 冲突后不再重试                    │
│    3. 检查 cooldown → 失败后 30s 冷却                    │
│    4. POST /api/chat/sync-state                          │
│    5. 成功 → 刷新 sessions + resources + messages        │
│    6. 失败 → 记录 lastFailedAt，终端错误标记 isTerminal   │
│                                                          │
│  sessionSyncMeta 状态机:                                  │
│    idle → syncing → ready                                │
│                  → error → cooldown (30s) → syncing       │
│                  → isTerminal (冲突，不重试)               │
└─────────────────────────────────────────────────────────┘
```

### 增量消息 Upsert

后端 `SyncSessionState` 从上游拉取消息后，通过 `UpsertByUpstreamID` 增量写入本地数据库：

```go
// 仅当 upstream_id 不为空时才持久化，避免重复
if upstreamID == nil {
    continue  // 跳过无稳定 ID 的帧
}
messageRepo.UpsertByUpstreamID(&project.Message{
    UpstreamID: upstreamID,
    // ... 其他字段
})
```

---

## 8. 关键设计模式

### 后端设计模式

| 模式 | 实现 | 说明 |
|---|---|---|
| **Repository Pattern** | `domain/project/repository.go`, `domain/user/repository.go` | 领域层定义接口，基础设施层 GORM 实现，解耦数据访问 |
| **Service Layer** | `application/chat/service.go`, `application/project/service.go` | 编排业务逻辑，协调多个 Repo 和外部服务 |
| **Provider Interface** | `gateway/client/client.go#Provider` | AI 引擎抽象接口，支持新版网关和旧版适配器互换 |
| **Adapter Pattern** | `ai/legacy_sdk_adapter.go` | 将旧版 OpenAI Client 适配为 Provider 接口 |
| **Middleware Chain** | `cors.go`, `ratelimit.go`, `requestlog.go`, `middleware.go` | Gin 中间件链：CORS → 限流 → 请求日志 → JWT 鉴权 |
| **SSE (Server-Sent Events)** | `gateway/stream/sse.go` | 流式对话通过 SSE 向前端推送事件，支持 content/status/tool/done/error |
| **Retry with Backoff** | `gateway/client/client.go` | Client 层封装指数退避重试，仅对可重试错误（限流/超时/5xx）重试 |
| **Async Fire-and-Forget** | `chat/service.go#triggerAsyncSessionBackfill` | 对话完成后异步回填上游消息，不阻塞主流程 |
| **Graceful Shutdown** | `cmd/server/main.go` | 监听 SIGINT/SIGTERM，优雅关闭 HTTP 服务器和数据库连接 |

### 前端设计模式

| 模式 | 实现 | 说明 |
|---|---|---|
| **Protected Routes** | `App.tsx#ProtectedRoute` | 高阶组件守卫，未登录重定向至 `/login`，清理过期认证状态 |
| **Slice Pattern** | `chatConversationSlice.ts` | 将大 Store 拆分为独立切片，通过 Zustand merge 注入主 Store |
| **AsyncGenerator SSE** | `services/api.ts#chatApi.stream` | 使用 async generator 封装 SSE 流解析，支持 for-await-of 消费 |
| **AbortController** | `chatConversationSlice.ts#chatStreamAbortBySession` | 按会话管理 AbortController，支持单会话取消或全部取消 |
| **Coalesced Updates** | `chat/service.go#flushDraft` | 流式消息 700ms/120字符 节流 flush，减少数据库写入频率 |
| **Visibility-aware Polling** | `useSessionSync.ts` | 定时同步仅在页面可见时执行，避免后台标签页无效请求 |
| **Error Boundary** | `components/ErrorBoundary.tsx` | React 错误边界，捕获渲染异常防止白屏 |
| **Optimistic Update** | `chatConversationSlice.ts#sendMessageStream` | 先插入临时消息（`temp-` 前缀），流式完成后由后端数据替换 |

### 跨端协作模式

| 模式 | 说明 |
|---|---|
| **Dual-ID Session Binding** | 本地 session_id + upstream_session_id 双 ID 设计，首次对话绑定上游 ID |
| **SSE Event Protocol** | 前后端约定统一事件类型：content/status/tool/done/error/session_id/upstream_handshake/status_clear |
| **Incremental Sync** | 后端异步回填 + 前端 45s 定期同步，保证本地与上游数据最终一致 |
| **Upstream Gate** | 前端查询 upstream-gate 接口，根据上游状态锁定/解锁输入框，支持 Stop 操作 |
