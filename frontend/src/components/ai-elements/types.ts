/**
 * AI Elements - 类型定义
 */

export type ChatMode = 'chat' | 'agent' | 'ask' | 'query'

export type MessageStatus =
  | 'idle'
  | 'streaming'
  | 'thinking'
  | 'tool-calling'
  | 'error'
  | 'complete'

export type MessageRole = 'user' | 'assistant' | 'system'

export type MessageKind = 'normal' | 'reasoning' | 'system' | 'tool'

export interface ChatMessage {
  id: string
  role: MessageRole
  content: string
  messageKind?: MessageKind
  /** 上游帧 kind 原文：reasoning / internal_thought / subliminal_thought / system 等，用于过程卡片细分标签 */
  upstreamKind?: string
  thinkingTime?: number
  status?: MessageStatus
  timestamp?: Date
  metadata?: Record<string, unknown>
}

export interface ThinkingStep {
  id: string
  title: string
  content?: string
  status: 'pending' | 'in-progress' | 'complete' | 'error'
  duration?: number
  timestamp?: Date
}

export interface ToolCall {
  id: string
  name: string
  description?: string
  arguments?: Record<string, unknown>
  result?: unknown
  status: 'calling' | 'success' | 'error'
  duration?: number
}

export interface TodoItem {
  id: string
  text: string
  done: boolean
  priority?: 'low' | 'medium' | 'high'
  metadata?: Record<string, unknown>
}

export interface Skill {
  id: string
  name: string
  icon: string
  description?: string
  category?: string
}

export interface Attachment {
  id: string
  name: string
  type: 'local' | 'library' | 'url'
  file?: File
  url?: string
  size?: number
  mimeType?: string
}

export interface ModelOption {
  id: string
  name: string
  provider?: string
  contextLength?: number
  pricing?: {
    prompt: number
    completion: number
  }
  capabilities?: string[]
}

/** 与笔记详情右侧 Studio 栏一致的动作项（来自提示词模板） */
export interface StudioAction {
  id: string
  label: string
  prompt: string
  color: string
  textColor: string
}

/** 选中的 Studio 动作 */
export interface SelectedStudioAction extends StudioAction {
  isActive: boolean
}
