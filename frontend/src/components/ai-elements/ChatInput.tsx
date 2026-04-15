/**
 * ChatInput - 聊天输入组件
 */

import { useRef, useCallback } from 'react'
import { cn } from '@/utils'
import { Send, Square } from 'lucide-react'
import type { ChatMode } from './types'

interface ChatInputProps {
  value: string
  onChange: (value: string) => void
  onSend: () => void
  placeholder?: string
  disabled?: boolean
  isStreaming?: boolean
  /** 远端未连接 / busy / blocked 时锁定输入 */
  upstreamLocked?: boolean
  /** 远端 Agent 可 Stop（无本地流时也要显示方块按钮） */
  canStop?: boolean
  stoppingUpstream?: boolean
  /** 流式生成中点击「停止」：应中止本地 SSE 并视情况通知上游 */
  onStop?: () => void | Promise<void>
  mode?: ChatMode
  className?: string
  autoFocus?: boolean
}

export function ChatInput({
  value,
  onChange,
  onSend,
  placeholder = '输入你的问题...',
  disabled = false,
  isStreaming = false,
  upstreamLocked = false,
  canStop = false,
  stoppingUpstream = false,
  onStop,
  className,
  autoFocus = false,
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const composeLocked = disabled || isStreaming || upstreamLocked
  /** 本地流式中，或远端 busy 且门控允许 Stop（刷新后进会话场景） */
  const showStopButton = Boolean(onStop) && (isStreaming || canStop)

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        if (!composeLocked && value.trim()) {
          onSend()
        }
      }
    },
    [composeLocked, value, onSend]
  )

  const handleInput = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const target = e.target
      target.style.height = 'auto'
      const maxH = 240
      target.style.height = Math.min(target.scrollHeight, maxH) + 'px'
      onChange(target.value)
    },
    [onChange]
  )

  return (
    <div className={cn('flex items-end gap-2', className)}>
      <textarea
        ref={textareaRef}
        data-ai-chat-input
        value={value}
        onChange={handleInput}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={composeLocked}
        autoFocus={autoFocus}
        rows={1}
        className={cn(
          'h-12 max-h-40 flex-1 resize-none bg-transparent p-3.5 text-sm outline-none',
          'text-zinc-900 placeholder:text-zinc-400 leading-6 dark:text-white dark:placeholder:text-white/50',
          'min-h-[24px] max-h-[240px] overflow-y-auto',
          composeLocked && 'opacity-50 cursor-not-allowed'
        )}
        style={{ height: '48px' }}
      />

      {showStopButton ? (
        <button
          type="button"
          title={
            stoppingUpstream
              ? '正在停止…'
              : isStreaming
                ? '停止生成'
                : '停止远端运行'
          }
          onClick={() => void onStop?.()}
          disabled={stoppingUpstream}
          className={cn(
            'm-2 flex size-8 shrink-0 items-center justify-center rounded-full transition-all duration-200',
            stoppingUpstream
              ? 'cursor-wait bg-rose-100 text-rose-300 dark:bg-rose-300/20'
              : 'bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-white/90'
          )}
        >
          <Square size={10} fill="currentColor" className={cn(stoppingUpstream ? 'text-rose-400' : 'text-current')} />
        </button>
      ) : (
        <button
          type="button"
          onClick={onSend}
          disabled={composeLocked || !value.trim()}
          className={cn(
            'm-2 flex size-8 shrink-0 items-center justify-center rounded-full transition-all duration-200',
            value.trim() && !composeLocked
              ? 'bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-white dark:text-black'
              : 'cursor-not-allowed bg-zinc-200 text-zinc-400 dark:bg-white/10 dark:text-white/30'
          )}
        >
          <Send size={14} />
        </button>
      )}
    </div>
  )
}
