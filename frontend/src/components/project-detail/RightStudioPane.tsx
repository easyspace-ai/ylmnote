import { type ReactNode } from 'react'

interface RightStudioPaneProps {
  collapsed: boolean
  width: number
  onResizeStart: (e: React.MouseEvent) => void
  children: ReactNode
}

export function RightStudioPane({ collapsed, width, onResizeStart, children }: RightStudioPaneProps) {
  return (
    <aside
      className="flex flex-col bg-white flex-shrink-0 overflow-hidden relative rounded-xl border border-gray-100 shadow-sm"
      style={{
        width: collapsed ? '0px' : `${width}px`,
        transition: collapsed ? 'width 200ms cubic-bezier(0.4,0,0.2,1)' : 'none',
      }}
    >
      {!collapsed && (
        <div
          className="absolute top-0 left-0 w-1 h-full cursor-col-resize hover:bg-indigo-400 active:bg-indigo-500 z-50 transition-colors"
          onMouseDown={onResizeStart}
        />
      )}
      {children}
    </aside>
  )
}

