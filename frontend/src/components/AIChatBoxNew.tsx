/**
 * AIChatBoxNew - 使用 ai-elements 重构的聊天组件
 *
 * 这是基于 ai-elements 组件库重构的新版本聊天界面
 * 提供了更好的组件化结构、更清晰的职责分离和更优秀的用户体验
 */

import { useState, useEffect, useCallback } from 'react'
import { AIChat } from './ai-elements/AIChat'
import type {
  ChatMessage,
  ChatMode,
  Skill,
  Attachment,
  ModelOption,
  TodoItem,
} from './ai-elements'

// 导出类型，保持与旧版本兼容
export type { ChatMode, ChatMessage, Skill, Attachment } from './ai-elements'

interface AIChatBoxNewProps {
  // 数据
  messages?: ChatMessage[]
  todoItems?: TodoItem[]
  skills?: Skill[]
  recommendedSkills?: Skill[]
  libraryFiles?: { id: string; name: string }[]
  models?: ModelOption[]

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
  defaultSelectedSkill?: string | null
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
  skills = [],
  libraryFiles = [],
  models,
  onSendMessage,
  onCopy,
  onRegenerate,
  onSaveAsDocument,
  onLoadOlder,
  autoFocus = false,
  isStreaming = false,
  hasMoreOlder = false,
  loadingOlder = false,
  isGeneratingTodos = false,
  upstreamInputLocked = false,
  upstreamCanStop = false,
  upstreamBanner = null,
  stoppingUpstream = false,
  onUpstreamStop,
  defaultInputValue = '',
  defaultSelectedSkill = null,
  defaultMode = 'chat',
  defaultModel = 'google/gemini-3-flash-preview',
  autoSend = false,
  className,
}: AIChatBoxNewProps) {
  // 初始化状态
  const [inputValue, setInputValue] = useState(defaultInputValue)

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
        skill: defaultSelectedSkill,
        attachments: [],
        model: defaultModel,
      })
    }
  }, [])

  return (
    <AIChat
      messages={messages}
      skills={skills}
      models={models}
      libraryFiles={libraryFiles}
      todoItems={todoItems}
      isStreaming={isStreaming}
      isLoadingOlder={loadingOlder}
      hasMoreOlder={hasMoreOlder}
      isGeneratingTodos={isGeneratingTodos}
      initialMode={defaultMode}
      initialSkill={defaultSelectedSkill}
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
      onTodoToggle={(id, done) => {
        // 处理待办事项切换
      }}
      className={className}
    />
  )
}

// 资料库选择弹窗组件
function LibraryPickerModal({
  isOpen,
  onClose,
  files,
  onSelect,
}: {
  isOpen: boolean
  onClose: () => void
  files: { id: string; name: string }[]
  onSelect: (file: { id: string; name: string }) => void
}) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">从资料库选择</h2>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto p-4 space-y-1.5">
          {files.map((file) => (
            <div
              key={file.id}
              onClick={() => {
                onSelect(file)
                onClose()
              }}
              className="flex items-center gap-3 p-3 hover:bg-gray-50 cursor-pointer rounded-xl transition-colors"
            >
              <div className="p-2 bg-gray-100 rounded-lg">
                <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <span className="text-sm text-gray-700">{file.name}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
