# YLMNote 部署运维指南

本文档提供 YLMNote 笔记的完整部署、运维和配置说明。

## 1. 环境要求

### 1.1 后端依赖

| 组件 | 版本要求 | 说明 |
|------|----------|------|
| Go | 1.25.0+ | 后端服务运行环境 |
| GCC | 任意版本 | SQLite C 库编译依赖（CGO 需要） |
| SQLite | 3.x | 嵌入式数据库，无需单独安装 |

### 1.2 前端依赖

| 组件 | 版本要求 | 说明 |
|------|----------|------|
| Node.js | 20.x+ | 前端构建运行环境 |
| pnpm | 9.x | 包管理器（推荐） |

### 1.3 系统依赖

```bash
# Ubuntu/Debian
sudo apt-get update
sudo apt-get install -y gcc libc6-dev

# macOS
xcode-select --install

# CentOS/RHEL
sudo yum install -y gcc glibc-devel
```

---

## 2. 环境变量完整清单

### 2.1 必填项（启动必需）

| 变量名 | 是否必填 | 默认值 | 说明 |
|--------|----------|--------|------|
| `DATABASE_URL` | **是** | - | SQLite 数据库文件路径，如 `./youmind.db` |
| `JWT_SECRET` | **是** | - | JWT 签名密钥，生产环境必须使用强随机字符串 |

### 2.2 服务器配置

| 变量名 | 是否必填 | 默认值 | 说明 |
|--------|----------|--------|------|
| `HTTP_PORT` | 否 | `8080` | HTTP 服务监听端口 |
| `APP_NAME` | 否 | `YouMind Backend v2` | 应用名称 |
| `APP_ENV` | 否 | `development` | 运行环境：`development` / `production` |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | 否 | `60` | JWT Token 过期时间（分钟） |

### 2.3 日志配置

| 变量名 | 是否必填 | 默认值 | 说明 |
|--------|----------|--------|------|
| `LOG_FILE_PATH` | 否 | `./logs/backend.log`（仅开发环境） | 日志文件路径，留空则不写入文件 |
| `LOG_TO_STDOUT` | 否 | `true` | 是否输出日志到标准输出 |

### 2.4 CORS 配置

| 变量名 | 是否必填 | 默认值 | 说明 |
|--------|----------|--------|------|
| `CORS_ALLOWED_ORIGINS` | 生产环境**必填** | - | 逗号分隔的允许来源，如 `https://app.example.com,http://localhost:5173` |

> **重要**：当 `APP_ENV=production` 时，必须配置 `CORS_ALLOWED_ORIGINS`，否则服务无法启动。

### 2.5 限流配置

| 变量名 | 是否必填 | 默认值 | 说明 |
|--------|----------|--------|------|
| `RATE_LIMIT_API_PER_MINUTE` | 否 | `180` | `/api/*` 路径每 IP 每分钟请求上限 |
| `RATE_LIMIT_AUTH_PER_MINUTE` | 否 | `30` | `/api/auth/*` 路径每 IP 每分钟请求上限（防暴力破解） |

### 2.6 AI SDK 配置（推荐）

| 变量名 | 是否必填 | 默认值 | 说明 |
|--------|----------|--------|------|
| `AI_SDK_BASE_URL` | 否 | `OPENAI_COMPAT_BASE_URL` 的值 | AI SDK 服务基础 URL |
| `AI_SDK_SERVICE_API_KEY` | 否 | - | 第三方服务 API Key（作为 `x-w6service-api-key` 发送） |
| `AI_SDK_UPLOAD_PATH` | 否 | `/api/upload` | 文件上传路径 |
| `AI_SDK_TIMEOUT_SEC` | 否 | `120` | HTTP 请求超时时间（秒） |
| `AI_SDK_WS_WRITE_TIMEOUT_SEC` | 否 | `8` | WebSocket 写帧超时（秒） |
| `AI_SDK_WS_HANDSHAKE_TIMEOUT_SEC` | 否 | `15` | WebSocket 握手超时（秒） |
| `AI_SDK_WS_DIAL_TIMEOUT_SEC` | 否 | `15` | WebSocket 建连超时（秒） |
| `AI_SDK_RETRY_MAX` | 否 | `2` | 最大重试次数 |
| `AI_SDK_LEGACY_MODE` | 否 | `false` | 设为 `true` 回退到旧版 `ai.NewFromEnv` 实现 |
| `AI_SDK_DEBUG` | 否 | `false` | 调试模式，打印 SDK WebSocket 帧、上游 HTTP 详细日志（**生产勿开**） |
| `AI_SDK_AUTH_HEADER_VAL` | 否 | - | `AI_SDK_SERVICE_API_KEY` 的别名（向后兼容） |

### 2.7 OpenAI 兼容 API 配置（备选）

当未配置 `AI_SDK_BASE_URL` 时，系统会自动回退到以下配置：

| 变量名 | 是否必填 | 默认值 | 说明 |
|--------|----------|--------|------|
| `OPENAI_COMPAT_BASE_URL` | 否 | `https://api.openai.com/v1` | OpenAI 兼容 API 基础 URL |
| `OPENAI_COMPAT_API_KEY` | 否 | - | API Key |
| `OPENAI_COMPAT_MODEL` | 否 | `gpt-4.1-mini` | 默认模型名称 |

### 2.8 W6 AI 网关配置（可选）

用于课程大纲 / 网页生成功能。如果不使用 W6，可以留空；使用时至少需要 `W6_BASE_URL`、`W6_WSS_BASE_URL` 和鉴权字段。

| 变量名 | 是否必填 | 默认值 | 说明 |
|--------|----------|--------|------|
| `W6_BASE_URL` | 使用 W6 时必填 | - | W6 API 基础 URL，如 `https://beta.megamoyo.cn/api` |
| `W6_WSS_BASE_URL` | 使用 W6 时必填 | - | W6 WebSocket 基础 URL，如 `wss://beta.megamoyo.cn/api/interact/chat/` |
| `W6_AUTH_HEADER_FIELD` | 使用 W6 时必填 | - | 鉴权 Header 字段名，如 `x-w6-api-key` |
| `W6_AUTH_HEADER_VALUE` | 使用 W6 时必填 | - | 鉴权 Header 值 |
| `W6_MODEL_PROCEDURE` | 否 | `raw` | 模型流程 |
| `W6_MODEL_LLM` | 否 | `claude-3.7-sonnet` | LLM 模型名称 |
| `W6_MODEL_LLM_SHORT` | 否 | `Claude` | LLM 模型简称 |
| `W6_MODULE_NAME` | 否 | `w6.agent.third_party.iecube` | 模块名称 |

### 2.9 积分系统配置

| 变量名 | 是否必填 | 默认值 | 说明 |
|--------|----------|--------|------|
| `CHAT_CREDIT_COST` | 否 | `1` | 每轮对话成功结束后扣减的积分，`0` 表示关闭扣费 |

### 2.10 静态文件配置

| 变量名 | 是否必填 | 默认值 | 说明 |
|--------|----------|--------|------|
| `STATIC_DIR` | 否 | 自动检测 | 前端构建产物目录。不设时：若二进制同目录存在 `static/` 则自动使用（如根目录 make 后的 `bin/static`），否则使用进程工作目录下的 `static/` |
| `DOTENV_PATH` | 否 | - | 指定 `.env` 文件的自定义路径 |

---

## 3. 本地开发环境搭建

### 3.1 克隆笔记

```bash
git clone <repository-url>
cd ylmnote
```

### 3.2 后端环境配置

```bash
# 1. 复制环境变量模板
cp backend/.env.example .env

# 2. 编辑 .env 文件，配置必填项
# 必须配置：
# - DATABASE_URL=./youmind.db
# - JWT_SECRET=your-secret-here（使用强随机字符串）
# - HTTP_PORT=40001（开发环境，配合前端 Vite 代理）

# 3. 安装依赖（自动下载 Go modules）
cd backend

# 4. 启动服务
go run ./cmd/server
```

服务启动后将监听 `:40001` 端口（由 `HTTP_PORT` 环境变量控制，默认 `8080`）。

### 3.3 前端环境配置

```bash
# 1. 进入前端目录
cd frontend

# 2. 安装依赖
pnpm install

# 3. 启动开发服务器
pnpm dev
```

前端开发服务器默认监听 `:5173` 端口。

### 3.4 开发环境联调

前端 `vite.config.ts` 已配置代理：

```typescript
server: {
  proxy: {
    '/api': {
      target: 'http://127.0.0.1:40001',  // 代理到后端 API
      changeOrigin: true,
    }
  }
}
```

开发时：
- 前端访问 `http://localhost:5173`
- API 请求自动代理到后端
- 如需修改后端端口，同步更新 `vite.config.ts` 中的 `target`

---

## 4. 构建流程

笔记使用 Makefile 统一管理构建流程。

### 4.1 完整构建

```bash
# 并行构建前端和后端
make all
```

### 4.2 单独构建前端

```bash
make frontend
```

执行内容：
```bash
cd frontend && pnpm install && pnpm run build -- --outDir "$(BIN)/static"
```

产物输出到 `bin/static/` 目录。

### 4.3 单独构建后端

```bash
make backend
```

执行内容：
```bash
cd backend && CGO_ENABLED=1 go build -trimpath -o "$(BIN)/server" ./cmd/server
```

产物输出到 `bin/server`。

### 4.4 清理构建产物

```bash
make clean
```

删除 `bin/static/` 和 `bin/server`。

### 4.5 构建产物说明

```
ylmnote/
├── bin/
│   ├── server          # Go 后端可执行文件
│   └── static/         # 前端构建产物（HTML/CSS/JS）
│       ├── index.html
│       ├── assets/
│       └── ...
```

运行方式：
```bash
# 方式1：直接运行（自动检测同目录 static/）
./bin/server

# 方式2：指定静态目录
STATIC_DIR=/path/to/static ./bin/server
```

---

## 5. CI/CD Pipeline

### 5.1 GitHub Actions 配置

配置文件：`.github/workflows/ci.yml`

触发条件：
- `push` 到 `main` 或 `master` 分支
- 任意 `pull_request`

### 5.2 后端 CI Job

```yaml
backend:
  runs-on: ubuntu-latest
  env:
    CGO_ENABLED: "1"
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-go@v5
      with:
        go-version: "1.25.x"
    - name: Install C deps for SQLite
      run: sudo apt-get update && sudo apt-get install -y gcc libc6-dev
    - run: go test ./...
```

### 5.3 前端 CI Job

```yaml
frontend:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: pnpm/action-setup@v4
      with:
        version: 9
    - uses: actions/setup-node@v4
      with:
        node-version: "20"
        cache: pnpm
        cache-dependency-path: frontend/pnpm-lock.yaml
    - run: pnpm install --frozen-lockfile
    - run: pnpm run build
```

---

## 6. 生产部署

### 6.1 PM2 部署配置

配置文件：`ecosystem.config.js`

```javascript
module.exports = {
  apps: [
    {
      name: 'metanote',
      script: './bin/server',
      cwd: __dirname,
      interpreter: 'none',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_restarts: 15,
      min_uptime: '10s',
      kill_timeout: 15_000,
      max_memory_restart: '1G',
      time: true,
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
```

配置说明：

| 配置项 | 值 | 说明 |
|--------|-----|------|
| `name` | `metanote` | PM2 进程名称 |
| `instances` | `1` | 单进程模式（SQLite 限制） |
| `exec_mode` | `fork` | 进程执行模式 |
| `autorestart` | `true` | 自动重启 |
| `max_restarts` | `15` | 最大重启次数 |
| `max_memory_restart` | `1G` | 内存超过 1GB 时重启 |
| `kill_timeout` | `15000` | 优雅关闭超时（毫秒） |
| `time` | `true` | 日志带时间戳 |

### 6.2 部署步骤

```bash
# 1. 构建笔记
make all

# 2. 确保 .env 文件存在且配置正确
# 生产环境必须配置：
# - APP_ENV=production
# - CORS_ALLOWED_ORIGINS=https://your-domain.com
# - JWT_SECRET=强随机字符串
# - DATABASE_URL=./youmind.db

# 3. 使用 PM2 启动
pm2 start ecosystem.config.js

# 4. 查看日志
pm2 logs metanote

# 5. 保存 PM2 配置（开机自启）
pm2 save
pm2 startup
```

### 6.3 PM2 常用命令

```bash
# 查看状态
pm2 status

# 重启服务
pm2 restart metanote

# 停止服务
pm2 stop metanote

# 删除服务
pm2 delete metanote

# 查看日志
pm2 logs metanote
pm2 logs metanote --lines 100

# 监控
pm2 monit
```

---

## 7. 生产环境配置建议

### 7.1 环境变量配置示例

```bash
# 基础配置
APP_ENV=production
APP_NAME=YouMind Production
HTTP_PORT=8080

# 数据库
DATABASE_URL=./data/youmind.db

# 安全（必须修改！）
JWT_SECRET=your-256-bit-secret-here-change-in-production
ACCESS_TOKEN_EXPIRE_MINUTES=60

# CORS（必须配置）
CORS_ALLOWED_ORIGINS=https://youmind.example.com

# 限流
RATE_LIMIT_API_PER_MINUTE=180
RATE_LIMIT_AUTH_PER_MINUTE=30

# AI 服务（根据实际服务商配置）
AI_SDK_BASE_URL=https://api.openai.com/v1
AI_SDK_SERVICE_API_KEY=sk-xxx

# 日志
LOG_FILE_PATH=./logs/backend.log
LOG_TO_STDOUT=false
```

### 7.2 SQLite 局限性及升级建议

**SQLite 局限性：**
- 单文件数据库，不适合高并发写入
- 不支持多实例同时写入
- 文件级锁，并发性能有限

**升级 PostgreSQL 建议：**

如需迁移到 PostgreSQL，需修改 `backend/internal/infrastructure/persistence/db.go`：

```go
// 原代码
import "gorm.io/driver/sqlite"
db, err := gorm.Open(sqlite.Open(databasePath), &gorm.Config{})

// 修改为 PostgreSQL
import "gorm.io/driver/postgres"
dsn := "host=localhost user=youmind password=xxx dbname=youmind port=5432 sslmode=disable"
db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{})
```

### 7.3 Nginx 反向代理配置

```nginx
server {
    listen 80;
    server_name youmind.example.com;
    
    # 重定向到 HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name youmind.example.com;

    # SSL 证书配置
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # 静态文件缓存
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
        proxy_pass http://127.0.0.1:8080;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    # API 和前端代理
    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # 超时配置
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
}
```

### 7.4 HTTPS/SSL 配置

**使用 Let's Encrypt（推荐）：**

```bash
# 安装 Certbot
sudo apt-get install certbot python3-certbot-nginx

# 获取证书
sudo certbot --nginx -d youmind.example.com

# 自动续期
sudo certbot renew --dry-run
```

### 7.5 日志和监控建议

**日志配置：**
```bash
# 生产环境建议关闭 stdout，只写入文件
LOG_FILE_PATH=./logs/backend.log
LOG_TO_STDOUT=false
```

**日志轮转（logrotate）：**

创建 `/etc/logrotate.d/youmind`：

```
/path/to/ylmnote/logs/*.log {
    daily
    rotate 30
    compress
    delaycompress
    missingok
    notifempty
    create 0644 user user
    sharedscripts
    postrotate
        pm2 reloadLogs
    endscript
}
```

**监控指标：**
- 使用 PM2 内置监控：`pm2 monit`
- 内存使用：`pm2 show metanote`
- 日志分析：配置 ELK 或 Loki
- 应用性能：集成 Prometheus/Grafana

---

## 8. 数据备份与恢复

### 8.1 SQLite 数据库备份

**手动备份：**

```bash
# 备份数据库文件
cp ./youmind.db ./backups/youmind_$(date +%Y%m%d_%H%M%S).db

# 使用 SQLite 在线备份（推荐，不影响服务）
sqlite3 youmind.db ".backup './backups/youmind_backup.db'"
```

**自动备份脚本：**

```bash
#!/bin/bash
# backup.sh

BACKUP_DIR="/path/to/backups"
DB_FILE="/path/to/youmind.db"
RETENTION_DAYS=30

# 创建备份
mkdir -p "$BACKUP_DIR"
BACKUP_FILE="$BACKUP_DIR/youmind_$(date +%Y%m%d_%H%M%S).db"
sqlite3 "$DB_FILE" ".backup '$BACKUP_FILE'"

# 压缩备份
gzip "$BACKUP_FILE"

# 清理旧备份
find "$BACKUP_DIR" -name "youmind_*.db.gz" -mtime +$RETENTION_DAYS -delete

echo "Backup completed: $BACKUP_FILE.gz"
```

**添加到 crontab：**

```bash
# 每天凌晨 3 点备份
0 3 * * * /path/to/backup.sh >> /var/log/youmind-backup.log 2>&1
```

### 8.2 上传文件备份

上传文件存储在 `backend/uploads/` 目录，建议：

```bash
# 使用 rsync 同步到备份服务器
rsync -avz --delete /path/to/ylmnote/backend/uploads/ backup-server:/backups/youmind/uploads/

# 或使用云存储同步
aws s3 sync /path/to/ylmnote/backend/uploads/ s3://your-bucket/youmind-uploads/
```

### 8.3 数据恢复

```bash
# 停止服务
pm2 stop metanote

# 恢复数据库
cp /path/to/backup/youmind_20240101_120000.db ./youmind.db

# 恢复上传文件（如需要）
rsync -avz backup-server:/backups/youmind/uploads/ ./backend/uploads/

# 启动服务
pm2 start metanote
```

---

## 9. 常见问题

### 9.1 CGO 编译问题

**问题：** `gcc: command not found` 或 `sqlite3.h: No such file`

**解决：**
```bash
# Ubuntu/Debian
sudo apt-get install -y gcc libc6-dev

# macOS
xcode-select --install

# 验证 CGO 环境
CGO_ENABLED=1 go env CGO_ENABLED
```

### 9.2 SQLite 锁问题

**问题：** `database is locked` 错误

**原因：**
- 多进程同时写入 SQLite
- 长时间事务未提交

**解决：**
1. 确保只运行单个服务实例（`instances: 1`）
2. 检查是否有其他程序占用数据库文件
3. 优化事务，尽快提交
4. 考虑迁移到 PostgreSQL

### 9.3 CORS 跨域问题

**问题：** 浏览器报 `CORS policy` 错误

**解决：**
```bash
# 生产环境必须配置 CORS_ALLOWED_ORIGINS
CORS_ALLOWED_ORIGINS=https://your-frontend-domain.com

# 多个来源用逗号分隔
CORS_ALLOWED_ORIGINS=https://app.example.com,https://admin.example.com
```

### 9.4 JWT Secret 问题

**问题：** `JWT_SECRET is required` 错误

**解决：**
```bash
# 生成强随机密钥
openssl rand -base64 32

# 写入 .env
JWT_SECRET=your-generated-secret-here
```

### 9.5 前端 404 问题

**问题：** 刷新页面后 404

**原因：** 前端是 SPA，需要后端正确配置 fallback 到 index.html

**解决：**
- 确保 `bin/static/index.html` 存在
- 检查 `STATIC_DIR` 配置正确
- 后端已配置 `NoRoute` 处理 SPA fallback

### 9.6 内存占用过高

**解决：**
```bash
# PM2 已配置内存限制，超过 1GB 自动重启
max_memory_restart: '1G'

# 如需调整，修改 ecosystem.config.js 后重载
pm2 reload ecosystem.config.js
```

---

## 附录：文件结构参考

```
ylmnote/
├── .env                    # 环境变量（勿提交到 Git）
├── .env.example            # 环境变量模板
├── Makefile                # 构建脚本
├── ecosystem.config.js     # PM2 配置
├── bin/                    # 构建产物（.gitignore）
│   ├── server
│   └── static/
├── backend/
│   ├── cmd/server/
│   │   └── main.go         # 服务入口
│   ├── internal/
│   │   ├── config/         # 配置加载
│   │   ├── infrastructure/
│   │   │   └── persistence/
│   │   │       └── db.go   # 数据库连接
│   │   └── interfaces/http/
│   │       ├── cors.go     # CORS 配置
│   │       ├── ratelimit.go # 限流配置
│   │       └── router.go   # 路由配置
│   ├── uploads/            # 上传文件存储
│   └── youmind.db          # SQLite 数据库
├── frontend/
│   ├── .env.development    # 开发环境变量
│   ├── .env.production     # 生产环境变量
│   ├── vite.config.ts      # Vite 配置
│   └── package.json
└── doc/
    └── DEPLOYMENT_GUIDE.md # 本文档
```

---

**文档版本：** 1.0  
**最后更新：** 2026-04-19
