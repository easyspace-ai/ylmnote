# YLMNote 数据库设计文档（内部代号 YouMind Backend v2）

## 1. 概述

### 1.1 数据库引擎
- **引擎**: SQLite
- **驱动**: `gorm.io/driver/sqlite` + `github.com/mattn/go-sqlite3`
- **ORM**: GORM v2 (v1.25+)

### 1.2 连接配置
- 数据库路径通过 `DATABASE_URL` 环境变量指定（格式：`file:/path/to/db.sqlite` 或相对路径）
- 默认连接池配置：
  - 最大空闲连接数: 10
  - 最大打开连接数: 100
- 时区: UTC

### 1.3 架构特点
- 采用 DDD（领域驱动设计）分层架构
- 领域实体（Domain Entity）与持久化模型（GORM Model）分离
- 通过仓储模式（Repository Pattern）实现数据访问抽象

---

## 2. 表结构详细定义

### 2.1 users（用户表）

存储系统用户信息。

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| id | TEXT | PRIMARY KEY | 用户唯一标识（UUID） |
| username | TEXT | NOT NULL, UNIQUE | 用户名 |
| email | TEXT | NOT NULL, UNIQUE | 邮箱地址 |
| hashed_password | TEXT | NOT NULL | 密码哈希（bcrypt） |
| subscription_plan | TEXT | NOT NULL, DEFAULT 'free' | 订阅计划（free/premium等） |
| credits_balance | INTEGER | NOT NULL, DEFAULT 1000 | 积分余额 |
| credits_used | INTEGER | NOT NULL, DEFAULT 0 | 已使用积分 |
| created_at | DATETIME | NOT NULL, DEFAULT CURRENT_TIMESTAMP | 创建时间 |

**SQL 定义**:
```sql
CREATE TABLE IF NOT EXISTS users (
    id              TEXT PRIMARY KEY,
    username        TEXT NOT NULL UNIQUE,
    email           TEXT NOT NULL UNIQUE,
    hashed_password TEXT NOT NULL,
    subscription_plan TEXT NOT NULL DEFAULT 'free',
    credits_balance INTEGER NOT NULL DEFAULT 1000,
    credits_used    INTEGER NOT NULL DEFAULT 0,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

---

### 2.2 projects（笔记表）

存储用户创建的笔记信息。

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| id | TEXT | PRIMARY KEY | 笔记唯一标识（UUID） |
| user_id | TEXT | REFERENCES users(id) ON DELETE SET NULL | 所属用户ID |
| name | TEXT | NOT NULL | 笔记名称 |
| description | TEXT | NULL | 笔记描述 |
| cover_image | TEXT | NULL | 封面图片URL |
| status | TEXT | NOT NULL, DEFAULT 'active' | 笔记状态（active/archived等） |
| created_at | DATETIME | NOT NULL, DEFAULT CURRENT_TIMESTAMP | 创建时间 |
| updated_at | DATETIME | NOT NULL, DEFAULT CURRENT_TIMESTAMP | 更新时间 |

**SQL 定义**:
```sql
CREATE TABLE IF NOT EXISTS projects (
    id           TEXT PRIMARY KEY,
    user_id      TEXT REFERENCES users(id) ON DELETE SET NULL,
    name         TEXT NOT NULL,
    description  TEXT,
    cover_image  TEXT,
    status       TEXT NOT NULL DEFAULT 'active',
    created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

---

### 2.3 sessions（会话表）

存储笔记下的对话会话。

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| id | TEXT | PRIMARY KEY | 会话唯一标识（UUID） |
| project_id | TEXT | NOT NULL, REFERENCES projects(id) ON DELETE CASCADE | 所属笔记ID |
| upstream_session_id | TEXT | NULL | 上游会话ID（WSS同步用） |
| upstream_verified | INTEGER | NOT NULL, DEFAULT 0 | 上游会话验证状态（0=false, 1=true） |
| title | TEXT | NOT NULL, DEFAULT '新对话' | 会话标题 |
| created_at | DATETIME | NOT NULL, DEFAULT CURRENT_TIMESTAMP | 创建时间 |
| updated_at | DATETIME | NOT NULL, DEFAULT CURRENT_TIMESTAMP | 更新时间 |

**SQL 定义**:
```sql
CREATE TABLE IF NOT EXISTS sessions (
    id           TEXT PRIMARY KEY,
    project_id   TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title        TEXT NOT NULL DEFAULT '新对话',
    created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
-- 后续迁移添加的字段:
-- ALTER TABLE sessions ADD COLUMN upstream_session_id TEXT;
-- ALTER TABLE sessions ADD COLUMN upstream_verified INTEGER NOT NULL DEFAULT 0;
```

**字段说明**:
- `upstream_session_id`: 与上游 WSS 服务同步的会话标识
- `upstream_verified`: 会话与上游 WSS 握手验证状态，首帧 `update.state.id` 与发出的 `{"id":upstream}` 一致后为 true

---

### 2.4 messages（消息表）

存储会话中的消息记录。

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| id | TEXT | PRIMARY KEY | 消息唯一标识（UUID） |
| upstream_message_id | TEXT | NULL | 上游消息ID（WSS同步用） |
| project_id | TEXT | NOT NULL, REFERENCES projects(id) ON DELETE CASCADE | 所属笔记ID |
| session_id | TEXT | NOT NULL, REFERENCES sessions(id) ON DELETE CASCADE | 所属会话ID |
| role | TEXT | NOT NULL | 消息角色（user/assistant/system） |
| content | TEXT | NOT NULL | 消息内容 |
| skill_id | TEXT | NULL | 使用的技能ID |
| attachments | TEXT | NULL | 附件信息（JSON格式） |
| created_at | DATETIME | NOT NULL, DEFAULT CURRENT_TIMESTAMP | 创建时间 |

**SQL 定义**:
```sql
CREATE TABLE IF NOT EXISTS messages (
    id          TEXT PRIMARY KEY,
    project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    session_id  TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    role        TEXT NOT NULL,
    content     TEXT NOT NULL,
    skill_id    TEXT,
    attachments TEXT,
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
-- 后续迁移添加的字段:
-- ALTER TABLE messages ADD COLUMN upstream_message_id TEXT;
```

---

### 2.5 resources（资源表）

存储笔记关联的资源文件。

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| id | TEXT | PRIMARY KEY | 资源唯一标识（UUID） |
| project_id | TEXT | NOT NULL, REFERENCES projects(id) ON DELETE CASCADE | 所属笔记ID |
| session_id | TEXT | NULL | 关联会话ID |
| type | TEXT | NOT NULL | 资源类型（file/image/document等） |
| name | TEXT | NOT NULL | 资源名称 |
| content | TEXT | NULL | 资源内容（文本类） |
| url | TEXT | NULL | 资源URL |
| size | TEXT | NULL | 资源大小 |
| created_at | DATETIME | NOT NULL, DEFAULT CURRENT_TIMESTAMP | 创建时间 |

**SQL 定义**:
```sql
CREATE TABLE IF NOT EXISTS resources (
    id          TEXT PRIMARY KEY,
    project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    type        TEXT NOT NULL,
    name        TEXT NOT NULL,
    content     TEXT,
    url         TEXT,
    size        TEXT,
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
-- 后续迁移添加的字段:
-- ALTER TABLE resources ADD COLUMN session_id TEXT;
```

---

### 2.6 skills（技能表）

存储 AI 技能/插件信息。

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| id | TEXT | PRIMARY KEY | 技能唯一标识（UUID） |
| name | TEXT | NOT NULL | 技能名称 |
| description | TEXT | NULL | 技能描述 |
| icon | TEXT | NULL | 图标URL |
| category | TEXT | NOT NULL, DEFAULT 'other' | 分类 |
| author | TEXT | NULL | 作者 |
| users_count | INTEGER | NOT NULL, DEFAULT 0 | 使用人数 |
| rating | REAL | NOT NULL, DEFAULT 0 | 评分（0-5） |
| tags | TEXT | NULL | 标签（JSON数组） |
| system_prompt | TEXT | NULL | 系统提示词 |
| is_installed | INTEGER | NOT NULL, DEFAULT 0 | 是否已安装（0=false, 1=true） |
| is_personal | INTEGER | NOT NULL, DEFAULT 0 | 是否个人技能（0=false, 1=true） |
| is_recommended | INTEGER | NOT NULL, DEFAULT 0 | 是否推荐（0=false, 1=true） |
| created_at | DATETIME | NOT NULL, DEFAULT CURRENT_TIMESTAMP | 创建时间 |
| updated_at | DATETIME | NOT NULL, DEFAULT CURRENT_TIMESTAMP | 更新时间 |

**SQL 定义**:
```sql
CREATE TABLE IF NOT EXISTS skills (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    description   TEXT,
    icon          TEXT,
    category      TEXT NOT NULL DEFAULT 'other',
    author        TEXT,
    users_count   INTEGER NOT NULL DEFAULT 0,
    rating        REAL NOT NULL DEFAULT 0,
    tags          TEXT,
    system_prompt TEXT,
    is_installed  INTEGER NOT NULL DEFAULT 0,
    is_personal   INTEGER NOT NULL DEFAULT 0,
    is_recommended INTEGER NOT NULL DEFAULT 0,
    created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

---

### 2.7 prompt_templates（提示词模板表）

存储用户的自定义提示词模板。

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| id | TEXT | PRIMARY KEY | 模板唯一标识（UUID） |
| user_id | TEXT | NOT NULL, REFERENCES users(id) ON DELETE CASCADE | 所属用户ID |
| action_type | TEXT | NOT NULL | 动作类型（如：summarize/translate等） |
| name | TEXT | NOT NULL | 模板名称 |
| prompt | TEXT | NOT NULL | 提示词内容 |
| created_at | DATETIME | NOT NULL, DEFAULT CURRENT_TIMESTAMP | 创建时间 |
| updated_at | DATETIME | NOT NULL, DEFAULT CURRENT_TIMESTAMP | 更新时间 |

**SQL 定义**:
```sql
CREATE TABLE IF NOT EXISTS prompt_templates (
    id           TEXT PRIMARY KEY,
    user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    action_type  TEXT NOT NULL,
    name         TEXT NOT NULL,
    prompt       TEXT NOT NULL,
    created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

---

### 2.8 transactions（积分流水表）

存储用户积分变动记录。

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| id | TEXT | PRIMARY KEY | 流水唯一标识（UUID） |
| user_id | TEXT | NOT NULL, REFERENCES users(id) ON DELETE CASCADE | 所属用户ID |
| amount | INTEGER | NOT NULL | 变动金额（负数为消费） |
| reason | TEXT | NOT NULL | 变动原因 |
| prompt_tokens | INTEGER | NULL | 提示词 Token 数 |
| completion_tokens | INTEGER | NULL | 补全 Token 数 |
| model_id | TEXT | NULL | 使用的模型ID |
| project_id | TEXT | NULL | 关联笔记ID |
| message_id | TEXT | NULL | 关联消息ID |
| created_at | DATETIME | NOT NULL, DEFAULT CURRENT_TIMESTAMP | 创建时间 |

**SQL 定义**:
```sql
CREATE TABLE IF NOT EXISTS transactions (
    id               TEXT PRIMARY KEY,
    user_id          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount           INTEGER NOT NULL,
    reason           TEXT NOT NULL,
    prompt_tokens    INTEGER,
    completion_tokens INTEGER,
    model_id         TEXT,
    project_id       TEXT,
    message_id       TEXT,
    created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

---

## 3. 表间关系（ER 描述）

### 3.1 关系总览

```
users (1) ───────< (N) projects
  │                    │
  │                    ├──< (N) sessions
  │                    │       └──< (N) messages
  │                    ├──< (N) messages
  │                    └──< (N) resources
  │
  ├──< (N) prompt_templates
  └──< (N) transactions

skills (独立表，读多写少)
```

### 3.2 详细关系说明

| 父表 | 子表 | 关系类型 | 外键字段 | 级联操作 |
|------|------|----------|----------|----------|
| users | projects | 1:N | projects.user_id | ON DELETE SET NULL |
| users | prompt_templates | 1:N | prompt_templates.user_id | ON DELETE CASCADE |
| users | transactions | 1:N | transactions.user_id | ON DELETE CASCADE |
| projects | sessions | 1:N | sessions.project_id | ON DELETE CASCADE |
| projects | messages | 1:N | messages.project_id | ON DELETE CASCADE |
| projects | resources | 1:N | resources.project_id | ON DELETE CASCADE |
| sessions | messages | 1:N | messages.session_id | ON DELETE CASCADE |
| sessions | resources | 1:N | resources.session_id | - |

### 3.3 关系说明

1. **users 1:N projects**
   - 一个用户可以创建多个笔记
   - 用户删除时，笔记保留但 user_id 设为 NULL

2. **projects 1:N sessions**
   - 一个笔记下可以有多个对话会话
   - 笔记删除时，关联会话级联删除

3. **projects 1:N messages**
   - 一个笔记下可以有多个消息（跨会话）
   - 笔记删除时，关联消息级联删除

4. **sessions 1:N messages**
   - 一个会话下有多条消息
   - 会话删除时，关联消息级联删除

5. **projects 1:N resources**
   - 一个笔记下可以有多个资源
   - 笔记删除时，关联资源级联删除

6. **sessions 1:N resources**
   - 一个会话下可以有多个资源（可选关联）
   - session_id 可为 NULL，表示笔记级资源

7. **users 1:N prompt_templates**
   - 一个用户可以创建多个提示词模板
   - 用户删除时，模板级联删除

8. **users 1:N transactions**
   - 一个用户有多条积分流水记录
   - 用户删除时，流水级联删除

---

## 4. 索引设计

### 4.1 索引列表

| 索引名 | 表名 | 字段 | 类型 | 用途 |
|--------|------|------|------|------|
| idx_users_username | users | username | UNIQUE | 用户名唯一约束查询 |
| idx_users_email | users | email | UNIQUE | 邮箱唯一约束查询 |
| idx_projects_user_id | projects | user_id | 普通索引 | 按用户查询笔记 |
| idx_projects_status | projects | status | 普通索引 | 按状态筛选笔记 |
| idx_projects_updated_at | projects | updated_at DESC | 普通索引 | 笔记列表按更新时间排序 |
| idx_sessions_project_id | sessions | project_id | 普通索引 | 按笔记查询会话 |
| idx_sessions_updated_at | sessions | updated_at DESC | 普通索引 | 会话列表按更新时间排序 |
| idx_sessions_project_upstream | sessions | (project_id, upstream_session_id) | 普通索引 | 按笔记和上游会话ID查询 |
| idx_messages_project_id_created_at | messages | (project_id, created_at) | 普通索引 | 按笔记查询消息并排序 |
| idx_messages_session_id_created_at | messages | (session_id, created_at) | 普通索引 | 按会话查询消息并排序 |
| idx_messages_upstream_message_id | messages | upstream_message_id | 普通索引 | 按上游消息ID查询 |
| idx_messages_session_upstream_unique | messages | (session_id, upstream_message_id) | 唯一索引（条件） | 会话内上游消息ID唯一性约束 |
| idx_resources_project_id | resources | project_id | 普通索引 | 按笔记查询资源 |
| idx_resources_type | resources | type | 普通索引 | 按类型筛选资源 |
| idx_resources_session_id | resources | session_id | 普通索引 | 按会话查询资源 |
| idx_skills_category | skills | category | 普通索引 | 按分类筛选技能 |
| idx_skills_is_installed | skills | is_installed | 普通索引 | 查询已安装技能 |
| idx_skills_is_recommended | skills | is_recommended | 普通索引 | 查询推荐技能 |
| idx_prompt_templates_user_id | prompt_templates | user_id | 普通索引 | 按用户查询模板 |
| idx_prompt_templates_user_updated_at | prompt_templates | (user_id, updated_at DESC) | 普通索引 | 用户模板列表排序 |
| idx_transactions_user_id_created_at | transactions | (user_id, created_at DESC) | 普通索引 | 用户流水按时间排序 |

### 4.2 特殊索引说明

**idx_messages_session_upstream_unique**:
```sql
CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_session_upstream_unique
ON messages (session_id, upstream_message_id)
WHERE upstream_message_id IS NOT NULL AND upstream_message_id <> '';
```
- 这是一个**条件唯一索引**
- 确保同一个会话内，上游消息ID（如果存在）唯一
- 允许 upstream_message_id 为 NULL 或空字符串的记录重复

---

## 5. 迁移管理

### 5.1 迁移文件命名规范

迁移文件位于 `backend/internal/infrastructure/persistence/migrations/` 目录：

```
{版本号}_{描述}.up.sql    -- 升级脚本
{版本号}_{描述}.down.sql  -- 回滚脚本
```

### 5.2 迁移文件列表

| 文件名 | 版本 | 说明 |
|--------|------|------|
| 001_init.up.sql | 001 | 初始建表：users, projects, sessions, messages, resources, skills, transactions |
| 001_init.down.sql | 001 | 初始回滚：删除所有表和索引 |
| 002_prompt_templates.up.sql | 002 | 新增 prompt_templates 表 |
| 002_resource_session_id.up.sql | 002 | resources 表新增 session_id 字段及索引 |
| 003_sessions_upstream_session_id.up.sql | 003 | sessions 表新增 upstream_session_id 字段及复合索引 |
| 004_messages_upstream_message_id.up.sql | 004 | messages 表新增 upstream_message_id 字段及索引、条件唯一索引 |
| 006_sessions_upstream_verified.up.sql | 006 | sessions 表新增 upstream_verified 字段 |

### 5.3 迁移执行机制

迁移执行逻辑位于 `migrate.go`：

1. **迁移记录表**: `schema_migrations`
   ```sql
   CREATE TABLE IF NOT EXISTS schema_migrations (
       version TEXT PRIMARY KEY,
       applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
   );
   ```

2. **执行流程**:
   - 读取 `migrations/*.up.sql` 文件列表
   - 按文件名排序（字典序）
   - 检查每个版本是否已在 `schema_migrations` 中
   - 未执行的迁移在事务中执行：
     - 分割 SQL 语句（按 `;` 分隔）
     - 逐个执行语句（SQLite 要求）
     - 记录迁移版本到 `schema_migrations`
     - 提交事务

3. **启动时自动执行**: 
   - 数据库连接初始化时 (`db.New()`) 自动调用 `RunMigrations()`
   - 确保数据库 schema 始终与代码版本一致

---

## 6. GORM 模型与 Domain Entity 映射

### 6.1 分层架构

```
┌─────────────────────────────────────────────────────────┐
│  Domain Layer (领域层)                                    │
│  - domain/user/entity.go    → User                       │
│  - domain/project/entity.go → Project, Session, Message  │
│  - domain/skill/entity.go   → Skill                      │
└─────────────────────────────────────────────────────────┘
                           │
                           │ 仓储接口定义
                           ▼
┌─────────────────────────────────────────────────────────┐
│  Infrastructure Layer (基础设施层)                        │
│  - persistence/models.go    → GORM Model (数据库映射)      │
│  - persistence/*_repo.go    → 仓储实现 + 转换函数          │
└─────────────────────────────────────────────────────────┘
```

### 6.2 GORM 模型定义

位于 `backend/internal/infrastructure/persistence/models.go`：

| GORM Model | 对应表 | 主要标签 |
|------------|--------|----------|
| UserModel | users | `gorm:"primaryKey"`, `gorm:"uniqueIndex;not null"` |
| ProjectModel | projects | `gorm:"index;not null"` |
| SessionModel | sessions | `gorm:"index"` |
| MessageModel | messages | `gorm:"column:upstream_message_id;index"` |
| ResourceModel | resources | `gorm:"type:text"` |
| TransactionModel | transactions | `gorm:"column:prompt_tokens"` |
| PromptTemplateModel | prompt_templates | `gorm:"index;not null"` |
| SkillModel | skills | `gorm:"type:text"` (JSONSlice) |

### 6.3 领域实体定义

#### User (domain/user/entity.go)
```go
type User struct {
    ID               string
    Username         string
    Email            string
    HashedPassword   string
    SubscriptionPlan string
    CreditsBalance   int
    CreditsUsed      int
    CreatedAt        time.Time
}
```

#### Project 相关 (domain/project/entity.go)
```go
type Project struct {
    ID          string
    UserID      string
    Name        string
    Description *string
    CoverImage  *string
    Status      string
    CreatedAt   time.Time
    UpdatedAt   time.Time
}

type Session struct {
    ID                string
    ProjectID         string
    UpstreamSessionID *string
    UpstreamVerified  bool
    Title             string
    CreatedAt         time.Time
    UpdatedAt         time.Time
}

type Message struct {
    ID          string
    UpstreamID  *string
    ProjectID   string
    SessionID   string
    Role        string
    Content     string
    SkillID     *string
    Attachments map[string]interface{}
    CreatedAt   time.Time
}

type Resource struct {
    ID        string
    ProjectID string
    SessionID *string
    Type      string
    Name      string
    Content   *string
    URL       *string
    Size      *string
    CreatedAt time.Time
}

type PromptTemplate struct {
    ID         string
    UserID     string
    ActionType string
    Name       string
    Prompt     string
    CreatedAt  time.Time
    UpdatedAt  time.Time
}
```

#### Skill (domain/skill/entity.go)
```go
type Skill struct {
    ID            string
    Name          string
    Description   *string
    Icon          *string
    Category      string
    Author        *string
    UsersCount    int
    Rating        float64
    Tags          []string
    SystemPrompt  *string
    IsInstalled   bool
    IsPersonal    bool
    IsRecommended bool
}
```

### 6.4 映射转换方式

每个仓储文件包含双向转换函数：

```go
// Model → Entity
toXXXEntity(m *XXXModel) *domain.XXX

// Entity → Model  
toXXXModel(e *domain.XXX) *XXXModel
```

**示例**（user_repo.go）：
```go
func toUserModel(u *user.User) *UserModel {
    return &UserModel{
        ID:               u.ID,
        Username:         u.Username,
        // ...
    }
}

func toUserEntity(m *UserModel) *user.User {
    return &user.User{
        ID:               m.ID,
        Username:         m.Username,
        // ...
    }
}
```

### 6.5 特殊类型处理

**JSONSlice**: 用于存储 SQLite 不直接支持的 `[]string` 类型
```go
type JSONSlice []string

func (s JSONSlice) Value() (driver.Value, error) {
    return json.Marshal(s)
}

func (s *JSONSlice) Scan(value interface{}) error {
    // 处理 []byte 或 string 类型的数据库值
    // 解析 JSON 到 []string
}
```

应用于 `SkillModel.Tags` 字段，将 Go 的 `[]string` 与数据库的 JSON 文本相互转换。

---

## 7. 附录

### 7.1 数据库连接示例

```go
import "github.com/easyspace-ai/ylmnote/internal/infrastructure/persistence"

// 初始化数据库连接
db, err := persistence.New("./metanote.db")
if err != nil {
    log.Fatal(err)
}
defer db.Close()

// 创建仓储
userRepo := persistence.NewUserRepository(db)
projectRepo := persistence.NewProjectRepository(db)
```

### 7.2 环境变量配置

```bash
# .env 文件
DATABASE_URL=./metanote.db
```

### 7.3 版本信息

- GORM: v1.25+
- SQLite: 3.x
