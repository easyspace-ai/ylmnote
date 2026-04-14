/**
 * MessageList - 消息列表组件
 *
 * 处理消息的分组、虚拟滚动、加载历史消息等功能
 */

import { useRef, useEffect, useMemo, useCallback } from 'react'
import { cn } from '@/utils'
import type { ChatMessage } from './types'
import { MessageBubble } from './MessageBubble'
import { ThinkingProcess } from './ThinkingProcess'
import { StreamingIndicator } from './StreamingIndicator'

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

  // 将消息分组（普通消息和思考过程分组）
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
      className={cn('flex-1 min-h-0 overflow-y-auto px-6 pt-6 pb-4', className)}
    >
      {messages.length > 0 ? (
        <div className="space-y-4 max-w-3xl mx-auto">
          {/* 加载更早消息提示 */}
          {(loadingOlder || hasMoreOlder) && (
            <div className="flex justify-center">
              <div className="text-xs text-gray-400 bg-gray-50 border border-gray-100 rounded-full px-3 py-1">
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
                  steps={group.steps || []}
                  isStreaming={isStreaming}
                  isLatestGroup={group.hasLatestAssistant || false}
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

          {/* 流式响应指示器 */}
          {isStreaming && <StreamingIndicator />}

          {/* 滚动锚点 */}
          <div ref={messagesEndRef} />
        </div>
      ) : (
        /* 空状态 */
        <div className="flex flex-col items-center justify-center h-full text-center select-none">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500/10 to-purple-500/10 flex items-center justify-center mb-4">
            <svg
              className="w-8 h-8 text-indigo-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
              />
            </svg>
          </div>
          <p className="text-sm font-medium text-gray-900 mb-1">开始对话</p>
          <p className="text-sm text-gray-500">输入你的问题，或选择技能开始</p>
        </div>
      )}
    </div>
  )
}
