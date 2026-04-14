import { type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Home, PanelLeft, PanelLeftClose, FileOutput, Pencil } from 'lucide-react'
import { cn } from '@/utils'

interface ProjectHeaderProps {
  title?: string
  isLeftCollapsed: boolean
  isRightCollapsed: boolean
  onToggleLeft: () => void
  onToggleRight: () => void
  onRename: () => void
  rightSlot?: ReactNode
}

export function ProjectHeader({
  title,
  isLeftCollapsed,
  isRightCollapsed,
  onToggleLeft,
  onToggleRight,
  onRename,
  rightSlot,
}: ProjectHeaderProps) {
  return (
    <header
      className="flex items-center justify-between bg-white border-b border-gray-100 flex-shrink-0"
      style={{ height: '48px', paddingLeft: '16px', paddingRight: '16px' }}
    >
      <div className="flex items-center gap-1.5">
        <button
          onClick={onToggleLeft}
          className={cn(
            'flex items-center justify-center w-8 h-8 rounded-full transition-colors',
            isLeftCollapsed
              ? 'bg-primary-50 text-primary-600 hover:bg-primary-100'
              : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
          )}
          title={isLeftCollapsed ? '展开资料栏' : '收起资料栏'}
        >
          {isLeftCollapsed ? <PanelLeft size={14} /> : <PanelLeftClose size={14} />}
        </button>
        <Link
          to="/"
          className="flex items-center gap-1.5 text-sm font-bold text-gray-400 hover:text-indigo-600 transition-colors duration-200 px-2 py-1 rounded-md hover:bg-gray-100"
          title="返回主页"
        >
          <Home size={18} />
        </Link>
      </div>

      <div className="flex items-center gap-1 group cursor-pointer" onClick={onRename} title="点击修改项目名称">
        <span className="text-sm font-semibold text-gray-900 truncate max-w-xs">{title || '项目名称'}</span>
        <Pencil size={12} className="text-gray-300 group-hover:text-indigo-500 transition-colors" />
      </div>

      <div className="flex items-center gap-1">
        <button
          onClick={onToggleRight}
          className={cn(
            'flex items-center justify-center w-8 h-8 rounded-full transition-colors',
            isRightCollapsed
              ? 'bg-primary-50 text-primary-600 hover:bg-primary-100'
              : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
          )}
          title={isRightCollapsed ? '展开输出栏' : '收起输出栏'}
        >
          <FileOutput size={14} />
        </button>
        {rightSlot}
      </div>
    </header>
  )
}

