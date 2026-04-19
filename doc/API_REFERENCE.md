# YLMNote 后端 API 参考文档

## 1. 概述

### Base URL

```
/api
```

### 认证方式

大部分 API 需要在请求头中携带 JWT Bearer Token：

```
Authorization: Bearer <access_token>
```

Token 通过 `/api/auth/login` 接口获取。认证失败时返回 `401 Unauthorized`。

### 通用响应格式

**成功响应**：各端点直接返回 JSON 对象或数组，不包裹在统一信封中。

**错误响应**：

```json
{
  "detail": "错误描述信息"
}
```

部分错误（如积分不足）额外包含 `code` 字段：

```json
{
  "detail": "insufficient credits",
  "code": "insufficient_credits"
}
```

### 速率限制

- 认证接口（`/api/auth/*`）：独立速率限制
- 通用 API（`/api/*`）：独立速率限制

---

## 2. 认证 (Auth)

Base: `/api/auth`

### POST /api/auth/register

注册新用户。**无需认证。**

请求 Body：

```json
{
  "username": "string (必填)",
  "email": "string (必填)",
  "password": "string (必填)"
}
```

成功响应 `200 OK`：

```json
{
  "id": "uuid",
  "username": "alice",
  "email": "alice@example.com",
  "subscription_plan": "free",
  "credits_balance": 1000,
  "credits_used": 0,
  "created_at": "2025-01-01T00:00:00.000Z"
}
```

错误响应：

| 状态码 | detail |
|--------|--------|
| 400 | `invalid request body` |
| 400 | `Username or email already registered` |
| 500 | `failed to create user`（开发环境附加重试信息） |

---

### POST /api/auth/login

登录获取 Token。**无需认证。** 支持 JSON 和 form-data 两种格式。

请求 Body（JSON）：

```json
{
  "username": "string (必填)",
  "password": "string (必填)"
}
```

成功响应 `200 OK`：

```json
{
  "access_token": "eyJhbGciOi...",
  "token_type": "Bearer"
}
```

错误响应：

| 状态码 | detail |
|--------|--------|
| 400 | `username and password required` |
| 401 | `Incorrect username or password` |
| 500 | `login failed` |

---

### GET /api/auth/me

获取当前用户信息。**需要认证。**

成功响应 `200 OK`：

```json
{
  "id": "uuid",
  "username": "alice",
  "email": "alice@example.com",
  "subscription_plan": "free",
  "credits_balance": 100,
  "credits_used": 20,
  "created_at": "2025-01-01T00:00:00.000Z"
}
```

---

### PATCH /api/auth/me

更新当前用户信息。**需要认证。**

请求 Body：

```json
{
  "username": "new_name (可选)",
  "email": "new_email@example.com (可选)"
}
```

成功响应 `200 OK`：同 `GET /api/auth/me` 返回格式。

错误响应：

| 状态码 | detail |
|--------|--------|
| 400 | `invalid request body` |
| 401 | `Not authenticated` |
| 500 | `failed to update user` |

---

## 3. 项目 (Projects)

Base: `/api/projects`，**所有端点需要认证。**

### GET /api/projects

列出当前用户的项目。

查询参数：

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `skip` | int | 0 | 偏移量 |
| `limit` | int | 20 | 每页数量 |
| `status` | string | - | 按状态筛选 |

成功响应 `200 OK`：

```json
[
  {
    "id": "uuid",
    "name": "我的项目",
    "description": "项目描述",
    "cover_image": "https://...",
    "status": "active",
    "created_at": "2025-01-01T00:00:00Z",
    "updated_at": "2025-01-02T00:00:00Z"
  }
]
```

> `description` 和 `cover_image` 可为 `null`。

---

### POST /api/projects

创建项目。

请求 Body：

```json
{
  "name": "string (必填)",
  "description": "项目描述 (可选)",
  "cover_image": "https://... (可选)"
}
```

成功响应 `200 OK`：同项目对象格式。

错误响应：

| 状态码 | detail |
|--------|--------|
| 400 | `invalid request body` |
| 502 | `failed to create project: ...` |

---

### GET /api/projects/:project_id

获取项目详情。

成功响应 `200 OK`：同项目对象格式。

错误响应：

| 状态码 | detail |
|--------|--------|
| 404 | `Project not found` |

---

### PATCH /api/projects/:project_id

更新项目。

请求 Body：

```json
{
  "name": "新名称 (可选)",
  "description": "新描述 (可选)",
  "cover_image": "https://... (可选)",
  "status": "archived (可选)"
}
```

成功响应 `200 OK`：同项目对象格式。

错误响应：

| 状态码 | detail |
|--------|--------|
| 400 | `invalid request body` |
| 404 | `Project not found` |

---

### DELETE /api/projects/:project_id

删除项目。

成功响应 `200 OK`：

```json
{
  "message": "Project deleted"
}
```

错误响应：

| 状态码 | detail |
|--------|--------|
| 404 | `Project not found` |

---

## 4. 会话 (Sessions)

Base: `/api/projects/:project_id/sessions`，**所有端点需要认证。**

### GET /api/projects/:project_id/sessions

列出项目下的会话。

查询参数：

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `skip` | int | 0 | 偏移量 |
| `limit` | int | 20 | 每页数量（最大 500） |

成功响应 `200 OK`：

```json
[
  {
    "id": "uuid",
    "project_id": "uuid",
    "upstream_session_id": "upstream-uuid (可为 null)",
    "upstream_verified": false,
    "title": "新对话",
    "created_at": "2025-01-01T00:00:00Z",
    "updated_at": "2025-01-01T00:00:00Z"
  }
]
```

---

### POST /api/projects/:project_id/sessions

创建会话。

请求 Body：

```json
{
  "title": "会话标题 (可选，默认 '新对话')"
}
```

成功响应 `200 OK`：同会话对象格式。

---

### PATCH /api/projects/:project_id/sessions/:session_id

更新会话。

请求 Body：

```json
{
  "title": "新标题 (必填)"
}
```

成功响应 `200 OK`：同会话对象格式。

错误响应：

| 状态码 | detail |
|--------|--------|
| 400 | `invalid request body` |
| 404 | `Session not found` |

---

### DELETE /api/projects/:project_id/sessions/:session_id

删除会话。

成功响应 `200 OK`：

```json
{
  "message": "Session deleted"
}
```

---

### PATCH /api/projects/:project_id/sessions/:session_id/upstream

绑定上游会话 ID。

请求 Body：

```json
{
  "upstream_session_id": "string (必填)"
}
```

成功响应 `200 OK`：同会话对象格式。

错误响应：

| 状态码 | detail |
|--------|--------|
| 400 | `invalid request body` 或业务错误信息 |
| 404 | `Project not found` |

---

## 5. 消息 (Messages)

Base: `/api/projects/:project_id`，**所有端点需要认证。**

### GET /api/projects/:project_id/messages

列出项目所有消息（项目维度）。

查询参数：

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `skip` | int | 0 | 偏移量 |
| `limit` | int | 20 | 每页数量（最大 50） |

成功响应 `200 OK`：

```json
[
  {
    "id": "uuid",
    "upstream_message_id": "upstream-uuid (可为 null)",
    "project_id": "uuid",
    "session_id": "uuid",
    "role": "user",
    "content": "你好",
    "skill_id": "skill-uuid (可为 null)",
    "attachments": {},
    "created_at": "2025-01-01T00:00:00Z"
  }
]
```

---

### GET /api/projects/:project_id/sessions/:session_id/messages

按会话列出消息。

查询参数：

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `skip` | int | 0 | 偏移量 |
| `limit` | int | 20 | 每页数量（最大 200） |

成功响应 `200 OK`：同消息数组格式。

---

### POST /api/projects/:project_id/messages

创建消息。

请求 Body：

```json
{
  "session_id": "uuid (必填)",
  "content": "string (必填)",
  "skill_id": "skill-uuid (可选)",
  "attachments": {}
}
```

成功响应 `200 OK`：同消息对象格式。

---

### PATCH /api/projects/:project_id/messages/:message_id

更新消息。

请求 Body：

```json
{
  "content": "string (必填)"
}
```

成功响应 `200 OK`：同消息对象格式。

错误响应：

| 状态码 | detail |
|--------|--------|
| 400 | `invalid request body` |
| 404 | `Message not found` |

---

### DELETE /api/projects/:project_id/messages/:message_id

删除消息。

成功响应 `200 OK`：

```json
{
  "message": "Message deleted"
}
```

---

## 6. 资源 (Resources)

Base: `/api/projects/:project_id`，**所有端点需要认证。**

### GET /api/projects/:project_id/resources

列出项目资源。

查询参数：

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `type` | string | - | 按类型筛选（如 `document`） |

成功响应 `200 OK`：

```json
[
  {
    "id": "uuid",
    "project_id": "uuid",
    "session_id": "uuid (可为 null)",
    "type": "document",
    "name": "文件名.pdf",
    "content": "文件内容文本 (可为 null)",
    "url": "sdk-file:xxx (可为 null)",
    "size": "1024",
    "created_at": "2025-01-01T00:00:00Z"
  }
]
```

---

### POST /api/projects/:project_id/resources

创建资源。

请求 Body：

```json
{
  "type": "document (必填)",
  "name": "文件名 (必填)",
  "content": "文件内容 (可选)",
  "url": "https://... (可选)",
  "size": "1024 (可选)",
  "session_id": "uuid (可选)"
}
```

成功响应 `200 OK`：同资源对象格式。

---

### PATCH /api/projects/:project_id/resources/:resource_id

更新资源。

请求 Body：

```json
{
  "name": "新名称 (可选)",
  "content": "新内容 (可选)",
  "url": "新链接 (可选)"
}
```

成功响应 `200 OK`：同资源对象格式。

---

### DELETE /api/projects/:project_id/resources/:resource_id

删除资源。

成功响应 `200 OK`：

```json
{
  "message": "Resource deleted"
}
```

---

### POST /api/projects/:project_id/upload

上传文件。**Content-Type: `multipart/form-data`**

表单字段：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `file` | file | 是 | 上传的文件 |

限制：
- 文件大小：1B ~ 20MB
- 允许的扩展名：`.pdf`, `.doc`, `.docx`, `.txt`, `.md`, `.jpg`, `.jpeg`, `.png`

成功响应 `200 OK`：同资源对象格式（自动创建 `type=document` 的资源）。

错误响应：

| 状态码 | detail |
|--------|--------|
| 400 | `file is required` / `file size must be between 1B and 20MB` / `unsupported file type` |
| 500 | `failed to open upload stream` / `failed to read upload stream` / `failed to create resource for upload` |
| 502 | `sdk upload failed: ...` |

---

### POST /api/projects/:project_id/page-from-outline

根据大纲生成 HTML 页面资源（W6 PageMaker）。支持 SSE 流式进度。

请求 Body：

```json
{
  "title": "页面标题 (必填)",
  "knowledge_points": "知识点描述 (可选)",
  "outline": "大纲文本 (与 outline_resource_id 二选一)",
  "outline_resource_id": "已有大纲资源 ID (与 outline 二选一)"
}
```

**非流式模式**（默认）：成功响应 `200 OK`

```json
{
  "id": "resource-uuid",
  "project_id": "uuid",
  "type": "page",
  "name": "生成页面",
  "content": "<html>...</html>",
  "created_at": "2025-01-01T00:00:00Z"
}
```

**流式模式**（请求头 `Accept: text/event-stream` 或查询参数 `?stream=1`）：

SSE 事件格式：

```
event: progress
data: {"step":"created_chat","message":"已创建对话"}

event: progress
data: {"step":"calling_pagemaker","message":"正在调用 PageMaker 代理..."}

event: progress
data: {"step":"waiting_artefact","message":"正在生成网页，请稍候..."}

event: progress
data: {"step":"got_artefact","message":"已生成，正在拉取结果..."}

event: progress
data: {"step":"saving","message":"正在保存到项目..."}

event: progress
data: {"step":"done","message":"完成"}

event: result
data: {"id":"...","project_id":"...","type":"page","name":"...","content":"...","created_at":"..."}

event: error
data: {"detail":"错误描述"}
```

错误响应：

| 状态码 | detail |
|--------|--------|
| 400 | `invalid request body` / `outline or outline_resource_id is required` |
| 404 | `Project not found` / `Outline resource not found` |
| 501 | `W6 pagemaker is not configured in backend` |
| 500 | `failed to generate page: ...` |

---

## 7. 对话 (Chat)

Base: `/api/chat`，**所有端点需要认证。**

### POST /api/chat

同步对话。

请求 Body：

```json
{
  "message": "你好 (必填)",
  "project_id": "uuid (必填)",
  "session_id": "uuid (可选，不传则新建会话)",
  "skill_id": "skill-uuid (可选)",
  "attachments": {},
  "resource_refs": [
    { "id": "resource-uuid", "name": "文档名", "type": "document" }
  ],
  "model": "model-name (可选)",
  "mode": "chat (可选)"
}
```

成功响应 `200 OK`：

```json
{
  "id": "message-uuid",
  "project_id": "uuid",
  "session_id": "uuid",
  "role": "assistant",
  "content": "回复内容",
  "skill_id": "skill-uuid (可为 null)",
  "created_at": "2025-01-01T00:00:00Z"
}
```

错误响应：

| 状态码 | detail | code |
|------|--------|------|
| 400 | `invalid request body` | - |
| 400 | 上游会话未绑定 | - |
| 402 | `insufficient credits` | `insufficient_credits` |
| 409 | 上游会话 ID 冲突 | - |
| 500 | `ai error: ...` | - |

---

### POST /api/chat/stream

流式对话（SSE）。

请求 Body：同 `POST /api/chat`。**`project_id` 为必填。**

```
Content-Type: application/json
```

成功时返回 `text/event-stream`，SSE 事件序列如下：

#### 1. 连接上游

```
event: status
data: {"type":"status","value":"connecting_upstream"}
```

#### 2. 内容流式输出

```
event: content
data: {"type":"content","value":"你"}
```

```
event: content
data: {"type":"content","value":"好"}
```

#### 3. 工具调用（可选）

```
event: tool
data: {"type":"tool","value":"..."}
```

#### 4. 上游握手（可选）

```
event: upstream_handshake
data: {"type":"upstream_handshake","value":"..."}
```

#### 5. 完成流式输出后

```
event: done
data: {"type":"done","value":""}
```

#### 6. 返回会话 ID

```
event: session_id
data: {"type":"session_id","value":"session-uuid"}
```

#### 7. 清除状态

```
event: status_clear
data: {"type":"status_clear","value":""}
```

#### 8. 最终状态

```
event: status
data: {"type":"status","value":"session:session-uuid"}
```

#### 错误事件

```
event: error
data: {"type":"error","value":"insufficient credits"}
```

```
event: error
data: {"type":"error","value":"ai error: ..."}
```

**SSE 事件类型汇总**：

| 事件类型 | 说明 |
|----------|------|
| `status` | 状态变更（如 `connecting_upstream`、`session:xxx`） |
| `content` | 流式输出的文本 token |
| `tool` | 工具调用事件 |
| `done` | 流式输出结束 |
| `error` | 错误事件 |
| `upstream_handshake` | 上游 WebSocket 握手完成 |
| `session_id` | 返回会话 ID |
| `status_clear` | 清除前端状态提示 |

错误响应（在 SSE 事件中）：

| 错误值 | 说明 |
|--------|------|
| `insufficient credits` | 积分不足 |
| 上游会话冲突/未绑定错误 | 上游会话状态异常 |
| `ai error: ...` | AI 服务调用失败 |

---

### POST /api/chat/sync-state

同步会话状态。

请求 Body：

```json
{
  "project_id": "uuid (必填)",
  "session_id": "uuid (必填)",
  "upstream_session_id": "upstream-uuid (可选)",
  "activate_upstream": false
}
```

成功响应 `200 OK`：

```json
{
  "artifact_count": 3,
  "todo_count": 1
}
```

上游不可用时降级响应 `200 OK`：

```json
{
  "artifact_count": 0,
  "todo_count": 0,
  "skipped": true,
  "detail": "upstream unavailable"
}
```

错误响应：

| 状态码 | detail |
|--------|--------|
| 400 | `invalid request body` / 上游会话未绑定 |
| 404 | `Project not found` |
| 409 | 上游会话 ID 冲突 |
| 502 | `sync session state failed` |

---

### GET /api/chat/remote-messages

拉取远程（上游）消息。

查询参数：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `project_id` | string | 是 | 项目 ID |
| `session_id` | string | 是 | 会话 ID |
| `skip` | int | 否 | 偏移量（默认 0） |
| `limit` | int | 否 | 每页数量（默认 20，最大 200） |

成功响应 `200 OK`：同消息数组格式。

错误响应：

| 状态码 | detail |
|--------|--------|
| 400 | `project_id and session_id are required` / 上游会话未绑定 |
| 404 | `Project not found` |
| 409 | 上游会话 ID 冲突 |
| 502 | `remote message fetch failed` |

---

### GET /api/chat/upstream-gate

获取上游会话网关状态。

查询参数：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `project_id` | string | 是 | 项目 ID |
| `session_id` | string | 是 | 会话 ID |

成功响应 `200 OK`：上游网关视图对象。

错误响应：

| 状态码 | detail |
|--------|--------|
| 400 | `project_id and session_id are required` |
| 404 | `Project or session not found` |

---

### POST /api/chat/upstream-stop

停止上游任务。

请求 Body：

```json
{
  "project_id": "uuid (必填)",
  "session_id": "uuid (必填)"
}
```

成功响应 `200 OK`：

```json
{
  "ok": true
}
```

错误响应：

| 状态码 | detail |
|--------|--------|
| 400 | `invalid request body` / 上游会话未绑定 |
| 501 | `upstream stop not supported in this deployment` |
| 503 | 上游停止不可用 |
| 502 | `upstream stop failed` |

---

### GET /api/chat/source/:source_id

获取源文件内容。

查询参数：

| 参数 | 类型 | 说明 |
|------|------|------|
| `download` | string | 设为 `1` 时以附件方式下载 |

成功响应：直接返回文件内容，响应头包含 `Content-Type` 和 `Content-Disposition`。

错误响应：

| 状态码 | detail |
|--------|--------|
| 400 | `source_id is required` |
| 502 | `failed to fetch source` |

---

## 8. 技能 (Skills)

Base: `/api/skills`，**所有端点需要认证。**

### GET /api/skills

列出所有技能。

成功响应 `200 OK`：

```json
[
  {
    "id": "skill-uuid",
    "name": "写作助手",
    "description": "帮助撰写文章",
    "icon": "✍️",
    "category": "writing",
    "author": "官方",
    "users_count": 1200,
    "rating": 4.5,
    "tags": ["写作", "文章"],
    "system_prompt": "你是一个专业的写作助手...",
    "is_installed": true,
    "is_personal": false,
    "is_recommended": true
  }
]
```

> `description`、`icon`、`author`、`system_prompt` 可为 `null`。

---

### POST /api/skills

创建自定义技能。

请求 Body：

```json
{
  "name": "string (必填)",
  "description": "技能描述 (可选)",
  "icon": "图标 (可选)",
  "category": "分类",
  "system_prompt": "系统提示词 (可选)"
}
```

成功响应 `201 Created`：同技能对象格式。

---

### GET /api/skills/:id

获取技能详情。

成功响应 `200 OK`：同技能对象格式。

错误响应：

| 状态码 | detail |
|--------|--------|
| 404 | `Skill not found` |

---

### GET /api/skills/installed

列出已安装的技能。

成功响应 `200 OK`：同技能数组格式。

---

### GET /api/skills/recommended

列出推荐技能（默认最多 4 个）。

成功响应 `200 OK`：同技能数组格式。

---

### POST /api/skills/:id/install

安装技能。

成功响应 `200 OK`：

```json
{
  "message": "ok"
}
```

错误响应：

| 状态码 | detail |
|--------|--------|
| 404 | `Skill not found` |

---

### POST /api/skills/:id/uninstall

卸载技能。

成功响应 `200 OK`：

```json
{
  "message": "ok"
}
```

错误响应：

| 状态码 | detail |
|--------|--------|
| 404 | `Skill not found` |

---

## 9. 提示词模板 (Prompt Templates)

Base: `/api/prompt-templates`，**所有端点需要认证。**

### GET /api/prompt-templates

列出当前用户的提示词模板。首次调用会自动初始化默认模板。

成功响应 `200 OK`：

```json
[
  {
    "id": "uuid",
    "action_type": "summarize",
    "name": "摘要生成",
    "prompt": "请对以下内容生成摘要：",
    "created_at": "2025-01-01T00:00:00Z",
    "updated_at": "2025-01-01T00:00:00Z"
  }
]
```

---

### POST /api/prompt-templates

创建提示词模板。

请求 Body：

```json
{
  "action_type": "string (必填)",
  "name": "string (必填)",
  "prompt": "string (必填)"
}
```

成功响应 `201 Created`：同模板对象格式。

错误响应：

| 状态码 | detail |
|--------|--------|
| 400 | `invalid request body` / `action_type, name and prompt are required` |
| 500 | `failed to create prompt template` |

---

### GET /api/prompt-templates/:id

获取模板详情。

成功响应 `200 OK`：同模板对象格式。

错误响应：

| 状态码 | detail |
|--------|--------|
| 404 | `PromptTemplate not found` |

---

### PATCH /api/prompt-templates/:id

更新模板。

请求 Body：

```json
{
  "action_type": "新类型 (可选)",
  "name": "新名称 (可选)",
  "prompt": "新提示词 (可选)"
}
```

成功响应 `200 OK`：同模板对象格式。

错误响应：

| 状态码 | detail |
|--------|--------|
| 400 | `invalid request body` |
| 404 | `PromptTemplate not found` |

---

### DELETE /api/prompt-templates/:id

删除模板。

成功响应 `200 OK`：

```json
{
  "message": "PromptTemplate deleted"
}
```

错误响应：

| 状态码 | detail |
|--------|--------|
| 404 | `PromptTemplate not found` |

---

## 10. 模型 (Models)

Base: `/api/models`，**无需认证。**

### GET /api/models

获取可用模型列表（占位接口，与旧版兼容）。

成功响应 `200 OK`：

```json
{
  "models": [],
  "default_model": "",
  "updated_at": "2025-01-01T00:00:00Z"
}
```

---

## 11. 用户 (User)

Base: `/api/user`，**所有端点需要认证。**

### GET /api/user/balance

获取用户积分余额。

成功响应 `200 OK`：

```json
{
  "balance": 80,
  "used": 20,
  "plan": "free"
}
```

---

## 12. 健康检查

### GET /health

健康检查。**无需认证。**

成功响应 `200 OK`：

```json
{
  "status": "healthy"
}
```

---

## 13. 错误码汇总

### HTTP 状态码

| 状态码 | 含义 | 典型场景 |
|--------|------|----------|
| 200 | 成功 | 正常请求 |
| 201 | 创建成功 | 创建技能/模板 |
| 400 | 请求无效 | 参数缺失、格式错误、上游会话未绑定 |
| 401 | 未认证 | 缺少 Token、Token 无效或过期 |
| 402 | 积分不足 | 对话时余额不足 |
| 404 | 资源不存在 | 项目/会话/消息/技能/模板不存在 |
| 409 | 冲突 | 上游会话 ID 冲突 |
| 500 | 服务器内部错误 | 服务异常 |
| 501 | 未实现 | W6 PageMaker 未配置、上游停止不支持 |
| 502 | 网关错误 | AI 服务调用失败、SDK 上传失败 |
| 503 | 服务不可用 | 上游停止功能不可用 |

### 业务错误码

| code | 说明 |
|------|------|
| `insufficient_credits` | 用户积分余额不足，无法完成对话 |

### 认证错误 detail 值

| detail | 说明 |
|--------|------|
| `Missing Authorization header` | 请求头缺少 Authorization |
| `Invalid Authorization header` | Authorization 格式不正确（非 Bearer 格式） |
| `Could not validate credentials` | Token 无效、过期或用户不存在 |
| `Not authenticated` | 上下文中未找到用户（中间件未通过） |

### SDK 错误码（内部）

| 错误码 | 说明 |
|--------|------|
| `unauthorized` | SDK 认证失败 |
| `rate_limited` | 请求被限流 |
| `timeout` | 请求超时 |
| `upstream_4xx` | 上游返回 4xx |
| `upstream_5xx` | 上游返回 5xx |
| `protocol_error` | 协议错误 |
| `transport_error` | 传输错误 |
| `bad_request` | 请求参数错误 |
| `internal` | 内部错误 |
| `not_implemented` | 功能未实现 |
