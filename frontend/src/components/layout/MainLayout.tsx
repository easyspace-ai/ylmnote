import { ReactNode } from 'react'
import Sidebar from './Sidebar'

interface MainLayoutProps {
  children: ReactNode
}

export default function MainLayout({ children }: MainLayoutProps) {
  return (
    <div className="flex h-screen bg-gray-25 overflow-hidden">
      {/* 左侧导航栏 */}
      <Sidebar />
      
      {/* 主内容区 */}
      <main className="flex-1 overflow-hidden flex flex-col">
        <div className="flex-1 overflow-auto">
          {children}
        </div>
      </main>
    </div>
  )
}
