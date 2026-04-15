/**
 * ThinkingProcess — 思考过程：时间线卡片，默认折叠，流式时在折叠态也有明确「进行中」感知
 */

import { useMemo, useState } from 'react'
import { cn } from '@/utils'
import { BookOpen, ChevronDown } from 'lucide-react'
import type { ChatMessage } from './types'
import type { ThinkingStepTone } from './thinkingLabels'
import { getThinkingStepLabel, getThinkingStepTone, summarizeUpstreamKinds } from './thinkingLabels'
import { MarkdownRenderer } from '../MarkdownRenderer'

function toneBadgeClass(tone: ThinkingStepTone): string {
  switch (tone) {
    case 'system':
      return 'border border-stone-200 bg-white text-stone-800 shadow-sm'
    case 'reasoning':
      return 'bg-stone-200/70 text-stone-800'
    case 'internal':
      return 'bg-slate-200/70 text-slate-800'
    case 'subliminal':
      return 'border border-dashed border-stone-300 bg-stone-50 text-stone-700'
    default:
      return 'bg-stone-100 text-stone-700'
  }
}

interface ThinkingProcessProps {
  steps: ChatMessage[]
  isStreaming?: boolean
  isLatestGroup?: boolean
  className?: string
}

/** 粗略识别路径 / 技能文件，用于展示为标签 pill */
function splitPathSegments(content: string): { before: string; path: string; after: string } | null {
  const m = content.match(/([\s\S]*?)((?:\/[\w./-]+\.(?:md|txt|json|yaml|yml|ts|tsx|js|py|go))(?:\s|$))([\s\S]*)/)
  if (!m) return null
  return { before: m[1], path: m[2].trim(), after: m[3] }
}

export function ThinkingProcess({
  steps,
  isStreaming = false,
  isLatestGroup = false,
  className,
}: ThinkingProcessProps) {
  const [expanded, setExpanded] = useState(false)

  const activeStreaming = Boolean(isStreaming && isLatestGroup)

  const totalThinkingTime = steps.reduce((sum, step) => sum + (step.thinkingTime || 0), 0)
  const formattedTime =
    totalThinkingTime > 1000
      ? `${(totalThinkingTime / 1000).toFixed(1)}s`
      : totalThinkingTime > 0
        ? `${totalThinkingTime}ms`
        : ''

  const previewLine = useMemo(() => {
    const last = steps[steps.length - 1]
    const raw = (last?.content || '').replace(/\s+/g, ' ').trim()
    if (!raw) return ''
    return raw.length > 96 ? `${raw.slice(0, 96)}…` : raw
  }, [steps])

  const kindMixLine = useMemo(() => (steps.length > 0 ? summarizeUpstreamKinds(steps) : ''), [steps])

  return (
    <div
      className={cn(
        'rounded-xl border bg-stone-50/90 text-stone-800 shadow-sm shadow-stone-900/5',
        activeStreaming ? 'border-amber-200/90 ring-1 ring-amber-100/80' : 'border-stone-200/90',
        className
      )}
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-label={expanded ? '隐藏思考步骤' : '展开思考步骤'}
        className={cn(
          'w-full flex items-start gap-2 px-3.5 py-2.5 text-left rounded-xl transition-colors',
          'hover:bg-stone-100/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-400/40'
        )}
      >
        <ChevronDown
          size={16}
          className={cn(
            'mt-0.5 shrink-0 text-stone-500 transition-transform duration-200 ease-out',
            expanded && 'rotate-180'
          )}
          aria-hidden
        />

        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-[13px] font-medium text-stone-800">思考过程</span>
            {steps.length > 0 && (
              <span className="text-[10px] font-medium tabular-nums text-stone-500 bg-stone-200/60 px-1.5 py-0.5 rounded-md">
                {steps.length} 步
              </span>
            )}
            {formattedTime ? (
              <span className="text-[10px] tabular-nums text-stone-400">{formattedTime}</span>
            ) : null}
            {activeStreaming && (
              <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-amber-800/90">
                <span
                  className="size-1.5 rounded-full bg-amber-500 motion-safe:animate-pulse motion-reduce:animate-none motion-reduce:opacity-80"
                  aria-hidden
                />
                进行中
              </span>
            )}
          </div>

          {!expanded && kindMixLine && (
            <p className="text-[11px] text-stone-500 leading-snug text-pretty">{kindMixLine}</p>
          )}
          {!expanded && previewLine && (
            <p className="text-[12px] text-stone-500 leading-snug line-clamp-2 text-pretty">{previewLine}</p>
          )}
        </div>

        <span className="shrink-0 text-[11px] text-stone-400 pt-0.5">
          {expanded ? '隐藏步骤' : '展开步骤'}
        </span>
      </button>

      {expanded && (
        <div className="border-t border-stone-200/80 px-3.5 pb-3.5 pt-1">
          <div className="relative pl-2">
            <div
              className="absolute left-[11px] top-2 bottom-2 w-px bg-stone-200"
              aria-hidden
            />
            <ul className="space-y-0 list-none m-0 p-0">
              {steps.map((step) => {
                const tone = getThinkingStepTone(step)
                const label = getThinkingStepLabel(step)
                const pathSplit = splitPathSegments(step.content || '')
                return (
                  <li key={step.id} className="relative pl-8 pb-4 last:pb-0">
                    <span
                      className="absolute left-1 top-2 size-2 rounded-full border-2 border-white bg-stone-400 shadow-sm ring-1 ring-stone-200"
                      aria-hidden
                    />
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        {tone === 'system' ? (
                          <span className="inline-flex items-center gap-1 rounded-md border border-stone-200 bg-white px-1.5 py-0.5 text-[11px] font-semibold text-stone-700 shadow-sm">
                            <BookOpen size={12} className="text-stone-500 shrink-0" aria-hidden />
                            {label}
                          </span>
                        ) : (
                          <span
                            className={cn(
                              'inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-semibold',
                              toneBadgeClass(tone)
                            )}
                          >
                            {label}
                          </span>
                        )}
                        {step.thinkingTime != null && step.thinkingTime > 0 && (
                          <span className="text-[10px] tabular-nums text-stone-400">
                            {step.thinkingTime > 1000
                              ? `${(step.thinkingTime / 1000).toFixed(1)}s`
                              : `${step.thinkingTime}ms`}
                          </span>
                        )}
                      </div>

                      <div className="text-[12px] text-stone-600 leading-relaxed text-pretty">
                        {pathSplit ? (
                          <div className="space-y-2">
                            {pathSplit.before.trim() ? (
                              <MarkdownRenderer content={pathSplit.before.trim()} />
                            ) : null}
                            <code className="block w-fit max-w-full truncate rounded-lg bg-stone-100 px-2 py-1 text-[11px] text-stone-600">
                              {pathSplit.path}
                            </code>
                            {pathSplit.after.trim() ? (
                              <MarkdownRenderer content={pathSplit.after.trim()} />
                            ) : null}
                          </div>
                        ) : step.content ? (
                          <MarkdownRenderer content={step.content} />
                        ) : (
                          <span className="text-stone-400 italic">
                            {activeStreaming ? '写入中…' : '（空）'}
                          </span>
                        )}
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}
