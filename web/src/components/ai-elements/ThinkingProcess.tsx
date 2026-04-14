/**
 * ThinkingProcess - 思考过程组件
 *
 * 显示 AI 的思考步骤，支持展开/折叠动画
 */

import { useState, useEffect } from 'react'
import { cn } from '@/utils'
import { ChevronDown, Brain, Sparkles } from 'lucide-react'
import type { ChatMessage } from './types'
import { MarkdownRenderer } from '../MarkdownRenderer'

interface ThinkingProcessProps {
  steps: ChatMessage[]
  isStreaming?: boolean
  isLatestGroup?: boolean
  className?: string
}

export function ThinkingProcess({
  steps,
  isStreaming = false,
  isLatestGroup = false,
  className,
}: ThinkingProcessProps) {
  const [expanded, setExpanded] = useState(false)

  // 自动展开正在流式传输的最新思考组
  useEffect(() => {
    if (isStreaming && isLatestGroup) {
      setExpanded(true)
    }
  }, [isStreaming, isLatestGroup, steps.length])

  const toggleExpanded = () => setExpanded((v) => !v)

  return (
    <div
      className={cn(
        'rounded-xl border border-amber-100/80 bg-gradient-to-br from-amber-50/80 to-orange-50/60 overflow-hidden',
        'shadow-sm shadow-amber-900/5',
        className
      )}
    >
      {/* 头部 - 始终可见 */}
      <button
        onClick={toggleExpanded}
        className={cn(
          'w-full flex items-center justify-between px-3.5 py-2.5',
          'text-xs font-medium text-amber-800/80',
          'hover:bg-amber-100/40 transition-colors duration-200',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/50'
        )}
      >
        <div className="flex items-center gap-2">
          {isStreaming && isLatestGroup ? (
            <div className="relative">
              <Brain size={13} className="text-amber-600 animate-pulse" />
              <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-amber-500 rounded-full animate-ping" />
            </div>
          ) : (
            <Sparkles size={13} className="text-amber-600" />
          )}
          <span>
            {expanded
              ? '隐藏思考过程'
              : isStreaming && isLatestGroup
                ? '思考中...'
                : `思考过程 (${steps.length} 步)`}
          </span>
        </div>
        <ChevronDown
          size={14}
          className={cn(
            'text-amber-600/70 transition-transform duration-300 ease-out',
            expanded && 'rotate-180'
          )}
        />
      </button>

      {/* 展开内容 - 思考步骤 */}
      <div
        className={cn(
          'grid transition-all duration-300 ease-out',
          expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        )}
      >
        <div className="overflow-hidden">
          <div className="space-y-2 border-t border-amber-200/50 px-3.5 py-3">
            {steps.map((step, idx) => (
              <div
                key={step.id}
                className={cn(
                  'rounded-lg border border-white/60 bg-white/70 backdrop-blur-sm',
                  'px-3 py-2.5 shadow-sm shadow-amber-900/5',
                  'transition-all duration-200 hover:border-amber-200/80 hover:bg-white/90'
                )}
              >
                {/* 步骤标题 */}
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="flex items-center justify-center w-5 h-5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-semibold">
                    {idx + 1}
                  </span>
                  <span className="text-[11px] text-amber-700/80 font-medium">
                    {step.messageKind === 'system' ? '系统处理' : '推理思考'}
                  </span>
                  {step.thinkingTime && (
                    <span className="text-[10px] text-amber-600/60 ml-auto">
                      {step.thinkingTime > 1000
                        ? `${(step.thinkingTime / 1000).toFixed(1)}s`
                        : `${step.thinkingTime}ms`}
                    </span>
                  )}
                </div>

                {/* 步骤内容 */}
                <div className="text-[13px] text-gray-700 leading-relaxed pl-7">
                  {step.content ? (
                    <MarkdownRenderer content={step.content} />
                  ) : (
                    <span className="text-gray-400 italic">思考中...</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
