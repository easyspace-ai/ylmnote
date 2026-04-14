/**
 * ThinkingProcess - 思考过程组件（重构版）
 *
 * 精美的思考过程展示，默认折叠，独立配色方案
 */

import { useState, useEffect } from 'react'
import { cn } from '@/utils'
import { ChevronDown, Brain, Sparkles, Clock, Lightbulb } from 'lucide-react'
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
  // 默认折叠，除非是正在流式传输的最新思考组
  const [expanded, setExpanded] = useState(false)

  // 自动展开正在流式传输的最新思考组
  useEffect(() => {
    if (isStreaming && isLatestGroup) {
      setExpanded(true)
    }
  }, [isStreaming, isLatestGroup, steps.length])

  const toggleExpanded = () => setExpanded((v) => !v)

  // 计算总思考时间
  const totalThinkingTime = steps.reduce((sum, step) => sum + (step.thinkingTime || 0), 0)
  const formattedTime = totalThinkingTime > 1000
    ? `${(totalThinkingTime / 1000).toFixed(1)}s`
    : `${totalThinkingTime}ms`

  return (
    <div
      className={cn(
        // 精致的边框和背景 - 使用 slate 色系，与正文形成区分
        'rounded-lg border border-slate-200/80 bg-slate-50/60',
        'overflow-hidden',
        // 微妙的阴影
        'shadow-sm shadow-slate-900/5',
        // 过渡动画
        'transition-all duration-200',
        expanded && 'bg-slate-50/80 border-slate-300/80',
        className
      )}
    >
      {/* 头部 - 始终可见，精致的设计 */}
      <button
        onClick={toggleExpanded}
        className={cn(
          'w-full flex items-center justify-between px-3.5 py-2.5',
          'transition-colors duration-200',
          'hover:bg-slate-100/60',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/50'
        )}
      >
        <div className="flex items-center gap-2.5">
          {/* 图标容器 - 精致的背景 */}
          <div className={cn(
            'flex items-center justify-center w-6 h-6 rounded-md',
            'bg-gradient-to-br from-indigo-100 to-violet-100',
            'border border-indigo-200/50'
          )}>
            {isStreaming && isLatestGroup ? (
              <Brain size={13} className="text-indigo-600 animate-pulse" />
            ) : (
              <Lightbulb size={13} className="text-indigo-600" />
            )}
          </div>

          {/* 标题和时间 */}
          <div className="flex items-center gap-2">
            <span className="text-[12px] font-medium text-slate-700">
              {expanded
                ? '思考过程'
                : isStreaming && isLatestGroup
                  ? '思考中...'
                  : '思考过程'}
            </span>

            {/* 步骤数和时间标签 */}
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                {steps.length} 步
              </span>
              {totalThinkingTime > 0 && (
                <span className="flex items-center gap-0.5 text-[10px] text-slate-400">
                  <Clock size={9} />
                  {formattedTime}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* 展开/折叠指示器 */}
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-slate-400">
            {expanded ? '收起' : '展开'}
          </span>
          <ChevronDown
            size={14}
            className={cn(
              'text-slate-500 transition-transform duration-300 ease-out',
              expanded && 'rotate-180'
            )}
          />
        </div>
      </button>

      {/* 展开内容 - 思考步骤 */}
      <div
        className={cn(
          'grid transition-all duration-300 ease-out',
          expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        )}
      >
        <div className="overflow-hidden">
          <div className="space-y-2 border-t border-slate-200/60 px-3.5 py-3 bg-slate-50/40">
            {steps.map((step, idx) => (
              <div
                key={step.id}
                className={cn(
                  'rounded-md border border-slate-200/70 bg-white/90',
                  'px-3 py-2.5',
                  'shadow-sm shadow-slate-900/3',
                  'transition-all duration-200 hover:border-slate-300 hover:shadow-md'
                )}
              >
                {/* 步骤标题 */}
                <div className="flex items-center gap-2 mb-2">
                  <span className={cn(
                    'flex items-center justify-center w-5 h-5 rounded text-[10px] font-semibold',
                    step.messageKind === 'system'
                      ? 'bg-violet-100 text-violet-700'
                      : 'bg-indigo-100 text-indigo-700'
                  )}>
                    {idx + 1}
                  </span>
                  <span className="text-[11px] text-slate-600 font-medium">
                    {step.messageKind === 'system' ? '系统处理' : '推理分析'}
                  </span>
                  {step.thinkingTime && (
                    <span className="text-[10px] text-slate-400 ml-auto">
                      {step.thinkingTime > 1000
                        ? `${(step.thinkingTime / 1000).toFixed(1)}s`
                        : `${step.thinkingTime}ms`}
                    </span>
                  )}
                </div>

                {/* 步骤内容 - 使用不同的字体大小和颜色与正文区分 */}
                <div className="text-[12px] text-slate-600 leading-relaxed pl-7">
                  {step.content ? (
                    <MarkdownRenderer content={step.content} />
                  ) : (
                    <span className="text-slate-400 italic">处理中...</span>
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
