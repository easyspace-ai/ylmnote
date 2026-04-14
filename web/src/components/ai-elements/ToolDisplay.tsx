/**
 * ToolDisplay - 工具调用显示组件
 *
 * 显示 AI 调用的工具及其结果
 */

import { useState } from 'react'
import { cn } from '@/utils'
import {
  Wrench,
  ChevronDown,
  CheckCircle2,
  XCircle,
  Loader2,
  Terminal,
  Globe,
  FileSearch,
  Database,
} from 'lucide-react'
import type { ToolCall } from './types'

interface ToolDisplayProps {
  tool: ToolCall
  className?: string
}

// 工具图标映射
const toolIcons: Record<string, typeof Wrench> = {
  search: Globe,
  web_search: Globe,
  read_file: FileSearch,
  write_file: FileSearch,
  execute: Terminal,
  run_command: Terminal,
  query: Database,
  default: Wrench,
}

// 获取工具图标
function getToolIcon(toolName: string) {
  const normalizedName = toolName.toLowerCase()
  for (const [key, icon] of Object.entries(toolIcons)) {
    if (normalizedName.includes(key)) {
      return icon
    }
  }
  return toolIcons.default
}

// 格式化参数
function formatArgs(args?: Record<string, unknown>): string {
  if (!args) return ''
  try {
    return JSON.stringify(args, null, 2)
  } catch {
    return String(args)
  }
}

// 格式化结果
function formatResult(result: unknown): string {
  if (typeof result === 'string') return result
  try {
    return JSON.stringify(result, null, 2)
  } catch {
    return String(result)
  }
}

export function ToolDisplay({ tool, className }: ToolDisplayProps) {
  const [expanded, setExpanded] = useState(false)
  const Icon = getToolIcon(tool.name)

  const statusConfig = {
    calling: {
      icon: Loader2,
      className: 'text-amber-500',
      bgClass: 'bg-amber-50 border-amber-200',
      label: '调用中...',
    },
    success: {
      icon: CheckCircle2,
      className: 'text-emerald-500',
      bgClass: 'bg-emerald-50 border-emerald-200',
      label: '成功',
    },
    error: {
      icon: XCircle,
      className: 'text-red-500',
      bgClass: 'bg-red-50 border-red-200',
      label: '失败',
    },
  }

  const config = statusConfig[tool.status]
  const StatusIcon = config.icon

  return (
    <div
      className={cn(
        'rounded-lg border overflow-hidden transition-all duration-200',
        config.bgClass,
        className
      )}
    >
      {/* 头部 */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-black/5 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Icon size={14} className={config.className} />
          <span className="text-xs font-medium text-gray-700">{tool.name}</span>
          {tool.duration && (
            <span className="text-[10px] text-gray-400">
              {tool.duration > 1000
                ? `${(tool.duration / 1000).toFixed(1)}s`
                : `${tool.duration}ms`}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="flex items-center gap-1 text-[10px] text-gray-500">
            <StatusIcon size={10} className={config.className} />
            {config.label}
          </span>
        </div>
      </button>

      {/* 展开内容 */}
      {expanded && (
        <div className="px-3 pb-3 space-y-2 border-t border-black/5">
          {/* 参数 */}
          {tool.arguments && Object.keys(tool.arguments).length > 0 && (
            <div className="pt-2">
              <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">
                参数
              </span>
              <pre className="mt-1 p-2 bg-black/5 rounded text-[11px] text-gray-700 overflow-x-auto font-mono">
                {formatArgs(tool.arguments)}
              </pre>
            </div>
          )}

          {/* 结果 */}
          {tool.result !== undefined && (
            <div>
              <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">
                结果
              </span>
              <pre className="mt-1 p-2 bg-black/5 rounded text-[11px] text-gray-700 overflow-x-auto font-mono max-h-32 overflow-y-auto">
                {formatResult(tool.result)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
