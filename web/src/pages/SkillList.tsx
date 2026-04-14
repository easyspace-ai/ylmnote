import { useMemo, useState, useEffect } from 'react'
import { Plus, X, Search } from 'lucide-react'
import { cn } from '@/utils'
import { useAppStore } from '@/stores/apiStore'

const actionOptions = [
  { value: 'ppt', label: 'PPT' },
  { value: 'dynamic_web', label: '动态网页' },
  { value: 'quiz', label: '测验' },
  { value: 'mind_map', label: '思维导图' },
  { value: 'image', label: '图片' },
  { value: 'custom', label: '自定义' },
] as const

function PromptTemplateModal({
  isOpen,
  onClose,
  mode,
  initialData,
  onSubmit,
}: {
  isOpen: boolean
  onClose: () => void
  mode: 'create' | 'edit'
  initialData?: { action_type: string; name: string; prompt: string }
  onSubmit: (data: { action_type: string; name: string; prompt: string }) => Promise<void>
}) {
  const [saving, setSaving] = useState(false)
  const [actionType, setActionType] = useState(initialData?.action_type || 'custom')
  const [name, setName] = useState('')
  const [prompt, setPrompt] = useState('')

  useEffect(() => {
    if (!isOpen) return
    setActionType(initialData?.action_type || 'custom')
    setName(initialData?.name || '')
    setPrompt(initialData?.prompt || '')
  }, [isOpen, initialData])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="text-lg font-semibold text-gray-900">{mode === 'create' ? '新增 Studio 动作' : '编辑 Studio 动作'}</h3>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
            <X size={18} />
          </button>
        </div>
        
        <div className="p-6 space-y-4 overflow-y-auto">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">动作类型</label>
            <select
              value={actionType}
              onChange={(e) => setActionType(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all"
            >
              {actionOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">动作名称</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all"
              placeholder="例如：PPT、动态网页"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">系统设定 (Prompt)</label>
            <textarea
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all min-h-[120px] resize-none"
              placeholder="描述这个技能的系统指令，例如：你是一个专业的论文翻译助手，请你将接收到的英文翻译为中文..."
            />
          </div>
        </div>
        
        <div className="flex items-center justify-end px-6 py-4 border-t border-gray-100 bg-gray-50 gap-3 mt-auto">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
            取消
          </button>
          <button 
            onClick={async () => {
              if (!name.trim() || !prompt.trim()) return
              setSaving(true)
              try {
                await onSubmit({ action_type: actionType, name: name.trim(), prompt: prompt.trim() })
                onClose()
              } finally {
                setSaving(false)
              }
            }}
            disabled={saving || !name.trim() || !prompt.trim()}
            className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors"
          >
            {saving ? '保存中...' : mode === 'create' ? '确认创建' : '保存修改'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function SkillList() {
  const {
    promptTemplates,
    loading,
    fetchPromptTemplates,
    createPromptTemplate,
    updatePromptTemplate,
  } = useAppStore()
  
  const [searchQuery, setSearchQuery] = useState('')
  const [editingTemplate, setEditingTemplate] = useState<any | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)

  useEffect(() => {
    fetchPromptTemplates()
  }, [fetchPromptTemplates])

  const filteredTemplates = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return promptTemplates
    return promptTemplates.filter((item) =>
      item.name.toLowerCase().includes(q) ||
      item.prompt.toLowerCase().includes(q) ||
      item.action_type.toLowerCase().includes(q)
    )
  }, [promptTemplates, searchQuery])
  
  return (
    <div className="flex flex-col h-screen bg-white">
      <header className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
        <h1 className="text-lg font-semibold text-gray-900">技能</h1>
        <button
          type="button"
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-1.5 px-3 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors"
        >
          <Plus size={15} />
          <span>新动作</span>
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-6 pb-6">
        <div className="flex items-center justify-between py-4 gap-3">
          <div className="text-sm text-gray-500">
            共 <span className="font-semibold text-gray-900">{promptTemplates.length}</span> 条动作
          </div>
          <div className="relative w-64">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索名称/提示词/类型"
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
            />
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <p className="text-sm text-gray-400">加载中...</p>
          </div>
        ) : filteredTemplates.length > 0 ? (
          <div className="space-y-2">
            {filteredTemplates.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-3 px-4 py-3 rounded-xl border border-gray-100 hover:border-gray-200 hover:shadow-sm cursor-pointer transition-all duration-200"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <h3 className="text-sm font-medium text-gray-800 truncate">{item.name}</h3>
                    <span className="px-2 py-0.5 bg-gray-100 text-gray-500 text-[11px] rounded-full flex-shrink-0">
                      {item.action_type}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 line-clamp-2">{item.prompt}</p>
                </div>
                <button
                  onClick={() => setEditingTemplate(item)}
                  className="px-3 py-1.5 text-xs text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  编辑
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-16">
            <p className="text-sm text-gray-400">
              {searchQuery ? '没有找到匹配记录' : '暂无动作记录'}
            </p>
          </div>
        )}
      </div>

      <PromptTemplateModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        mode="create"
        onSubmit={async (payload) => {
          await createPromptTemplate(payload)
          await fetchPromptTemplates()
        }}
      />
      <PromptTemplateModal
        isOpen={!!editingTemplate}
        onClose={() => setEditingTemplate(null)}
        mode="edit"
        initialData={editingTemplate || undefined}
        onSubmit={async (payload) => {
          if (!editingTemplate?.id) return
          await updatePromptTemplate(editingTemplate.id, payload)
          await fetchPromptTemplates()
          setEditingTemplate(null)
        }}
      />
    </div>
  )
}
