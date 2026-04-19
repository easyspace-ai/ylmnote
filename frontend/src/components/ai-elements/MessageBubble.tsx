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
import { Check, Copy, FileText, RefreshCw, User } from 'lucide-react'

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
      text: '',
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
      'mb-2.5 flex items-center gap-2 border-b border-zinc-200 pb-2.5 text-xs dark:border-white/10',
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
    <div className="pl-1 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
      <div className="flex items-center gap-1 rounded-lg">
      <button
        onClick={handleCopy}
        className={cn(
          'flex items-center gap-1 rounded-md px-2 py-1 text-[11px] transition-colors',
          copied
            ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-300'
            : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 dark:text-white/60 dark:hover:bg-white/10 dark:hover:text-white'
        )}
      >
        {copied ? <Check size={10} /> : <Copy size={10} />}
        <span>{copied ? '已复制' : '复制'}</span>
      </button>

      <button
        onClick={() => onSaveAsDocument?.(content)}
        className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:text-white/60 dark:hover:bg-white/10 dark:hover:text-white"
      >
        <FileText size={10} />
        <span>保存</span>
      </button>

      <button
        onClick={() => onRegenerate?.()}
        className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:text-white/60 dark:hover:bg-white/10 dark:hover:text-white"
      >
        <RefreshCw size={10} />
        <span>重试</span>
      </button>
      </div>
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
      {!isUser && (
        <div className={cn(
          'mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-3xl border shadow dark:border-white/15'
        )}>
          <span className="text-[11px] font-semibold text-zinc-700 dark:text-white">C</span>
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
              ? 'rounded-3xl bg-zinc-100 text-zinc-900 dark:bg-white/10 dark:text-white'
              : 'rounded-none bg-transparent text-zinc-800 shadow-none dark:text-[#eee]'
          )}
        >
          {isUser ? (
            <div className="w-full">
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

      {isUser && (
        <div className={cn(
          'mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-3xl bg-zinc-800 text-white shadow-sm dark:bg-white/80 dark:text-black'
        )}>
          <User size={14} />
        </div>
      )}
    </div>
  )
}
