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
import { HardDrive, Folder, Zap } from 'lucide-react'

interface AIChatProps {
  // 数据
  messages: ChatMessage[]
  models?: ModelOption[]
  libraryFiles?: { id: string; name: string }[]
  todoItems?: TodoItem[]
  /** 与右侧 Studio 栏一致的动作列表 */
  studioActions?: StudioAction[]
  onRunStudioTool?: (action: StudioAction) => void | Promise<void>

  // 状态
  isStreaming?: boolean
  isLoadingOlder?: boolean
  hasMoreOlder?: boolean
  isGeneratingTodos?: boolean
  upstreamInputLocked?: boolean
  upstreamCanStop?: boolean
  upstreamBanner?: string | null
  stoppingUpstream?: boolean
  onUpstreamStop?: () => void | Promise<void>

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
  onRunStudioTool,
  isStreaming = false,
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
}: AIChatProps) {
  const navigate = useNavigate()

  // 状态
  const [inputValue, setInputValue] = useState('')
  const [mode, setMode] = useState<ChatMode>(initialMode)
  const [selectedModel, setSelectedModel] = useState(initialModel)
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [showStudioPicker, setShowStudioPicker] = useState(false)
  const [showResourcePicker, setShowResourcePicker] = useState(false)

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
      skill: null,
      attachments,
      model: selectedModel,
    })

    setInputValue('')
    setAttachments([])
  }, [
    inputValue,
    isStreaming,
    upstreamInputLocked,
    mode,
    attachments,
    selectedModel,
    onSendMessage,
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
      <div className="border-t border-gray-100 px-4 py-3">
        <div className="max-w-3xl mx-auto space-y-2">
          {upstreamBanner && (
            <div className="flex items-center gap-2 rounded-lg border border-amber-100 bg-amber-50/80 px-3 py-2 text-xs text-amber-900">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500 animate-pulse" aria-hidden />
              <span>{upstreamBanner}</span>
            </div>
          )}
          {/* 附件列表 */}
          {attachments.length > 0 && (
            <AttachmentList attachments={attachments} onRemove={handleRemoveAttachment} />
          )}

          {/* 输入框容器 */}
          <div className="relative rounded-xl border border-gray-200 bg-white shadow-sm shadow-gray-900/5 overflow-visible focus-within:ring-2 focus-within:ring-indigo-500/20 focus-within:border-indigo-300 transition-all duration-200">
            {showStudioPicker && onRunStudioTool && (
              <StudioActionsPopover
                tools={studioActions}
                onClose={() => setShowStudioPicker(false)}
                onPick={(tool) => void onRunStudioTool(tool)}
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
            <div className="px-3 pt-2.5 pb-2 overflow-hidden rounded-xl">
              <ChatInput
                value={inputValue}
                onChange={handleInputValueChange}
                onSend={handleSend}
                placeholder="输入你的问题，按 / 打开 Studio 动作，按 @ 引用资料..."
                disabled={false}
                isStreaming={isStreaming}
                upstreamLocked={upstreamInputLocked}
                canStop={upstreamCanStop}
                stoppingUpstream={stoppingUpstream}
                onStop={handleStopGeneration}
                autoFocus={autoFocus}
              />
            </div>

            {/* 工具栏 */}
            <div className="flex items-center gap-2 px-3 py-2 border-t border-gray-100 bg-gray-50/50">
              {/* 附件按钮 */}
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={handleAddLocalFile}
                  disabled={upstreamInputLocked || isStreaming}
                  className={cn(
                    'flex items-center gap-1 px-2 py-1 text-xs rounded-md transition-colors',
                    upstreamInputLocked || isStreaming
                      ? 'text-gray-300 cursor-not-allowed'
                      : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200/50'
                  )}
                >
                  <HardDrive size={12} />
                  <span className="hidden sm:inline">本地文件</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (upstreamInputLocked || isStreaming) return
                    setShowStudioPicker(false)
                    setShowResourcePicker(true)
                  }}
                  disabled={upstreamInputLocked || isStreaming}
                  className={cn(
                    'flex items-center gap-1 px-2 py-1 text-xs rounded-md transition-colors',
                    upstreamInputLocked || isStreaming
                      ? 'text-gray-300 cursor-not-allowed'
                      : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200/50'
                  )}
                >
                  <Folder size={12} />
                  <span className="hidden sm:inline">资料库</span>
                </button>
              </div>

              <div className="w-px h-4 bg-gray-200" />

              {/* 模式选择 */}
              {/* <ModeSelector mode={mode} onChange={handleModeChange} /> */}

              {/* <div className="w-px h-4 bg-gray-200" /> */}

              {/* Studio 动作（与右侧栏一致） */}
              <button
                type="button"
                onClick={() => {
                  if (upstreamInputLocked || isStreaming) return
                  setShowResourcePicker(false)
                  setShowStudioPicker((v) => !v)
                }}
                disabled={upstreamInputLocked || isStreaming || !onRunStudioTool}
                className={cn(
                  'flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-all duration-200',
                  showStudioPicker
                    ? 'border-indigo-200 bg-indigo-50 text-indigo-700'
                    : 'border-gray-200 bg-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700',
                  (!onRunStudioTool || upstreamInputLocked || isStreaming) && 'opacity-50 cursor-not-allowed'
                )}
              >
                <Zap size={12} className={showStudioPicker ? 'text-indigo-500' : 'text-gray-400'} />
                <span>技能</span>
              </button>

              {/* <div className="w-px h-4 bg-gray-200" /> */}

              {/* 模型选择
              <ModelSelector
                selectedModel={selectedModel}
                onSelect={handleModelChange}
                models={models}
              /> */}
            </div>
          </div>
        </div>
      </div>

      {/* 居中「从资料库选择」弹窗已停用，改为输入区 @ 或「资料库」按钮的浮层列表 */}
    </ChatContainer>
  )
}
