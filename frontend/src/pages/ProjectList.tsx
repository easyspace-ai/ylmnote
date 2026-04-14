import { useState } from "react"
import { 
  Plus, Clock, MoreVertical, Pencil, Archive, Trash2, Grid, List, 
  Search, FolderOpen, Sparkles, Filter, ArrowUpDown
} from 'lucide-react'
import { cn } from '@/utils'
import { useAppStore } from '@/stores/apiStore'
import { useProjectsList } from '@/hooks/useProjectsList'
import { queryClient } from '@/lib/queryClient'
import { Link, useNavigate } from 'react-router-dom'

type FilterType = 'recent' | 'active' | 'archived'
type ViewMode = 'grid' | 'list'
type SortBy = 'updated' | 'created' | 'name'

// 项目卡片操作菜单
function ProjectCardMenu({ 
  projectId, 
  status,
  onRename,
  onArchive, 
  onDelete 
}: { 
  projectId: string
  status: string
  onRename: (id: string) => void
  onArchive: (id: string) => void
  onDelete: (id: string) => void
}) {
  const [isOpen, setIsOpen] = useState(false)
  
  return (
    <div className="relative" onClick={(e) => e.preventDefault()}>
      <button 
        onClick={(e) => { e.preventDefault(); setIsOpen(!isOpen) }}
        className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
      >
        <MoreVertical size={16} />
      </button>
      {isOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />
          <div className="absolute right-0 top-full mt-1 bg-white rounded-xl border border-gray-100 shadow-xl shadow-gray-900/10 z-20 min-w-[160px] py-1 animate-fade-in">
            <button
              onClick={(e) => { e.preventDefault(); onRename(projectId); setIsOpen(false) }}
              className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <Pencil size={14} className="text-gray-400" />
              <span>重命名</span>
            </button>
            <button
              onClick={(e) => { e.preventDefault(); onArchive(projectId); setIsOpen(false) }}
              className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <Archive size={14} className="text-gray-400" />
              <span>{status === 'archived' ? '取消归档' : '归档'}</span>
            </button>
            <div className="h-px bg-gray-100 my-1" />
            <button
              onClick={(e) => { e.preventDefault(); onDelete(projectId); setIsOpen(false) }}
              className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-danger-600 hover:bg-danger-50 transition-colors"
            >
              <Trash2 size={14} />
              <span>删除</span>
            </button>
          </div>
        </>
      )}
    </div>
  )
}

export default function ProjectList() {
  const navigate = useNavigate()
  const { createProject, updateProject, deleteProject } = useAppStore()
  const { data: projects = [], isFetching: loading } = useProjectsList()
  
  const [searchQuery, setSearchQuery] = useState('')
  const [activeFilter, setActiveFilter] = useState<FilterType>('recent')
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [sortBy, setSortBy] = useState<SortBy>('updated')
  
  // 过滤和排序
  const displayProjects = projects
    .filter(project => {
      if (activeFilter === 'recent' && project.status === 'archived') return false
      if (activeFilter === 'active' && project.status !== 'active') return false
      if (activeFilter === 'archived' && project.status !== 'archived') return false
      
      if (searchQuery) {
        const query = searchQuery.toLowerCase()
        return project.name.toLowerCase().includes(query) || 
               project.description?.toLowerCase().includes(query)
      }
      return true
    })
    .sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name)
      if (sortBy === 'created') return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    })
  
  const handleRename = async (id: string) => {
    const project = projects.find(p => p.id === id)
    if (!project) return
    const newName = prompt('重命名项目:', project.name)
    if (newName && newName !== project.name) {
      await updateProject(id, { name: newName } as any)
      void queryClient.invalidateQueries({ queryKey: ['projects'] })
    }
  }

  const handleArchive = async (id: string, currentStatus: string) => {
    try {
      const newStatus = currentStatus === 'archived' ? 'active' : 'archived'
      await updateProject(id, { status: newStatus })
      void queryClient.invalidateQueries({ queryKey: ['projects'] })
    } catch (e) {
      console.error(e)
    }
  }

  const handleDelete = async (id: string) => {
    if (window.confirm("确定要删除这个项目吗？")) {
      try {
        await deleteProject(id)
        void queryClient.invalidateQueries({ queryKey: ['projects'] })
      } catch (e) {
        console.error(e)
      }
    }
  }
  
  const handleCreateProject = async () => {
    const project = await createProject({ name: '新项目' })
    if (project) {
      void queryClient.invalidateQueries({ queryKey: ['projects'] })
      navigate(`/boards/${project.id}`)
    }
  }
  
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const hours = Math.floor(diff / (1000 * 60 * 60))
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))
    
    if (hours < 1) return '刚刚'
    if (hours < 24) return `${hours}小时前`
    if (days < 7) return `${days}天前`
    return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
  }
  
  return (
    <div className="h-full bg-gray-25">
      {/* 标题栏 */}
      <div className="sticky top-0 z-10 bg-white/80 backdrop-blur-xl border-b border-gray-100 px-8 py-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center shadow-lg shadow-primary-500/20">
              <FolderOpen className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-h1 text-gray-900">项目</h1>
              <p className="text-sm text-gray-500">管理你的所有 AI 协作项目</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <button className="btn-ghost">
              <Clock size={18} />
              <span>定时任务</span>
            </button>
            <button
              onClick={handleCreateProject}
              className="btn-primary"
            >
              <Plus size={18} />
              <span>新建项目</span>
            </button>
          </div>
        </div>
      </div>
      
      <div className="px-8 py-6">
        {/* 搜索和筛选栏 */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-2 p-1 bg-white rounded-xl border border-gray-200 shadow-sm">
            {[
              { key: 'recent', label: '最近', count: projects.filter(p => p.status !== 'archived').length },
              { key: 'active', label: '活跃中', count: projects.filter(p => p.status === 'active').length },
              { key: 'archived', label: '已归档', count: projects.filter(p => p.status === 'archived').length },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveFilter(tab.key as FilterType)}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200",
                  activeFilter === tab.key
                    ? "bg-gray-900 text-white shadow-sm"
                    : "text-gray-600 hover:bg-gray-50"
                )}
              >
                {tab.label}
                <span className={cn(
                  "text-xs px-1.5 py-0.5 rounded-full",
                  activeFilter === tab.key ? "bg-white/20" : "bg-gray-100 text-gray-500"
                )}>
                  {tab.count}
                </span>
              </button>
            ))}
          </div>
          
          <div className="flex items-center gap-3">
            {/* 搜索框 */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="搜索项目..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="input-base pl-9 w-64"
              />
            </div>
            
            {/* 排序 */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortBy)}
              className="input-base w-32 cursor-pointer"
            >
              <option value="updated">最近更新</option>
              <option value="created">创建时间</option>
              <option value="name">名称</option>
            </select>
            
            {/* 视图切换 */}
            <div className="flex items-center p-1 bg-white rounded-lg border border-gray-200">
              <button
                onClick={() => setViewMode('grid')}
                className={cn(
                  "p-2 rounded-md transition-colors",
                  viewMode === 'grid' ? "bg-gray-100 text-gray-900" : "text-gray-400 hover:text-gray-600"
                )}
              >
                <Grid size={18} />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={cn(
                  "p-2 rounded-md transition-colors",
                  viewMode === 'list' ? "bg-gray-100 text-gray-900" : "text-gray-400 hover:text-gray-600"
                )}
              >
                <List size={18} />
              </button>
            </div>
          </div>
        </div>
        
        {/* 项目列表 */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-12 h-12 border-3 border-gray-200 border-t-primary-600 rounded-full animate-spin mb-4" />
            <p className="text-gray-500">加载中...</p>
          </div>
        ) : displayProjects.length > 0 ? (
          viewMode === 'grid' ? (
            /* 网格视图 */
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {displayProjects.map((project) => (
                <Link
                  key={project.id}
                  to={`/boards/${project.id}`}
                  className="group card-interactive overflow-hidden"
                >
                  {/* 封面 */}
                  <div className="aspect-[4/3] bg-gradient-to-br from-gray-100 to-gray-50 flex items-center justify-center relative overflow-hidden">
                    <div className="w-16 h-16 rounded-2xl bg-white/80 backdrop-blur-sm flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform duration-300">
                      <Sparkles className="w-8 h-8 text-gray-300 group-hover:text-primary-500 transition-colors" />
                    </div>
                    
                    {/* 归档标记 */}
                    {project.status === 'archived' && (
                      <div className="absolute top-3 left-3 badge badge-secondary">
                        已归档
                      </div>
                    )}
                    
                    {/* 悬浮操作菜单 */}
                    <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                      <ProjectCardMenu 
                        projectId={project.id}
                        status={project.status}
                        onRename={handleRename}
                        onArchive={() => handleArchive(project.id, project.status)}
                        onDelete={handleDelete}
                      />
                    </div>
                  </div>
                  
                  {/* 信息 */}
                  <div className="p-4">
                    <h3 className="font-semibold text-gray-900 mb-1 truncate group-hover:text-primary-600 transition-colors">
                      {project.name}
                    </h3>
                    <p className="text-sm text-gray-500 truncate mb-3">
                      {project.description || '暂无描述'}
                    </p>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-400">{formatDate(project.updated_at)}</span>
                      <div className="w-2 h-2 rounded-full bg-emerald-400" />
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            /* 列表视图 */
            <div className="space-y-2">
              {displayProjects.map((project) => (
                <Link
                  key={project.id}
                  to={`/boards/${project.id}`}
                  className="flex items-center gap-4 p-4 bg-white hover:bg-gray-50 border border-gray-200 hover:border-gray-300 rounded-xl transition-all duration-200 group"
                >
                  {/* 缩略图 */}
                  <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-gray-100 to-gray-50 flex items-center justify-center flex-shrink-0">
                    <Sparkles className="w-6 h-6 text-gray-300 group-hover:text-primary-500 transition-colors" />
                  </div>
                  
                  {/* 信息 */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-gray-900 truncate group-hover:text-primary-600 transition-colors">
                        {project.name}
                      </h3>
                      {project.status === 'archived' && (
                        <span className="badge badge-secondary">已归档</span>
                      )}
                    </div>
                    <p className="text-sm text-gray-500 truncate">{project.description || '暂无描述'}</p>
                  </div>
                  
                  {/* 更新时间 */}
                  <div className="text-sm text-gray-400">
                    {formatDate(project.updated_at)}
                  </div>
                  
                  {/* 操作菜单 */}
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                    <ProjectCardMenu 
                      projectId={project.id}
                      status={project.status}
                      onRename={handleRename}
                      onArchive={() => handleArchive(project.id, project.status)}
                      onDelete={handleDelete}
                    />
                  </div>
                </Link>
              ))}
            </div>
          )
        ) : (
          /* 空状态 */
          <div className="empty-state">
            <div className="empty-state-icon">
              <FolderOpen className="w-10 h-10 text-gray-300" />
            </div>
            <h3 className="empty-state-title">
              {searchQuery ? '没有找到匹配的项目' : '还没有项目'}
            </h3>
            <p className="empty-state-desc">
              {searchQuery ? '试试其他关键词' : '创建你的第一个项目，开始 AI 协作之旅'}
            </p>
            {!searchQuery && (
              <button
                onClick={handleCreateProject}
                className="btn-primary"
              >
                <Plus size={18} />
                创建项目
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
