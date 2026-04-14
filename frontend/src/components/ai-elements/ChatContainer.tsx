/**
 * ChatContainer - 聊天容器组件
 *
 * 提供聊天界面的整体布局和状态管理上下文
 */

import { cn } from '@/utils'
import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import type { ChatMode, ChatMessage, MessageStatus, Skill, Attachment, ModelOption } from './types'

interface ChatContextValue {
  mode: ChatMode
  setMode: (mode: ChatMode) => void
  messages: ChatMessage[]
  status: MessageStatus
  selectedSkill: string | null
  setSelectedSkill: (skillId: string | null) => void
  selectedModel: string
  setSelectedModel: (modelId: string) => void
  attachments: Attachment[]
  setAttachments: (attachments: Attachment[]) => void
  isStreaming: boolean
}

const ChatContext = createContext<ChatContextValue | null>(null)

export function useChatContext() {
  const context = useContext(ChatContext)
  if (!context) {
    throw new Error('useChatContext must be used within a ChatContainer')
  }
  return context
}

interface ChatContainerProps {
  children: ReactNode
  className?: string
  initialMode?: ChatMode
  initialMessages?: ChatMessage[]
  initialSkill?: string | null
  initialModel?: string
  onModeChange?: (mode: ChatMode) => void
}

export function ChatContainer({
  children,
  className,
  initialMode = 'chat',
  initialMessages = [],
  initialSkill = null,
  initialModel = 'google/gemini-3-flash-preview',
  onModeChange,
}: ChatContainerProps) {
  const [mode, setMode] = useState<ChatMode>(initialMode)
  const [messages] = useState<ChatMessage[]>(initialMessages)
  const [status] = useState<MessageStatus>('idle')
  const [selectedSkill, setSelectedSkill] = useState<string | null>(initialSkill)
  const [selectedModel, setSelectedModel] = useState(initialModel)
  const [attachments, setAttachments] = useState<Attachment[]>([])

  const handleModeChange = useCallback((newMode: ChatMode) => {
    setMode(newMode)
    onModeChange?.(newMode)
  }, [onModeChange])

  const value: ChatContextValue = {
    mode,
    setMode: handleModeChange,
    messages,
    status,
    selectedSkill,
    setSelectedSkill,
    selectedModel,
    setSelectedModel,
    attachments,
    setAttachments,
    isStreaming: status === 'streaming' || status === 'thinking',
  }

  return (
    <ChatContext.Provider value={value}>
      <div className={cn('flex flex-col h-full min-h-0 bg-white', className)}>
        {children}
      </div>
    </ChatContext.Provider>
  )
}
