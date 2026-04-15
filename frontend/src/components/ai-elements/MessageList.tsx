/**
 * MessageList - 消息列表组件
 *
 * 处理消息的分组、虚拟滚动、加载历史消息等功能
 */

import { useRef, useEffect, useMemo, useCallback } from 'react'
import { cn } from '@/utils'
import type { ChatMessage } from './types'
import { MessageBubble } from './MessageBubble'
import { StreamingIndicator } from './StreamingIndicator'
import { ThinkingProcess } from './ThinkingProcess'

interface MessageGroup {
  type: 'message' | 'process-group'
  id: string
  message?: ChatMessage
  steps?: ChatMessage[]
  hasLatestAssistant?: boolean
}

interface MessageListProps {
  messages: ChatMessage[]
  className?: string
  isStreaming?: boolean
  hasMoreOlder?: boolean
  loadingOlder?: boolean
  todoItems?: Array<{ text: string; done: boolean }>
  onLoadOlder?: () => Promise<void> | void
  onCopy?: (content: string) => void
  onRegenerate?: () => void
  onSaveAsDocument?: (content: string) => void
}

export function MessageList({
  messages,
  className,
  isStreaming = false,
  hasMoreOlder = false,
  loadingOlder = false,
  onLoadOlder,
  onCopy,
  onRegenerate,
  onSaveAsDocument,
}: MessageListProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const shouldAutoScrollRef = useRef(true)
  const prependAnchorRef = useRef<{ prevHeight: number; prevTop: number } | null>(null)

  // 获取最新消息ID用于判断是否是正在流式传输的消息
  const latestAssistantId = useMemo(() => {
    return [...messages].reverse().find(m => m.role === 'assistant')?.id
  }, [messages])

  const messageGroups = useMemo<MessageGroup[]>(() => {
    const groups: MessageGroup[] = []
    let processBuffer: ChatMessage[] = []

    const flushBuffer = () => {
      if (processBuffer.length === 0) return
      const hasLatestAssistant = processBuffer.some(step => step.id === latestAssistantId)
      const id = `process-${processBuffer[0]?.id || Date.now()}-${processBuffer.length}`
      groups.push({
        type: 'process-group',
        id,
        steps: processBuffer,
        hasLatestAssistant,
      })
      processBuffer = []
    }

    for (const msg of messages) {
      const isProcess = msg.role === 'assistant' && (msg.messageKind === 'reasoning' || msg.messageKind === 'system')
      if (isProcess) {
        processBuffer.push(msg)
        continue
      }
      flushBuffer()
      groups.push({
        type: 'message',
        id: msg.id,
        message: msg,
      })
    }
    flushBuffer()
    return groups
  }, [messages, latestAssistantId])

  const streamingFooter = useMemo(() => {
    if (!isStreaming) return null
    const last = messageGroups[messageGroups.length - 1]
    const thinkingLive = last?.type === 'process-group' && last.hasLatestAssistant
    if (thinkingLive) {
      return (
        <div className="flex items-center justify-start gap-2 pl-1 text-xs text-zinc-500 dark:text-white/60">
          <StreamingIndicator variant="minimal" className="shrink-0" />
          <span>正在生成回复…</span>
        </div>
      )
    }
    return <StreamingIndicator />
  }, [isStreaming, messageGroups])

  // 自动滚动逻辑
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    if (prependAnchorRef.current) {
      const { prevHeight, prevTop } = prependAnchorRef.current
      const delta = container.scrollHeight - prevHeight
      container.scrollTop = prevTop + delta
      prependAnchorRef.current = null
      return
    }

    if (shouldAutoScrollRef.current || isStreaming) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, isStreaming])

  // 滚动处理（加载历史消息）
  const handleScroll = useCallback(async () => {
    const container = containerRef.current
    if (!container) return

    const distanceToBottom = container.scrollHeight - (container.scrollTop + container.clientHeight)
    shouldAutoScrollRef.current = distanceToBottom < 80

    if (container.scrollTop <= 40 && hasMoreOlder && !loadingOlder && onLoadOlder) {
      prependAnchorRef.current = {
        prevHeight: container.scrollHeight,
        prevTop: container.scrollTop,
      }
      await onLoadOlder()
    }
  }, [hasMoreOlder, loadingOlder, onLoadOlder])

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className={cn('flex-1 min-h-0 overflow-y-auto px-4 pt-8 pb-4 dark:bg-[#212121]', className)}
    >
      {messages.length > 0 ? (
        <div className="mx-auto max-w-3xl space-y-5">
          {/* 加载更早消息提示 */}
          {(loadingOlder || hasMoreOlder) && (
            <div className="flex justify-center">
              <div className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs text-zinc-400 dark:border-white/10 dark:bg-white/5 dark:text-white/50">
                {loadingOlder ? '加载更早消息中...' : '上滑可加载更早消息'}
              </div>
            </div>
          )}

          {/* 消息列表 */}
          {messageGroups.map((group) => {
            if (group.type === 'process-group') {
              return (
                <ThinkingProcess
                  key={group.id}
                  steps={group.steps!}
                  isStreaming={isStreaming}
                  isLatestGroup={group.hasLatestAssistant}
                />
              )
            }

            return (
              <MessageBubble
                key={group.id}
                message={group.message!}
                onCopy={onCopy}
                onRegenerate={onRegenerate}
                onSaveAsDocument={onSaveAsDocument}
              />
            )
          })}

          {streamingFooter}

          {/* 滚动锚点 */}
          <div ref={messagesEndRef} />
        </div>
      ) : (
        /* 空状态 */
        <div className="flex h-full select-none flex-col items-center justify-center text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-3xl border shadow dark:border-white/15">
            <span className="text-sm font-semibold text-zinc-700 dark:text-white">C</span>
          </div>
          <p className="mb-1 text-xl text-zinc-900 dark:text-white">How can I help you today?</p>
        </div>
      )}
    </div>
  )
}
