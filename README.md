# YLMNote

AI 驱动的知识管理平台 — 项目管理、实时 AI 对话、资源与技能系统。

`Go` `Gin` `GORM` `SQLite` `React` `TypeScript` `Vite` `Zustand` `TanStack Query` `Tailwind CSS` `WebSocket`

## 快速启动

```bash
# 后端（开发环境请设置 HTTP_PORT=40001 以配合前端 Vite 代理）
cp backend/.env.example .env   # 编辑必填项: DATABASE_URL, JWT_SECRET, HTTP_PORT=40001
cd backend && go run ./cmd/server/main.go

# 前端
cd frontend && pnpm install && pnpm dev

# 构建
make all    # 输出 bin/server + bin/static/
```

详见 [doc/PROJECT_OVERVIEW.md](doc/PROJECT_OVERVIEW.md)。

## 文档索引

| 文档 | 说明 |
|------|------|
| [doc/PROJECT_OVERVIEW.md](doc/PROJECT_OVERVIEW.md) | 项目总览：定位、技术栈、目录结构、快速启动 |
| [doc/ARCHITECTURE.md](doc/ARCHITECTURE.md) | 架构设计：DDD 分层、模块依赖、数据流 |
| [doc/API_REFERENCE.md](doc/API_REFERENCE.md) | API 参考：路由、请求/响应格式、认证机制 |
| [doc/FRONTEND_GUIDE.md](doc/FRONTEND_GUIDE.md) | 前端开发指南：组件体系、状态管理、构建配置 |
| [doc/DATABASE_DESIGN.md](doc/DATABASE_DESIGN.md) | 数据库设计：表结构、迁移策略、索引 |
| [doc/DEVELOPMENT_STANDARDS.md](doc/DEVELOPMENT_STANDARDS.md) | 开发规范：代码风格、Git 流程、提交规范 |
| [doc/DEPLOYMENT_GUIDE.md](doc/DEPLOYMENT_GUIDE.md) | 部署运维：构建产物、PM2 配置、CI/CD |
