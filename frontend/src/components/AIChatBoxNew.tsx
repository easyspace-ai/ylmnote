/**
 * AIChatBoxNew - 使用 ai-elements 重构的聊天组件
 *
 * 这是基于 ai-elements 组件库重构的新版本聊天界面
 * 提供了更好的组件化结构、更清晰的职责分离和更优秀的用户体验
 */

import { useEffect, useCallback } from 'react'
import { AIChat } from './ai-elements/AIChat'
import type {
  ChatMessage,
  ChatMode,
  Attachment,
  ModelOption,
  TodoItem,
  StudioAction,
} from './ai-elements'

// 导出类型，保持与旧版本兼容
export type { ChatMode, ChatMessage, Skill, Attachment } from './ai-elements'

interface AIChatBoxNewProps {
  // 数据
  messages?: ChatMessage[]
  todoItems?: TodoItem[]
  libraryFiles?: { id: string; name: string }[]
  models?: ModelOption[]
  studioActions?: StudioAction[]
  activeStudioToolId?: string | null
  onStudioToolSelect?: (action: StudioAction | null) => void
  onRunStudioTool?: (action: StudioAction) => void | Promise<void>

  // 回调
  onSendMessage?: (
    message: string,
    mode: ChatMode,
    skillId: string | null,
    attachments: Attachment[],
    model?: string
  ) => void
  onCopy?: (content: string) => void
  onRegenerate?: () => void
  onSaveAsDocument?: (content: string) => void
  onEditMessage?: (id: string, content: string) => void
  onDeleteMessage?: (id: string) => void
  onLoadOlder?: () => Promise<void> | void

  // 状态
  autoFocus?: boolean
  isStreaming?: boolean
  isLoadingMessages?: boolean
  hasMoreOlder?: boolean
  loadingOlder?: boolean
  isGeneratingTodos?: boolean
  /** 远端未就绪或 busy 时禁止输入与发送 */
  upstreamInputLocked?: boolean
  upstreamCanStop?: boolean
  upstreamBanner?: string | null
  stoppingUpstream?: boolean
  onUpstreamStop?: () => void | Promise<void>

  // 默认值
  defaultInputValue?: string
  /** 父组件注入输入框内容（如 Studio 技能提示词），以 seq 变化为准 */
  inputPrefill?: { seq: number; text: string }
  defaultMode?: ChatMode
  defaultModel?: string
  autoSend?: boolean

  // 样式
  className?: string
}

/**
 * AIChatBoxNew - 重构后的聊天组件
 *
 * 使用 ai-elements 组件库构建，提供：
 * - 更好的组件化结构
 * - 更清晰的职责分离
 * - 更优秀的用户体验
 * - 更好的可维护性
 */
export default function AIChatBoxNew({
  messages = [],
  todoItems = [],
  libraryFiles = [],
  models,
  studioActions = [],
  activeStudioToolId,
  onStudioToolSelect,
  onRunStudioTool,
  onSendMessage,
  onCopy,
  onRegenerate,
  onSaveAsDocument,
  onLoadOlder,
  autoFocus = false,
  isStreaming = false,
  isLoadingMessages = false,
  hasMoreOlder = false,
  loadingOlder = false,
  isGeneratingTodos = false,
  upstreamInputLocked = false,
  upstreamCanStop = false,
  upstreamBanner = null,
  stoppingUpstream = false,
  onUpstreamStop,
  defaultInputValue = '',
  inputPrefill,
  defaultMode = 'chat',
  defaultModel = 'google/gemini-3-flash-preview',
  autoSend = false,
  className,
}: AIChatBoxNewProps) {
  // 处理发送消息
  const handleSendMessage = useCallback(
    (
      message: string,
      options: {
        mode: ChatMode
        skill: string | null
        attachments: Attachment[]
        model: string
      }
    ) => {
      onSendMessage?.(
        message,
        options.mode,
        options.skill,
        options.attachments,
        options.model
      )
    },
    [onSendMessage]
  )

  // 自动发送处理
  useEffect(() => {
    if (autoSend && defaultInputValue && !isStreaming) {
      handleSendMessage(defaultInputValue, {
        mode: defaultMode,
        skill: null,
        attachments: [],
        model: defaultModel,
      })
    }
  }, [])

  return (
    <AIChat
      messages={messages}
      models={models}
      libraryFiles={libraryFiles}
      todoItems={todoItems}
      studioActions={studioActions}
      activeStudioToolId={activeStudioToolId}
      onStudioToolSelect={onStudioToolSelect}
      onRunStudioTool={onRunStudioTool}
      isStreaming={isStreaming}
      isLoadingMessages={isLoadingMessages}
      isLoadingOlder={loadingOlder}
      hasMoreOlder={hasMoreOlder}
      isGeneratingTodos={isGeneratingTodos}
      initialMode={defaultMode}
      initialModel={defaultModel}
      autoFocus={autoFocus}
      showTodos={true}
      onSendMessage={handleSendMessage}
      onLoadOlder={onLoadOlder}
      onCopy={onCopy}
      onRegenerate={onRegenerate}
      onSaveAsDocument={onSaveAsDocument}
      upstreamInputLocked={upstreamInputLocked}
      upstreamCanStop={upstreamCanStop}
      upstreamBanner={upstreamBanner}
      stoppingUpstream={stoppingUpstream}
      onUpstreamStop={onUpstreamStop}
      inputPrefill={inputPrefill}
      onTodoToggle={(id, done) => {
        // 处理待办事项切换
      }}
      className={className}
    />
  )
}
