/**
 * MessageBubble - 消息气泡组件
 *
 * 支持用户消息和 AI 消息，包含操作按钮和状态显示
 */

import { useState, useCallback } from 'react'
import { cn } from '@/utils'
import { MarkdownRenderer } from '../MarkdownRenderer'
import type { ChatMessage, MessageStatus } from './types'
import { Check, Copy, FileText, RefreshCw } from 'lucide-react'

interface MessageBubbleProps {
  message: ChatMessage
  onCopy?: (content: string) => void
  onRegenerate?: () => void
  onSaveAsDocument?: (content: string) => void
  onEdit?: (messageId: string, newContent: string) => void
  onDelete?: (messageId: string) => void
  className?: string
}

// 状态指示器组件
function StatusIndicator({ status }: { status?: MessageStatus }) {
  if (!status || status === 'idle' || status === 'complete') return null

  const statusConfig = {
    streaming: {
      text: '生成中...',
      className: 'text-indigo-500',
    },
    thinking: {
      text: '思考中...',
      className: 'text-amber-500',
    },
    'tool-calling': {
      text: '调用工具...',
      className: 'text-emerald-500',
    },
    error: {
      text: '出错了',
      className: 'text-red-500',
    },
  }

  const config = statusConfig[status]

  return (
    <div className="flex items-center gap-2 text-xs mb-2 pb-2 border-b border-gray-100/50">
      <div
        className={cn(
          'w-3.5 h-3.5 rounded-full border-2 border-t-transparent animate-spin',
          status === 'thinking' && 'border-amber-400',
          status === 'streaming' && 'border-indigo-400',
          status === 'tool-calling' && 'border-emerald-400'
        )}
        style={{ borderColor: status === 'error' ? 'transparent' : undefined }}
      />
      <span className={cn('font-medium', config.className)}>{config.text}</span>
    </div>
  )
}

// 消息操作按钮
function MessageActions({
  content,
  onCopy,
  onRegenerate,
  onSaveAsDocument,
}: {
  content: string
  onCopy?: (content: string) => void
  onRegenerate?: () => void
  onSaveAsDocument?: (content: string) => void
}) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(() => {
    onCopy?.(content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [content, onCopy])

  return (
    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150 pl-1">
      <button
        onClick={handleCopy}
        className="flex items-center gap-1 px-2 py-1 text-[11px] text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
      >
        {copied ? <Check size={10} className="text-emerald-500" /> : <Copy size={10} />}
        <span>{copied ? '已复制' : '复制'}</span>
      </button>

      <button
        onClick={() => onSaveAsDocument?.(content)}
        className="flex items-center gap-1 px-2 py-1 text-[11px] text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
      >
        <FileText size={10} />
        <span>保存</span>
      </button>

      <button
        onClick={() => onRegenerate?.()}
        className="flex items-center gap-1 px-2 py-1 text-[11px] text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
      >
        <RefreshCw size={10} />
        <span>重试</span>
      </button>
    </div>
  )
}

export function MessageBubble({
  message,
  onCopy,
  onRegenerate,
  onSaveAsDocument,
  className,
}: MessageBubbleProps) {
  const isUser = message.role === 'user'
  const isProcess =
    !isUser && (message.messageKind === 'reasoning' || message.messageKind === 'system')

  return (
    <div className={cn('group flex gap-2', isUser ? 'justify-end' : 'justify-start', className)}>
      <div
        className={cn(
          'flex flex-col gap-0.5',
          isUser ? 'items-end max-w-[78%]' : 'items-start max-w-[85%]'
        )}
      >
        {/* 消息气泡 */}
        <div
          className={cn(
            'px-3 py-2 text-[14px]',
            isUser
              ? 'bg-gray-900 text-white rounded-[18px] rounded-tr-md'
              : isProcess
                ? 'bg-amber-50/70 border border-amber-100 text-gray-700 rounded-[18px] rounded-tl-md max-w-none'
                : 'bg-gray-50 text-gray-800 rounded-[18px] rounded-tl-md max-w-none'
          )}
        >
          {isUser ? (
            <div className="w-full text-white user-markdown">
              <MarkdownRenderer content={message.content} />
            </div>
          ) : (
            <>
              <StatusIndicator status={message.status} />
              {message.content ? (
                <div className="w-full">
                  <MarkdownRenderer content={message.content} />
                </div>
              ) : (
                !message.status && (
                  <div className="h-4 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce" />
                    <span
                      className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce"
                      style={{ animationDelay: '100ms' }}
                    />
                    <span
                      className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce"
                      style={{ animationDelay: '200ms' }}
                    />
                  </div>
                )
              )}
            </>
          )}
        </div>

        {/* 操作按钮（仅 AI 消息） */}
        {!isUser && (
          <MessageActions
            content={message.content}
            onCopy={onCopy}
            onRegenerate={onRegenerate}
            onSaveAsDocument={onSaveAsDocument}
          />
        )}
      </div>
    </div>
  )
}
