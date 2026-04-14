import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Sparkles, FileText, BookOpen, FileEdit, Lightbulb, Check } from 'lucide-react'
import { cn } from '@/utils'
import { useAppStore } from '@/stores/apiStore'
import { queryClient } from '@/lib/queryClient'

const templates = [
  { 
    id: 'blank', 
    name: '空白项目', 
    icon: FileText, 
    description: '从零开始创建',
    color: 'from-gray-400 to-gray-500'
  },
  { 
    id: 'research', 
    name: '深度研究', 
    icon: BookOpen, 
    description: '研究分析任务',
    color: 'from-blue-400 to-cyan-500'
  },
  { 
    id: 'writing', 
    name: '内容创作', 
    icon: FileEdit, 
    description: '文章和内容',
    color: 'from-orange-400 to-amber-500'
  },
  { 
    id: 'learning', 
    name: '学习笔记', 
    icon: Lightbulb, 
    description: '知识整理',
    color: 'from-purple-400 to-pink-500'
  },
]

export default function NewProject() {
  const navigate = useNavigate()
  const { createProject } = useAppStore()
  const [isCreating, setIsCreating] = useState(false)
  
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    template: 'blank',
  })
  
  const [errors, setErrors] = useState({ name: '' })
  
  const validate = () => {
    if (!formData.name.trim()) {
      setErrors({ name: '请输入项目名称' })
      return false
    }
    setErrors({ name: '' })
    return true
  }
  
  const handleCreate = async () => {
    if (!validate()) return
    setIsCreating(true)
    try {
      const project = await createProject({
        name: formData.name,
        description: formData.description,
      })
      void queryClient.invalidateQueries({ queryKey: ['projects'] })
      navigate(`/boards/${project.id}`)
    } catch (e) {
      console.error('Failed to create project', e)
      setIsCreating(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="w-full max-w-lg">
        {/* 顶部返回 */}
        <button 
          onClick={() => navigate(-1)} 
          className="flex items-center gap-2 mb-8 text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          <ArrowLeft size={16} />
          返回
        </button>

        {/* 标题 */}
        <div className="mb-8">
          <div className="w-12 h-12 bg-gradient-to-br from-primary-500 to-primary-700 rounded-2xl flex items-center justify-center shadow-lg shadow-primary-500/25 mb-4">
            <Sparkles size={24} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">新建项目</h1>
          <p className="text-sm text-gray-500 mt-1">填写基本信息，资料和技能可以之后再添加</p>
        </div>

        {/* 表单卡片 */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5">
          {/* 项目名称 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">项目名称 <span className="text-red-500">*</span></label>
            <input
              type="text"
              autoFocus
              value={formData.name}
              onChange={e => setFormData({ ...formData, name: e.target.value })}
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
              placeholder="例：产品竞品分析、读书笔记..."
              className={cn(
                "w-full px-4 py-3 text-sm bg-gray-50 border rounded-xl outline-none transition-all duration-200",
                "focus:bg-white focus:border-primary-400 focus:ring-2 focus:ring-primary-100",
                errors.name ? "border-red-300" : "border-gray-200"
              )}
            />
            {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name}</p>}
          </div>

          {/* 项目描述 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">描述 <span className="text-gray-400 font-normal">（可选）</span></label>
            <textarea
              value={formData.description}
              onChange={e => setFormData({ ...formData, description: e.target.value })}
              placeholder="这个项目是用来做什么的..."
              rows={3}
              className="w-full px-4 py-3 text-sm bg-gray-50 border border-gray-200 rounded-xl outline-none resize-none transition-all duration-200 focus:bg-white focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
            />
          </div>

          {/* 模板选择 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">选择模板</label>
            <div className="grid grid-cols-2 gap-2">
              {templates.map(t => (
                <button
                  key={t.id}
                  onClick={() => setFormData({ ...formData, template: t.id })}
                  className={cn(
                    "flex items-center gap-3 p-3 rounded-xl border text-left transition-all duration-200",
                    formData.template === t.id
                      ? "border-primary-300 bg-primary-50 shadow-sm"
                      : "border-gray-100 bg-gray-50 hover:border-gray-200 hover:bg-white"
                  )}
                >
                  <div className={cn("w-8 h-8 rounded-lg bg-gradient-to-br flex items-center justify-center flex-shrink-0", t.color)}>
                    <t.icon size={15} className="text-white" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800">{t.name}</p>
                    <p className="text-xs text-gray-400 truncate">{t.description}</p>
                  </div>
                  {formData.template === t.id && (
                    <Check size={14} className="ml-auto text-primary-600 flex-shrink-0" />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* 提示 */}
          <div className="flex items-start gap-2.5 p-3 bg-blue-50 border border-blue-100 rounded-xl">
            <Sparkles size={14} className="text-blue-500 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-blue-700 leading-relaxed">
              项目创建后，可以在详情页随时添加资料文档和 AI 技能，无需现在填写。
            </p>
          </div>
        </div>

        {/* 操作按钮 */}
        <div className="flex gap-3 mt-5">
          <button
            onClick={() => navigate(-1)}
            className="flex-1 py-3 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleCreate}
            disabled={isCreating || !formData.name.trim()}
            className={cn(
              "flex-1 py-3 text-sm font-medium text-white rounded-xl transition-all duration-200",
              "bg-gray-900 hover:bg-gray-800 shadow-md",
              "disabled:opacity-50 disabled:cursor-not-allowed"
            )}
          >
            {isCreating ? '创建中…' : '创建项目'}
          </button>
        </div>
      </div>
    </div>
  )
}
