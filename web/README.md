# YouMind Clone

基于 YouMind.com 设计的 AI 创作工作室克隆项目。

## 技术栈

- **React 18** - UI 框架
- **TypeScript** - 类型安全
- **Vite** - 构建工具
- **Tailwind CSS** - 样式
- **Zustand** - 状态管理
- **React Router** - 路由
- **Lucide React** - 图标

## 项目结构

```
src/
├── components/        # 组件
│   ├── layout/       # 布局组件
│   ├── common/       # 公共组件
│   ├── project/      # 项目相关组件
│   └── skill/        # 技能相关组件
├── pages/            # 页面
├── hooks/            # 自定义 Hooks
├── stores/           # 状态管理
├── types/            # 类型定义
├── utils/            # 工具函数
└── styles/           # 样式文件
```

## 核心功能

### 已实现

- ✅ 项目列表页
- ✅ 项目详情页（对话/资料/输出）
- ✅ 新建项目页
- ✅ 技能列表页
- ✅ 设置页面
- ✅ 响应式侧边栏
- ✅ 主题切换

### 待实现

- ⏳ 搜索功能
- ⏳ AI 对话集成
- ⏳ 资料上传和管理
- ⏳ 技能详情页
- ⏳ 用户认证
- ⏳ API 对接

## 快速开始

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 构建生产版本
npm run build

# 预览生产构建
npm run preview
```

## 设计文档

详细的需求文档和 UI 设计文档请查看 `../youbmind-analysis/docs/` 目录。

## License

MIT
