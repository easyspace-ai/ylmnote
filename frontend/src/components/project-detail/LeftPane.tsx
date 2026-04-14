import { type ReactNode } from 'react'

interface LeftPaneProps {
  collapsed: boolean
  width: number
  onResizeStart: (e: React.MouseEvent) => void
  children: ReactNode
}

export function LeftPane({ collapsed, width, onResizeStart, children }: LeftPaneProps) {
  return (
    <aside
      className="flex flex-col bg-white flex-shrink-0 overflow-hidden relative rounded-xl border border-gray-100 shadow-sm"
      style={{
        width: collapsed ? '48px' : `${width}px`,
        transition: collapsed ? 'width 200ms cubic-bezier(0.4,0,0.2,1)' : 'none',
      }}
    >
      {children}
      {!collapsed && (
        <div
          className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-indigo-400 active:bg-indigo-500 z-50 transition-colors"
          onMouseDown={onResizeStart}
        />
      )}
    </aside>
  )
}

