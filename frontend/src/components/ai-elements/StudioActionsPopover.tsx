/**
 * Studio 动作选择浮层 — 与右侧 Studio 栏相同数据源与执行逻辑
 */

import { cn } from '@/utils'
import { BookOpen, Settings2, Zap, Check } from 'lucide-react'
import type { StudioAction } from './types'

interface StudioActionsPopoverProps {
  tools: StudioAction[]
  selectedToolId?: string | null
  onPick: (tool: StudioAction) => void
  onClose: () => void
  onExploreMore?: () => void
  onManage?: () => void
  className?: string
}

export function StudioActionsPopover({
  tools,
  selectedToolId,
  onPick,
  onClose,
  onExploreMore,
  onManage,
  className,
}: StudioActionsPopoverProps) {
  return (
    <>
      <div className="fixed inset-0 z-40" aria-hidden onClick={onClose} />
      <div
        className={cn(
          'absolute left-0 right-0 bottom-full z-50 mb-2 rounded-xl border border-gray-200 bg-white shadow-xl shadow-gray-900/10 overflow-hidden flex flex-col max-h-[min(360px,50vh)]',
          className
        )}
        role="listbox"
        aria-label="Studio 动作"
      >
        <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100 bg-gray-50/80">
          <Zap size={14} className="text-indigo-500 shrink-0" />
          <span className="text-xs font-semibold text-gray-800">选择技能</span>
        </div>
        <div className="overflow-y-auto py-1">
          {tools.length > 0 ? (
            tools.map((tool) => {
              const isSelected = selectedToolId === tool.id
              return (
                <button
                  key={tool.id}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => onPick(tool)}
                  className={cn(
                    'flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-xs font-medium transition-colors',
                    isSelected ? 'bg-indigo-50' : 'hover:bg-gray-50'
                  )}
                >
                  <span className="flex items-center gap-2">
                    <span
                      className={cn(
                        'truncate rounded-lg bg-gradient-to-br px-2.5 py-1 shadow-sm',
                        tool.color,
                        tool.textColor
                      )}
                    >
                      {tool.label}
                    </span>
                    {isSelected && (
                      <Check size={14} className="text-indigo-500" />
                    )}
                  </span>
                  <span className="shrink-0 text-[10px] text-gray-400">AI</span>
                </button>
              )
            })
          ) : (
            <div className="px-4 py-6 text-center text-xs text-gray-400">
              暂无 Studio 动作，请在设置中配置提示词模板
            </div>
          )}
        </div>
        {(onExploreMore || onManage) && (
          <div className="flex items-center justify-between gap-2 border-t border-gray-100 px-2 py-2 bg-gray-50/60">
            {onExploreMore ? (
              <button
                type="button"
                onClick={() => {
                  onExploreMore()
                  onClose()
                }}
                className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-gray-600 hover:bg-white hover:text-gray-900"
              >
                <BookOpen size={13} className="text-gray-400" />
                探索更多
              </button>
            ) : (
              <span />
            )}
            {onManage ? (
              <button
                type="button"
                onClick={() => {
                  onManage()
                  onClose()
                }}
                className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
              >
                管理
              </button>
            ) : null}
          </div>
        )}
      </div>
    </>
  )
}
