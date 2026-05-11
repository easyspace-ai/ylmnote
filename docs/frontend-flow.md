# 前端交互流程图（Mermaid）

```mermaid
flowchart TB
    subgraph Auth[认证入口]
        Login["/login<br/>登录页"]
        Register["/register<br/>注册页"]
    end

    subgraph Layout[MainLayout 布局容器]
        Sidebar["Sidebar<br/>侧边导航栏"]
    end

    subgraph Pages[页面路由]
        Home["/home<br/>主页"]
        Search["/search<br/>搜索页"]
        Boards["/boards<br/>项目列表"]
        Detail["/boards/:id/sessions/:sessionId<br/>核心工作区"]
        Skills["/skills<br/>技能市场"]
        Settings["/settings<br/>设置页"]
    end

    Auth -->|已认证| Layout
    Layout --> Sidebar
    Sidebar --> Pages
    Pages --> Detail

    subgraph Workspace[ProjectDetail 核心工作区]
        direction LR
        Left["LeftPane<br/>左侧资料栏"]
        Center["AIChatBoxNew<br/>中间对话区"]
        Right["RightStudioPane<br/>右侧输出栏"]
    end

    Detail --> Workspace

    subgraph LeftPanel[左侧资料栏]
        direction TB
        L1["文档管理<br/>pdf, doc, txt, md"]
        L2["链接管理<br/>YouTube, 网页"]
        L3["笔记管理<br/>note, text"]
        L4["文件上传"]
        L5["资源预览"]
        L6["搜索资料"]
    end

    subgraph CenterPanel[中间对话区]
        direction TB
        C1["消息列表"]
        C2["流式响应<br/>WebSocket"]
        C3["技能选择<br/>Studio Tools"]
        C4["模式选择<br/>chat/reasoning"]
        C5["资料引用<br/>libraryFiles"]
        C6["附件上传"]
    end

    subgraph RightPanel[右侧输出栏]
        direction TB
        R1["PPT 产物"]
        R2["动态网页"]
        R3["思维导图"]
        R4["测验生成"]
        R5["图片生成"]
        R6["下载管理"]
    end

    LeftPanel --- Left
    CenterPanel --- Center
    RightPanel --- Right

    subgraph State[Zustand Store - apiStore]
        S1["projects[]"]
        S2["currentProject"]
        S3["sessions[]"]
        S4["messages[]"]
        S5["resources[]"]
        S6["wsConnections{}"]
        S7["streamingBySession{}"]
        S8["skills[]"]
        S9["installedSkills[]"]
        S10["promptTemplates[]"]
    end

    Workspace --> State

    subgraph API[API 服务层]
        PAPI["projectApi<br/>笔记 CRUD"]
        SAPI["sessionApi<br/>会话管理"]
        RAPI["resourceApi<br/>资源管理"]
        CAPI["chatApi<br/>消息操作"]
        SAPi["skillApi<br/>技能操作"]
    end

    subgraph WS[WebSocket 服务]
        WS1["connect(sessionId, projectId)"]
        WS2["sendMessageWS()"]
        WS3["onMessage → messages"]
        WS4["onToolCall → tools"]
        WS5["reconnect logic"]
    end

    State --> API
    State --> WS

    API -->|"HTTP/HTTPS"| Backend[后端 API]
    WS -->|"WS Protocol"| Backend
```

## 核心工作区详细流程

```mermaid
flowchart LR
    subgraph 进入流程
        A1["URL 路由变化<br/>/boards/:id/sessions/:sessionId"] --> A2["fetchProject(id)"]
        A2 --> A3["fetchSessions(id)"]
        A3 --> A4["fetchMessagesBySession()"]
        A4 --> A5["connectWebSocket()"]
    end

    subgraph 消息流程
        B1["用户输入消息"] --> B2["handleSendMessage()"]
        B2 --> B3["附件处理<br/>uploadResource()"]
        B3 --> B4["sendMessageWS()"]
        B4 --> B5["WebSocket 发送"]
        B5 --> B6["后端流式响应"]
        B6 --> B7["update messages"]
        B7 --> B8["渲染消息列表"]
    end

    subgraph 资源流程
        C1["上传文件 / 添加链接"] --> C2["createResource()"]
        C2 --> C3["fetchResources()"]
        C3 --> C4["左侧资料栏展示"]
    end

    subgraph Studio 流程
        D1["选择 Studio 技能"] --> D2["设置 activeStudioTool"]
        D2 --> D3["发送消息携带技能ID"]
        D3 --> D4["后端执行技能"]
        D4 --> D5["生成产物资源"]
        D5 --> D6["createResource(type=output)"]
        D6 --> D7["右侧输出栏展示"]
    end
```

## 组件交互时序

```mermaid
sequenceDiagram
    participant User as 用户
    participant Route as 路由
    participant Store as apiStore
    participant WS as WebSocket
    participant API as 后端 API

    Note over User,API: 进入工作区流程

    Route->>Store: fetchProject(id)
    Store->>API: GET /projects/:id
    API-->>Store: project data
    Store-->>Route: currentProject

    Route->>Store: fetchSessions(id)
    Store->>API: GET /projects/:id/sessions
    API-->>Store: sessions[]
    Store-->>Route: sessions

    Route->>Store: fetchMessagesBySession(id, sessionId)
    Store->>API: GET /projects/:id/sessions/:sessionId/messages
    API-->>Store: messages[]
    Store-->>Route: messages

    Route->>WS: connectWebSocket(sessionId, projectId)
    WS-->>Route: wsStatus: connected

    Note over User,API: 发送消息流程

    User->>Route: 输入消息 + 点击发送
    Route->>Store: handleSendMessage(message)
    Store->>Store: 处理附件
    Store->>WS: sendMessageWS(sessionId, content, attachments)
    WS->>API: WebSocket 消息

    API-->>WS: 流式响应 (streaming)
    WS->>Store: onMessage → append messages
    Store-->>User: 实时渲染 AI 回复

    Note over User,API: 资源管理流程

    User->>Route: 上传文件
    Route->>Store: uploadResource(projectId, file)
    Store->>API: POST /projects/:id/upload
    API-->>Store: resource
    Store->>Store: fetchResources()
    Store->>User: 左侧资料栏更新
```

## 数据模型关系

```mermaid
erDiagram
    USER ||--o{ PROJECT : creates
    PROJECT ||--o{ SESSION : contains
    SESSION ||--o{ MESSAGE : has
    SESSION ||--o{ RESOURCE : generates
    PROJECT ||--o{ RESOURCE : owns
    USER ||--o{ SKILL : installs
    PROJECT ||--o{ PROMPT_TEMPLATE : uses
```

## 技术栈

| 层级 | 技术 |
|------|------|
| 路由 | React Router v6 |
| 状态管理 | Zustand |
| 数据获取 | TanStack Query |
| HTTP 客户端 | Fetch API |
| 实时通信 | WebSocket |
| UI 框架 | React + TypeScript |
| 样式 | Tailwind CSS |
| 组件库 | lucide-react (图标) |