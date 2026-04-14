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
  /** @deprecated 停止已合并到发送位：流式时用 onStop；保留仅为兼容 */
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
  canStop: _canStop = false,
  stoppingUpstream = false,
  onStop,
  className,
  autoFocus = false,
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const composeLocked = disabled || isStreaming || upstreamLocked

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
        value={value}
        onChange={handleInput}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={composeLocked}
        autoFocus={autoFocus}
        rows={1}
        className={cn(
          'flex-1 bg-transparent resize-none outline-none text-sm',
          'text-gray-900 placeholder-gray-400 leading-6',
          'min-h-[24px] max-h-[240px] overflow-y-auto',
          composeLocked && 'opacity-50 cursor-not-allowed'
        )}
        style={{ height: '24px' }}
      />

      {isStreaming && onStop ? (
        <button
          type="button"
          title={stoppingUpstream ? '正在停止…' : '停止生成'}
          onClick={() => void onStop()}
          disabled={stoppingUpstream}
          className={cn(
            'flex-shrink-0 flex items-center justify-center',
            'w-8 h-8 rounded-lg transition-all duration-200',
            stoppingUpstream
              ? 'bg-rose-100 text-rose-300 cursor-wait'
              : 'bg-rose-600 text-white hover:bg-rose-700'
          )}
        >
          <Square size={12} fill="currentColor" className="text-white" />
        </button>
      ) : (
        <button
          type="button"
          onClick={onSend}
          disabled={composeLocked || !value.trim()}
          className={cn(
            'flex-shrink-0 flex items-center justify-center',
            'w-8 h-8 rounded-lg transition-all duration-200',
            value.trim() && !composeLocked
              ? 'bg-gray-900 text-white hover:bg-gray-800'
              : 'bg-gray-200 text-gray-400 cursor-not-allowed'
          )}
        >
          <Send size={14} />
        </button>
      )}
    </div>
  )
}
