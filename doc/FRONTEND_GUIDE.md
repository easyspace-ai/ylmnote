# YLMNote 前端开发指南

本文档详细介绍 YLMNote 笔记的前端架构、技术栈和开发规范。

## 1. 技术栈与依赖

### 1.1 核心框架和版本

| 技术 | 版本 | 说明 |
|------|------|------|
| React | ^18.2.0 | UI 框架 |
| TypeScript | ^5.2.2 | 类型系统 |
| Vite | ^5.0.8 | 构建工具 |

### 1.2 主要第三方库

| 库 | 版本 | 用途 |
|----|------|------|
| zustand | ^4.4.7 | 状态管理 |
| @tanstack/react-query | ^5.99.0 | 服务端状态管理/缓存 |
| react-router-dom | ^6.21.0 | 路由管理 |
| framer-motion | ^12.34.3 | 动画效果 |
| lucide-react | ^0.294.0 | 图标库 |
| i18next + react-i18next | ^26.0.4 + ^17.0.3 | 国际化 |
| react-markdown | ^10.1.0 | Markdown 渲染 |
| react-syntax-highlighter | ^16.1.0 | 代码高亮 |
| remark-gfm | ^4.0.1 | GitHub Flavored Markdown |
| tailwindcss | ^3.3.6 | CSS 框架 |
| clsx + tailwind-merge | ^2.0.0 + ^2.2.0 | 类名处理 |

### 1.3 构建工具配置

**Vite 配置** (`vite.config.ts`):

```typescript
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),  // 路径别名
    },
  },
  build: {
    outDir: '../bin/static',  // 输出到后端静态目录
    emptyOutDir: true,
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:40001',  // 代理到后端服务
        changeOrigin: true,
      }
    }
  }
})
```

**TypeScript 配置** (`tsconfig.json`):
- 目标: ES2020
- 模块: ESNext
- JSX: react-jsx
- 严格模式: 开启
- 路径别名: `@/*` → `./src/*`

---

## 2. 笔记结构

```
frontend/src/
├── components/          # 组件目录
│   ├── ai-elements/     # AI 聊天相关组件库
│   ├── layout/          # 布局组件
│   ├── project-detail/  # 笔记详情页子组件
│   ├── ui/              # 基础 UI 组件
│   ├── AIChatBoxNew.tsx # 聊天组件封装
│   ├── ErrorBoundary.tsx# 错误边界
│   ├── GlobalSearch.tsx # 全局搜索
│   └── MarkdownRenderer.tsx # Markdown 渲染
├── config/              # 配置文件
│   ├── ai.ts            # AI 模型配置
│   └── api.ts           # API 端点配置
├── hooks/               # 自定义 Hooks
│   ├── useProjectsList.ts
│   └── useSessionSync.ts
├── i18n/                # 国际化
│   └── index.ts
├── lib/                 # 第三方库配置
│   └── queryClient.ts   # React Query 客户端
├── pages/               # 页面组件
│   ├── Auth/            # 认证页面
│   ├── HomePage.tsx
│   ├── NewProject.tsx
│   ├── ProjectDetail.tsx
│   ├── ProjectList.tsx
│   ├── SearchPage.tsx
│   ├── Settings.tsx
│   └── SkillList.tsx
├── services/            # API 服务层
│   ├── ai/              # AI 相关服务
│   ├── ai.ts            # OpenRouter AI 服务
│   └── api.ts           # 后端 API 服务
├── stores/              # 状态管理 (Zustand)
│   ├── apiStore.ts      # 主状态树
│   ├── apiStoreTypes.ts # 状态类型
│   ├── appStore.ts      # 应用状态
│   ├── authStore.ts     # 认证状态
│   └── chatConversationSlice.ts # 对话切片
├── styles/              # 全局样式
│   └── globals.css
├── types/               # TypeScript 类型定义
│   └── index.ts
└── utils/               # 工具函数
    ├── index.ts
    └── logger.ts
```

---

## 3. 路由表

### 3.1 完整路由配置

路由定义在 `App.tsx` 中：

| 路由 | 组件 | 说明 | 权限 |
|------|------|------|------|
| `/login` | Login | 登录页 | 公开 |
| `/register` | Register | 注册页 | 公开 |
| `/` | HomePage | 首页 | 需登录 |
| `/search` | SearchPage | 搜索页 | 需登录 |
| `/boards` | ProjectList | 笔记列表 | 需登录 |
| `/boards/new` | NewProject | 新建笔记 | 需登录 |
| `/boards/:id` | ProjectDetail | 笔记详情 | 需登录 |
| `/boards/:id/sessions/:sessionId` | ProjectDetail | 笔记会话详情 | 需登录 |
| `/skills` | SkillList | 技能列表 | 需登录 |
| `/settings` | Settings | 设置页 | 需登录 |

### 3.2 ProtectedRoute 保护机制

```typescript
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const token = useAuthStore((state) => state.token)
  const user = useAuthStore((state) => state.user)
  const logout = useAuthStore((state) => state.logout)

  if (!token || !user) {
    // 清理过期状态
    if (token || user) {
      logout()
    }
    return <Navigate to="/login" replace />
  }
  return <>{children}</>
}
```

---

## 4. 页面组件

### 4.1 各页面职责

| 页面 | 文件 | 核心职责 |
|------|------|----------|
| HomePage | `pages/HomePage.tsx` | 首页展示、快捷入口、推荐技能 |
| ProjectList | `pages/ProjectList.tsx` | 笔记列表、筛选、排序 |
| ProjectDetail | `pages/ProjectDetail.tsx` | 笔记详情、三栏布局、流式对话 |
| NewProject | `pages/NewProject.tsx` | 创建新笔记 |
| SkillList | `pages/SkillList.tsx` | 技能市场、已安装技能 |
| Settings | `pages/Settings.tsx` | 用户设置、提示词模板管理 |
| SearchPage | `pages/SearchPage.tsx` | 全局搜索结果展示 |
| Login/Register | `pages/Auth/*.tsx` | 用户认证 |

### 4.2 ProjectDetail 详细说明

**初始化流程：**

1. **无 sessionId 时**：
   - 加载笔记详情 (`fetchProject`)
   - 获取会话列表 (`fetchSessions`)
   - 等待后端创建默认会话（轮询 3 次，每次 250ms）
   - 优先恢复上次会话（localStorage 缓存）
   - 重定向到 `/boards/:id/sessions/:sessionId`

2. **有 sessionId 时**：
   - 并行加载：笔记、会话列表、资源、提示词模板、已安装技能
   - 设置激活会话 (`setActiveMessageSession`)
   - 加载会话消息 (`fetchMessagesBySession`)
   - 延迟 1.2s 再次刷新消息（确保拿到完整历史）

**三栏布局结构：**

```
┌─────────────────────────────────────────────────────────────┐
│                     ProjectHeader                           │
├──────────────┬──────────────────────────────┬───────────────┤
│              │                              │               │
│   LeftPane   │        中间对话区             │ RightStudioPane│
│  (资料/对话)  │     (AIChatBoxNew)           │   (Studio)    │
│              │                              │               │
│ - 文档       │                              │ - 技能快捷入口 │
│ - 链接       │                              │ - 输出产物列表 │
│ - 笔记       │                              │ - 预览区      │
│ - 对话历史   │                              │               │
│              │                              │               │
└──────────────┴──────────────────────────────┴───────────────┘
```

**流式对话处理：**

```typescript
const handleSendMessage = async (message: string, mode: string, skillId: string | null, attachments: Attachment[]) => {
  // 1. 上传本地文件附件
  const localAttachments = attachments.filter(a => a.type === 'local' && a.file)
  for (const att of localAttachments) {
    const res = await uploadResource(id, att.file!)
    resourceRefs.push({ id: res.id, name: res.name, type: res.type })
  }
  
  // 2. 处理引用的资料库文件
  const libraryAttachments = attachments.filter(a => a.type === 'library')
  
  // 3. 特殊处理：动态讲义技能走 W6 流式生成
  if (selectedSkill?.name.includes('动态讲义')) {
    await sendW6PageFromOutlineStream(id, { title, outline }, callbacks)
    return
  }
  
  // 4. 普通流式发送
  await sendMessageStream(id, urlSessionId, message, skillId, undefined, model, mode, resourceRefs)
}
```

**资源管理：**

- **文档**: 支持 txt, md, pdf, doc, docx, jpg, jpeg, png 格式，最大 20MB
- **链接**: 自动抓取网页内容
- **笔记**: 纯文本笔记
- **输出产物**: AI 生成的内容，支持 HTML 预览和下载

---

## 5. 状态管理 (Zustand)

### 5.1 apiStore - 主状态树

**状态结构：**

```typescript
interface AppState {
  // 加载状态
  loading: boolean
  isStreaming: boolean
  streamingBySession: Record<string, boolean>
  error: string | null
  
  // 笔记
  projects: TProject[]
  currentProject: TProject | null
  sessions: TSession[]
  resources: Resource[]
  messages: TMessage[]
  activeMessageSessionId?: string
  liveTodosBySession: Record<string, Array<{ text: string; done: boolean }>>
  messagePagination: Record<string, { nextSkip: number; hasMore: boolean; loadingOlder: boolean; pageSize: number }>
  sessionSyncMeta: Record<string, SessionSyncMeta>

  // 技能
  skills: TSkill[]
  installedSkills: TSkill[]
  recommendedSkills: TSkill[]
  promptTemplates: TPromptTemplate[]
}
```

**核心 Actions：**

| 类别 | Action | 说明 |
|------|--------|------|
| 笔记 CRUD | `fetchProjects`, `fetchProject`, `createProject`, `updateProject`, `deleteProject` | 笔记管理 |
| 会话管理 | `fetchSessions`, `createSession`, `updateSession`, `deleteSession`, `bindSessionUpstream` | 会话操作 |
| 消息管理 | `fetchMessagesBySession`, `loadOlderMessages`, `updateMessage`, `deleteMessage` | 消息操作 |
| 资源管理 | `fetchResources`, `createResource`, `updateResource`, `deleteResource`, `uploadResource` | 资源操作 |
| 流式发送 | `sendMessageStream`, `abortActiveMessageStream` | SSE 流式通信 |
| 技能管理 | `fetchSkills`, `installSkill`, `uninstallSkill`, `fetchPromptTemplates` | 技能市场 |
| 同步 | `syncSessionState`, `getSessionSyncStatus` | 会话状态同步 |

### 5.2 authStore - 认证状态

```typescript
interface AuthState {
  token: string | null
  user: any | null
  setToken: (token: string | null) => void
  setUser: (user: any | null) => void
  logout: () => void
}

// 使用 persist 中间件持久化到 localStorage
export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({ ... }),
    { name: 'youmind-auth' }
  )
)
```

### 5.3 appStore - 应用状态

```typescript
interface AppState {
  // 用户
  user: User | null
  
  // 笔记
  projects: Project[]
  currentProject: Project | null
  
  // 技能
  skills: Skill[]
  installedSkills: Skill[]
  
  // 消息
  messages: Message[]
  
  // 资源
  resources: Resource[]
  
  // UI 状态
  sidebarCollapsed: boolean
  theme: 'light' | 'dark'
}
```

### 5.4 chatConversationSlice - 对话状态切片

从 `apiStore` 拆出以减轻单文件体积，包含：

```typescript
// 流式消息发送
sendMessageStream: async (projectId, sessionId, content, skillId, onChunk, model, mode, resourceRefs, externalAbortSignal) => {
  // - 创建 AbortController 管理取消
  // - 发送 SSE 请求
  // - 处理多种 chunk 类型：session_id, tool, status, content
  // - 更新消息状态
  // - 错误处理和降级
}

// 会话状态同步
syncSessionState: async (projectId, sessionId, options) => {
  // - 防重复提交 (inFlight)
  // - 错误冷却期 (30s)
  // - 终态检测 (isTerminal)
}

// 消息分页加载
fetchMessagesBySession: async (projectId, sessionId, options) => {
  // - replaceLatest: 切换会话时加载最新消息
  // - prependOlder: 加载历史消息
}
```

---

## 6. API 服务层

### 6.1 模块化设计

`services/api.ts` 按领域划分：

```typescript
// 笔记 API
export const projectApi = {
  list, get, create, update, delete,
  uploadResource, listSessions, createSession, updateSession,
  bindSessionUpstream, deleteSession, getSessionMessages,
  getMessages, createMessage, getResources, createResource,
  updateMessage, deleteMessage, updateResource, deleteResource,
  generatePageFromOutline, generatePageFromOutlineStream
}

// 技能 API
export const skillApi = {
  list, getInstalled, getRecommended, get, create, install, uninstall
}

// 聊天 API
export const chatApi = {
  send, stream, syncState, stopUpstream, getRemoteMessages,
  downloadSource, fetchSourceFile
}

// Prompt Template API
export const promptTemplateApi = {
  list, get, create, update, delete
}

// 认证 API
export const authApi = {
  login, register, getMe
}

// 搜索 API
export const searchApi = {
  search
}
```

### 6.2 请求拦截器

```typescript
// 获取 Token
function getAuthToken(): string | null {
  const token = useAuthStore.getState().token
  if (token) return token
  // Fallback: 从 localStorage 读取
  const raw = localStorage.getItem('youmind-auth')
  return JSON.parse(raw)?.state?.token || null
}

// 401 处理
function handleUnauthorizedResponse(status: number) {
  if (status !== 401) return
  useAuthStore.getState().logout()
  // 重定向到登录页
  const next = `${window.location.pathname}${window.location.search}`
  window.location.replace(`/login?redirect=${encodeURIComponent(next)}&reason=expired`)
}

// 通用请求
async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = getAuthToken()
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    }
  })
  if (!response.ok) {
    handleUnauthorizedResponse(response.status)
    throw new Error(error.detail || `HTTP ${response.status}`)
  }
  return response.json()
}
```

### 6.3 流式请求处理

```typescript
stream: async function* (data, signal?): AsyncGenerator<any> {
  // 130s 超时保护（与后端 120s 对齐）
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 130_000)
  
  const response = await fetch(`${API_CONFIG.baseUrl}${API_ENDPOINTS.chatStream}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
    signal: controller.signal,
  })
  
  const reader = response.body?.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const blocks = buffer.split('\n\n')
    buffer = blocks.pop() || ''
    for (const block of blocks) {
      const parsed = parseSSEBlock(block)
      if (parsed) yield parsed
    }
  }
}
```

---

## 7. 自定义 Hooks

### 7.1 useSessionSync

45秒定期同步机制：

```typescript
export function useSessionSync({
  projectId,
  sessionId,
  intervalMs = 45_000,  // 默认 45 秒
  enabled = true,
  refreshMessages = true,
  skipInitialSync = false,
  syncSessionState,
  sessionSyncMeta,
}: UseSessionSyncOptions) {
  useEffect(() => {
    if (!enabled || !projectId || !sessionId) return
    
    const runSync = async () => {
      // 防重复提交检查
      if (sessionSyncMeta?.inFlight) return
      if (sessionSyncMeta?.isTerminal) return
      // 错误冷却期检查 (30s)
      if (sessionSyncMeta?.lastFailedAt && Date.now() - sessionSyncMeta.lastFailedAt < 30_000) return
      
      await syncSessionState(projectId, sessionId, { refreshMessages })
    }
    
    // 立即执行（除非 skipInitialSync）
    if (!skipInitialSync) runSync()
    
    // 定时器
    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return  // 页面不可见时跳过
      runSync()
    }, intervalMs)
    
    return () => window.clearInterval(timer)
  }, [enabled, intervalMs, projectId, sessionId, syncSessionState])
}
```

### 7.2 useProjectsList

React Query 缓存：

```typescript
export function useProjectsList(status?: string) {
  return useQuery({
    queryKey: ['projects', status ?? 'all'],
    queryFn: () => projectApi.list({ status, limit: 50 }),
  })
}
```

---

## 8. 类型定义

### 8.1 核心类型

```typescript
// types/index.ts

export interface User {
  id: string
  username: string
  email: string
  subscription_plan: string
  credits_balance: number
  credits_used: number
  created_at: string
}

export interface Project {
  id: string
  name: string
  description?: string
  cover_image?: string | null
  status: 'active' | 'archived' | 'deleted'
  created_at: string
  updated_at: string
}

export interface Session {
  id: string
  project_id: string
  upstream_session_id?: string | null
  upstream_verified?: boolean
  title: string
  created_at: string
  updated_at: string
}

export interface Message {
  id: string
  upstream_message_id?: string | null
  project_id: string
  session_id?: string
  role: 'user' | 'assistant' | 'system'
  content: string
  status?: string
  skill_id?: string | null
  attachments?: any
  resource_refs?: Array<{ id: string; name?: string; type?: string }>
  created_at: string
}

export interface Resource {
  id: string
  project_id: string
  session_id?: string | null
  type: 'document' | 'link' | 'note' | 'output' | 'pdf' | 'text' | 'html_page' | 'artifact' | 'todo_state'
  name: string
  content?: string
  url?: string | null
  size?: string | null
  created_at: string
}

export interface Skill {
  id: string
  name: string
  description?: string
  icon?: string | null
  category: string
  author?: string | null
  users_count: number
  rating: number
  tags?: string[] | null
  is_installed: boolean
  is_personal: boolean
  is_recommended: boolean
  created_at: string
  updated_at: string
}

export interface PromptTemplate {
  id: string
  action_type: string
  name: string
  prompt: string
  created_at: string
  updated_at: string
}
```

### 8.2 SessionSyncMeta

```typescript
// stores/apiStoreTypes.ts

export interface SessionSyncMeta {
  inFlight: boolean        // 是否正在同步
  lastAttemptAt: number    // 上次尝试时间
  lastFailedAt?: number    // 上次失败时间
  lastSuccessAt?: number   // 上次成功时间
  lastError?: string       // 错误信息
  isTerminal?: boolean     // 是否终态（如上游冲突）
}
```

---

## 9. 组件库

### 9.1 目录结构

```
components/
├── ai-elements/           # AI 聊天组件库
│   ├── AIChat.tsx         # 主聊天组件
│   ├── ChatInput.tsx      # 输入框
│   ├── MessageList.tsx    # 消息列表
│   ├── MessageBubble.tsx  # 消息气泡
│   ├── ModeSelector.tsx   # 模式选择器
│   ├── ModelSelector.tsx  # 模型选择器
│   ├── SkillSelector.tsx  # 技能选择器
│   ├── TodoList.tsx       # 待办列表
│   ├── ThinkingProcess.tsx # 思考过程展示
│   ├── ToolDisplay.tsx    # 工具调用展示
│   ├── StreamingIndicator.tsx # 流式指示器
│   ├── AttachmentList.tsx # 附件列表
│   ├── ResourcePickerPopover.tsx # 资源选择弹窗
│   ├── StudioActionsPopover.tsx  # Studio 动作弹窗
│   ├── types.ts           # 类型定义
│   └── index.ts           # 统一导出
├── layout/                # 布局组件
│   ├── MainLayout.tsx     # 主布局
│   └── Sidebar.tsx        # 侧边栏
├── project-detail/        # 笔记详情子组件
│   ├── ProjectHeader.tsx
│   ├── LeftPane.tsx
│   └── RightStudioPane.tsx
└── ui/                    # 基础 UI 组件
    ├── Feedback.tsx       # Toast 反馈
    └── ...
```

### 9.2 关键组件说明

#### AIChatBoxNew

聊天组件封装，基于 `ai-elements` 组件库：

```typescript
interface AIChatBoxNewProps {
  messages?: ChatMessage[]
  todoItems?: TodoItem[]
  libraryFiles?: { id: string; name: string }[]
  models?: ModelOption[]
  studioActions?: StudioAction[]
  onRunStudioTool?: (action: StudioAction) => void
  onSendMessage?: (message: string, mode: ChatMode, skillId: string | null, attachments: Attachment[], model?: string) => void
  onCopy?: (content: string) => void
  onRegenerate?: () => void
  onSaveAsDocument?: (content: string) => void
  onLoadOlder?: () => Promise<void>
  isStreaming?: boolean
  hasMoreOlder?: boolean
  loadingOlder?: boolean
  upstreamInputLocked?: boolean
  upstreamCanStop?: boolean
  stoppingUpstream?: boolean
  onUpstreamStop?: () => void
  inputPrefill?: { seq: number; text: string }
}
```

#### MarkdownRenderer

基于 `react-markdown` + `react-syntax-highlighter`：

```typescript
export const MarkdownRenderer = memo(function MarkdownRenderer({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        code({ node, inline, className, children, ...props }) {
          // 代码块：带语言标签和复制按钮
          // 使用 Prism + vscDarkPlus 主题
        },
        a({ node, children, href, ...props }) {
          // 链接：新标签页打开
        }
      }}
    >
      {content}
    </ReactMarkdown>
  )
})
```

#### GlobalSearch

全局搜索组件，支持：

- 300ms 防抖搜索
- 键盘导航（↑↓Enter Esc）
- Cmd/Ctrl + K 快捷键
- 分类展示（笔记/技能/文档）

```typescript
export default function GlobalSearch({
  placeholder = '搜索笔记、技能...',
  onFocus,
  className,
  showShortcut = true,
}: GlobalSearchProps)
```

#### ErrorBoundary

错误边界，使用 i18n 支持多语言：

```typescript
export function ErrorBoundary({ children }: Props) {
  const { t } = useTranslation()
  return <ErrorBoundaryInner t={t}>{children}</ErrorBoundaryInner>
}
```

---

## 10. 国际化

### 10.1 i18next 配置

```typescript
// i18n/index.ts

import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

void i18n.use(initReactI18next).init({
  lng: 'zh',                    // 默认语言
  fallbackLng: 'zh',            // 回退语言
  defaultNS: 'common',          // 默认命名空间
  resources: {
    zh: {
      common: {
        errorTitle: '出错了',
        errorDescription: '请刷新页面或稍后再试。',
        retry: '重试',
      },
    },
  },
  interpolation: { escapeValue: false },
  react: { useSuspense: false },
})
```

### 10.2 使用方式

```typescript
import { useTranslation } from 'react-i18next'

function Component() {
  const { t } = useTranslation()
  return <h1>{t('errorTitle')}</h1>
}
```

---

## 11. 构建与开发

### 11.1 开发服务器启动

```bash
# 进入前端目录
cd frontend

# 安装依赖
npm install

# 启动开发服务器
npm run dev
# 或
pnpm dev
```

开发服务器配置：
- 地址: `http://0.0.0.0:5173`
- API 代理: `/api` → `http://127.0.0.1:40001`

### 11.2 生产构建

```bash
# 构建
npm run build

# 预览生产构建
npm run preview
```

构建输出：
- 目录: `../bin/static`
- 由后端服务提供静态文件

### 11.3 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `VITE_API_URL` | API 基础 URL | '' |
| `VITE_API_BASE_URL` | OpenRouter API URL | https://openrouter.ai/api/v1 |
| `VITE_OPENROUTER_API_KEY` | OpenRouter API Key | - |
| `VITE_DEFAULT_MODEL` | 默认模型 | openrouter/google/gemini-3-pro-preview |
| `VITE_FALLBACK_MODEL` | 回退模型 | openrouter/google/gemini-3-flash-preview |

---

## 12. AI 模型配置

### 12.1 配置位置

`config/ai.ts` 包含：

- OpenRouter API 配置
- 100+ 可用模型列表
- 模型选择器配置

### 12.2 默认模型

```typescript
AI_CONFIG.defaultModelId = 'moonshot/kimi-k2.5'
```

### 12.3 模型结构

```typescript
{
  id: 'moonshot/kimi-k2.5',
  name: 'Kimi (Moonshot) 2.5',
  description: '超长文本逻辑之王 默认模型',
  provider: 'OpenRouter',
  maxTokens: 8192
}
```

---

## 13. 开发规范

### 13.1 代码风格

- 使用 TypeScript 严格模式
- 组件使用函数式组件 + Hooks
- 使用 `memo` 优化渲染性能
- 类型定义优先使用 `interface`

### 13.2 文件命名

- 组件: PascalCase (e.g., `AIChatBoxNew.tsx`)
- Hooks: camelCase with use prefix (e.g., `useSessionSync.ts`)
- 工具: camelCase (e.g., `index.ts`)
- 类型: PascalCase (e.g., `apiStoreTypes.ts`)

### 13.3 导入顺序

1. React 内置
2. 第三方库
3. 内部模块 (@/)
4. 相对路径
5. 类型导入

---

## 14. 注意事项

1. **流式消息超时**: 130s 超时保护，与后端 120s 对齐
2. **会话同步**: 45s 定期同步，30s 错误冷却期
3. **消息分页**: 切换会话加载 200 条，历史加载 20 条
4. **文件上传**: 限制 txt, md, pdf, doc, docx, jpg, jpeg, png，最大 20MB
5. **认证状态**: 使用 localStorage 持久化，401 自动跳转登录
