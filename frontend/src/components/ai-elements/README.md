# AI Elements - 聊天界面组件库

一套基于现代 AI 聊天界面最佳实践构建的 React 组件库。

## 特性

- 🎨 精美的默认样式，基于 Tailwind CSS
- ♿ 完整的无障碍支持
- 📱 响应式设计
- 🔧 高度可定制
- ⚡ 优秀的性能

## 安装

组件已包含在笔记中，直接从 `@/components/ai-elements` 导入即可。

## 快速开始

### 基础用法

```tsx
import { AIChat } from '@/components/ai-elements'
import type { ChatMessage, Skill } from '@/components/ai-elements'

const skills: Skill[] = [
  { id: '1', name: '代码助手', icon: '💻' },
  { id: '2', name: '写作助手', icon: '✍️' },
]

const messages: ChatMessage[] = [
  {
    id: '1',
    role: 'user',
    content: '你好！',
  },
  {
    id: '2',
    role: 'assistant',
    content: '你好！很高兴为你服务。',
  },
]

function App() {
  const handleSendMessage = (
    message: string,
    options: {
      mode: ChatMode
      skill: string | null
      attachments: Attachment[]
      model: string
    }
  ) => {
    console.log('发送消息:', message, options)
  }

  return (
    <AIChat
      messages={messages}
      skills={skills}
      onSendMessage={handleSendMessage}
    />
  )
}
```

## 组件列表

### 容器组件

- `ChatContainer` - 聊天容器，提供上下文管理
- `AIChat` - 完整的聊天界面（整合所有组件）

### 消息组件

- `MessageList` - 消息列表，处理消息分组和滚动
- `MessageBubble` - 消息气泡，显示用户和 AI 消息
- `StreamingIndicator` - 流式响应指示器

### 输入组件

- `ChatInput` - 文本输入组件
- `AttachmentList` - 附件列表

### AI 特定组件

- `ThinkingProcess` - 思考过程显示
- `ToolDisplay` - 工具调用显示
- `TodoList` - 待办事项列表

### 选择器组件

- `ModeSelector` - 聊天模式选择
- `ModelSelector` - AI 模型选择
- `SkillSelector` - 技能选择

## 类型定义

```typescript
import type {
  ChatMode,
  ChatMessage,
  MessageStatus,
  ThinkingStep,
  ToolCall,
  TodoItem,
  Skill,
  Attachment,
  ModelOption,
} from '@/components/ai-elements'
```

## 自定义样式

所有组件都接受 `className` 属性，可以使用 Tailwind CSS 进行自定义样式。

```tsx
<MessageBubble
  message={message}
  className="my-custom-class"
/>
```

## 许可证

MIT
