/**
 * ModeSelector - 聊天模式选择器
 */

import { useState } from 'react'
import { cn } from '@/utils'
import { MessageSquare, Bot, HelpCircle, Search, ChevronDown } from 'lucide-react'
import type { ChatMode } from './types'

interface ModeSelectorProps {
  mode: ChatMode
  onChange: (mode: ChatMode) => void
  className?: string
}

const modeConfig: Record<
  ChatMode,
  {
    label: string
    description: string
    icon: typeof MessageSquare
    colors: string
  }
> = {
  chat: {
    label: 'Chat',
    description: '普通对话模式',
    icon: MessageSquare,
    colors: 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100',
  },
  agent: {
    label: 'Agent',
    description: '智能体模式（支持工具调用）',
    icon: Bot,
    colors: 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100',
  },
  ask: {
    label: 'Ask',
    description: '问答模式',
    icon: HelpCircle,
    colors: 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100',
  },
  query: {
    label: 'Query',
    description: '查询模式',
    icon: Search,
    colors: 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100',
  },
}

export function ModeSelector({ mode, onChange, className }: ModeSelectorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const current = modeConfig[mode]
  const CurrentIcon = current.icon

  return (
    <div className={cn('relative', className)}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-all duration-200',
          current.colors
        )}
      >
        <CurrentIcon size={12} />
        <span>{current.label}</span>
        <ChevronDown
          size={12}
          className={cn('transition-transform duration-200', isOpen && 'rotate-180')}
        />
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />
          <div className="absolute left-0 bottom-full mb-2 bg-white rounded-xl border border-gray-100 shadow-xl shadow-gray-900/10 z-20 min-w-[200px] overflow-hidden py-1">
            {(Object.keys(modeConfig) as ChatMode[]).map((m) => {
              const config = modeConfig[m]
              const Icon = config.icon
              const isActive = mode === m

              return (
                <button
                  key={m}
                  onClick={() => {
                    onChange(m)
                    setIsOpen(false)
                  }}
                  className={cn(
                    'flex items-center gap-3 w-full px-3 py-2.5 text-left transition-colors',
                    isActive ? 'bg-gray-50' : 'hover:bg-gray-50'
                  )}
                >
                  <div
                    className={cn(
                      'flex items-center justify-center w-8 h-8 rounded-lg',
                      isActive ? config.colors : 'bg-gray-100 text-gray-500'
                    )}
                  >
                    <Icon size={14} />
                  </div>
                  <div className="flex flex-col">
                    <span
                      className={cn(
                        'text-sm font-medium',
                        isActive ? 'text-gray-900' : 'text-gray-700'
                      )}
                    >
                      {config.label}
                    </span>
                    <span className="text-xs text-gray-500">{config.description}</span>
                  </div>
                </button>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
