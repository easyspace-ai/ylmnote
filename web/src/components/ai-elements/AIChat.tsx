/**
 * AIChat - 完整的 AI 聊天界面组件
 *
 * 整合所有 ai-elements 组件，提供开箱即用的聊天界面
 */

import { useState, useCallback, useEffect, useRef } from 'react'
import { cn } from '@/utils'
import type {
  ChatMessage,
  ChatMode,
  Skill,
  Attachment,
  TodoItem,
  ModelOption,
} from './types'

// 子组件导入
import { ChatContainer } from './ChatContainer'
import { MessageList } from './MessageList'
import { ChatInput } from './ChatInput'
import { TodoList } from './TodoList'
import { AttachmentList } from './AttachmentList'
import { ModeSelector } from './ModeSelector'
import { ModelSelector } from './ModelSelector'
import { SkillSelector } from './SkillSelector'
import { HardDrive, Folder, X } from 'lucide-react'

interface AIChatProps {
  // 数据
  messages: ChatMessage[]
  skills?: Skill[]
  models?: ModelOption[]
  libraryFiles?: { id: string; name: string }[]
  todoItems?: TodoItem[]

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
  initialSkill?: string | null
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
  onSkillChange?: (skillId: string | null) => void
  onModelChange?: (modelId: string) => void
  onTodoToggle?: (id: string, done: boolean) => void

  // 样式
  className?: string
}

export function AIChat({
  messages,
  skills = [],
  models,
  libraryFiles = [],
  todoItems = [],
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
  initialSkill = null,
  initialModel = 'google/gemini-3-flash-preview',
  autoFocus = false,
  showTodos = true,
  onSendMessage,
  onLoadOlder,
  onCopy,
  onRegenerate,
  onSaveAsDocument,
  onModeChange,
  onSkillChange,
  onModelChange,
  onTodoToggle,
  className,
}: AIChatProps) {
  // 状态
  const [inputValue, setInputValue] = useState('')
  const [mode, setMode] = useState<ChatMode>(initialMode)
  const [selectedSkill, setSelectedSkill] = useState<string | null>(initialSkill)
  const [selectedModel, setSelectedModel] = useState(initialModel)
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [showLibraryPicker, setShowLibraryPicker] = useState(false)

  // 处理模式变化
  const handleModeChange = useCallback(
    (newMode: ChatMode) => {
      setMode(newMode)
      onModeChange?.(newMode)
    },
    [onModeChange]
  )

  // 处理技能变化
  const handleSkillChange = useCallback(
    (skillId: string | null) => {
      setSelectedSkill(skillId)
      onSkillChange?.(skillId)
    },
    [onSkillChange]
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
      skill: selectedSkill,
      attachments,
      model: selectedModel,
    })

    setInputValue('')
    // 注意：附件是否清空取决于业务需求
    // setAttachments([])
  }, [
    inputValue,
    isStreaming,
    upstreamInputLocked,
    mode,
    selectedSkill,
    attachments,
    selectedModel,
    onSendMessage,
  ])

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
      const attachment: Attachment = {
        id: `library-${file.id}`,
        name: file.name,
        type: 'library',
      }
      setAttachments((prev) => [...prev, attachment])
      setShowLibraryPicker(false)
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
      {showTodos && todoItems.length > 0 && (
        <div className="px-4 pb-2">
          <TodoList
            items={todoItems}
            isGenerating={isGeneratingTodos}
            onItemToggle={onTodoToggle}
          />
        </div>
      )}

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
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm shadow-gray-900/5 overflow-hidden focus-within:ring-2 focus-within:ring-indigo-500/20 focus-within:border-indigo-300 transition-all duration-200">
            {/* 技能标签（如果有选择） */}
            {selectedSkill && (
              <div className="px-3 pt-2.5">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-indigo-50 border border-indigo-100 text-xs font-medium text-indigo-700 rounded-lg">
                  <span>{skills.find((s) => s.id === selectedSkill)?.icon}</span>
                  <span>{skills.find((s) => s.id === selectedSkill)?.name}</span>
                  <button
                    onClick={() => handleSkillChange(null)}
                    className="p-0.5 hover:bg-indigo-100 rounded transition-colors"
                  >
                    <span className="sr-only">移除</span>
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            )}

            {/* 文本输入 */}
            <div className="px-3 pt-2.5 pb-2">
              <ChatInput
                value={inputValue}
                onChange={setInputValue}
                onSend={handleSend}
                placeholder={
                  selectedSkill
                    ? `使用 ${skills.find((s) => s.id === selectedSkill)?.name}...`
                    : '输入你的问题，或按 / 选择技能...'
                }
                disabled={false}
                isStreaming={isStreaming}
                upstreamLocked={upstreamInputLocked}
                canStop={upstreamCanStop}
                stoppingUpstream={stoppingUpstream}
                onStop={onUpstreamStop}
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
                  onClick={() => !upstreamInputLocked && !isStreaming && setShowLibraryPicker(true)}
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
              <ModeSelector mode={mode} onChange={handleModeChange} />

              <div className="w-px h-4 bg-gray-200" />

              {/* 技能选择 */}
              <SkillSelector
                skills={skills}
                selectedSkill={selectedSkill}
                onSelect={handleSkillChange}
              />

              <div className="w-px h-4 bg-gray-200" />

              {/* 模型选择 */}
              <ModelSelector
                selectedModel={selectedModel}
                onSelect={handleModelChange}
                models={models}
              />
            </div>
          </div>
        </div>
      </div>

      {/* 资料库选择弹窗 */}
      {showLibraryPicker && (
        <LibraryPickerModal
          isOpen={showLibraryPicker}
          onClose={() => setShowLibraryPicker(false)}
          files={libraryFiles}
          onSelect={handleAddFromLibrary}
        />
      )}
    </ChatContainer>
  )
}

// 资料库选择弹窗
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
            <X size={18} />
          </button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto p-4 space-y-1.5">
          {files.map((file) => (
            <div
              key={file.id}
              onClick={() => onSelect(file)}
              className="flex items-center gap-3 p-3 hover:bg-gray-50 cursor-pointer rounded-xl transition-colors"
            >
              <div className="p-2 bg-gray-100 rounded-lg">
                <Folder size={16} className="text-gray-400" />
              </div>
              <span className="text-sm text-gray-700">{file.name}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
