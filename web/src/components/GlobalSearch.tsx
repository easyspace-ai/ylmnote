import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, X, ArrowRight, FolderOpen, Zap, FileText, Loader2 } from 'lucide-react'
import { cn } from '@/utils'
import { searchApi, SearchResult } from '@/services/api'

export interface SearchItem {
  id: string
  name: string
  icon?: string
  description?: string
  category?: string
  type: 'project' | 'skill' | 'document'
  shortcut?: string
}

interface GlobalSearchProps {
  placeholder?: string
  onFocus?: () => void
  className?: string
  showShortcut?: boolean
}

// 搜索结果项
function SearchItemRow({
  item,
  isSelected,
  onClick,
}: {
  item: SearchItem
  isSelected: boolean
  onClick: () => void
}) {
  const getIcon = () => {
    switch (item.type) {
      case 'project':
        return <FolderOpen size={16} className="text-primary-500" />
      case 'skill':
        return <Zap size={16} className="text-amber-500" />
      case 'document':
        return <FileText size={16} className="text-gray-400" />
      default:
        return null
    }
  }

  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 w-full px-4 py-3 text-left transition-colors",
        isSelected ? "bg-gray-100" : "hover:bg-gray-50"
      )}
    >
      <span className="text-lg w-8 h-8 flex items-center justify-center bg-gray-100 rounded-lg">
        {item.icon ? item.icon : getIcon()}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm">{item.name}</span>
          {item.category && (
            <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
              {item.category}
            </span>
          )}
        </div>
        {item.description && (
          <p className="text-xs text-gray-500 truncate">{item.description}</p>
        )}
      </div>
      {item.shortcut && (
        <div className="flex items-center gap-1 text-xs text-gray-400">
          <kbd className="px-1.5 py-0.5 bg-gray-100 border border-gray-200 text-gray-500 rounded">
            {item.shortcut}
          </kbd>
        </div>
      )}
      <ArrowRight size={14} className="text-gray-300" />
    </button>
  )
}

// 分类标题
function CategoryHeader({ title, count }: { title: string; count: number }) {
  return (
    <div className="px-4 py-2 text-xs font-medium text-gray-400 bg-gray-50 flex items-center justify-between">
      <span>{title}</span>
      <span className="text-gray-300">{count}</span>
    </div>
  )
}

export default function GlobalSearch({
  placeholder = '搜索项目、技能...',
  onFocus,
  className,
  showShortcut = true,
}: GlobalSearchProps) {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<SearchResult | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<number | null>(null)

  // 防抖搜索
  const performSearch = useCallback(async (keyword: string) => {
    if (!keyword.trim()) {
      setResults(null)
      setLoading(false)
      return
    }

    setLoading(true)
    try {
      const data = await searchApi.search(keyword, 5)
      setResults(data)
    } catch (error) {
      console.error('Search error:', error)
      setResults(null)
    } finally {
      setLoading(false)
    }
  }, [])

  // 防抖处理
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }

    if (query.trim()) {
      setLoading(true)
      debounceRef.current = setTimeout(() => {
        performSearch(query)
      }, 300) // 300ms 防抖
    } else {
      setResults(null)
      setLoading(false)
    }

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }
    }
  }, [query, performSearch])

  // 转换结果为 SearchItem 格式
  const searchItems: SearchItem[] = []
  
  if (results) {
    // Projects
    results.projects.forEach(p => {
      searchItems.push({
        id: p.id,
        name: p.name,
        description: p.description,
        category: '项目',
        type: 'project',
      })
    })
    
    // Skills
    results.skills.forEach(s => {
      searchItems.push({
        id: s.id,
        name: s.name,
        description: s.description,
        icon: s.icon,
        category: s.category || '技能',
        type: 'skill',
      })
    })
    
    // Documents (placeholder for future)
    results.documents.forEach(d => {
      searchItems.push({
        id: d.id,
        name: d.name,
        description: d.content_preview,
        category: '文档',
        type: 'document',
      })
    })
  }

  // 分组
  const groupedItems = searchItems.reduce((acc, item) => {
    const category = item.category || '全部'
    if (!acc[category]) acc[category] = []
    acc[category].push(item)
    return acc
  }, {} as Record<string, SearchItem[]>)
  
  // 键盘导航
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return
      
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          setSelectedIndex(i => Math.min(i + 1, searchItems.length - 1))
          break
        case 'ArrowUp':
          e.preventDefault()
          setSelectedIndex(i => Math.max(i - 1, 0))
          break
        case 'Enter':
          e.preventDefault()
          if (searchItems[selectedIndex]) {
            handleSelect(searchItems[selectedIndex])
          }
          break
        case 'Escape':
          setIsOpen(false)
          inputRef.current?.blur()
          break
      }
    }
    
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, selectedIndex, searchItems])
  
  // 全局快捷键 Cmd/Ctrl + K
  useEffect(() => {
    const handleGlobalShortcut = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
        setIsOpen(true)
      }
    }
    
    document.addEventListener('keydown', handleGlobalShortcut)
    return () => document.removeEventListener('keydown', handleGlobalShortcut)
  }, [])
  
  // 滚动到选中项
  useEffect(() => {
    if (listRef.current) {
      const selectedElement = listRef.current.querySelector(`[data-index="${selectedIndex}"]`)
      if (selectedElement) {
        selectedElement.scrollIntoView({ block: 'nearest' })
      }
    }
  }, [selectedIndex])
  
  const handleSelect = (item: SearchItem) => {
    // 根据类型跳转
    switch (item.type) {
      case 'project':
        navigate(`/boards/${item.id}`)
        break
      case 'skill':
        navigate(`/skills?id=${item.id}`)
        break
      case 'document':
        if (item.id) {
          // TODO: 未来支持文档跳转
          navigate(`/boards/${item.id}`)
        }
        break
    }
    
    setQuery('')
    setIsOpen(false)
    setSelectedIndex(0)
    setResults(null)
  }
  
  const handleChange = (value: string) => {
    setQuery(value)
    setSelectedIndex(0)
  }
  
  const handleClear = () => {
    setQuery('')
    setResults(null)
    setLoading(false)
    inputRef.current?.focus()
  }

  return (
    <div className={cn("relative", className)}>
      {/* 搜索输入框 */}
      <div className="relative">
        <Search
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
        />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => { setIsOpen(true); onFocus?.() }}
          onBlur={() => setTimeout(() => setIsOpen(false), 200)}
          placeholder={placeholder}
          className="w-full pl-10 pr-10 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-gray-500 focus:ring-1 focus:ring-gray-200 bg-white transition-all"
        />
        {loading && (
          <Loader2
            size={14}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 animate-spin"
          />
        )}
        {query && !loading && (
          <button
            onClick={handleClear}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
          >
            <X size={14} />
          </button>
        )}
        {showShortcut && !query && !loading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 text-xs text-gray-400">
            <kbd className="px-1.5 py-0.5 bg-gray-100 border border-gray-200 rounded">⌘</kbd>
            <kbd className="px-1.5 py-0.5 bg-gray-100 border border-gray-200 rounded">K</kbd>
          </div>
        )}
      </div>
      
      {/* 搜索结果下拉 */}
      {isOpen && query.trim() && (
        <div
          ref={listRef}
          className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 shadow-lg rounded-lg z-50 max-h-80 overflow-y-auto"
        >
          {loading ? (
            <div className="px-4 py-8 text-center text-gray-400 text-sm flex items-center justify-center gap-2">
              <Loader2 size={16} className="animate-spin" />
              <span>搜索中...</span>
            </div>
          ) : searchItems.length > 0 ? (
            Object.entries(groupedItems).map(([category, categoryItems]) => (
              <div key={category}>
                <CategoryHeader title={category} count={categoryItems.length} />
                {categoryItems.map((item) => {
                  const globalIndex = searchItems.findIndex(i => i.id === item.id && i.type === item.type)
                  return (
                    <div key={`${item.type}-${item.id}`} data-index={globalIndex}>
                      <SearchItemRow
                        item={item}
                        isSelected={selectedIndex === globalIndex}
                        onClick={() => handleSelect(item)}
                      />
                    </div>
                  )
                })}
              </div>
            ))
          ) : (
            <div className="px-4 py-8 text-center text-gray-500 text-sm">
              没有找到 "{query}" 相关结果
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// 简单搜索框（不带下拉）
export function SimpleSearch({
  placeholder = '搜索...',
  value,
  onChange,
  className,
}: {
  placeholder?: string
  value: string
  onChange: (value: string) => void
  className?: string
}) {
  return (
    <div className={cn("relative", className)}>
      <Search
        size={16}
        className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
      />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full pl-9 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-gray-500 bg-white"
      />
      {value && (
        <button
          onClick={() => onChange('')}
          className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
        >
          <X size={14} />
        </button>
      )}
    </div>
  )
}

// 斜杠命令搜索（用于 AI 对话框）
export function SlashCommandSearch({
  isOpen,
  query,
  items,
  onSelect,
  onClose,
}: {
  isOpen: boolean
  query: string
  items: SearchItem[]
  onSelect: (item: SearchItem) => void
  onClose: () => void
}) {
  const [selectedIndex, setSelectedIndex] = useState(0)
  
  const filteredItems = items.filter(item =>
    item.name.toLowerCase().includes(query.toLowerCase())
  )
  
  useEffect(() => {
    setSelectedIndex(0)
  }, [query])
  
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return
      
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          setSelectedIndex(i => Math.min(i + 1, filteredItems.length - 1))
          break
        case 'ArrowUp':
          e.preventDefault()
          setSelectedIndex(i => Math.max(i - 1, 0))
          break
        case 'Enter':
          e.preventDefault()
          if (filteredItems[selectedIndex]) {
            onSelect(filteredItems[selectedIndex])
          }
          break
        case 'Escape':
          onClose()
          break
      }
    }
    
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, selectedIndex, filteredItems])
  
  if (!isOpen || !query) return null
  
  return (
    <div className="absolute bottom-full left-0 right-0 mb-1 bg-white border border-gray-200 shadow-lg rounded-lg z-20 max-h-60 overflow-y-auto">
      <div className="px-3 py-2 text-xs text-gray-400 border-b border-gray-100">
        技能命令
      </div>
      {filteredItems.length > 0 ? (
        filteredItems.map((item, index) => (
          <button
            key={item.id}
            onClick={() => onSelect(item)}
            className={cn(
              "flex items-center gap-3 w-full px-4 py-2.5 text-left transition-colors",
              selectedIndex === index ? "bg-gray-100" : "hover:bg-gray-50"
            )}
          >
            <span className="text-base">{item.icon}</span>
            <div className="flex-1 min-w-0">
              <span className="text-sm font-medium">{item.name}</span>
              {item.description && (
                <span className="text-xs text-gray-400 ml-2">{item.description}</span>
              )}
            </div>
            <kbd className="px-1.5 py-0.5 text-xs bg-gray-100 border border-gray-200 text-gray-400 rounded">
              Enter
            </kbd>
          </button>
        ))
      ) : (
        <div className="px-4 py-4 text-center text-gray-400 text-sm">
          没有匹配的技能
        </div>
      )}
    </div>
  )
}