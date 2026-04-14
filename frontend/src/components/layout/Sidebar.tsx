import { Link, useLocation } from 'react-router-dom'
import {
  Plus, Search, FolderOpen, Settings, LogOut,
  Home, ChevronLeft, ChevronRight, Zap, Sparkles,
} from 'lucide-react'
import { cn } from '@/utils'
import { useAppStore } from '@/stores/apiStore'
import { useAuthStore } from '@/stores/authStore'
import { useEffect, useState } from 'react'
import { create } from 'zustand'
import GlobalSearch from '@/components/GlobalSearch'

export const useSidebarStore = create<{
  sidebarCollapsed: boolean
  setSidebarCollapsed: (b: boolean) => void
}>(set => ({
  sidebarCollapsed: false,
  setSidebarCollapsed: (b) => set({ sidebarCollapsed: b }),
}))

const navItems = [
  { icon: Home, label: '主页', path: '/' },
  { icon: Search, label: '搜索', path: '/search' },
  { icon: FolderOpen, label: '项目', path: '/boards' },
  { icon: Zap, label: '技能', path: '/skills' },
]

export default function Sidebar() {
  const location = useLocation()
  const { projects, fetchProjects } = useAppStore()
  const { user, logout } = useAuthStore()
  const { sidebarCollapsed, setSidebarCollapsed } = useSidebarStore()
  const [userHovered, setUserHovered] = useState(false)

  useEffect(() => {
    fetchProjects()
  }, [fetchProjects])

  const toggle = () => setSidebarCollapsed(!sidebarCollapsed)

  const isActive = (path: string) =>
    path === '/'
      ? location.pathname === '/'
      : location.pathname.startsWith(path)

  return (
    <aside
      className={cn(
        'flex flex-col bg-white border-r border-gray-100 transition-all duration-200 overflow-hidden shrink-0',
        sidebarCollapsed ? 'w-sidebarCollapsed' : 'w-sidebar'
      )}
    >
      {/* ── Logo ─────────────────────────────────────── */}
      <div
        className={cn(
          'flex items-center border-b border-gray-50 px-4 py-4',
          sidebarCollapsed ? 'flex-col gap-3 items-center' : 'justify-between'
        )}
      >
        {sidebarCollapsed ? (
          <>
            <Link to="/" className="shrink-0">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
            </Link>
            {/* Expand button */}
            <button
              onClick={toggle}
              title="展开导航栏"
              className="w-8 h-8 rounded-full bg-gray-100 hover:bg-primary-50 flex items-center justify-center text-gray-400 hover:text-primary-600 transition-colors duration-150"
            >
              <ChevronRight size={16} />
            </button>
          </>
        ) : (
          <>
            <Link to="/" className="flex items-center gap-2.5 min-w-0">
              <img
                src="/logo.jpg"
                alt="MetaNote"
                className="w-9 h-9 rounded-xl object-cover shrink-0"
              />
              <span className="font-bold text-lg text-gray-900 tracking-tight truncate">MetaNote</span>
            </Link>
            {/* Collapse button */}
            <button
              onClick={toggle}
              title="收起导航栏"
              className="w-8 h-8 rounded-full bg-gray-100 hover:bg-primary-50 flex items-center justify-center text-gray-400 hover:text-primary-600 transition-colors duration-150 shrink-0"
            >
              <ChevronLeft size={16} />
            </button>
          </>
        )}
      </div>

      {/* ── New Project ───────────────────────────────── */}
      <div className={cn('px-3 py-3', sidebarCollapsed && 'flex justify-center')}>
        <Link
          to="/boards/new"
          className={cn(
            'flex items-center justify-center gap-2 bg-gray-900 hover:bg-gray-800 text-white font-medium rounded-xl py-2.5 transition-colors duration-150',
            sidebarCollapsed ? 'w-10 h-10 p-0 rounded-xl' : 'w-full px-4'
          )}
        >
          <Plus size={18} />
          {!sidebarCollapsed && <span className="text-sm">新建项目</span>}
        </Link>
      </div>

      {/* ── Global Search (expanded only) ────────────── */}
      {!sidebarCollapsed && (
        <div className="px-3 pb-3">
          <GlobalSearch 
            placeholder="搜索项目、技能..." 
            className="w-full"
          />
        </div>
      )}

      {/* ── Nav ──────────────────────────────────────── */}
      <nav className="flex-1 overflow-y-auto px-3 py-1 space-y-1">
        {navItems.map((item) => {
          const active = isActive(item.path)
          return (
            <Link
              key={item.path}
              to={item.path}
              title={sidebarCollapsed ? item.label : undefined}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors duration-150',
                sidebarCollapsed && 'justify-center px-0',
                active
                  ? 'bg-gray-100 text-gray-900 font-medium'
                  : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'
              )}
            >
              <item.icon
                size={18}
                className={cn(
                  'shrink-0',
                  active ? 'text-gray-900' : 'text-gray-400'
                )}
              />
              {!sidebarCollapsed && <span>{item.label}</span>}
            </Link>
          )
        })}

        {/* ── Projects list (expanded only) ─────────── */}
        {!sidebarCollapsed && projects.length > 0 && (
          <div className="pt-4">
            <p className="px-3 mb-1 text-xs font-medium text-gray-400 uppercase tracking-wider">
              我的项目
            </p>
            <div className="space-y-0.5">
              {projects.slice(0, 5).map((project) => (
                <Link
                  key={project.id}
                  to={`/boards/${project.id}`}
                  className={cn(
                    'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors duration-150 group',
                    location.pathname.includes(project.id)
                      ? 'bg-gray-100 text-gray-900 font-medium'
                      : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'
                  )}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                  <span className="truncate flex-1">{project.name}</span>
                </Link>
              ))}
              {projects.length > 5 && (
                <Link
                  to="/boards"
                  className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors duration-150"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-gray-300 shrink-0" />
                  <span>查看全部 {projects.length} 个</span>
                </Link>
              )}
            </div>
          </div>
        )}
      </nav>

      {/* ── User ─────────────────────────────────────── */}
      <div className="border-t border-gray-100 p-3">
        {sidebarCollapsed ? (
          /* Collapsed: avatar only */
          <div className="flex justify-center">
            <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center border border-gray-200">
              <span className="text-sm font-semibold text-gray-600">
                {(user?.username || 'U').charAt(0).toUpperCase()}
              </span>
            </div>
          </div>
        ) : (
          /* Expanded: avatar + name + hover actions */
          <div
            className="flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-gray-50 transition-colors duration-150 cursor-default group"
            onMouseEnter={() => setUserHovered(true)}
            onMouseLeave={() => setUserHovered(false)}
          >
            <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center border border-gray-200 shrink-0">
              <span className="text-sm font-semibold text-gray-600">
                {(user?.username || 'U').charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-800 truncate leading-tight">
                {user?.username || '用户'}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">{user?.credits_balance != null ? `积分: ${Math.floor(user.credits_balance)}` : ''}</p>
            </div>
            {/* Actions — only visible on hover */}
            <div
              className={cn(
                'flex items-center gap-0.5 transition-opacity duration-150',
                userHovered ? 'opacity-100' : 'opacity-0'
              )}
            >
              <Link
                to="/settings"
                className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors duration-150"
                title="设置"
              >
                <Settings size={15} />
              </Link>
              <button
                onClick={() => { logout(); window.location.href = '/login' }}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-danger-500 hover:bg-danger-50 transition-colors duration-150"
                title="退出"
              >
                <LogOut size={15} />
              </button>
            </div>
          </div>
        )}
      </div>
    </aside>
  )
}
