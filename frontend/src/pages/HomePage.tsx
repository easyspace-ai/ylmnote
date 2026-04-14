import { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Sparkles, ArrowRight, FileText, Search, Wand2, Code } from 'lucide-react'
import { cn } from '@/utils'
import { useAppStore } from '@/stores/apiStore'

const quickSkills = [
  { id: '1', name: '智能写作', icon: FileText,  color: 'from-orange-400 to-amber-500' },
  { id: '2', name: '文档总结', icon: Search,    color: 'from-blue-400 to-cyan-500'   },
  { id: '3', name: '深度研究', icon: Wand2,     color: 'from-emerald-400 to-teal-500' },
  { id: '4', name: '代码助手', icon: Code,      color: 'from-violet-400 to-purple-500' },
]

const hotPrompts = [
  { id: '1', text: '帮我写一篇关于人工智能发展趋势的深度分析文章' },
  { id: '2', text: '总结这份文档的核心观点和关键数据' },
  { id: '3', text: '分析这段代码的性能瓶颈并提供优化建议' },
  { id: '4', text: '为我的新产品制定一份详细的市场推广计划' },
]

const placeholderPrompts = [
  '生成一份可执行的OKR与里程碑计划',
  '把这份需求拆解成清晰的任务清单',
  '为我的产品做一次竞争分析与差异点总结',
  '帮我设计一个 7 天学习路线和每日练习',
  '把这段会议纪要整理成行动项与负责人',
]

export default function HomePage() {
  const navigate = useNavigate()
  const [inputValue, setInputValue] = useState('')
  const [isFocused, setIsFocused] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    textareaRef.current?.focus()
  }, [])

  const placeholderText = useMemo(
    () => placeholderPrompts[Math.floor(Math.random() * placeholderPrompts.length)],
    []
  )

  // Auto-grow textarea
  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const el = e.target
    setInputValue(el.value)
    el.style.height = 'auto'
    const lineHeight = 24
    const maxHeight = lineHeight * 8
    el.style.height = Math.min(el.scrollHeight, maxHeight) + 'px'
  }

  const handleSend = async () => {
    if (!inputValue.trim() || isLoading) return
    setIsLoading(true)
    try {
      const project = await useAppStore.getState().createProject({
        name: inputValue.substring(0, 30) || '新项目',
      })
      navigate(`/boards/${project.id}`, {
        state: { initialMessage: inputValue, startChat: true },
      })
    } catch (e) {
      console.error('Failed to create project', e)
      setIsLoading(false)
    }
  }

  const fillPrompt = (text: string) => {
    setInputValue(text)
    if (textareaRef.current) {
      textareaRef.current.value = text
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height =
        Math.min(textareaRef.current.scrollHeight, 192) + 'px'
      textareaRef.current.focus()
    }
    
    // Simulate auto-send by delaying execution slightly and firing handleSend.
    setTimeout(async () => {
       setIsLoading(true)
       try {
         const project = await useAppStore.getState().createProject({
           name: text.substring(0, 30) || '新项目',
         })
         navigate(`/boards/${project.id}`, {
           state: { initialMessage: text, startChat: true },
         })
       } catch (e) {
         console.error('Failed to create project', e)
         setIsLoading(false)
       }
    }, 50)
  }

  return (
    <div className="min-h-full flex flex-col items-center justify-center px-4 py-14 bg-gray-50">
      <div className="w-full max-w-2xl space-y-8">

        {/* ── Header ───────────────────────────────────── */}
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <h1 className="font-bold text-2xl text-gray-900 tracking-tight">
            有什么可以帮你的？
          </h1>
          <p className="text-sm text-gray-400">
            描述你的任务，AI 将为你提供智能解决方案
          </p>
        </div>

        {/* ── Input ────────────────────────────────────── */}
        <div>
          <div
            className={cn(
              'bg-white border rounded-xl transition-colors duration-150',
              isFocused ? 'border-gray-300' : 'border-gray-200'
            )}
          >
            <div className="flex items-end gap-2 p-3">
              <textarea
                ref={textareaRef}
                value={inputValue}
                onChange={handleInput}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleSend()
                  }
                }}
                placeholder={placeholderText}
                rows={1}
                disabled={isLoading}
                className="flex-1 resize-none outline-none bg-transparent text-sm text-gray-900 placeholder-gray-400 leading-6 py-1 px-1"
                style={{ minHeight: '24px', maxHeight: '192px' }}
              />
              <button
                onClick={handleSend}
                disabled={!inputValue.trim() || isLoading}
                className={cn(
                  'w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors duration-150 mb-0.5',
                  inputValue.trim() && !isLoading
                    ? 'bg-gray-900 text-white hover:bg-gray-700'
                    : 'bg-gray-100 text-gray-300 cursor-not-allowed'
                )}
              >
                {isLoading ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <ArrowRight size={16} />
                )}
              </button>
            </div>
          </div>
          <p className="mt-2 text-center text-xs text-gray-400">
            Enter 发送 · Shift+Enter 换行
          </p>
        </div>

        {/* ── Skill Cards ──────────────────────────────── */}
        <div className="grid grid-cols-4 gap-3">
          {quickSkills.map((skill) => (
            <button
              key={skill.id}
              onClick={() => fillPrompt(`使用 ${skill.name}：`)}
              className="flex flex-col items-center gap-2 p-4 bg-white border border-gray-200 rounded-xl hover:border-gray-300 hover:shadow-sm hover:-translate-y-0.5 transition-all duration-150 group"
            >
              <div
                className={cn(
                  'w-9 h-9 rounded-full bg-gradient-to-br flex items-center justify-center',
                  skill.color
                )}
              >
                <skill.icon size={17} className="text-white" />
              </div>
              <span className="text-xs font-medium text-gray-700 text-center leading-tight">
                {skill.name}
              </span>
            </button>
          ))}
        </div>

        {/* ── Hot Prompts ──────────────────────────────── */}
        <div className="space-y-1">
          {hotPrompts.map((prompt) => (
            <button
              key={prompt.id}
              onClick={() => fillPrompt(prompt.text)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-left text-gray-500 hover:bg-gray-100 hover:text-gray-800 transition-colors duration-150 group"
            >
              <span className="text-gray-300 group-hover:text-gray-500 transition-colors duration-150 shrink-0">
                →
              </span>
              <span className="flex-1 truncate">{prompt.text}</span>
            </button>
          ))}
        </div>

      </div>
    </div>
  )
}
