/**
 * TodoList - 待办事项列表组件
 *
 * 显示 AI 生成的待办事项，支持展开/折叠
 */

import { useState } from 'react'
import { cn } from '@/utils'
import { ChevronDown, CheckCircle2, Circle, Clock } from 'lucide-react'

interface TodoItem {
  id: string
  text: string
  done: boolean
  priority?: 'low' | 'medium' | 'high'
  metadata?: Record<string, unknown>
}

interface TodoListProps {
  items: TodoItem[]
  isGenerating?: boolean
  defaultCollapsed?: boolean
  className?: string
  onItemToggle?: (id: string, done: boolean) => void
  onItemClick?: (item: TodoItem) => void
}

// 优先级配置
const priorityConfig = {
  low: {
    color: 'text-blue-500',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-100',
    label: '低',
  },
  medium: {
    color: 'text-amber-500',
    bgColor: 'bg-amber-50',
    borderColor: 'border-amber-100',
    label: '中',
  },
  high: {
    color: 'text-red-500',
    bgColor: 'bg-red-50',
    borderColor: 'border-red-100',
    label: '高',
  },
}

export function TodoList({
  items,
  isGenerating = false,
  defaultCollapsed = false,
  className,
  onItemToggle,
  onItemClick,
}: TodoListProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed)

  const completedCount = items.filter((item) => item.done).length
  const progress = items.length > 0 ? (completedCount / items.length) * 100 : 0

  return (
    <div
      className={cn(
        'rounded-2xl border border-gray-200 bg-gradient-to-br from-gray-50/80 to-white/60',
        'overflow-hidden shadow-sm shadow-gray-900/5',
        'backdrop-blur-sm',
        className
      )}
    >
      {/* 头部 - 可点击折叠 */}
      <button
        onClick={() => setCollapsed((v) => !v)}
        className={cn(
          'w-full flex items-center justify-between px-4 py-3',
          'text-sm font-medium text-gray-800',
          'hover:bg-gray-100/50 transition-colors duration-200',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-300/50'
        )}
      >
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500/10 to-purple-500/10">
            <CheckCircle2 size={16} className="text-indigo-600" />
          </div>
          <div className="flex flex-col items-start">
            <span>待办事项</span>
            <span className="text-xs text-gray-500 font-normal">
              {completedCount}/{items.length} 已完成
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* 进度条 */}
          <div className="hidden sm:block w-24 h-1.5 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-500 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>

          {/* 折叠指示器 */}
          <ChevronDown
            size={16}
            className={cn(
              'text-gray-400 transition-transform duration-300',
              collapsed && '-rotate-90'
            )}
          />
        </div>
      </button>

      {/* 待办列表内容 */}
      <div
        className={cn(
          'grid transition-all duration-300 ease-out',
          collapsed ? 'grid-rows-[0fr]' : 'grid-rows-[1fr]'
        )}
      >
        <div className="overflow-hidden">
          <div className="border-t border-gray-100 px-3 pb-3 pt-1 space-y-1">
            {items.length > 0 ? (
              items.map((item) => {
                const priority = item.priority || 'medium'
                const config = priorityConfig[priority]

                return (
                  <div
                    key={item.id}
                    onClick={() => onItemClick?.(item)}
                    className={cn(
                      'group flex items-center gap-2.5 rounded-lg',
                      'border border-gray-100 bg-white',
                      'px-2.5 py-2 text-xs',
                      'transition-all duration-200',
                      'hover:border-gray-200 hover:shadow-sm hover:shadow-gray-900/5',
                      'cursor-pointer'
                    )}
                  >
                    {/* 复选框 */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onItemToggle?.(item.id, !item.done)
                      }}
                      className={cn(
                        'flex-shrink-0 flex items-center justify-center',
                        'w-4 h-4 rounded border transition-all duration-200',
                        item.done
                          ? 'bg-emerald-500 border-emerald-500 text-white'
                          : 'border-gray-300 hover:border-gray-400 bg-white'
                      )}
                    >
                      {item.done && <CheckCircle2 size={10} />}
                    </button>

                    {/* 文本 */}
                    <span
                      className={cn(
                        'flex-1 leading-relaxed transition-all duration-200',
                        item.done ? 'text-gray-400 line-through' : 'text-gray-700'
                      )}
                    >
                      {item.text}
                    </span>

                    {/* 优先级标签 */}
                    <span
                      className={cn(
                        'flex-shrink-0 px-1.5 py-0.5 rounded text-[9px] font-medium',
                        config.bgColor,
                        config.color,
                        config.borderColor
                      )}
                    >
                      {config.label}
                    </span>
                  </div>
                )
              })
            ) : isGenerating ? (
              <div className="flex items-center gap-2 text-xs text-gray-400 px-1 py-2">
                <Clock size={12} className="animate-pulse" />
                <span>正在生成待办列表...</span>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}
