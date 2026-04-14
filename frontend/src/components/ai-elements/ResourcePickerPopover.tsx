/**
 * 资料区列表浮层 — 替代居中「从资料库选择」弹窗
 */

import { cn } from '@/utils'
import { Folder, X } from 'lucide-react'

interface ResourcePickerPopoverProps {
  files: { id: string; name: string }[]
  onPick: (file: { id: string; name: string }) => void
  onClose: () => void
  className?: string
}

export function ResourcePickerPopover({
  files,
  onPick,
  onClose,
  className,
}: ResourcePickerPopoverProps) {
  return (
    <>
      <div className="fixed inset-0 z-40" aria-hidden onClick={onClose} />
      <div
        className={cn(
          'absolute left-0 right-0 bottom-full z-50 mb-2 flex max-h-[min(320px,45vh)] flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl shadow-gray-900/10',
          className
        )}
        role="listbox"
        aria-label="从资料库选择"
      >
        <div className="flex flex-shrink-0 items-center justify-between border-b border-gray-100 px-3 py-2">
          <span className="text-xs font-semibold text-gray-800">从资料库选择</span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            aria-label="关闭"
          >
            <X size={14} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto py-1">
          {files.length > 0 ? (
            files.map((file) => (
              <button
                key={file.id}
                type="button"
                role="option"
                onClick={() => {
                  onPick(file)
                  onClose()
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
              >
                <div className="rounded-lg bg-gray-100 p-1.5">
                  <Folder size={14} className="text-gray-400" />
                </div>
                <span className="min-w-0 flex-1 truncate">{file.name}</span>
              </button>
            ))
          ) : (
            <div className="px-4 py-6 text-center text-xs text-gray-400">暂无可用资料</div>
          )}
        </div>
      </div>
    </>
  )
}
