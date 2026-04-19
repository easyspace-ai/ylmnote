/**
 * StreamingIndicator - 流式响应指示器
 *
 * 显示 AI 正在生成响应的动画效果
 */

import { cn } from '@/utils'

interface StreamingIndicatorProps {
  className?: string
  variant?: 'default' | 'minimal' | 'pulse'
}

export function StreamingIndicator({
  className,
  variant = 'default',
}: StreamingIndicatorProps) {
  if (variant === 'minimal') {
    return (
      <div className={cn('flex items-center gap-1', className)}>
        <span className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce" />
        <span className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce [animation-delay:100ms]" />
        <span className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce [animation-delay:200ms]" />
      </div>
    )
  }

  if (variant === 'pulse') {
    return (
      <div className={cn('flex items-center gap-2', className)}>
        {/* <div className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
        <span className="text-xs text-gray-500">生成中...</span> */}
      </div>
    )
  }

  // 默认变体 - 彩色方块动画
  return (
    <div className={cn('flex justify-start', className)}>
      <div className="bg-gray-50 rounded-2xl rounded-tl-md px-4 py-3">
        <div className="relative w-5 h-5">
          <div className="absolute inset-0 flex items-center justify-center">
            <div
              className="w-5 h-5 grid grid-cols-2 gap-0.5 animate-spin"
              style={{ animationDuration: '3s' }}
            >
              <div
                className="bg-indigo-400 rounded-sm animate-pulse"
                style={{ animationDelay: '0s' }}
              />
              <div
                className="bg-purple-400 rounded-sm animate-pulse"
                style={{ animationDelay: '0.2s' }}
              />
              <div
                className="bg-fuchsia-400 rounded-sm animate-pulse"
                style={{ animationDelay: '0.6s' }}
              />
              <div
                className="bg-blue-400 rounded-sm animate-pulse"
                style={{ animationDelay: '0.4s' }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
