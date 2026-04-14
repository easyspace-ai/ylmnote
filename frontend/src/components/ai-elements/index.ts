/**
 * AI Elements - 聊天界面组件库
 *
 * 基于现代 AI 聊天界面最佳实践构建的组件集合
 * 包含：消息气泡、输入框、思考过程、工具显示、待办列表等
 */

// 容器和布局组件
export { ChatContainer, useChatContext } from './ChatContainer'

// 消息相关组件
export { MessageList } from './MessageList'
export { MessageBubble } from './MessageBubble'

// 输入和交互组件
export { ChatInput } from './ChatInput'
export { AttachmentList } from './AttachmentList'

// AI 特定组件
export { ThinkingProcess } from './ThinkingProcess'
export { ToolDisplay } from './ToolDisplay'
export { TodoList } from './TodoList'
export { StreamingIndicator } from './StreamingIndicator'

// 选择器组件
export { ModeSelector } from './ModeSelector'
export { ModelSelector } from './ModelSelector'
export { SkillSelector } from './SkillSelector'
export { StudioActionsPopover } from './StudioActionsPopover'
export { ResourcePickerPopover } from './ResourcePickerPopover'

// 导出类型
export type {
  ChatMode,
  ChatMessage,
  MessageStatus,
  MessageRole,
  MessageKind,
  ThinkingStep,
  ToolCall,
  TodoItem,
  Skill,
  Attachment,
  ModelOption,
  StudioAction,
} from './types'
