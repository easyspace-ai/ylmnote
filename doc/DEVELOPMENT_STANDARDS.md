# YLMNote 开发规范

本文档规定了 YLMNote 笔记的开发规范，基于现有代码风格总结而成，确保规范与实际代码一致。

## 目录

1. [后端 Go 代码规范](#后端-go-代码规范)
2. [前端 TypeScript 规范](#前端-typescript-规范)
3. [Git 规范](#git-规范)
4. [Code Review 检查清单](#code-review-检查清单)
5. [测试要求](#测试要求)
6. [文档要求](#文档要求)

---

## 后端 Go 代码规范

### 包命名

- 使用小写单词，不使用下划线或驼峰
- 包名应与目录名一致
- 避免使用通用名称如 `util`、`common`，按功能命名

```go
// 正确
package user
package persistence
package auth

// 错误
package UserPackage
package user_utils
```

### 文件命名

- 使用 `snake_case`（蛇形命名）
- 测试文件以 `_test.go` 结尾

```
user_repo.go          // 仓储实现
auth_handler.go       // HTTP 处理器
service_test.go       // 服务测试
```

### 结构体/接口命名

- 使用 `PascalCase`（大驼峰）
- 接口名以功能描述为主，不加 `I` 前缀
- 结构体名应清晰表达其用途

```go
// 正确
type User struct { ... }
type Repository interface { ... }
type Service struct { ... }

// 错误
type userStruct struct { ... }
type IUserRepository interface { ... }
```

### 错误处理

#### 哨兵值模式（Sentinel Errors）

在领域层定义可导出的错误变量：

```go
// domain/user/errors.go
package user

import "errors"

// ErrInsufficientCredits 用户积分不足以完成本次对话扣费
var ErrInsufficientCredits = errors.New("insufficient credits")
```

#### 应用层错误

```go
// application/auth/errors.go
package auth

import "errors"

var (
    ErrUsernameOrEmailTaken = errors.New("username or email already registered")
    ErrInvalidCredentials   = errors.New("incorrect username or password")
)
```

#### 错误处理原则

1. 领域错误在 domain 层定义，供全笔记使用
2. 应用错误在 application 层定义，与业务逻辑相关
3. Handler 层根据错误类型返回适当的 HTTP 状态码
4. 内部错误在开发环境显示详细信息，生产环境隐藏

```go
func (h *Handler) handler(c *gin.Context) {
    result, err := h.svc.SomeOperation(input)
    if err != nil {
        // 检查特定错误
        if err == auth.ErrInvalidCredentials {
            c.JSON(http.StatusUnauthorized, gin.H{"detail": "Incorrect username or password"})
            return
        }
        // 内部错误
        log.Printf("operation failed: %v", err)
        detail := "operation failed"
        if h.cfg.AppEnv == "development" {
            detail = "operation failed: " + err.Error()
        }
        c.JSON(http.StatusInternalServerError, gin.H{"detail": detail})
        return
    }
    c.JSON(http.StatusOK, result)
}
```

### 日志使用

使用 `applog` 包（基于标准库 `log/slog` 的封装）：

```go
import "github.com/easyspace-ai/ylmnote/internal/applog"

// 初始化（在 main.go 中）
applog.Init(cfg.AppEnv, cfg.LogFilePath, cfg.LogToStdout)
defer applog.Close()

// 使用 slog 记录日志
slog.Info("server started", "port", cfg.HTTPPort)
slog.Debug("debug info", "detail", someValue)
slog.Error("operation failed", "error", err)
```

#### 日志规范

- 使用结构化日志（key-value 形式）
- 开发环境（development）输出 Debug 级别到 stdout 和文件
- 生产环境输出 Info 级别
- 日志格式为 JSON

### Handler 规范

遵循 **参数校验 -> 调用 Service -> 构造响应** 的流程：

```go
func (h *SomeHandler) action(c *gin.Context) {
    // 1. 参数校验
    var req requestStruct
    if err := c.ShouldBindJSON(&req); err != nil {
        c.JSON(http.StatusBadRequest, gin.H{"detail": "invalid request body"})
        return
    }
    
    // 2. 调用 Service
    result, err := h.svc.SomeMethod(service.Input{
        Field: req.Field,
    })
    if err != nil {
        // 错误处理...
        return
    }
    
    // 3. 构造响应
    c.JSON(http.StatusOK, responseStruct{
        Data: result,
    })
}
```

#### Handler 结构

```go
type AuthHandler struct {
    svc *auth.Service
    cfg *config.Config
}

func NewAuthHandler(svc *auth.Service, cfg *config.Config) *AuthHandler {
    return &AuthHandler{svc: svc, cfg: cfg}
}

func (h *AuthHandler) RegisterRoutes(r *gin.RouterGroup) {
    r.POST("/register", h.register)
    r.POST("/login", h.login)
    // ...
}
```

### Service 规范

#### 结构

```go
// Service 应用服务
type Service struct {
    cfg  *config.Config
    repo user.Repository  // 依赖接口，非具体实现
}

func NewService(cfg *config.Config, repo user.Repository) *Service {
    return &Service{cfg: cfg, repo: repo}
}
```

#### 原则

1. **业务逻辑集中**：Service 层包含核心业务逻辑
2. **依赖注入**：通过构造函数注入依赖
3. **接口依赖**：依赖 domain 层定义的接口，而非具体实现
4. **输入输出定义**：为每个方法定义明确的输入（Input）和输出（Result）结构体

```go
// RegisterInput 注册入参
type RegisterInput struct {
    Username string
    Email    string
    Password string
}

// RegisterResult 注册结果
type RegisterResult struct {
    ID               string
    Username         string
    Email            string
    SubscriptionPlan string
    CreditsBalance   int
    CreatedAt        time.Time
}

// Register 注册新用户
func (s *Service) Register(in RegisterInput) (*RegisterResult, error) {
    // 业务逻辑...
}
```

### Repository 规范

#### 分层架构

- **接口定义**：在 `domain/xxx/repository.go` 中定义
- **实现**：在 `infrastructure/persistence/` 中实现

```go
// domain/user/repository.go - 接口定义
package user

type Repository interface {
    Create(u *User) error
    GetByID(id string) (*User, error)
    GetByUsername(username string) (*User, error)
    Update(u *User) error
    // ...
}
```

```go
// infrastructure/persistence/user_repo.go - 实现
package persistence

type UserRepository struct {
    db *DB
}

func NewUserRepository(db *DB) user.Repository {
    return &UserRepository{db: db}
}

func (r *UserRepository) Create(u *user.User) error {
    m := toUserModel(u)
    return r.db.Create(m).Error
}

// 转换函数
func toUserModel(u *user.User) *UserModel { ... }
func toUserEntity(m *UserModel) *user.User { ... }
```

#### 原则

1. 领域层只依赖接口，不依赖具体实现
2. 仓储实现负责领域对象与持久化模型的转换
3. 使用 GORM 进行数据库操作
4. 复杂查询使用原生 SQL，简单查询使用 GORM API

### 配置管理

通过 `config.Config` 结构体统一管理配置：

```go
// config/config.go
type Config struct {
    AppName              string
    AppEnv               string
    HTTPPort             string
    DatabaseURL          string
    JWTSecret            string
    AccessTokenExpireMin int
    // ...
}

// Load 从环境变量/.env 加载配置
func Load() *Config {
    // 加载逻辑...
}
```

#### 原则

1. 所有配置通过环境变量或 `.env` 文件提供
2. 使用 `github.com/joho/godotenv` 加载 `.env` 文件
3. 必要配置缺失时程序应直接退出（`log.Fatal`）
4. 提供合理的默认值（仅限非敏感配置）

---

## 前端 TypeScript 规范

### 组件命名

- 使用 `PascalCase`（大驼峰）
- 文件名与组件名保持一致

```
AIChatBoxNew.tsx      // 组件名: AIChatBoxNew
ProjectDetail.tsx     // 组件名: ProjectDetail
ProjectHeader.tsx     // 组件名: ProjectHeader
```

### 组件组织

```
src/
├── components/
│   ├── ai-elements/          # AI 相关基础组件
│   │   ├── AIChat.tsx
│   │   ├── AIInput.tsx
│   │   └── ...
│   ├── layout/               # 布局组件
│   │   ├── Sidebar.tsx
│   │   └── Header.tsx
│   ├── project-detail/       # 页面专属组件
│   │   ├── ProjectHeader.tsx
│   │   ├── LeftPane.tsx
│   │   └── RightStudioPane.tsx
│   ├── ui/                   # 通用 UI 组件
│   ├── AIChatBoxNew.tsx      # 主要业务组件
│   └── MarkdownRenderer.tsx
├── pages/                    # 页面组件
│   ├── HomePage.tsx
│   ├── ProjectDetail.tsx
│   └── ...
```

#### 分类原则

1. **ai-elements/**：AI 交互相关的基础组件，可被多个页面复用
2. **layout/**：页面布局相关组件（侧边栏、头部等）
3. **project-detail/**：特定页面（ProjectDetail）的子组件
4. **ui/**：通用 UI 组件（Button、Modal 等）
5. **pages/**：路由级别的页面组件

### Zustand Store 规范

#### 按职责分离

```
stores/
├── apiStore.ts              # API 相关状态（笔记、消息、技能等）
├── authStore.ts             # 认证状态
├── appStore.ts              # 应用级状态
├── chatConversationSlice.ts # 聊天会话切片
└── apiStoreTypes.ts         # Store 类型定义
```

#### Action 命名规范

| 操作类型 | 前缀 | 示例 |
|---------|------|------|
| 获取列表 | `fetchXxx` | `fetchProjects`, `fetchSkills` |
| 创建 | `createXxx` | `createProject`, `createSession` |
| 更新 | `updateXxx` | `updateProject`, `updateMessage` |
| 删除 | `deleteXxx` | `deleteProject`, `deleteResource` |
| 设置状态 | `setXxx` | `setLoading`, `setError` |

#### Store 结构示例

```typescript
// stores/apiStore.ts
interface AppState {
  // 状态
  loading: boolean
  error: string | null
  projects: TProject[]
  currentProject: TProject | null
  
  // Actions
  fetchProjects: (status?: string) => Promise<void>
  fetchProject: (id: string) => Promise<void>
  createProject: (data: { name: string; description?: string }) => Promise<TProject>
  updateProject: (id: string, data: Partial<TProject>) => Promise<void>
  deleteProject: (id: string) => Promise<void>
  setCurrentProject: (project: TProject | null) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
}

export const useAppStore = create<AppState>((set, get) => ({
  // 初始状态
  loading: false,
  error: null,
  projects: [],
  currentProject: null,
  
  // Actions
  fetchProjects: async (status?: string) => {
    try {
      set({ loading: true, error: null })
      const projects = await projectApi.list({ status, limit: 50 })
      set({ projects, loading: false })
    } catch (error: any) {
      set({ error: error.message, loading: false })
    }
  },
  
  // ... 其他 actions
}))
```

### API 服务层

#### 按资源分模块

```typescript
// services/api.ts

// ============ 笔记 API ============
export const projectApi = {
  list: (params?: { status?: string; skip?: number; limit?: number }) => { ... },
  get: (id: string) => request<any>(API_ENDPOINTS.project(id)),
  create: (data: { name: string; description?: string }) => { ... },
  update: (id: string, data: Partial<...>) => { ... },
  delete: (id: string) => { ... },
  // ...
}

// ============ 技能 API ============
export const skillApi = {
  list: (params?: { category?: string }) => { ... },
  getInstalled: () => request<any[]>(API_ENDPOINTS.skillsInstalled),
  install: (id: string) => { ... },
  uninstall: (id: string) => { ... },
}

// ============ 聊天 API ============
export const chatApi = {
  send: async (data: { ... }) => { ... },
  stream: async function* (data, signal) { ... },
}

// ============ 认证 API ============
export const authApi = {
  login: async (data: any) => { ... },
  register: (data: any) => { ... },
  getMe: () => request<any>('/api/auth/me'),
}
```

#### 通用请求封装

```typescript
async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_CONFIG.baseUrl}${endpoint}`
  const token = getAuthToken()
  
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers as any),
    } as any
  })
  
  if (!response.ok) {
    handleUnauthorizedResponse(response.status)
    const error = await response.json().catch(() => ({ detail: 'Unknown error' }))
    throw new Error(error.detail || `HTTP ${response.status}`)
  }
  
  return response.json()
}
```

### 类型定义

集中在 `types/index.ts`：

```typescript
// types/index.ts
export interface User {
  id: string
  username: string
  email: string
  subscription_plan: string
  credits_balance: number
  created_at: string
}

export interface Project {
  id: string
  name: string
  description?: string
  status: 'active' | 'archived' | 'deleted'
  created_at: string
  updated_at: string
}

export interface Session {
  id: string
  project_id: string
  title: string
  created_at: string
}

// ... 其他类型
```

### 样式规范

使用 Tailwind CSS，遵循 utility-first 原则：

```tsx
// 正确：使用 Tailwind 工具类
<button className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">
  提交
</button>

// 复杂样式使用 cn 工具函数合并
import { cn } from '@/utils'

<div className={cn(
  'flex items-center gap-2 p-2 rounded',
  isActive ? 'bg-blue-50 text-blue-600' : 'bg-white text-gray-700',
  disabled && 'opacity-50 cursor-not-allowed'
)}>
```

#### 样式原则

1. 优先使用 Tailwind 工具类
2. 颜色使用笔记定义的主题色（primary, danger, success 等）
3. 复杂条件样式使用 `cn()` 工具函数
4. 全局样式在 `globals.css` 中定义
5. 动画使用 Tailwind 动画类或定义在 CSS 中

### 导入排序规范

```tsx
// 1. React/框架导入
import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'

// 2. 第三方库
import { create } from 'zustand'
import { useQueryClient } from '@tanstack/react-query'

// 3. 绝对路径导入（笔记内部）
import { useAppStore } from '@/stores/apiStore'
import { projectApi } from '@/services/api'
import { cn } from '@/utils'

// 4. 相对路径导入
import { ProjectHeader } from './ProjectHeader'
import type { Session } from '../types'
```

---

## Git 规范

### 提交消息格式

遵循 [Conventional Commits](https://www.conventionalcommits.org/) 规范：

```
<type>(<scope>): <subject>

<body>

<footer>
```

#### Type 类型

| 类型 | 说明 |
|------|------|
| `feat` | 新功能 |
| `fix` | 修复 bug |
| `docs` | 文档更新 |
| `style` | 代码格式（不影响功能） |
| `refactor` | 重构（既不是 feat 也不是 fix） |
| `test` | 测试相关 |
| `chore` | 构建/工具/依赖更新 |

#### 示例

```
feat(auth): 添加用户注册功能

- 实现邮箱/密码注册
- 添加邮箱唯一性校验
- 发送欢迎邮件

fix(api): 修复笔记列表分页错误

docs: 更新 API 文档

refactor(user): 重构用户服务层
```

### 分支策略

| 分支 | 用途 |
|------|------|
| `main` | 稳定分支，可直接部署 |
| `feature/*` | 新功能开发 |
| `fix/*` | Bug 修复 |
| `docs/*` | 文档更新 |
| `refactor/*` | 代码重构 |

#### 命名示例

```
feature/user-authentication
feature/project-sharing
fix/message-pagination
fix/memory-leak-in-chat
docs/api-reference
```

### PR 流程

1. **创建分支**：从 `main` 创建功能分支
2. **开发**：在分支上进行开发，保持提交清晰
3. **自测**：确保代码可编译/构建，基本功能正常
4. **提交 PR**：
   - 填写清晰的 PR 标题和描述
   - 关联相关 Issue
   - 添加适当的标签
5. **Code Review**：至少 1 人审核通过
6. **合并**：使用 Squash Merge 或普通 Merge（根据笔记约定）

---

## Code Review 检查清单

### 功能正确性

- [ ] 代码实现了预期的功能
- [ ] 边界条件被正确处理
- [ ] 没有明显的逻辑错误

### 错误处理完整性

- [ ] 所有错误都被正确处理
- [ ] 错误信息对用户友好
- [ ] 敏感信息不会泄露到错误信息中

### 安全性

- [ ] 输入数据经过验证
- [ ] SQL 注入防护（使用参数化查询）
- [ ] XSS 防护（输出转义）
- [ ] 认证/授权检查完整
- [ ] 敏感数据加密存储

### 性能影响

- [ ] 没有 N+1 查询问题
- [ ] 大数据量处理有分页
- [ ] 没有不必要的计算
- [ ] 资源使用合理

### 代码可读性

- [ ] 命名清晰有意义
- [ ] 函数长度适中（不超过 50 行）
- [ ] 复杂逻辑有注释
- [ ] 代码结构清晰

---

## 测试要求

### 后端测试

```bash
cd backend
go test ./...
```

#### 要求

- 所有测试必须通过
- 新增功能需要补充单元测试
- 关键路径需要有测试覆盖

### 前端测试

```bash
cd frontend
pnpm build
```

#### 要求

- 构建必须成功（无 TypeScript 错误）
- 无 ESLint 警告（或已明确禁用）

### CI 自动检查

GitHub Actions 配置：

```yaml
# .github/workflows/ci.yml
jobs:
  backend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-go@v5
        with:
          go-version: "1.25.x"
      - run: go test ./...

  frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
      - run: pnpm install --frozen-lockfile
      - run: pnpm run build
```

---

## 文档要求

### 新增 API

需要更新 `doc/API_REFERENCE.md`：

- 接口路径和方法
- 请求参数（类型、必填、说明）
- 响应格式
- 错误码
- 示例

### 数据库变更

1. 添加 migration 文件到 `backend/internal/infrastructure/persistence/migrations/`
2. 更新 `doc/DATABASE_DESIGN.md`

### 架构变更

更新 `doc/ARCHITECTURE.md`：

- 系统架构图
- 模块说明
- 数据流

---

## 构建与部署

### Makefile 命令

```bash
# 构建前端和后端
make all

# 仅构建前端
make frontend

# 仅构建后端
make backend

# 清理构建产物
make clean
```

### 构建输出

- 后端二进制：`bin/server`
- 前端静态文件：`bin/static/`

---

## 参考文件

### 后端示例

- `backend/internal/domain/user/entity.go` - 领域实体
- `backend/internal/domain/user/repository.go` - 仓储接口
- `backend/internal/application/auth/service.go` - 应用服务
- `backend/internal/interfaces/http/auth_handler.go` - HTTP 处理器
- `backend/internal/infrastructure/persistence/user_repo.go` - 仓储实现
- `backend/internal/config/config.go` - 配置管理
- `backend/internal/applog/applog.go` - 日志封装

### 前端示例

- `frontend/src/types/index.ts` - 类型定义
- `frontend/src/stores/apiStore.ts` - Zustand Store
- `frontend/src/services/api.ts` - API 服务层
- `frontend/src/pages/ProjectDetail.tsx` - 页面组件
- `frontend/src/components/AIChatBoxNew.tsx` - 业务组件

---

*本文档基于笔记现有代码风格总结，如有更新请以最新代码为准。*
