/**
 * AttachmentList - 附件列表组件
 */

import { cn } from '@/utils'
import { FileText, X, HardDrive, Folder, Link2 } from 'lucide-react'
import type { Attachment } from './types'

interface AttachmentListProps {
  attachments: Attachment[]
  onRemove?: (id: string) => void
  className?: string
  maxHeight?: number
}

// 获取附件图标
function getAttachmentIcon(type: Attachment['type']) {
  switch (type) {
    case 'local':
      return <HardDrive size={12} className="text-gray-400" />
    case 'library':
      return <Folder size={12} className="text-amber-400" />
    case 'url':
      return <Link2 size={12} className="text-blue-400" />
    default:
      return <FileText size={12} className="text-gray-400" />
  }
}

// 格式化文件大小
function formatSize(bytes?: number): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function AttachmentList({
  attachments,
  onRemove,
  className,
  maxHeight,
}: AttachmentListProps) {
  if (attachments.length === 0) return null

  return (
    <div
      className={cn('flex flex-wrap gap-1.5', className)}
      style={maxHeight ? { maxHeight, overflowY: 'auto' } : undefined}
    >
      {attachments.map((attachment) => (
        <div
          key={attachment.id}
          className={cn(
            'flex items-center gap-1.5 px-2.5 py-1.5',
            'bg-indigo-50/80 border border-indigo-100',
            'text-xs text-indigo-700 rounded-lg',
            'group transition-all duration-200',
            'hover:bg-indigo-100 hover:border-indigo-200'
          )}
        >
          {getAttachmentIcon(attachment.type)}
          <span className="truncate max-w-[100px] font-medium">{attachment.name}</span>
          {attachment.size && (
            <span className="text-indigo-400 text-[10px]">{formatSize(attachment.size)}</span>
          )}
          {onRemove && (
            <button
              onClick={() => onRemove(attachment.id)}
              className={cn(
                'p-0.5 ml-0.5 rounded transition-all duration-200',
                'opacity-60 hover:opacity-100',
                'hover:bg-indigo-200/50'
              )}
            >
              <X size={10} />
            </button>
          )}
        </div>
      ))}
    </div>
  )
}
