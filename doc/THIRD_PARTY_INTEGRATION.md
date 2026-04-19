# 第三方接入文档

本文档描述第三方如何在自己的网页中集成 Cozor 项目，实现固定用户自动登录、对话功能和文件下载功能。

---

## 目录

1. [项目概述](#1-项目概述)
2. [认证机制](#2-认证机制)
3. [自动登录](#3-自动登录)
4. [对话功能](#4-对话功能)
5. [文件下载功能](#5-文件下载功能)
6. [API 错误码](#6-api-错误码)

---

## 1. 项目概述

Cozor 是一个 AI Agent 系统，支持：
- WebSocket 实时对话
- 文件上传下载
- 记忆系统（情景记忆、语义记忆、工作记忆）
- Docker 沙箱代码执行

**后端地址**：`http://example.com`（默认配置，第三方需根据实际部署地址修改）

---

## 2. 认证机制

### 2.1 认证方式

所有 API 请求需要在 Header 中携带 `x-w6service-api-key` 参数进行认证：

```http
x-w6service-api-key: your_api_key_here
```

### 2.2 用户信息

获取当前登录用户信息：

```http
GET /api/whoami
x-w6service-api-key: your_api_key_here
```

响应示例：
```json
{
  "username": "alice",
  "user_id": "u_12345",
  "metadata": {}
}
```

---

## 3. 自动登录

第三方页面通过预共享的 API Key 实现固定用户自动登录。无需调用登录接口，直接在请求中携带 API Key 即可。

### 3.1 第三方集成示例

```html
<!DOCTYPE html>
<html>
<head>
  <title>第三方集成示例</title>
</head>
<body>
  <div id="app"></div>

  <script>
    const API_BASE = 'http://localhost:41889';
    const API_KEY = 'your_api_key_here';  // 预共享的 API Key

    async function fetchAsUser(url, options = {}) {
      return fetch(url, {
        ...options,
        headers: {
          ...options.headers,
          'x-w6service-api-key': API_KEY
        }
      });
    }

    // 初始化 - 获取用户信息
    async function init() {
      try {
        const response = await fetchAsUser(`${API_BASE}/api/whoami`);
        if (!response.ok) {
          throw new Error(`认证失败: ${response.status}`);
        }
        const user = await response.json();
        document.getElementById('app').innerHTML = `<p>欢迎, ${user.username}</p>`;
      } catch (err) {
        console.error('初始化失败:', err);
      }
    }

    init();
  </script>
</body>
</html>
```

### 3.2 直接使用 API Key 认证

如果第三方直接持有用户的 API Key，可跳过登录直接使用：

```html
<script>
  const API_KEY = 'your_api_key_here';  // 从第三方配置获取

  async function fetchAsUser(url, options = {}) {
    return fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        'x-w6service-api-key': API_KEY
      }
    });
  }

  // 示例：获取用户信息
  fetchAsUser(`${API_BASE}/api/whoami`).then(r => r.json()).then(console.log);
</script>
```

---

## 4. 对话功能

### 4.1 实时对话（WebSocket）

通过 WebSocket 实现实时双向对话。

**WebSocket 地址**：`ws://example.com/api/ws/run`

#### 4.1.1 客户端发送消息

```typescript
// 用户输入消息
{
  "type": "input",
  "content": "帮我分析这个文件",     // 对话内容
  "attachments": ["file_123"]       // 附件ID列表（可选）
}

// 停止当前操作
{
  "type": "Stop"
}
```

#### 4.1.2 服务端推送消息

```typescript
// 状态更新
{
  "type": "Status",
  "status": "idle" | "busy" | "running"
}

// 错误信息
{
  "type": "Error",
  "error": "错误描述"
}

// 思考内容（流式输出）
{
  "type": "Thinking",
  "content": "正在分析..."
}

// 上下文更新
{
  "type": "Update",
  "state": { /* 当前状态 */ },
  "messages": [ /* 消息列表 */ ]
}

// LLM 调用开始
{
  "type": "ApiCallStarted",
  "call_id": "call_001"
}

// LLM 调用结束
{
  "type": "ApiCallFinished",
  "call_id": "call_001"
}
```

#### 4.1.3 WebSocket 对话示例

```html
<!DOCTYPE html>
<html>
<head>
  <title>对话功能示例</title>
  <style>
    #messages { border: 1px solid #ccc; height: 300px; overflow-y: auto; padding: 10px; }
    #input { width: 80%; }
    .user { color: blue; }
    .assistant { color: green; }
  </style>
</head>
<body>
  <h2>AI 对话</h2>
  <div id="messages"></div>
  <input type="text" id="input" placeholder="输入消息..." />
  <button onclick="sendMessage()">发送</button>

  <script>
    const API_BASE = 'ws://example.com';
    const API_KEY = 'your_api_key_here';
    let ws;

    function connect() {
      ws = new WebSocket(`${API_BASE}/api/ws/run`);

      ws.onopen = () => {
        console.log('WebSocket 已连接');
        // 认证
        ws.send(JSON.stringify({ type: 'auth', api_key: API_KEY }));
      };

      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        handleMessage(msg);
      };

      ws.onerror = (err) => console.error('WebSocket 错误:', err);
      ws.onclose = () => console.log('WebSocket 已断开');
    }

    function handleMessage(msg) {
      const div = document.getElementById('messages');

      switch (msg.type) {
        case 'Status':
          div.innerHTML += `<p><em>状态: ${msg.status}</em></p>`;
          break;
        case 'Thinking':
          div.innerHTML += `<p class="assistant">AI: ${msg.content}</p>`;
          break;
        case 'Error':
          div.innerHTML += `<p style="color: red">错误: ${msg.error}</p>`;
          break;
        case 'Update':
          // 更新消息列表
          msg.messages.forEach(m => {
            div.innerHTML += `<p class="${m.role}">${m.role}: ${m.content}</p>`;
          });
          break;
      }
      div.scrollTop = div.scrollHeight;
    }

    function sendMessage() {
      const input = document.getElementById('input');
      const content = input.value.trim();
      if (!content || !ws) return;

      ws.send(JSON.stringify({
        type: 'Input',
        content: content,
        attachments: []
      }));

      input.value = '';
    }

    // 回车发送
    document.getElementById('input').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') sendMessage();
    });

    // 初始化连接
    connect();
  </script>
</body>
</html>
```

### 4.2 获取历史消息

```http
GET /api/agents/{agent_id}/messages?limit=500&offset=0
x-w6service-api-key: your_api_key_here
```

`agent_id` 即会话维度的 Agent 标识；查询参数与上游实现一致时支持 `limit` / `offset` 分页。

**本仓库 SDK（ylmsdk）**：与后端拉远端时间线使用同一认证与路径，可在开发机直接汇总各帧 `kind`：

```bash
cd yilimsdk
export AI_SDK_BASE_URL="https://你的上游根地址"   # 与 AI 对话相同，非 OpenAI /v1 路径
export AI_SDK_SERVICE_API_KEY="your_api_key_here"
go run ./cmd/agent-messages -limit=500 -offset=0 "<agent_id>"
# 仅看 kind 分布；需要完整 JSON 时加 -json
```

Go 代码侧调用 `provider.New(...).FetchAgentMessages(ctx, agentID, limit, offset)`，返回 JSON 对象（含 `messages` 数组）；后端 `classifyUpstreamKind` 与聊天 UI 的「过程消息」分类即基于各帧的 `kind` 字段。

**响应示例**：
```json
{
  "messages": [
    {
      "id": "msg_001",
      "role": "user",
      "content": "帮我分析这个数据",
      "timestamp": "2026-04-01T10:30:00Z"
    },
    {
      "id": "msg_002",
      "role": "assistant",
      "content": "我来帮你分析这些数据。首先...",
      "timestamp": "2026-04-01T10:30:05Z"
    }
  ]
}
```

### 4.3 获取 Agent 列表

```http
GET /api/agents
x-w6service-api-key: your_api_key_here
```

响应示例：
```json
{
  "agents": [
    {
      "id": "agent_001",
      "name": "默认Agent",
      "description": "主对话Agent",
      "sop": "你是一个有帮助的AI助手..."
    }
  ]
}
```

---

## 5. 文件下载功能

### 5.1 通用下载接口

通过 `/call/{kind}/{identifier}` 端点进行文件下载。

```http
POST /call/{kind}/{identifier}
x-w6service-api-key: your_api_key_here
Content-Type: application/json

{
  "url": "https://example.com/file.pdf",
  "method": "GET",
  "headers": {},
  "domain": "example.com"
}
```

**响应示例**：
```json
{
  "status_code": 200,
  "final_url": "https://example.com/file.pdf",
  "response_headers": {
    "content-type": "application/pdf",
    "content-disposition": "attachment; filename=\"report.pdf\""
  },
  "content_type": "application/pdf",
  "data_base64": "JVBERi0xLjQK...",
  "filename": "report.pdf"
}
```

### 5.2 文件下载示例

```html
<!DOCTYPE html>
<html>
<head>
  <title>文件下载示例</title>
</head>
<body>
  <h2>文件下载</h2>
  <input type="text" id="url" placeholder="输入文件URL" style="width: 300px" />
  <button onclick="downloadFile()">下载</button>

  <script>
    const API_BASE = 'http://localhost:41889';
    const API_KEY = 'your_api_key_here';

    async function downloadFile() {
      const url = document.getElementById('url').value.trim();
      if (!url) {
        alert('请输入文件URL');
        return;
      }

      try {
        // 解析域名
        const domain = new URL(url).hostname;

        const response = await fetch(`${API_BASE}/call/download/default`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-w6service-api-key': API_KEY
          },
          body: JSON.stringify({
            url: url,
            method: 'GET',
            headers: {},
            domain: domain
          })
        });

        if (!response.ok) {
          throw new Error(`下载失败: ${response.status}`);
        }

        const data = await response.json();

        // 解码 Base64 并触发下载
        const binary = atob(data.data_base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }

        const blob = new Blob([bytes], { type: data.content_type });
        const downloadUrl = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = data.filename || 'download';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(downloadUrl);

        console.log('下载完成:', data.filename);
      } catch (err) {
        console.error('下载失败:', err);
        alert('下载失败: ' + err.message);
      }
    }
  </script>
</body>
</html>
```

### 5.3 获取源文件内容

```http
GET /api/source/{source_id}
x-w6service-api-key: your_api_key_here
```

**响应示例**：
```json
{
  "id": "src_123",
  "filename": "report.pdf",
  "content_type": "application/pdf",
  "size": 102400,
  "url": "https://example.com/files/report.pdf",
  "created_at": "2026-04-01T09:00:00Z"
}
```

### 5.4 文件上传

```http
POST /api/upload
x-w6service-api-key: your_api_key_here
Content-Type: multipart/form-data

file: <文件数据>
```

**响应示例**：
```json
{
  "id": "file_456",
  "filename": "document.pdf",
  "content_type": "application/pdf",
  "size": 524288,
  "url": "/api/source/file_456",
  "created_at": "2026-04-01T10:00:00Z"
}
```

---

## 6. API 错误码

| HTTP 状态码 | 说明 |
|-------------|------|
| 200 | 成功 |
| 400 | 请求参数错误 |
| 401 | 未认证或认证失败 |
| 403 | 权限不足 |
| 404 | 资源不存在 |
| 500 | 服务器内部错误 |

### 常见错误响应格式

```json
{
  "error": "错误描述",
  "code": "ERROR_CODE"
}
```

---

## 集成检查清单

- [ ] 确认后端服务地址
- [ ] 获取有效的 API Key
- [ ] 实现 WebSocket 连接用于实时对话
- [ ] 实现文件下载功能（Base64 解码）
- [ ] 处理错误和重连逻辑

---

## 技术支持

如有问题，请检查：
1. 后端服务是否运行 (`http://localhost:41889/health`)
2. API Key 是否有效
3. 网络连接是否正常
4. CORS 配置是否允许第三方域名
