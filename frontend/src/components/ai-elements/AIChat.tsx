/**
 * AIChat - 完整的 AI 聊天界面组件
 *
 * 整合所有 ai-elements 组件，提供开箱即用的聊天界面
 */

import { useState, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { cn } from '@/utils'
import { useAppStore } from '@/stores/apiStore'
import type {
  ChatMessage,
  ChatMode,
  Attachment,
  TodoItem,
  ModelOption,
  StudioAction,
} from './types'

// 子组件导入
import { ChatContainer } from './ChatContainer'
import { MessageList } from './MessageList'
import { ChatInput } from './ChatInput'
import { TodoList } from './TodoList'
import { AttachmentList } from './AttachmentList'
import { ModeSelector } from './ModeSelector'
import { ModelSelector } from './ModelSelector'
import { StudioActionsPopover } from './StudioActionsPopover'
import { ResourcePickerPopover } from './ResourcePickerPopover'
import { HardDrive, Folder, Zap, X } from 'lucide-react'

interface AIChatProps {
  // 数据
  messages: ChatMessage[]
  models?: ModelOption[]
  libraryFiles?: { id: string; name: string }[]
  todoItems?: TodoItem[]
  /** 与右侧 Studio 栏一致的动作列表 */
  studioActions?: StudioAction[]
  /** 激活指定 Studio 动作（改为选中模式而非填入提示词） */
  activeStudioToolId?: string | null
  onStudioToolSelect?: (action: StudioAction | null) => void
  onRunStudioTool?: (action: StudioAction) => void | Promise<void>
  /** 将文本写入输入框（不发送），seq 每次变化时应用 */
  inputPrefill?: { seq: number; text: string }

  // 状态
  isStreaming?: boolean
  isLoadingMessages?: boolean
  isLoadingOlder?: boolean
  hasMoreOlder?: boolean
  isGeneratingTodos?: boolean
  upstreamInputLocked?: boolean
  upstreamCanStop?: boolean
  upstreamBanner?: string | null
  stoppingUpstream?: boolean
  onUpstreamStop?: () => void | Promise<void>

  // WebSocket 连接状态
  wsConnectionStatus?: 'connecting' | 'connected' | 'disconnected' | 'reconnecting' | 'failed'
  wsReconnectAttempt?: number
  wsReconnectMaxAttempts?: number
  onRetryConnection?: () => void

  // 错误状态
  error?: string | null
  onRetryLoadMessages?: () => void

  // 配置
  initialMode?: ChatMode
  initialModel?: string
  autoFocus?: boolean
  showTodos?: boolean

  // 回调
  onSendMessage: (
    message: string,
    options: {
      mode: ChatMode
      skill: string | null
      attachments: Attachment[]
      model: string
    }
  ) => void
  onLoadOlder?: () => Promise<void> | void
  onCopy?: (content: string) => void
  onRegenerate?: () => void
  onSaveAsDocument?: (content: string) => void
  onModeChange?: (mode: ChatMode) => void
  onModelChange?: (modelId: string) => void
  onTodoToggle?: (id: string, done: boolean) => void

  // 样式
  className?: string
}

export function AIChat({
  messages,
  models,
  libraryFiles = [],
  todoItems = [],
  studioActions = [],
  activeStudioToolId,
  onStudioToolSelect,
  onRunStudioTool,
  inputPrefill,
  isStreaming = false,
  isLoadingMessages = false,
  isLoadingOlder = false,
  hasMoreOlder = false,
  isGeneratingTodos = false,
  upstreamInputLocked = false,
  upstreamCanStop = false,
  upstreamBanner = null,
  stoppingUpstream = false,
  onUpstreamStop,
  initialMode = 'chat',
  initialModel = 'google/gemini-3-flash-preview',
  autoFocus = false,
  showTodos = true,
  onSendMessage,
  onLoadOlder,
  onCopy,
  onRegenerate,
  onSaveAsDocument,
  onModeChange,
  onModelChange,
  onTodoToggle,
  className,
  // WebSocket 连接状态
  wsConnectionStatus,
  wsReconnectAttempt = 0,
  wsReconnectMaxAttempts = 5,
  onRetryConnection,
  // 错误状态
  error,
  onRetryLoadMessages,
}: AIChatProps) {
  const navigate = useNavigate()

  // 状态
  const [inputValue, setInputValue] = useState('')
  const [mode, setMode] = useState<ChatMode>(initialMode)
  const [selectedModel, setSelectedModel] = useState(initialModel)
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [showStudioPicker, setShowStudioPicker] = useState(false)
  const [showResourcePicker, setShowResourcePicker] = useState(false)
  const [selectedStudioTool, setSelectedStudioTool] = useState<StudioAction | null>(null)

  // 同步外部传入的 activeStudioToolId
  useEffect(() => {
    if (activeStudioToolId) {
      const tool = studioActions.find(t => t.id === activeStudioToolId)
      if (tool) {
        setSelectedStudioTool(tool)
      }
    }
  }, [activeStudioToolId, studioActions])

  const triggersSlashMenu = (v: string) => {
    if (!v.endsWith('/')) return false
    if (v.length === 1) return true
    return /\s/.test(v[v.length - 2] as string)
  }

  const triggersResourceMenu = (v: string) => {
    if (!v.endsWith('@')) return false
    if (v.length === 1) return true
    return /\s/.test(v[v.length - 2] as string)
  }

  const handleInputValueChange = useCallback(
    (v: string) => {
      if (triggersSlashMenu(v)) {
        if (onRunStudioTool) {
          setShowResourcePicker(false)
          setShowStudioPicker(true)
          setInputValue(v.slice(0, -1))
        } else {
          setInputValue(v)
        }
        return
      }
      if (triggersResourceMenu(v)) {
        setShowStudioPicker(false)
        setShowResourcePicker(true)
        setInputValue(v.slice(0, -1))
        return
      }
      setInputValue(v)
    },
    [onRunStudioTool]
  )

  // 处理模式变化
  const handleModeChange = useCallback(
    (newMode: ChatMode) => {
      setMode(newMode)
      onModeChange?.(newMode)
    },
    [onModeChange]
  )

  // 处理模型变化
  const handleModelChange = useCallback(
    (modelId: string) => {
      setSelectedModel(modelId)
      onModelChange?.(modelId)
    },
    [onModelChange]
  )

  // 处理发送消息
  const handleSend = useCallback(() => {
    if (!inputValue.trim() || isStreaming || upstreamInputLocked) return

    onSendMessage(inputValue, {
      mode,
      skill: selectedStudioTool?.id || null,
      attachments,
      model: selectedModel,
    })

    setInputValue('')
    setAttachments([])
    // 发送后清除选中的技能
    setSelectedStudioTool(null)
    onStudioToolSelect?.(null)
  }, [
    inputValue,
    isStreaming,
    upstreamInputLocked,
    mode,
    attachments,
    selectedModel,
    selectedStudioTool,
    onSendMessage,
    onStudioToolSelect,
  ])

  const handleStopGeneration = useCallback(() => {
    if (onUpstreamStop) {
      void onUpstreamStop()
      return
    }
    useAppStore.getState().abortActiveMessageStream()
  }, [onUpstreamStop])

  useEffect(() => {
    if (!showStudioPicker && !showResourcePicker) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowStudioPicker(false)
        setShowResourcePicker(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showStudioPicker, showResourcePicker])

  useEffect(() => {
    if (!inputPrefill) return
    setInputValue(inputPrefill.text)
    setShowStudioPicker(false)
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const ta = document.querySelector(
          '[data-ai-chat-input]'
        ) as HTMLTextAreaElement | null
        if (!ta) return
        ta.style.height = 'auto'
        const maxH = 240
        ta.style.height = `${Math.min(ta.scrollHeight, maxH)}px`
        ta.focus()
        const len = ta.value.length
        ta.setSelectionRange(len, len)
      })
    })
    return () => cancelAnimationFrame(id)
  }, [inputPrefill?.seq])

  // 处理添加本地文件
  const handleAddLocalFile = useCallback(() => {
    if (upstreamInputLocked || isStreaming) return
    const input = document.createElement('input')
    input.type = 'file'
    input.multiple = true
    input.onchange = (e: Event) => {
      const target = e.target as HTMLInputElement
      const files = Array.from(target.files || [])
      if (files.length === 0) return

      const newAttachments: Attachment[] = files.map((file) => ({
        id: `local-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        name: file.name,
        type: 'local',
        file,
        size: file.size,
        mimeType: file.type,
      }))

      setAttachments((prev) => [...prev, ...newAttachments])
    }
    input.click()
  }, [upstreamInputLocked, isStreaming])

  // 处理从资料库添加
  const handleAddFromLibrary = useCallback(
    (file: { id: string; name: string }) => {
      if (upstreamInputLocked || isStreaming) return
      // id 必须为项目资源的真实 ID；handleSendMessage 会原样写入 resource_refs。
      const attachment: Attachment = {
        id: file.id,
        name: file.name,
        type: 'library',
      }
      setAttachments((prev) => [...prev, attachment])
      setShowResourcePicker(false)
    },
    [upstreamInputLocked, isStreaming]
  )

  // 处理移除附件
  const handleRemoveAttachment = useCallback((id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id))
  }, [])

  return (
    <ChatContainer className={className}>
      {/* 消息列表 */}
      <MessageList
        messages={messages}
        isStreaming={isStreaming}
        isLoadingMessages={isLoadingMessages}
        hasMoreOlder={hasMoreOlder}
        loadingOlder={isLoadingOlder}
        onLoadOlder={onLoadOlder}
        onCopy={onCopy}
        onRegenerate={onRegenerate}
        onSaveAsDocument={onSaveAsDocument}
      />

      {/* 待办列表 */}
      {/* {showTodos && todoItems.length > 0 && (
        <div className="px-4 pb-2">
          <TodoList
            items={todoItems}
            isGenerating={isGeneratingTodos}
            onItemToggle={onTodoToggle}
          />
        </div>
      )} */}

      {/* 输入区域 */}
      <div className="border-t border-zinc-200/70 bg-white px-4 py-3 dark:border-white/10 dark:bg-[#212121]">
        <div className="mx-auto max-w-3xl space-y-2">
          {/* WebSocket 连接状态提示 */}
          {wsConnectionStatus && wsConnectionStatus !== 'connected' && (
            <div className={cn(
              'flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-xs',
              wsConnectionStatus === 'failed'
                ? 'border-red-200 bg-red-50 text-red-900 dark:border-red-300/20 dark:bg-red-900/20 dark:text-red-100'
                : wsConnectionStatus === 'reconnecting'
                  ? 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-300/20 dark:bg-amber-900/20 dark:text-amber-100'
                  : 'border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-300/20 dark:bg-blue-900/20 dark:text-blue-100'
            )}>
              <div className="flex items-center gap-2">
                <span className={cn(
                  'h-1.5 w-1.5 shrink-0 rounded-full',
                  wsConnectionStatus === 'failed'
                    ? 'bg-red-500'
                    : wsConnectionStatus === 'reconnecting'
                      ? 'animate-pulse bg-amber-500'
                      : 'animate-pulse bg-blue-500'
                )} aria-hidden />
                <span>
                  {wsConnectionStatus === 'connecting' && '正在连接...'}
                  {wsConnectionStatus === 'reconnecting' && `正在重试连接 (${wsReconnectAttempt}/${wsReconnectMaxAttempts})...`}
                  {wsConnectionStatus === 'disconnected' && '连接已断开'}
                  {wsConnectionStatus === 'failed' && '连接失败，请检查网络后重试'}
                </span>
              </div>
              {/* 手动重试按钮 - 只在失败时显示 */}
              {wsConnectionStatus === 'failed' && onRetryConnection && (
                <button
                  onClick={onRetryConnection}
                  className="flex items-center gap-1 rounded-md border border-red-300 bg-white px-2 py-1 text-xs font-medium text-red-700 transition-colors hover:bg-red-50 dark:border-red-400/30 dark:bg-red-900/30 dark:text-red-200 dark:hover:bg-red-900/50"
                >
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  重试
                </button>
              )}
            </div>
          )}

          {/* 消息加载错误提示 */}
          {error && (
            <div className="flex items-center justify-between gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900 dark:border-red-300/20 dark:bg-red-900/20 dark:text-red-100">
              <div className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" aria-hidden />
                <span>{error}</span>
              </div>
              {onRetryLoadMessages && (
                <button
                  onClick={onRetryLoadMessages}
                  className="flex items-center gap-1 rounded-md border border-red-300 bg-white px-2 py-1 text-xs font-medium text-red-700 transition-colors hover:bg-red-50 dark:border-red-400/30 dark:bg-red-900/30 dark:text-red-200 dark:hover:bg-red-900/50"
                >
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  重新加载
                </button>
              )}
            </div>
          )}

          {upstreamBanner && (
            <div className="flex items-center gap-2 rounded-xl border border-amber-200/80 bg-amber-50/80 px-3 py-2 text-xs text-amber-900 dark:border-amber-300/20 dark:bg-amber-900/20 dark:text-amber-100">
              <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-amber-500" aria-hidden />
              <span>{upstreamBanner}</span>
            </div>
          )}
          {/* 附件列表 */}
          {attachments.length > 0 && (
            <AttachmentList attachments={attachments} onRemove={handleRemoveAttachment} />
          )}

          {/* 输入框容器 */}
          <div className="relative overflow-visible rounded border border-zinc-200 bg-white pl-2 shadow-sm transition-all duration-200 focus-within:border-zinc-300 dark:border-none dark:bg-white/5">
            {showStudioPicker && (
              <StudioActionsPopover
                tools={studioActions}
                selectedToolId={selectedStudioTool?.id}
                onClose={() => setShowStudioPicker(false)}
                onPick={(tool) => {
                  setSelectedStudioTool(tool)
                  onStudioToolSelect?.(tool)
                  setShowStudioPicker(false)
                }}
                onExploreMore={() => navigate('/skills')}
                onManage={() => navigate('/settings')}
              />
            )}
            {showResourcePicker && (
              <ResourcePickerPopover
                files={libraryFiles}
                onClose={() => setShowResourcePicker(false)}
                onPick={handleAddFromLibrary}
              />
            )}

            {/* 文本输入 */}
            <div className="overflow-hidden rounded-3xl px-1 pt-2 pb-2">
              <ChatInput
                value={inputValue}
                onChange={handleInputValueChange}
                onSend={handleSend}
                placeholder={upstreamInputLocked && !isStreaming ? 'AI 思考中，可输入新消息或点击红色按钮停止…' : 'Ask anything'}
                disabled={false}
                isStreaming={isStreaming}
                upstreamLocked={upstreamInputLocked}
                canStop={upstreamCanStop}
                stoppingUpstream={stoppingUpstream}
                onStop={handleStopGeneration}
                autoFocus={autoFocus && !upstreamInputLocked}
              />
            </div>

            {/* 工具栏 */}
            <div className="flex items-center gap-2 border-t border-zinc-200/70 bg-zinc-50/70 px-3 py-2 dark:border-white/10 dark:bg-white/5">
              {/* 上游思考中提示（小标签形式） */}
              {upstreamInputLocked && !isStreaming && (
                <div className="flex items-center gap-1.5 text-xs text-blue-500 dark:text-blue-400 mr-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                  <span>AI 思考中</span>
                </div>
              )}

              {/* 附件按钮 - 上游思考时不禁用，仅本地流式时禁用 */}
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={handleAddLocalFile}
                  disabled={isStreaming}
                  className={cn(
                    'flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors',
                    isStreaming
                      ? 'cursor-not-allowed text-zinc-300 dark:text-white/30'
                      : 'text-zinc-500 hover:bg-zinc-200/50 hover:text-zinc-700 dark:text-white/60 dark:hover:bg-white/10 dark:hover:text-white'
                  )}
                >
                  <HardDrive size={12} />
                  <span className="hidden sm:inline">本地文件</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (isStreaming) return
                    setShowStudioPicker(false)
                    setShowResourcePicker(true)
                  }}
                  disabled={isStreaming}
                  className={cn(
                    'flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors',
                    isStreaming
                      ? 'cursor-not-allowed text-zinc-300 dark:text-white/30'
                      : 'text-zinc-500 hover:bg-zinc-200/50 hover:text-zinc-700 dark:text-white/60 dark:hover:bg-white/10 dark:hover:text-white'
                  )}
                >
                  <Folder size={12} />
                  <span className="hidden sm:inline">资料库</span>
                </button>
              </div>

              <div className="h-4 w-px bg-zinc-200 dark:bg-white/10" />

              {/* 已选中的 Studio 技能标签（替代技能按钮） */}
              {selectedStudioTool ? (
                <div
                  className={cn(
                    'flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-all duration-200',
                    'bg-gradient-to-br shadow-sm',
                    selectedStudioTool.color,
                    selectedStudioTool.textColor,
                    'border-white/20'
                  )}
                >
                  <span>{selectedStudioTool.label}</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      setSelectedStudioTool(null)
                      onStudioToolSelect?.(null)
                    }}
                    className="ml-0.5 p-0.5 hover:bg-black/10 rounded-full transition-colors"
                    title="移除技能"
                  >
                    <X size={10} />
                  </button>
                </div>
              ) : (
                /* Studio 动作（与右侧栏一致） */
                <button
                  type="button"
                  onClick={() => {
                    if (isStreaming) return
                    setShowResourcePicker(false)
                    setShowStudioPicker((v) => !v)
                  }}
                  disabled={isStreaming}
                  className={cn(
                    'flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-all duration-200',
                    showStudioPicker
                      ? 'border-zinc-300 bg-zinc-100 text-zinc-800 dark:border-white/20 dark:bg-white/10 dark:text-white'
                      : 'border-zinc-200 bg-transparent text-zinc-500 hover:border-zinc-300 hover:text-zinc-700 dark:border-white/10 dark:text-white/60 dark:hover:border-white/20 dark:hover:text-white',
                    isStreaming && 'cursor-not-allowed opacity-50'
                  )}
                >
                  <Zap size={12} className={showStudioPicker ? 'text-zinc-700 dark:text-white' : 'text-zinc-400 dark:text-white/40'} />
                  <span>技能</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 居中「从资料库选择」弹窗已停用，改为输入区 @ 或「资料库」按钮的浮层列表 */}
    </ChatContainer>
  )
}
