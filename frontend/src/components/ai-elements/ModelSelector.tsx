/**
 * ModelSelector - AI 模型选择器
 *
 * 支持搜索和选择不同的 AI 模型
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import { cn } from '@/utils'
import { ChevronDown, Check, Search, Sparkles } from 'lucide-react'
import type { ModelOption } from './types'

interface ModelSelectorProps {
  selectedModel: string
  onSelect: (modelId: string) => void
  models?: ModelOption[]
  loading?: boolean
  className?: string
}

// 默认模型列表（如果没有提供）
const defaultModels: ModelOption[] = [
  {
    id: 'google/gemini-3-flash-preview',
    name: 'Gemini 3 Flash',
    provider: 'Google',
    contextLength: 128000,
    pricing: { prompt: 0, completion: 0 },
  },
  {
    id: 'anthropic/claude-3-5-sonnet',
    name: 'Claude 3.5 Sonnet',
    provider: 'Anthropic',
    contextLength: 200000,
    pricing: { prompt: 0.003, completion: 0.015 },
  },
  {
    id: 'openai/gpt-4o',
    name: 'GPT-4o',
    provider: 'OpenAI',
    contextLength: 128000,
    pricing: { prompt: 0.005, completion: 0.015 },
  },
]

export function ModelSelector({
  selectedModel,
  onSelect,
  models: providedModels,
  loading = false,
  className,
}: ModelSelectorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [models, setModels] = useState<ModelOption[]>(providedModels || defaultModels)
  const [isLoading, setIsLoading] = useState(loading)

  // 获取模型列表（如果未提供）
  useEffect(() => {
    if (providedModels) {
      setModels(providedModels)
      return
    }

    const fetchModels = async () => {
      try {
        setIsLoading(true)
        const API_URL = (import.meta as any).env?.VITE_API_URL || ''
        const res = await fetch(`${API_URL}/api/models`)
        if (res.ok) {
          const data = await res.json()
          if (data.models?.length > 0) {
            setModels(data.models)
          }
        }
      } catch (e) {
        console.error('Failed to fetch models:', e)
      } finally {
        setIsLoading(false)
      }
    }

    fetchModels()
  }, [providedModels])

  // 过滤模型
  const filteredModels = useMemo(() => {
    if (!search) return models
    const query = search.toLowerCase()
    return models.filter(
      (m) =>
        m.id.toLowerCase().includes(query) ||
        m.name.toLowerCase().includes(query) ||
        m.provider?.toLowerCase().includes(query)
    )
  }, [models, search])

  // 获取显示名称
  const displayName = useCallback((id: string) => {
    const parts = id.split('/')
    return parts.length >= 2 ? parts.slice(-1)[0] : id
  }, [])

  const selected = models.find((m) => m.id === selectedModel)

  return (
    <div className={cn('relative', className)}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1 px-2 py-1 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors max-w-[140px]"
        title={selectedModel}
      >
        <Sparkles size={12} className="text-indigo-400" />
        <span className="truncate">{selected?.name || displayName(selectedModel)}</span>
        <ChevronDown size={10} className="shrink-0" />
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => {
              setIsOpen(false)
              setSearch('')
            }}
          />
          <div className="absolute left-0 bottom-full mb-1 w-80 max-h-[360px] bg-white rounded-xl border border-gray-100 shadow-xl shadow-gray-900/10 z-20 flex flex-col animate-fade-in">
            {/* 搜索框 */}
            <div className="p-2 border-b border-gray-100">
              <div className="relative">
                <Search
                  size={14}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                />
                <input
                  type="text"
                  placeholder="搜索模型..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  autoFocus
                  className="w-full pl-9 pr-3 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-lg outline-none focus:border-gray-300"
                />
              </div>
            </div>

            {/* 列表 */}
            <div className="flex-1 overflow-y-auto py-1">
              {isLoading ? (
                <div className="py-6 text-center text-xs text-gray-400">加载中...</div>
              ) : filteredModels.length > 0 ? (
                filteredModels.slice(0, 50).map((m) => {
                  const isFree = (m.pricing?.prompt || 0) === 0
                  const isSelected = selectedModel === m.id

                  return (
                    <button
                      key={m.id}
                      onClick={() => {
                        onSelect(m.id)
                        setIsOpen(false)
                        setSearch('')
                      }}
                      className={cn(
                        'flex items-center justify-between w-full px-3 py-2.5 text-left hover:bg-gray-50 transition-colors',
                        isSelected && 'bg-indigo-50'
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={cn(
                              'font-medium text-sm truncate',
                              isSelected ? 'text-indigo-700' : 'text-gray-800'
                            )}
                          >
                            {m.name}
                          </span>
                          {isFree && (
                            <span className="px-1.5 py-0.5 bg-emerald-50 text-emerald-600 text-[10px] font-medium rounded-full shrink-0">
                              Free
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-gray-400 truncate block">{m.id}</span>
                      </div>
                      {isSelected && <Check size={12} className="text-indigo-500 shrink-0 ml-2" />}
                    </button>
                  )
                })
              ) : (
                <div className="py-6 text-center text-xs text-gray-400">没有匹配的模型</div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
