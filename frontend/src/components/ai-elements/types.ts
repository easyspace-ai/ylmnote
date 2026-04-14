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
