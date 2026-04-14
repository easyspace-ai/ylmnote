import { MarkdownRenderer } from './MarkdownRenderer'
import { useState, useEffect, useRef, useMemo } from 'react'
import { 
  Send, Paperclip, Zap, FileText, Sparkles, Copy, RefreshCw, X,
  Folder, HardDrive, Check, ChevronDown, Pencil, Trash2
} from 'lucide-react'
import { cn } from '@/utils'
import { SlashCommandSearch, type SearchItem } from './GlobalSearch'

export type ChatMode = 'chat' | 'agent' | 'ask' | 'query'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  messageKind?: 'normal' | 'reasoning' | 'system'
  thinkingTime?: number
  status?: string
}

export interface Skill {
  id: string
  name: string
  icon: string
}

export interface Attachment {
  id: string
  name: string
  type: 'local' | 'library'
  file?: File
}

interface AIChatBoxProps {
  messages?: ChatMessage[]
  todoItems?: Array<{ text: string; done: boolean }>
  isHistoryLoading?: boolean
  skills?: Skill[]
  recommendedSkills?: Skill[]
  libraryFiles?: { id: string; name: string }[]
  onSendMessage?: (message: string, mode: ChatMode, skillId: string | null, attachments: Attachment[], model?: string) => void
  onCopy?: (content: string) => void
  onRegenerate?: () => void
  onSaveAsDocument?: (content: string) => void
  onEditMessage?: (id: string, content: string) => void
  onDeleteMessage?: (id: string) => void
  autoFocus?: boolean
  isStreaming?: boolean
  hasMoreOlder?: boolean
  loadingOlder?: boolean
  onLoadOlder?: () => Promise<void> | void
  defaultInputValue?: string
  defaultSelectedSkill?: string | null
  autoSend?: boolean
}

// 技能选择下拉
function SkillDropdown({
  skills,
  selectedSkill,
  onSelect,
}: {
  skills: Skill[]
  selectedSkill: string | null
  onSelect: (skillId: string | null) => void
}) {
  const [isOpen, setIsOpen] = useState(false)
  const selected = skills.find(s => s.id === selectedSkill)
  
  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-all duration-200",
          selectedSkill
            ? "border-indigo-200 bg-indigo-50 text-indigo-700"
            : "border-gray-200 bg-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700"
        )}
      >
        <Zap size={12} className={selectedSkill ? "text-indigo-500" : "text-gray-400"} />
        <span>{selected ? selected.name : '技能'}</span>
        {selected && (
          <button
            onClick={(e) => { e.stopPropagation(); onSelect(null) }}
            className="ml-0.5 p-0.5 hover:bg-indigo-100 rounded transition-colors"
          >
            <X size={10} />
          </button>
        )}
      </button>
      
      {isOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />
          <div className="absolute left-0 bottom-full mb-2 bg-white rounded-xl border border-gray-100 shadow-xl shadow-gray-900/10 z-20 min-w-[180px] max-h-[240px] overflow-y-auto py-1">
            {skills.length > 0 ? (
              skills.map((skill) => (
                <button
                  key={skill.id}
                  onClick={() => { onSelect(skill.id); setIsOpen(false) }}
                  className={cn(
                    "flex items-center justify-between gap-2 w-full px-4 py-2 text-sm text-left hover:bg-gray-50 transition-colors",
                    selectedSkill === skill.id && "bg-indigo-50 text-indigo-700"
                  )}
                >
                  <span className="flex items-center gap-2">
                    <span className="text-base">{skill.icon}</span>
                    <span>{skill.name}</span>
                  </span>
                  {selectedSkill === skill.id && <Check size={13} className="text-indigo-500" />}
                </button>
              ))
            ) : (
              <div className="px-4 py-3 text-sm text-gray-400">暂无已安装技能</div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// 导入按钮下拉
function ImportDropdown({
  onAddFromLocal,
  onAddFromLibrary,
}: {
  onAddFromLocal: () => void
  onAddFromLibrary: () => void
}) {
  const [isOpen, setIsOpen] = useState(false)
  
  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-gray-500 border border-gray-200 rounded-lg hover:border-gray-300 hover:text-gray-700 transition-colors bg-transparent"
      >
        <Paperclip size={12} className="text-gray-400" />
        <span>导入</span>
      </button>
      
      {isOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />
          <div className="absolute left-0 bottom-full mb-2 bg-white rounded-xl border border-gray-100 shadow-xl shadow-gray-900/10 z-20 min-w-[160px] py-1">
            <button
              onClick={() => { onAddFromLocal(); setIsOpen(false) }}
              className="flex items-center gap-3 w-full px-4 py-2 text-sm text-left text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <HardDrive size={15} className="text-gray-400" />
              <span>本地文件</span>
            </button>
            <button
              onClick={() => { onAddFromLibrary(); setIsOpen(false) }}
              className="flex items-center gap-3 w-full px-4 py-2 text-sm text-left text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <Folder size={15} className="text-gray-400" />
              <span>资料库</span>
            </button>
          </div>
        </>
      )}
    </div>
  )
}

// 附件标签
function AttachmentTag({
  attachment,
  onRemove,
}: {
  attachment: Attachment
  onRemove: () => void
}) {
  return (
    <div className="flex items-center gap-1.5 px-2.5 py-1 bg-indigo-50 border border-indigo-100 text-xs text-indigo-700 rounded-lg">
      <FileText size={12} />
      <span className="truncate max-w-[120px]">{attachment.name}</span>
      <button onClick={onRemove} className="p-0.5 hover:bg-indigo-100 rounded transition-colors ml-0.5">
        <X size={10} />
      </button>
    </div>
  )
}

// 资料库选择弹窗
export function LibraryPickerModal({
  isOpen,
  onClose,
  files,
  onSelect,
}: {
  isOpen: boolean
  onClose: () => void
  files: { id: string; name: string }[]
  onSelect: (file: { id: string; name: string }) => void
}) {
  if (!isOpen) return null
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">从资料库选择</h2>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
            <X size={18} />
          </button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto p-4 space-y-1.5">
          {files.map((file) => (
            <div
              key={file.id}
              onClick={() => { onSelect(file); onClose() }}
              className="flex items-center gap-3 p-3 hover:bg-gray-50 cursor-pointer rounded-xl transition-colors"
            >
              <div className="p-2 bg-gray-100 rounded-lg">
                <FileText size={16} className="text-gray-400" />
              </div>
              <span className="text-sm text-gray-700">{file.name}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// 消息气泡
function MessageBubble({
  message,
  onCopy,
  onRegenerate,
  onSaveAsDocument,
}: {
  message: ChatMessage
  onCopy?: (content: string) => void
  onRegenerate?: () => void
  onSaveAsDocument?: (content: string) => void
  onEdit?: (messageId: string, newContent: string) => void
  onDelete?: (messageId: string) => void
}) {
  const isUser = message.role === 'user'
  const [copied, setCopied] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editContent, setEditContent] = useState(message.content)
  const isProcessMessage = !isUser && (message.messageKind === 'reasoning' || message.messageKind === 'system')
  
  const handleCopy = () => {
    onCopy?.(message.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  
  return (
    <div className={cn("group flex gap-2", isUser ? "justify-end" : "justify-start")}>
      <div className={cn(
        "flex flex-col gap-0.5",
        isUser ? "items-end max-w-[78%]" : "items-start max-w-[85%]"
      )}>
        <div className={cn(
          "px-3 py-2 text-[14px]",
          isUser
            ? "bg-gray-900 text-white rounded-[18px] rounded-tr-md"
            : isProcessMessage
              ? "bg-amber-50/70 border border-amber-100 text-gray-700 rounded-[18px] rounded-tl-md max-w-none"
              : "bg-gray-50 text-gray-800 rounded-[18px] rounded-tl-md max-w-none"
        )}>
          {isUser ? (
            <div className="w-full text-white user-markdown">
              <MarkdownRenderer content={message.content} />
            </div>
          ) : (
            <>
              {message.status && (
                <div className="flex items-center gap-2 text-gray-400 text-xs mb-2 pb-2 border-b border-gray-100 italic">
                  <div className="w-3.5 h-3.5 rounded-full border-2 border-primary-500/30 border-t-primary-500 animate-spin flex-shrink-0" />
                  <span>{message.status}</span>
                </div>
              )}
              {message.content ? (
                <div className="w-full">
                  <MarkdownRenderer content={message.content} />
                </div>
              ) : (!message.status && <div className="h-4 flex items-center gap-1"><span className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce"></span><span className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce delay-100"></span><span className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce delay-200"></span></div>)}
            </>
          )}
        </div>
        {!isUser && (
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150 pl-1">
            <button
              onClick={handleCopy}
              className="flex items-center gap-1 px-2 py-1 text-[11px] text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
            >
              {copied ? <Check size={10} className="text-emerald-500" /> : <Copy size={10} />}
              <span>{copied ? '已复制' : '复制'}</span>
            </button>
            <button
              onClick={() => onSaveAsDocument?.(message.content)}
              className="flex items-center gap-1 px-2 py-1 text-[11px] text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
            >
              <FileText size={10} />
              <span>保存</span>
            </button>
            <button
              onClick={() => onRegenerate?.()}
              className="flex items-center gap-1 px-2 py-1 text-[11px] text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
            >
              <RefreshCw size={10} />
              <span>重试</span>
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function ProcessGroupBubble({
  steps,
  isStreaming,
  isLatestGroup,
}: {
  steps: ChatMessage[]
  isStreaming: boolean
  isLatestGroup: boolean
}) {
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    if (isStreaming && isLatestGroup) {
      setExpanded(true)
      return
    }
    setExpanded(false)
  }, [isStreaming, isLatestGroup, steps.length])

  return (
    <div className="rounded-xl border border-amber-100 bg-amber-50/70 overflow-hidden">
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-amber-700 hover:bg-amber-100/40 transition-colors"
      >
        <span>{expanded ? '隐藏步骤' : `显示步骤（${steps.length}）`}</span>
        <ChevronDown size={12} className={cn('transition-transform', expanded && 'rotate-180')} />
      </button>
      {expanded && (
        <div className="space-y-2 border-t border-amber-100/70 px-3 py-2">
          {steps.map((step, idx) => (
            <div key={step.id} className="rounded-lg border border-white/70 bg-white/70 px-2.5 py-2">
              <div className="mb-1 text-[11px] text-amber-700 font-medium">
                {step.messageKind === 'system' ? `系统步骤 ${idx + 1}` : `思考步骤 ${idx + 1}`}
              </div>
              <div className="text-[13px] text-gray-700 leading-relaxed">
                <MarkdownRenderer content={step.content || '...'} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// OpenRouter 模型选择器
interface ModelOption {
  id: string
  name: string
  context_length?: number
  pricing?: { prompt: string; completion: string }
}

function ModelSelector({
  selectedModel,
  onSelect,
}: {
  selectedModel: string
  onSelect: (modelId: string) => void
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [models, setModels] = useState<ModelOption[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)

  // Fetch models on first open
  const handleOpen = async () => {
    setIsOpen(true)
    if (models.length > 0) return
    setLoading(true)
    try {
      const API_URL = ((import.meta as any).env?.VITE_API_URL || '')
      const res = await fetch(`${API_URL}/api/models`)
      if (res.ok) {
        const data = await res.json()
        setModels(data.models || [])
      }
    } catch (e) {
      console.error('Failed to fetch models', e)
    }
    setLoading(false)
  }

  const filtered = search
    ? models.filter(m =>
        m.id.toLowerCase().includes(search.toLowerCase()) ||
        m.name.toLowerCase().includes(search.toLowerCase())
      )
    : models

  const displayName = (id: string) => {
    // Show short name: last part after /
    const parts = id.split('/')
    return parts.length >= 2 ? parts.slice(-1)[0] : id
  }

  return (
    <div className="relative">
      <button
        onClick={handleOpen}
        className="flex items-center gap-1 px-2 py-1 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors max-w-[140px]"
        title={selectedModel}
      >
        <span className="truncate">{displayName(selectedModel)}</span>
        <ChevronDown size={10} className="shrink-0" />
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => { setIsOpen(false); setSearch('') }} />
          <div className="absolute left-0 bottom-full mb-1 w-80 max-h-[360px] bg-white rounded-xl border border-gray-100 shadow-xl shadow-gray-900/10 z-20 flex flex-col animate-fade-in">
            {/* 搜索框 */}
            <div className="p-2 border-b border-gray-100">
              <input
                type="text"
                placeholder="搜索模型..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoFocus
                className="w-full px-3 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-lg outline-none focus:border-gray-300"
              />
            </div>
            {/* 列表 */}
            <div className="flex-1 overflow-y-auto py-1">
              {loading ? (
                <div className="py-6 text-center text-xs text-gray-400">加载中...</div>
              ) : filtered.length > 0 ? (
                filtered.slice(0, 50).map((m) => {
                  const isFree = parseFloat(m.pricing?.prompt || '0') === 0
                  return (
                    <button
                      key={m.id}
                      onClick={() => { onSelect(m.id); setIsOpen(false); setSearch('') }}
                      className={cn(
                        "flex items-center justify-between w-full px-3 py-2 text-left text-xs hover:bg-gray-50 transition-colors",
                        selectedModel === m.id && "bg-indigo-50"
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className={cn("font-medium truncate", selectedModel === m.id ? "text-indigo-700" : "text-gray-800")}>
                            {m.name}
                          </span>
                          {isFree && (
                            <span className="px-1.5 py-0.5 bg-emerald-50 text-emerald-600 text-[10px] font-medium rounded-full shrink-0">Free</span>
                          )}
                        </div>
                        <span className="text-[10px] text-gray-400 truncate block">{m.id}</span>
                      </div>
                      {selectedModel === m.id && <Check size={12} className="text-indigo-500 shrink-0 ml-2" />}
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


export default function AIChatBox({
  messages = [],
  todoItems = [],
  isHistoryLoading = false,
  skills = [],
  recommendedSkills = [],
  libraryFiles = [],
  onSendMessage,
  onCopy,
  onRegenerate,
  onSaveAsDocument,
  onEditMessage,
  onDeleteMessage,
  autoFocus = false,
  isStreaming = false,
  hasMoreOlder = false,
  loadingOlder = false,
  onLoadOlder,
  defaultInputValue = '',
  defaultSelectedSkill = null,
}: AIChatBoxProps) {
  const [inputValue, setInputValue] = useState(defaultInputValue)

  useEffect(() => {
    if (!defaultInputValue) return
    setInputValue(defaultInputValue)
  }, [defaultInputValue])
  const [chatMode, setChatMode] = useState<ChatMode>('chat')
  const [selectedSkill, setSelectedSkill] = useState<string | null>(defaultSelectedSkill)
  
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [showLibraryPicker, setShowLibraryPicker] = useState(false)
  const [showSlashCommands, setShowSlashCommands] = useState(false)
  const [slashQuery, setSlashQuery] = useState('')
  const [isFocused, setIsFocused] = useState(false)
  const [selectedModel, setSelectedModel] = useState('google/gemini-3-flash-preview')
  const [todoCollapsed, setTodoCollapsed] = useState(false)
  const latestAssistantId = [...messages].reverse().find(m => m.role === 'assistant')?.id
  const renderItems = useMemo(() => {
    const items: Array<
      { type: 'message'; message: ChatMessage } |
      { type: 'process-group'; id: string; steps: ChatMessage[]; hasLatestAssistant: boolean }
    > = []
    let processBuffer: ChatMessage[] = []

    const flushBuffer = () => {
      if (processBuffer.length === 0) return
      const hasLatestAssistant = processBuffer.some(step => step.id === latestAssistantId)
      const id = `process-${processBuffer[0]?.id || Date.now()}-${processBuffer.length}`
      items.push({ type: 'process-group', id, steps: processBuffer, hasLatestAssistant })
      processBuffer = []
    }

    for (const msg of messages) {
      const isProcess = msg.role === 'assistant' && (msg.messageKind === 'reasoning' || msg.messageKind === 'system')
      if (isProcess) {
        processBuffer.push(msg)
        continue
      }
      flushBuffer()
      items.push({ type: 'message', message: msg })
    }
    flushBuffer()
    return items
  }, [messages, latestAssistantId])

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const shouldAutoScrollRef = useRef(true)
  const prependAnchorRef = useRef<{ prevHeight: number; prevTop: number } | null>(null)
  
  // 自动聚焦
  useEffect(() => {
    if (autoFocus && textareaRef.current) {
      textareaRef.current.focus()
    }
  }, [autoFocus])
  
  useEffect(() => {
    const container = messagesContainerRef.current
    if (!container) return
    if (prependAnchorRef.current) {
      const { prevHeight, prevTop } = prependAnchorRef.current
      const delta = container.scrollHeight - prevHeight
      container.scrollTop = prevTop + delta
      prependAnchorRef.current = null
      return
    }
    if (shouldAutoScrollRef.current || isStreaming) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, isStreaming])

  const handleMessagesScroll = async () => {
    const container = messagesContainerRef.current
    if (!container) return
    const distanceToBottom = container.scrollHeight - (container.scrollTop + container.clientHeight)
    shouldAutoScrollRef.current = distanceToBottom < 80
    if (container.scrollTop <= 40 && hasMoreOlder && !loadingOlder && onLoadOlder) {
      prependAnchorRef.current = {
        prevHeight: container.scrollHeight,
        prevTop: container.scrollTop,
      }
      await onLoadOlder()
    }
  }
  
  // 将技能转换为搜索项
  const skillSearchItems: SearchItem[] = skills.map(s => ({
    id: s.id,
    name: s.name,
    icon: s.icon || '⚡',
    type: 'skill' as const,
  }))
  
  // 处理输入变化，检测斜杠命令
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value
    setInputValue(value)
    
    // 检测斜杠命令
    if (value.startsWith('/')) {
      setShowSlashCommands(true)
      setSlashQuery(value.slice(1))
    } else {
      setShowSlashCommands(false)
    }
  }
  
  // 选择斜杠命令
  const handleSlashCommandSelect = (item: SearchItem) => {
    setSelectedSkill(item.id)
    setInputValue('')
    setShowSlashCommands(false)
    setSlashQuery('')
  }
  
  const handleSend = () => {
    if (!inputValue.trim() || isStreaming) return
    onSendMessage?.(inputValue, chatMode, selectedSkill, attachments, selectedModel)
    setInputValue('')
    // 保持技能选择，不重置
  }
  
  const handleAddFromLocal = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.multiple = true
    input.onchange = (e: Event) => {
      const target = e.target as HTMLInputElement
      const files = Array.from(target.files || [])
      if (files.length === 0) return

      const newAttachments: Attachment[] = files.map(file => ({
        id: `local-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        name: file.name,
        type: 'local',
        file
      }))
      
      setAttachments(prev => [...prev, ...newAttachments])
    }
    input.click()
  }
  
  const handleAddFromLibrary = (file: { id: string; name: string }) => {
    setAttachments([...attachments, { ...file, type: 'library' }])
  }
  
  const handleRemoveAttachment = (id: string) => {
    setAttachments(attachments.filter(a => a.id !== id))
  }
  
  // 点击推荐技能
  const handleSkillClick = (skillId: string) => {
    setSelectedSkill(selectedSkill === skillId ? null : skillId)
  }
  
  return (
    <div className="flex flex-col h-full min-h-0 bg-white">
      {/* 消息区 */}
      <div
        ref={messagesContainerRef}
        onScroll={handleMessagesScroll}
        className="flex-1 min-h-0 overflow-y-auto px-6 pt-6 pb-4"
      >
        {messages.length > 0 ? (
          <div className="space-y-4 max-w-3xl mx-auto">
            {(loadingOlder || hasMoreOlder) && (
              <div className="flex justify-center">
                <div className="text-xs text-gray-400 bg-gray-50 border border-gray-100 rounded-full px-3 py-1">
                  {loadingOlder ? '加载更早消息中...' : '上滑可加载更早消息'}
                </div>
              </div>
            )}
            {renderItems.map((item) => {
              if (item.type === 'process-group') {
                return (
                  <ProcessGroupBubble
                    key={item.id}
                    steps={item.steps}
                    isStreaming={isStreaming}
                    isLatestGroup={item.hasLatestAssistant}
                  />
                )
              }
              return (
                <MessageBubble
                  key={item.message.id}
                  message={item.message}
                  onCopy={onCopy}
                  onRegenerate={onRegenerate}
                  onSaveAsDocument={onSaveAsDocument}
                  onEdit={onEditMessage}
                  onDelete={onDeleteMessage}
                />
              )
            })}
            {(todoItems.length > 0 || isStreaming) && (
              <div className="rounded-2xl border border-gray-200 bg-gray-50/80 overflow-hidden">
                <button
                  onClick={() => setTodoCollapsed(v => !v)}
                  className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-100/70 transition-colors"
                >
                  <span>To-dos</span>
                  <ChevronDown size={14} className={cn('transition-transform', todoCollapsed && '-rotate-90')} />
                </button>
                {!todoCollapsed && (
                  <div className="px-3 pb-3 space-y-1.5">
                    {todoItems.length > 0 ? (
                      todoItems.map((todo, idx) => (
                        <div key={`${todo.text}-${idx}`} className="flex items-center gap-2 rounded-lg bg-white border border-gray-100 px-2.5 py-1.5 text-xs">
                          <span className={cn('h-1.5 w-1.5 rounded-full', todo.done ? 'bg-emerald-500' : 'bg-amber-500')} />
                          <span className={cn('leading-relaxed', todo.done ? 'text-gray-400 line-through' : 'text-gray-700')}>{todo.text}</span>
                        </div>
                      ))
                    ) : (
                      <div className="text-xs text-gray-400 px-1 py-1">正在生成待办列表...</div>
                    )}
                  </div>
                )}
              </div>
            )}
            {isStreaming && (
              <div className="flex justify-start">
                <div className="bg-gray-50 rounded-2xl rounded-tl-md px-4 py-3">
                  <div className="relative w-5 h-5">
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-5 h-5 grid grid-cols-2 gap-0.5 animate-spin" style={{ animationDuration: '3s' }}>
                        <div className="bg-indigo-400 rounded-sm animate-pulse" style={{ animationDelay: '0s' }} />
                        <div className="bg-purple-400 rounded-sm animate-pulse" style={{ animationDelay: '0.2s' }} />
                        <div className="bg-fuchsia-400 rounded-sm animate-pulse" style={{ animationDelay: '0.6s' }} />
                        <div className="bg-blue-400 rounded-sm animate-pulse" style={{ animationDelay: '0.4s' }} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        ) : isHistoryLoading ? (
          <div className="h-full flex items-center justify-center">
            <div className="w-full max-w-2xl space-y-4">
              <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
                <div className="w-4 h-4 rounded-full border-2 border-gray-300 border-t-gray-600 animate-spin" />
                <span>正在加载会话历史...</span>
              </div>
              <div className="space-y-3 animate-pulse">
                <div className="h-4 w-1/3 bg-gray-100 rounded" />
                <div className="h-16 w-3/4 bg-gray-100 rounded-2xl" />
                <div className="h-4 w-1/4 bg-gray-100 rounded ml-auto" />
                <div className="h-12 w-2/3 bg-gray-100 rounded-2xl ml-auto" />
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center select-none">
            <Sparkles size={32} className="text-gray-300 mb-3" />
            <p className="text-sm font-medium text-gray-500 mb-1">开始对话</p>
            <p className="text-sm text-gray-400">输入你的问题</p>
          </div>
        )}
      </div>
      
      {/* 底部输入区 */}
      <div className="border-t border-gray-100 px-4 py-3">
        <div className="max-w-3xl mx-auto">
          {/* 附件标签 */}
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {attachments.map((att) => (
                <AttachmentTag
                  key={att.id}
                  attachment={att}
                  onRemove={() => handleRemoveAttachment(att.id)}
                />
              ))}
            </div>
          )}
          
          {/* 输入框容器 */}
          <div className={cn(
            "rounded-xl border transition-all duration-200",
            isFocused
              ? "border-gray-300 bg-white"
              : "border-gray-200 bg-gray-50"
          )}>
            {/* 斜杠命令搜索 */}
            <SlashCommandSearch
              isOpen={showSlashCommands}
              query={slashQuery}
              items={skillSearchItems}
              onSelect={handleSlashCommandSelect}
              onClose={() => setShowSlashCommands(false)}
            />
            
            {/* 已选技能标签 */}
            {selectedSkill && (
              <div className="px-3 pt-2.5">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-indigo-50 border border-indigo-100 text-xs font-medium text-indigo-700 rounded-lg">
                  <span>{skills.find(s => s.id === selectedSkill)?.icon}</span>
                  <span>{skills.find(s => s.id === selectedSkill)?.name}</span>
                  <button
                    onClick={() => setSelectedSkill(null)}
                    className="p-0.5 hover:bg-indigo-100 rounded transition-colors"
                  >
                    <X size={11} />
                  </button>
                </div>
              </div>
            )}
            
            {/* 文本输入行 */}
            <div className="flex items-end gap-2 px-3 pt-2.5 pb-2">
              <textarea
                ref={textareaRef}
                value={inputValue}
                onChange={(e) => {
                  handleInputChange(e)
                  e.target.style.height = 'auto'
                  const maxH = 240
                  e.target.style.height = Math.min(e.target.scrollHeight, maxH) + 'px'
                }}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && !showSlashCommands) {
                    e.preventDefault()
                    handleSend()
                  }
                }}
                placeholder={selectedSkill
                  ? `描述你想要${skills.find(s => s.id === selectedSkill)?.name}的内容...`
                  : "输入你的问题，或输入 / 选择技能..."}
                className="flex-1 bg-transparent resize-none outline-none text-sm text-gray-900 placeholder-gray-400 leading-6 overflow-y-auto"
                style={{ height: '24px', maxHeight: '240px' }}
                rows={1}
              />
              <button
                onClick={handleSend}
                disabled={!inputValue.trim()}
                className={cn(
                  "flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-lg transition-all duration-200",
                  inputValue.trim()
                    ? "bg-gray-900 text-white hover:bg-gray-800"
                    : "bg-gray-200 text-gray-400 cursor-not-allowed"
                )}
              >
                <Send size={14} />
              </button>
            </div>
            
            {/* 工具栏 */}
            <div className="flex items-center gap-2 px-3 py-2 border-t border-gray-100">
              {/* 导入按钮 */}
              <ImportDropdown
                onAddFromLocal={handleAddFromLocal}
                onAddFromLibrary={() => setShowLibraryPicker(true)}
              />
              
              {/* 分隔线 */}
              <div className="w-px h-4 bg-gray-200" />
              
              {/* 模式切换 */}
              <div className="flex items-center bg-gray-100 rounded-lg p-0.5">
                <button
                  onClick={() => setChatMode('chat')}
                  className={cn(
                    "px-2.5 py-1 text-xs font-medium rounded-md transition-all duration-200",
                    chatMode === 'chat'
                      ? "bg-white text-gray-900 shadow-sm"
                      : "text-gray-500 hover:text-gray-700"
                  )}
                >Chat</button>
                <button
                  onClick={() => setChatMode('agent')}
                  className={cn(
                    "px-2.5 py-1 text-xs font-medium rounded-md transition-all duration-200",
                    chatMode === 'agent'
                      ? "bg-white text-gray-900 shadow-sm"
                      : "text-gray-500 hover:text-gray-700"
                  )}
                >
                  Agent (Web Search)
                </button>
                <button
                  onClick={() => setChatMode('ask')}
                  className={cn(
                    "px-2.5 py-1 text-xs font-medium rounded-md transition-all duration-200",
                    chatMode === 'ask'
                      ? "bg-white text-gray-900 shadow-sm"
                      : "text-gray-500 hover:text-gray-700"
                  )}
                >
                  Ask
                </button>
              </div>
              
              {/* 分隔线 */}
              <div className="w-px h-4 bg-gray-200" />
              
              {/* 技能选择 */}
              <SkillDropdown
                skills={skills}
                selectedSkill={selectedSkill}
                onSelect={setSelectedSkill}
              />

              {/* 分隔线 */}
              <div className="w-px h-4 bg-gray-200" />

              {/* 模型选择 */}
              <ModelSelector
                selectedModel={selectedModel}
                onSelect={setSelectedModel}
              />
            </div>
          </div>
        </div>
      </div>
      
      {/* 资料库选择弹窗 */}
      <LibraryPickerModal
        isOpen={showLibraryPicker}
        onClose={() => setShowLibraryPicker(false)}
        files={libraryFiles}
        onSelect={handleAddFromLibrary}
      />
    </div>
  )
}
