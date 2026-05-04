import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, FolderOpen, Zap, FileText, Loader2, ArrowRight } from 'lucide-react'
import { searchApi, SearchResult } from '@/services/api'
import { useAppStore } from '@/stores/apiStore'

export default function SearchPage() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<SearchResult | null>(null)

  const performSearch = useCallback(async (keyword: string) => {
    if (!keyword.trim()) {
      setResults(null)
      return
    }
    setLoading(true)
    try {
      const data = await searchApi.search(keyword, 50)
      setResults(data)
    } catch (error) {
      console.error('Search error:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      performSearch(query)
    }, 400)
    return () => clearTimeout(delayDebounceFn)
  }, [query, performSearch])

  return (
    <div className="flex flex-col h-full bg-white">
      {/* 顶部搜索栏 */}
      <div className="flex items-center px-8 py-6 border-b border-gray-100">
        <div className="relative w-full max-w-3xl mx-auto">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索笔记、技能或文档细节..."
            className="w-full pl-12 pr-4 py-4 text-base border border-gray-200 rounded-2xl focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all shadow-sm"
            autoFocus
          />
          {loading && (
            <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 text-indigo-500 animate-spin" size={20} />
          )}
        </div>
      </div>

      {/* 结果区域 */}
      <div className="flex-1 overflow-y-auto p-8">
        <div className="max-w-3xl mx-auto space-y-8">
          {!query.trim() && (
            <div className="text-center py-20">
              <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <Search size={24} className="text-gray-300" />
              </div>
              <h3 className="text-sm font-medium text-gray-900 mb-1">全局搜索</h3>
              <p className="text-sm text-gray-500">输入关键字以查找任意笔记、对话或技能</p>
            </div>
          )}

          {query.trim() && !loading && !results?.projects?.length && !results?.skills?.length && !results?.documents?.length && (
            <div className="text-center py-20">
              <p className="text-sm text-gray-500">没有找到与 "{query}" 相关的结果</p>
            </div>
          )}

          {/* 笔记结果 */}
          {results?.projects && results.projects.length > 0 && (
            <section>
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">笔记 & 对话 ({results.projects.length})</h2>
              <div className="grid gap-2">
                {results.projects.map((project) => (
                  <button
                    key={project.id}
                    onClick={() => navigate(`/boards/${project.id}`)}
                    className="flex items-center gap-4 p-4 text-left border border-gray-100 rounded-xl hover:border-indigo-100 hover:shadow-md hover:shadow-indigo-500/5 transition-all group bg-white"
                  >
                    <div className="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-500 shrink-0 group-hover:scale-110 transition-transform">
                      <FolderOpen size={20} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-semibold text-gray-900 truncate">{project.name}</h4>
                      {project.description && <p className="text-xs text-gray-500 truncate mt-0.5">{project.description}</p>}
                    </div>
                    <ArrowRight size={16} className="text-gray-300 opacity-0 group-hover:opacity-100 -translate-x-2 group-hover:translate-x-0 transition-all" />
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* 技能结果 */}
          {results?.skills && results.skills.length > 0 && (
            <section>
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">技能 ({results.skills.length})</h2>
              <div className="grid gap-2">
                {results.skills.map((skill) => (
                  <button
                    key={skill.id}
                    onClick={() => navigate(`/skills?id=${skill.id}`)}
                    className="flex items-center gap-4 p-4 text-left border border-gray-100 rounded-xl hover:border-amber-100 hover:shadow-md hover:shadow-amber-500/5 transition-all group bg-white"
                  >
                    <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center text-amber-500 shrink-0 group-hover:scale-110 transition-transform">
                      <Zap size={20} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-semibold text-gray-900 truncate">{skill.name}</h4>
                      {skill.description && <p className="text-xs text-gray-500 truncate mt-0.5">{skill.description}</p>}
                    </div>
                    <ArrowRight size={16} className="text-gray-300 opacity-0 group-hover:opacity-100 -translate-x-2 group-hover:translate-x-0 transition-all" />
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* 文档结果 */}
          {results?.documents && results.documents.length > 0 && (
            <section>
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">资料库 & 文档 ({results.documents.length})</h2>
              <div className="grid gap-2">
                {results.documents.map((doc) => (
                  <button
                    key={doc.id}
                    onClick={() => doc.project_id && navigate(`/boards/${doc.project_id}`)}
                    className="flex items-center gap-4 p-4 text-left border border-gray-100 rounded-xl hover:border-blue-100 hover:shadow-md hover:shadow-blue-500/5 transition-all group bg-white"
                  >
                    <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center text-blue-500 shrink-0 group-hover:scale-110 transition-transform">
                      <FileText size={20} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-semibold text-gray-900 truncate">{doc.name}</h4>
                      {doc.content_preview && <p className="text-xs text-gray-500 truncate mt-0.5">{doc.content_preview}</p>}
                    </div>
                    <ArrowRight size={16} className="text-gray-300 opacity-0 group-hover:opacity-100 -translate-x-2 group-hover:translate-x-0 transition-all" />
                  </button>
                ))}
              </div>
            </section>
          )}

        </div>
      </div>
    </div>
  )
}
