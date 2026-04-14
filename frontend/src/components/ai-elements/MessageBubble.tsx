/**
 * MessageBubble - 消息气泡组件（重构版）
 *
 * 支持用户消息和 AI 消息，包含操作按钮和状态显示
 * 优化配色方案和视觉层次
 */

import { useState, useCallback } from 'react'
import { cn } from '@/utils'
import { MarkdownRenderer } from '../MarkdownRenderer'
import type { ChatMessage, MessageStatus } from './types'
import { Check, Copy, FileText, RefreshCw, User, Bot } from 'lucide-react'

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
      className: 'text-indigo-600',
      bgClass: 'bg-indigo-50',
      borderClass: 'border-indigo-200',
    },
    thinking: {
      text: '思考中...',
      className: 'text-amber-600',
      bgClass: 'bg-amber-50',
      borderClass: 'border-amber-200',
    },
    'tool-calling': {
      text: '调用工具...',
      className: 'text-emerald-600',
      bgClass: 'bg-emerald-50',
      borderClass: 'border-emerald-200',
    },
    error: {
      text: '出错了',
      className: 'text-red-600',
      bgClass: 'bg-red-50',
      borderClass: 'border-red-200',
    },
  }

  const config = statusConfig[status]

  return (
    <div className={cn(
      'flex items-center gap-2 text-xs mb-2.5 pb-2.5 border-b',
      config.borderClass
    )}>
      <div className={cn(
        'w-2 h-2 rounded-full animate-pulse',
        status === 'thinking' && 'bg-amber-400',
        status === 'streaming' && 'bg-indigo-400',
        status === 'tool-calling' && 'bg-emerald-400',
        status === 'error' && 'bg-red-400'
      )} />
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
    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pl-1">
      <button
        onClick={handleCopy}
        className={cn(
          'flex items-center gap-1 px-2 py-1 text-[11px] rounded-md transition-colors',
          copied
            ? 'text-emerald-600 bg-emerald-50'
            : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
        )}
      >
        {copied ? <Check size={10} /> : <Copy size={10} />}
        <span>{copied ? '已复制' : '复制'}</span>
      </button>

      <button
        onClick={() => onSaveAsDocument?.(content)}
        className="flex items-center gap-1 px-2 py-1 text-[11px] text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-md transition-colors"
      >
        <FileText size={10} />
        <span>保存</span>
      </button>

      <button
        onClick={() => onRegenerate?.()}
        className="flex items-center gap-1 px-2 py-1 text-[11px] text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-md transition-colors"
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

  return (
    <div className={cn('group flex gap-3', isUser ? 'justify-end' : 'justify-start', className)}>
      {/* AI 头像 */}
      {!isUser && (
        <div className={cn(
          'flex-shrink-0 w-7 h-7 rounded-lg',
          'bg-gradient-to-br from-indigo-500 to-violet-600',
          'flex items-center justify-center shadow-sm'
        )}>
          <Bot size={14} className="text-white" />
        </div>
      )}

      <div className={cn(
        'flex flex-col gap-0.5',
        isUser ? 'items-end max-w-[78%]' : 'items-start max-w-[85%]'
      )}>
        {/* 消息气泡 - 重新设计配色 */}
        <div
          className={cn(
            'px-4 py-2.5 text-[14px] leading-relaxed',
            isUser
              ? // 用户消息 - 深色渐变，现代感
                'bg-gradient-to-br from-slate-800 to-slate-900 text-white rounded-2xl rounded-tr-md shadow-sm'
              : // AI 消息 - 浅色背景，精致边框
                'bg-white border border-slate-200/80 text-slate-800 rounded-2xl rounded-tl-md shadow-sm shadow-slate-900/3'
          )}
        >
          {isUser ? (
            // 用户消息内容
            <div className="w-full">
              <MarkdownRenderer content={message.content} />
            </div>
          ) : (
            // AI 消息内容
            <>
              <StatusIndicator status={message.status} />
              {message.content ? (
                <div className="w-full">
                  <MarkdownRenderer content={message.content} />
                </div>
              ) : (
                !message.status && (
                  <div className="h-4 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce" />
                    <span className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce [animation-delay:100ms]" />
                    <span className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce [animation-delay:200ms]" />
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

      {/* 用户头像（可选，保持简洁可省略） */}
      {isUser && (
        <div className={cn(
          'flex-shrink-0 w-7 h-7 rounded-lg',
          'bg-gradient-to-br from-slate-400 to-slate-500',
          'flex items-center justify-center shadow-sm'
        )}>
          <User size={14} className="text-white" />
        </div>
      )}
    </div>
  )
}
