import { MarkdownRenderer } from '@/components/MarkdownRenderer'
import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useParams, useLocation, useNavigate } from 'react-router-dom'
import { 
  FileText, StickyNote,
  Upload, Plus, MoreVertical, FolderOpen, MessageCircle, Pencil, Trash2,
  FileOutput, Clock, ChevronRight, ChevronLeft, X, Archive, Maximize2, Minimize2, Download,
  FileX, Search, Globe
} from 'lucide-react'
import { cn } from '@/utils'
import { useToast } from '@/components/ui/Feedback'
import { useDialog } from '@/components/ui/Dialog'

import AIChatBoxNew, { type ChatMessage, type Skill, type Attachment } from '@/components/AIChatBoxNew'
import type { MessageStatus } from '@/components/ai-elements'
import { ProjectHeader } from '@/components/project-detail/ProjectHeader'
import { LeftPane } from '@/components/project-detail/LeftPane'
import { RightStudioPane } from '@/components/project-detail/RightStudioPane'
import { useAppStore } from '@/stores/apiStore'
import { queryClient } from '@/lib/queryClient'
import { useSidebarStore } from '@/components/layout/Sidebar'
import { chatApi, projectApi } from '@/services/api'
import { API_ENDPOINTS, API_CONFIG } from '@/config/api'
import { useQueryClient } from '@tanstack/react-query'

import ArtifactPreviewPanel from '@/components/ArtifactPreviewPanel'

const getLastSessionStorageKey = (projectId: string) => `youmind:last-session:${projectId}`

// 三点菜单组件
function MoreMenu({ onRename, onDelete }: { onRename: () => void; onDelete: () => void }) {
  const [isOpen, setIsOpen] = useState(false)
  
  return (
    <div className="relative group">
      <button 
        onClick={(e) => { e.stopPropagation(); setIsOpen(!isOpen) }}
        className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-all opacity-0 group-hover:opacity-100"
      >
        <MoreVertical size={14} />
      </button>
      {isOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />
          <div className="absolute right-0 top-full mt-1 bg-white rounded-xl border border-gray-100 shadow-xl shadow-gray-900/10 z-20 min-w-[140px] py-1 animate-fade-in">
            <button
              onClick={(e) => { e.stopPropagation(); onRename(); setIsOpen(false) }}
              className="flex items-center gap-2 w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <Pencil size={13} className="text-gray-400" />
              <span>重命名</span>
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(); setIsOpen(false) }}
              className="flex items-center gap-2 w-full px-4 py-2 text-sm text-danger-600 hover:bg-danger-50 transition-colors"
            >
              <Trash2 size={13} />
              <span>删除</span>
            </button>
          </div>
        </>
      )}
    </div>
  )
}

function ProjectHeaderMenu({ onArchive }: { onArchive: () => void }) {
  const [isOpen, setIsOpen] = useState(false)
  
  return (
    <div className="relative group">
      <button 
        onClick={(e) => { e.stopPropagation(); setIsOpen(!isOpen) }}
        className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors duration-200"
      >
        <MoreVertical size={16} />
      </button>
      {isOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />
          <div className="absolute right-0 top-full mt-1 bg-white rounded-xl border border-gray-100 shadow-xl shadow-gray-900/10 z-20 min-w-[140px] py-1 animate-fade-in">
            <button
              onClick={(e) => { e.stopPropagation(); onArchive(); setIsOpen(false) }}
              className="flex items-center gap-2 w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <Archive size={13} className="text-gray-400" />
              <span>归档笔记</span>
            </button>
          </div>
        </>
      )}
    </div>
  )
}

export default function ProjectDetail() {
  const { id: projectId, sessionId: urlSessionId } = useParams()
  const id = projectId
  const location = useLocation()
  const navigate = useNavigate()
  const { 
    currentProject,
    sessions,
    fetchSessions,
    loadOlderMessages,
    fetchMessagesBySession,
    setActiveMessageSession,
    clearSessionMessages,
    createSession,
    updateSession,
    deleteSession,
    messages,
    liveTodosBySession,
    messagePagination,
    installedSkills,
    loading,
    fetchProject,
    fetchMessages,
    fetchInstalledSkills,
    sendMessageWS,
    abortActiveMessageStream,
    resources,
    fetchResources,
    createResource,
    updateResource,
    deleteResource,
    setCurrentProject,
    updateProject,
    deleteProject,
    createProject,
    uploadResource
  } = useAppStore()

  // WebSocket actions 使用单独选择器订阅，避免每次渲染都获得新引用导致 useEffect 重复执行
  const connectWebSocket = useAppStore((state) => state.connectWebSocket)
  const disconnectWebSocket = useAppStore((state) => state.disconnectWebSocket)
  const retryWebSocketConnection = useAppStore((state) => state.retryWebSocketConnection)

  // WebSocket 连接状态
  const wsStatus = useAppStore((state) =>
    urlSessionId ? state.wsStatus?.[urlSessionId] : undefined
  )
  const wsReconnectAttempt = useAppStore((state) =>
    urlSessionId ? state.wsReconnectAttempt?.[urlSessionId] : undefined
  )
  const wsReconnectMaxAttempts = useAppStore((state) =>
    urlSessionId ? state.wsReconnectMaxAttempts?.[urlSessionId] : undefined
  )

  const promptTemplates = useAppStore((state) => state.promptTemplates)
  const fetchPromptTemplates = useAppStore((state) => state.fetchPromptTemplates)
  const isStreaming = useAppStore((state) =>
    Boolean(urlSessionId && state.streamingBySession?.[urlSessionId])
  )
  const isLoadingMessages = useAppStore((state) =>
    Boolean(urlSessionId && state.messagesLoadingBySession?.[urlSessionId])
  )
  const error = useAppStore((state) => state.error)

  const [leftViewingResource, setLeftViewingResource] = useState<{id: string, name: string, type?: string, content?: string, url?: string | null} | null>(null)
  const [isLeftPreviewExpanded, setIsLeftPreviewExpanded] = useState(false)
  const [rightViewingResource, setRightViewingResource] = useState<{id: string, name: string, type?: string, content?: string, url?: string | null} | null>(null)
  const [isRightPreviewExpanded, setIsRightPreviewExpanded] = useState(false)
  const [isEditingResource, setIsEditingResource] = useState(false)
  const [editContent, setEditContent] = useState('')
  const [activeStudioTool, setActiveStudioTool] = useState<string | null>(null)
  /** 点击 Studio 技能时仅填入输入框，用 seq 触发子组件同步 */
  const [studioInputPrefill, setStudioInputPrefill] = useState<{ seq: number; text: string } | null>(null)
  const [isLeftCollapsed, setIsLeftCollapsed] = useState(false)
  const [leftWidth, setLeftWidth] = useState(280)
  const [isRightCollapsed, setIsRightCollapsed] = useState(false)
  const [rightWidth, setRightWidth] = useState(280)
  const [uploading, setUploading] = useState(false)

  // 左侧资料栏新状态
  const [showLeftSearch, setShowLeftSearch] = useState(false)
  const [leftSearchQuery, setLeftSearchQuery] = useState('')
  const [showAddMenu, setShowAddMenu] = useState(false)
  const [showAddResourceModal, setShowAddResourceModal] = useState(false)
  const [addLinkText, setAddLinkText] = useState('')

  // 拖拽相关状态
  const startDragLeft = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.pageX;
    const startWidth = leftWidth;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const newWidth = Math.max(200, Math.min(600, startWidth + (moveEvent.pageX - startX)));
      setLeftWidth(newWidth);
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = 'default';
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    document.body.style.cursor = 'col-resize';
  };

  const startDragRight = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.pageX;
    const startWidth = rightWidth;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const newWidth = Math.max(200, Math.min(600, startWidth - (moveEvent.pageX - startX)));
      setRightWidth(newWidth);
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = 'default';
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    document.body.style.cursor = 'col-resize';
  };

  const [isUploading, setIsUploading] = useState(false)
  const [uploadingFileName, setUploadingFileName] = useState<string | null>(null)
  const [uploadProgress, setUploadProgress] = useState<'uploading' | 'parsing' | 'completed' | null>(null)
  const { setSidebarCollapsed } = useSidebarStore()
  const { addToast } = useToast()
  
  // 进入笔记详情时，收起全局导航栏
  useEffect(() => {
    setSidebarCollapsed(true)
    return () => { setSidebarCollapsed(false) }
  }, [])
  
  // 从主页传递的初始消息（只要发一次就失效）
  const locationState = location.state as any;
  const initialMessage = locationState?.initialMessage || '';
  const autoSendFromState = locationState?.startChat || false;
  // 记录“已经发送过的主题笔记ID”，防止跳去别的笔记还发
  const hasAutoSentForProject = useRef<string | null>(null);
  
  const [isInitializing, setIsInitializing] = useState(true)
  const hasRedirected = useRef(false)
  const sessionInitRunIdRef = useRef(0)
  const prevSessionIdRef = useRef<string | undefined>(undefined)
  const historyRecoveryAtRef = useRef<Record<string, number>>({})
  const wsRecoveryAtRef = useRef<Record<string, number>>({})

  // 无 session 时：加载笔记与会话后重定向到第一个会话或新建
  useEffect(() => {
    if (!id || urlSessionId) return
    let cancelled = false
    const run = async () => {
      await fetchProject(id)
      await fetchSessions(id)
      if (cancelled) return
      const sessList = useAppStore.getState().sessions
      if (sessList.length > 0 && !hasRedirected.current) {
        hasRedirected.current = true
        navigate(`/boards/${id}/sessions/${sessList[0].id}`, { replace: true })
      } else if (!hasRedirected.current) {
        // 极端情况：后端同步创建失败，前端兜底
        try {
          const newSess = await createSession(id, '新对话')
          if (!cancelled) {
            hasRedirected.current = true
            navigate(`/boards/${id}/sessions/${newSess.id}`, { replace: true })
          }
        } catch (_) {}
      }
    }
    run()
    return () => { cancelled = true }
  }, [id, urlSessionId])

  // 会话路由切换：切激活会话；先拉会话列表再拉消息。
  useEffect(() => {
    const runId = ++sessionInitRunIdRef.current
    let cancelled = false

    setActiveMessageSession(urlSessionId)
    if (id && urlSessionId) {
      const sessionChanged = prevSessionIdRef.current !== urlSessionId
      prevSessionIdRef.current = urlSessionId

      // 仅在会话变化时清空，避免同会话重复初始化造成空屏闪烁
      if (sessionChanged) {
        clearSessionMessages(urlSessionId)
      }

      void (async () => {
        // 1. 拉取会话列表，避免在会话不存在时继续后续流程
        try {
          await fetchSessions(id)
        } catch (e) {
          console.warn('[ProjectDetail] fetchSessions failed during session init:', e)
        }
        if (cancelled || sessionInitRunIdRef.current !== runId) return

        // 2. 加载历史消息（关键：即使失败也要继续连接 WebSocket）
        try {
          await fetchMessagesBySession(id, urlSessionId, { mode: 'replaceLatest' })
        } catch (err) {
          console.error('[ProjectDetail] Failed to fetch messages:', err)
          // 错误已在 store 中设置，会在 UI 中显示
        }
        if (cancelled || sessionInitRunIdRef.current !== runId) return

        // 3. 建立 WebSocket 连接（独立进行，不影响消息显示）
        // WebSocket 连接在消息加载之后，确保实时消息不会与历史消息冲突
        connectWebSocket(urlSessionId, id)
      })()
    } else if (urlSessionId) {
      clearSessionMessages(urlSessionId)
      prevSessionIdRef.current = urlSessionId
    } else {
      clearSessionMessages()
      prevSessionIdRef.current = undefined
    }

    // 清理函数：切换会话时断开旧连接
    return () => {
      cancelled = true
      if (urlSessionId) {
        disconnectWebSocket(urlSessionId)
      }
    }
  // 仅按路由参数触发，避免 store action 引用变化导致重复初始化
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, urlSessionId])

  // WS 连接健康检查：切笔记后若长时间未连通，主动重试（用户无感）
  useEffect(() => {
    if (!id || !urlSessionId) return
    if (wsStatus === 'connected' || wsStatus === 'connecting' || wsStatus === 'reconnecting') return
    const now = Date.now()
    const lastAt = wsRecoveryAtRef.current[urlSessionId] || 0
    if (now - lastAt < 3000) return
    wsRecoveryAtRef.current[urlSessionId] = now
    retryWebSocketConnection(urlSessionId)
  }, [id, urlSessionId, wsStatus, retryWebSocketConnection])

  // 历史兜底：当会话无消息且当前不在加载中时，按节流策略自动补拉一次历史
  useEffect(() => {
    if (!id || !urlSessionId) return
    if (isLoadingMessages) return
    if (messages.length > 0) return
    const now = Date.now()
    const lastAt = historyRecoveryAtRef.current[urlSessionId] || 0
    if (now - lastAt < 3000) return
    historyRecoveryAtRef.current[urlSessionId] = now
    void fetchMessagesBySession(id, urlSessionId, { mode: 'replaceLatest' })
  }, [id, urlSessionId, isLoadingMessages, messages.length, wsStatus, fetchMessagesBySession])

  useEffect(() => {
    return () => {
      useAppStore.getState().abortActiveMessageStream()
    }
  }, [])

  // 有 projectId + sessionId 时：加载笔记、会话列表、该会话消息、资源
  useEffect(() => {
    if (id && urlSessionId) {
      setIsInitializing(true)
      hasRedirected.current = false

      Promise.all([
        fetchProject(id),
        queryClient.refetchQueries({ queryKey: ['projects'] }),
        fetchResources(id),
        fetchPromptTemplates(),
        fetchInstalledSkills(),
      ])
        .finally(() => {
          setIsInitializing(false)
          if (autoSendFromState && initialMessage && hasAutoSentForProject.current !== id) {
            hasAutoSentForProject.current = id
            window.history.replaceState({}, document.title, window.location.pathname)
            setTimeout(() => {
              handleSendMessage(initialMessage, 'chat', null, [])
            }, 100)
          }
        })
    }
    return () => {
      if (!urlSessionId) setCurrentProject(null)
    }
  }, [id, urlSessionId])

  // 记录当前笔记最近一次打开的会话 ID，刷新后优先恢复到该会话。
  useEffect(() => {
    if (!id || !urlSessionId) return
    localStorage.setItem(getLastSessionStorageKey(id), urlSessionId)
  }, [id, urlSessionId])

  const queryClient = useQueryClient()
  const { confirm, prompt } = useDialog()

  const [stoppingUpstream, setStoppingUpstream] = useState(false)

  const handleUpstreamStop = async () => {
    if (!id || !urlSessionId) return
    setStoppingUpstream(true)
    try {
      useAppStore.getState().abortActiveMessageStream(urlSessionId)
      addToast('success', '已发送停止指令')
    } catch (e: any) {
      addToast('error', e?.message || '停止失败')
    } finally {
      setStoppingUpstream(false)
    }
  }

  const handleProjectRename = async () => {
    if (!id || !currentProject) return
    const newName = await prompt({
      title: '重命名对话',
      message: '请输入新的对话名称',
      defaultValue: currentProject.name,
      placeholder: '对话名称',
    })
    if (newName && newName !== currentProject.name) {
      await updateProject(id, { name: newName })
      await fetchProject(id)
      void queryClient.invalidateQueries({ queryKey: ['projects'] })
    }
  }

  const handleProjectArchive = async () => {
    if (!id || !currentProject) return
    const confirmed = await confirm({
      title: '归档笔记',
      message: `确定要归档当前对话 "${currentProject.name}" 吗？`,
      confirmText: '归档',
      cancelText: '取消',
    })
    if (confirmed) {
      await updateProject(id, { status: 'archived' })
      addToast('success', '对话已归档')
      void queryClient.invalidateQueries({ queryKey: ['projects'] })
      navigate('/')
    }
  }

  // 发送消息
  const handleSendMessage = async (message: string, mode: string, skillId: string | null, attachments: Attachment[], model?: string) => {
    if (!id || !urlSessionId) return
    let sendingMessage = message
    const resourceRefs: string[] = []
      
    // 1. 真上传本地文件附件
    const localAttachments = attachments.filter(a => a.type === 'local' && a.file)
    if (localAttachments.length > 0) {
      setUploading(true)
      addToast('info', `正在上传 ${localAttachments.length} 个附件...`)
      try {
        const localFileNames: string[] = []
        for (const att of localAttachments) {
          const res = await uploadResource(id, att.file!)
          if (res?.id) {
            resourceRefs.push(res.id)
            localFileNames.push(res.name || att.file!.name)
          }
        }
        fetchResources(id)
        addToast('success', '附件上传成功')
        // 将本地文件名注入消息文本，与资料库的 [引用资料: xxx] 格式保持一致
        if (localFileNames.length > 0) {
          const localRefTexts = localFileNames.map(name => `[上传文件: ${name}]`)
          sendingMessage = localRefTexts.join('\n') + '\n\n' + sendingMessage
        }
      } catch (err) {
        console.error('上传附件失败:', err)
        addToast('error', '附件上传失败')
      } finally {
        setUploading(false)
      }
    }
      
    // 2. 引用的资料库文件 - 将资源信息注入消息内容，让上游 AI 能识别
    const libraryAttachments = attachments.filter(a => a.type === 'library')
    if (libraryAttachments.length > 0) {
      const storeResources = useAppStore.getState().resources
      const refTexts: string[] = []
      for (const ref of libraryAttachments) {
        resourceRefs.push(ref.id)
        const resource = storeResources.find(r => r.id === ref.id)
        if (resource) {
          refTexts.push(`[引用资料: ${resource.name}]`)
        }
      }
      if (refTexts.length > 0) {
        sendingMessage = refTexts.join('\n') + '\n\n' + sendingMessage
      }
    }
  
    // 3. 通过 WebSocket 发送消息
    sendMessageWS(urlSessionId, sendingMessage, resourceRefs)
  }
  
  const mapStreamStatus = (s?: string): MessageStatus | undefined => {
    if (!s || typeof s !== 'string') return undefined
    const v = s.toLowerCase()
    if (v.includes('think') || v.includes('reason')) return 'thinking'
    if (v.includes('tool')) return 'tool-calling'
    if (v.includes('stream') || v.includes('generat') || v.includes('输出')) return 'streaming'
    return 'streaming'
  }

  // 消息转换
  const chatMessages: ChatMessage[] = messages.map(m => ({
    // 兼容后端回传的 process 元信息，先在现有聊天组件里渲染“思考/过程”折叠块。
    messageKind: (() => {
      const kind = (m.attachments as any)?.upstream_kind
      const isProcess = Boolean((m.attachments as any)?.is_process)
      if (kind === 'system') return 'system' as const
      if (isProcess || kind === 'reasoning' || kind === 'internal_thought' || kind === 'subliminal_thought') {
        return 'reasoning' as const
      }
      return 'normal' as const
    })(),
    id: m.id,
    role: (m.role === 'system' ? 'assistant' : m.role) as 'user' | 'assistant',
    content: m.content,
    upstreamKind:
      typeof (m.attachments as any)?.upstream_kind === 'string'
        ? String((m.attachments as any).upstream_kind)
        : undefined,
    thinkingTime: undefined,
    status: m.role === 'assistant' ? mapStreamStatus(m.status) : undefined,
  }))
  const currentSessionPagination = urlSessionId ? messagePagination[urlSessionId] : undefined
  
  // 资料库文件
  const libraryFiles = resources
    .filter(r => r.type === 'document' || r.type === 'pdf' || r.type === 'note' || r.type === 'link')
    .map(r => ({ id: r.id, name: r.name }))
  
  // 资源分类
  const docResources = resources.filter(r => r.type === 'document' || r.type === 'pdf')
  const linkResources = resources.filter(r => r.type === 'link')
  const noteResources = resources.filter(r => r.type === 'note' || r.type === 'text')
  const outputResources = resources.filter(r => r.type === 'output' || r.type === 'html_page' || r.type === 'artifact')
  const detectOutputOrigin = (r: { type?: string; url?: string | null; content?: string }) => {
    const url = r.url || ''
    if (r.type === 'artifact' || r.type === 'html_page') return 'generated' as const
    if (url.startsWith('source:') || url.startsWith('w6-file:')) return 'generated' as const
    if (url.startsWith('sdk-file:')) return 'uploaded' as const
    if (r.type === 'output' && (r.content || '').trim()) return 'generated' as const
    return 'uploaded' as const
  }
  /** 上游同步的 artifact 中，图片/音视频等多为用户上传附件，不应出现在「会话生成产物」列表 */
  const isUserMediaLikeArtifact = (r: { type?: string; name?: string }) => {
    if (r.type !== 'artifact') return false
    return /\.(jpe?g|png|gif|webp|bmp|svg|mp4|mov|webm|avi|mkv|mp3|wav|m4a|zip)$/i.test(r.name || '')
  }
  /** 误标为 output 的短文本/空内容图片文件（如聊天附件落库形态） */
  const isImageLikeNonTextOutput = (r: { type?: string; name?: string; content?: string }) => {
    if (r.type !== 'output') return false
    if (!/\.(jpe?g|png|gif|webp|bmp|svg)$/i.test(r.name || '')) return false
    return (r.content || '').trim().length < 200
  }
  /** 右侧 Studio 产物：仅当前会话 + 生成类，并排除用户上传类媒体 */
  const filteredOutputResources = outputResources.filter((r) => {
    if (!urlSessionId || r.session_id !== urlSessionId) return false
    if (detectOutputOrigin(r) !== 'generated') return false
    if (isUserMediaLikeArtifact(r)) return false
    if (isImageLikeNonTextOutput(r)) return false
    return true
  })
  const activeTodoResource = resources.find((r) => r.type === 'todo_state' && r.session_id === urlSessionId)
  const todoItems: Array<{ text: string; done: boolean }> = (() => {
    if (!activeTodoResource?.content) return []
    try {
      const parsed = JSON.parse(activeTodoResource.content)
      if (!Array.isArray(parsed)) return []
      return parsed
        .map((item: any) => ({
          text: String(item?.text || '').trim(),
          done: Boolean(item?.done),
        }))
        .filter((item: any) => item.text)
    } catch {
      return []
    }
  })()
  const liveTodoItems = urlSessionId ? (liveTodosBySession[urlSessionId] || []) : []
  const chatTodoItems = (liveTodoItems.length > 0 ? liveTodoItems : todoItems).map((item, idx) => ({
    id: `todo-${idx}-${item.text.slice(0, 10)}`,
    text: item.text,
    done: item.done,
  }))
  const studioTools = promptTemplates.map((template) => {
    const styleMap: Record<string, { color: string; textColor: string }> = {
      ppt: { color: 'from-amber-100 to-amber-50', textColor: 'text-amber-700' },
      dynamic_web: { color: 'from-indigo-100 to-indigo-50', textColor: 'text-indigo-700' },
      quiz: { color: 'from-lime-100 to-lime-50', textColor: 'text-lime-700' },
      mind_map: { color: 'from-sky-100 to-sky-50', textColor: 'text-sky-700' },
      image: { color: 'from-rose-100 to-rose-50', textColor: 'text-rose-700' },
    }
    const style = styleMap[template.action_type] || {
      color: 'from-slate-100 to-slate-50',
      textColor: 'text-slate-700',
    }
    return {
      id: template.id,
      label: template.name,
      prompt: template.prompt || '',
      color: style.color,
      textColor: style.textColor,
    }
  })

  /** 选中 Studio 技能 — 不再填入提示词，而是作为标签显示在输入框 */
  const handleSelectStudioTool = (tool: (typeof studioTools)[number] | null) => {
    if (isStreaming) {
      addToast('info', '当前正在生成中，请稍后再试')
      return
    }
    if (tool) {
      setActiveStudioTool(tool.id)
    } else {
      setActiveStudioTool(null)
    }
  }

  /** Studio 产物列表项下载：优先走 source: 下载，否则预留 artifact download API */
  const handleDownloadResource = async (resource: typeof outputResources[number]) => {
    const sourceId = resource.url?.startsWith('source:') ? resource.url.replace('source:', '') : null
    if (sourceId) {
      try {
        await chatApi.downloadSource(sourceId)
        addToast('success', '下载已开始')
      } catch (error) {
        console.error(error)
        addToast('error', '下载失败')
      }
      return
    }
    if (resource.content?.trim()) {
      try {
        const blob = new Blob([resource.content], { type: 'text/html;charset=utf-8' })
        const objectURL = URL.createObjectURL(blob)
        const a = document.createElement('a')
        const hasExt = /\.[a-z0-9]+$/i.test(resource.name || '')
        a.href = objectURL
        a.download = hasExt ? resource.name : `${resource.name}.html`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(objectURL)
        addToast('success', '下载已开始')
      } catch (error) {
        console.error(error)
        addToast('error', '下载失败')
      }
      return
    }
    // 预留后端 artifact download API（Task #18 将实现）
    if (id) {
      const downloadUrl = `${API_ENDPOINTS.projectArtifactDownload(id, resource.id)}`
      window.open(downloadUrl, '_blank')
    }
  }

  const handleRename = async (type: string, resId: string) => {
    if (!id) return;
    const resource = resources.find(r => r.id === resId);
    if (!resource) return;
    const newName = await prompt({
      title: '重命名',
      message: '请输入新的名称',
      defaultValue: resource.name,
      placeholder: '名称',
    });
    if (newName && newName !== resource.name) {
      try {
        await updateResource(id, resId, { name: newName });
        fetchResources(id);
      } catch (err) {
        addToast('error', '重命名失败');
      }
    }
  }
  
  const handleDelete = async (type: string, resId: string) => {
    if(!id) return;
    const confirmed = await confirm({
      title: '删除资源',
      message: '确定要删除此资源吗？此操作不可恢复。',
      variant: 'danger',
      confirmText: '删除',
      cancelText: '取消',
    });
    if(confirmed) {
      try { 
        await deleteResource(id, resId); 
        fetchResources(id);
        addToast('success', '已删除');
      } catch(err) { 
        console.error(err); 
        addToast('error', '删除失败');
      }
    }
  }

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!id || !e.target.files || e.target.files.length === 0) return
    const file = e.target.files[0]
    
    // File format check
    const allowedExtensions = ['.txt', '.md', '.pdf', '.doc', '.docx'];
    const fileName = file.name.toLowerCase();
    const isAllowed = allowedExtensions.some(ext => fileName.endsWith(ext));
    
    if (!isAllowed) {
        addToast('error', '不支持的文件格式。仅支持 txt, md, pdf, doc, docx。');
        e.target.value = '';
        return;
    }

    // File size check (e.g. max 10MB limit)
    const MAX_SIZE = 10 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
        addToast('error', '文件大小不可超过 10MB');
        e.target.value = '';
        return;
    }

    try {
      setIsUploading(true)
      setUploadingFileName(file.name)
      setUploadProgress('uploading')

      await uploadResource(id, file)

      // 上传完成，进入解析状态
      setUploadProgress('parsing')
      await fetchResources(id)

      // 显示完成状态后淡出
      setUploadProgress('completed')
      setTimeout(() => {
        setUploadingFileName(null)
        setUploadProgress(null)
      }, 1500)
    } catch (err: any) {
      console.error(err)
      addToast('error', err.message || '上传失败，请重试')
      setUploadingFileName(null)
      setUploadProgress(null)
    } finally {
      setIsUploading(false)
      e.target.value = ''
    }
}
  
  return (
    <div className="flex flex-col h-screen bg-white">
      <ProjectHeader
        title={currentProject?.name}
        isLeftCollapsed={isLeftCollapsed}
        isRightCollapsed={isRightCollapsed}
        onToggleLeft={() => setIsLeftCollapsed(v => !v)}
        onToggleRight={() => setIsRightCollapsed(v => !v)}
        onRename={handleProjectRename}
        rightSlot={<ProjectHeaderMenu onArchive={handleProjectArchive} />}
      />

      {/* 三栏主体 */}
      <div className="flex flex-1 overflow-hidden gap-2 p-2 bg-gray-50/40">

        {/* ── 左侧资料栏 ── */}
        <LeftPane collapsed={isLeftCollapsed} width={leftWidth} onResizeStart={startDragLeft}>
          {isLeftCollapsed ? (
            /* 收起态：展开按钮 + 文字标签 */
            <div className="flex flex-col items-center gap-2 pt-3 h-full" style={{ width: '48px' }}>
              <button
                onClick={() => setIsLeftCollapsed(false)}
                className="flex items-center justify-center w-8 h-8 rounded-full bg-gray-100 hover:bg-primary-50 hover:text-primary-600 transition-colors duration-200 flex-shrink-0 text-gray-500"
                title="展开资料栏"
              >
                <ChevronRight size={15} />
              </button>
              <span
                className="text-[10px] text-gray-400 cursor-pointer hover:text-primary-600 transition-colors whitespace-nowrap select-none"
                style={{ writingMode: 'vertical-rl' }}
                onClick={() => setIsLeftCollapsed(false)}
              >
                资料
              </span>
            </div>
          ) : (
            /* 展开态 */
            <div className="flex flex-col flex-1 overflow-hidden" style={{ width: `${leftWidth}px` }}>
              {/* 标题栏 */}
              <div className="flex items-center justify-between flex-shrink-0 border-b border-gray-100 px-4" style={{ height: '44px' }}>
                <span className="text-sm font-semibold text-gray-800">资料</span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setShowLeftSearch(v => !v)}
                    className="flex items-center justify-center w-7 h-7 rounded-full hover:bg-gray-100 text-gray-500 transition-colors"
                    title="搜索"
                  >
                    <Search size={15} />
                  </button>
                  <div className="relative">
                    <button
                      onClick={() => setShowAddMenu(v => !v)}
                      className="flex items-center justify-center w-7 h-7 rounded-full hover:bg-gray-100 text-gray-500 transition-colors"
                      title="添加"
                    >
                      <Plus size={15} />
                    </button>
                    {showAddMenu && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setShowAddMenu(false)} />
                        <div className="absolute right-0 top-full mt-1 bg-white rounded-xl border border-gray-100 shadow-xl shadow-gray-900/10 z-20 min-w-[140px] py-1 animate-fade-in">
                          <button
                            onClick={() => {
                              setShowAddMenu(false)
                              setShowAddResourceModal(true)
                            }}
                            className="flex items-center gap-2 w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                          >
                            <Upload size={14} className="text-gray-400" />
                            <span>添加资料</span>
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                  <button
                    onClick={() => setIsLeftCollapsed(true)}
                    className="flex items-center justify-center w-7 h-7 rounded-full bg-gray-100 hover:bg-gray-200 transition-colors duration-200 flex-shrink-0"
                    title="收起资料栏"
                  >
                    <ChevronLeft size={14} className="text-gray-500" />
                  </button>
                </div>
              </div>

              {/* 搜索框 */}
              {showLeftSearch && (
                <div className="px-3 py-2 border-b border-gray-100 flex-shrink-0">
                  <div className="flex items-center gap-2 rounded-lg bg-gray-100 px-3 py-2">
                    <Search size={14} className="text-gray-400" />
                    <input
                      type="text"
                      value={leftSearchQuery}
                      onChange={(e) => setLeftSearchQuery(e.target.value)}
                      placeholder="搜索"
                      className="flex-1 bg-transparent text-sm outline-none text-gray-800 placeholder-gray-400"
                      autoFocus
                    />
                    <button
                      onClick={() => { setShowLeftSearch(false); setLeftSearchQuery('') }}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>
              )}

              {/* 资源列表 + 预览 */}
              <div className="relative flex-1 overflow-hidden">
                <div className="h-full overflow-y-auto p-3 space-y-2">
                  {/* 正在上传的文件卡片 */}
                  {uploadingFileName && uploadProgress && (
                    <div className="group flex items-center gap-3 p-2.5 bg-gradient-to-r from-blue-50/80 to-indigo-50/50 border border-blue-100 rounded-lg animate-pulse">
                      <div className="p-1.5 bg-blue-100 rounded-md flex-shrink-0">
                        <FileText size={14} className="text-blue-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-blue-700 truncate">{uploadingFileName}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          {uploadProgress === 'uploading' && (
                            <>
                              <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" />
                              <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce [animation-delay:100ms]" />
                              <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce [animation-delay:200ms]" />
                              <span className="text-[10px] text-blue-500 ml-0.5">上传中</span>
                            </>
                          )}
                          {uploadProgress === 'parsing' && (
                            <>
                              <span className="w-3 h-3 border-2 border-blue-300 border-t-blue-500 rounded-full animate-spin" />
                              <span className="text-[10px] text-blue-500">解析中</span>
                            </>
                          )}
                          {uploadProgress === 'completed' && (
                            <>
                              <svg className="w-3 h-3 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                              <span className="text-[10px] text-emerald-600">已完成</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                    {/* 所有资源 */}
                    {(() => {
                      const query = leftSearchQuery.trim().toLowerCase()
                      const allResources = [
                        ...docResources.map(r => ({ ...r, kind: 'document' as const })),
                        ...linkResources.map(r => ({ ...r, kind: 'link' as const })),
                        ...noteResources.map(r => ({ ...r, kind: 'note' as const })),
                      ].filter(r => !query || r.name.toLowerCase().includes(query))

                      if (allResources.length === 0) {
                        return (
                          <div className="text-center py-8">
                            <FolderOpen size={28} className="text-gray-200 mx-auto mb-2" />
                            <p className="text-xs text-gray-400">{query ? '未找到匹配的资料' : '暂无资料'}</p>
                          </div>
                        )
                      }

                      return allResources.map((r) => {
                        const isDoc = r.kind === 'document'
                        const isLink = r.kind === 'link'
                        const isNote = r.kind === 'note'

                        return (
                          <div
                            key={r.id}
                            onClick={() => {
                              setLeftViewingResource({
                                id: r.id,
                                name: r.name,
                                type: r.type,
                                content: (r as any).content,
                                url: (r as any).url,
                              })
                              setIsLeftPreviewExpanded(false)
                              setIsEditingResource(false)
                              setEditContent((r as any).content || '')
                            }}
                            className={cn(
                              'cursor-pointer group flex items-center gap-3 p-2.5 rounded-lg transition-all duration-200',
                              leftViewingResource?.id === r.id
                                ? 'bg-indigo-50 border border-indigo-200'
                                : 'bg-white hover:bg-gray-50 border border-gray-100 hover:border-gray-200'
                            )}
                          >
                            <div className={cn(
                              'p-1.5 rounded-md flex-shrink-0',
                              isDoc ? 'bg-blue-50' : isLink ? 'bg-emerald-50' : 'bg-amber-50'
                            )}>
                              {isDoc ? <FileText size={14} className="text-blue-400" />
                                : isLink ? <Globe size={14} className="text-emerald-400" />
                                : <StickyNote size={14} className="text-amber-400" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium text-gray-700 truncate">{r.name}</p>
                              <p className="text-xs text-gray-400 mt-0.5 truncate">
                                {isDoc ? ((r as any).size || '文档')
                                  : isLink ? ((r as any).url || '链接')
                                  : ((r as any).content || '笔记').slice(0, 30)}
                              </p>
                            </div>
                            <MoreMenu
                              onRename={() => handleRename(r.kind, r.id)}
                              onDelete={() => handleDelete(r.kind, r.id)}
                            />
                          </div>
                        )
                      })
                    })()}
                  </div>

                  {/* 左侧预览面板 */}
                  {leftViewingResource && id && (
                    <ArtifactPreviewPanel
                      viewingResource={leftViewingResource}
                      projectId={id}
                      isPreviewExpanded={isLeftPreviewExpanded}
                      onClose={() => {
                        setLeftViewingResource(null)
                        setIsLeftPreviewExpanded(false)
                      }}
                      onToggleExpand={() => setIsLeftPreviewExpanded(v => !v)}
                    />
                  )}
                </div>
            </div>
          )}
        </LeftPane>

        {/* 添加资料弹窗 */}
        {showAddResourceModal && (
          <>
            <div className="fixed inset-0 bg-black/30 z-[80]" onClick={() => setShowAddResourceModal(false)} />
            <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[480px] max-w-[90vw] bg-white rounded-2xl shadow-2xl z-[90] overflow-hidden">
              {/* 弹窗标题 */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                <h3 className="text-base font-semibold text-gray-900">添加资料</h3>
                <button
                  onClick={() => setShowAddResourceModal(false)}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="p-5">
                {/* 拖放上传区域 */}
                <div
                  className="border-2 border-dashed border-gray-200 rounded-2xl p-8 text-center hover:border-gray-300 transition-colors cursor-pointer bg-gray-50/50"
                  onClick={() => document.getElementById('modal-file-upload')?.click()}
                  onDragOver={(e) => { e.preventDefault(); e.stopPropagation() }}
                  onDrop={(e) => {
                    e.preventDefault(); e.stopPropagation()
                    const files = e.dataTransfer.files
                    if (files.length > 0) {
                      const input = document.getElementById('modal-file-upload') as HTMLInputElement
                      if (input) {
                        const dt = new DataTransfer()
                        dt.items.add(files[0])
                        input.files = dt.files
                        input.dispatchEvent(new Event('change', { bubbles: true }))
                      }
                    }
                  }}
                >
                  <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-white border border-gray-200 flex items-center justify-center">
                    <Upload size={20} className="text-gray-600" />
                  </div>
                  <p className="text-sm font-medium text-gray-700 mb-1">拖拽文件到这里，或点击上传文件</p>
                  <p className="text-xs text-gray-400">支持 PDF、文档、图片、音频、视频等</p>
                  <input
                    type="file"
                    id="modal-file-upload"
                    className="hidden"
                    onChange={(e) => {
                      handleUpload(e)
                      setShowAddResourceModal(false)
                    }}
                  />
                </div>

                {/* 链接输入区域 */}
                <div className="mt-4">
                  <div className="relative">
                    <textarea
                      value={addLinkText}
                      onChange={(e) => setAddLinkText(e.target.value)}
                      placeholder={'或者将链接粘贴到这里，从 YouTube、播客或任意网页添加内容\n如需添加多个链接，请使用空格或换行分隔'}
                      className="w-full h-28 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700 placeholder-gray-400 resize-none outline-none focus:border-gray-300 transition-colors"
                    />
                  </div>
                  <div className="flex items-center justify-end mt-2 gap-2">
                    <span className="text-xs text-gray-400">{addLinkText.split(/\s+/).filter(Boolean).length}/50</span>
                    <button
                      onClick={async () => {
                        if (!id || !addLinkText.trim()) return
                        const urls = addLinkText.split(/\s+/).filter(Boolean)
                        if (urls.length === 0) return
                        setShowAddResourceModal(false)
                        addToast('info', '正在添加链接...')
                        try {
                          for (const url of urls.slice(0, 50)) {
                            await createResource(id, { type: 'link', name: url, url })
                          }
                          fetchResources(id)
                          addToast('success', `已添加 ${urls.length} 个链接`)
                        } catch (err) {
                          console.error(err)
                          addToast('error', '添加链接失败')
                        } finally {
                          setAddLinkText('')
                        }
                      }}
                      disabled={!addLinkText.trim()}
                      className={cn(
                        'px-4 py-1.5 rounded-full text-sm font-medium transition-colors',
                        addLinkText.trim()
                          ? 'bg-gray-800 text-white hover:bg-gray-900'
                          : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                      )}
                    >
                      添加链接
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {/* ── 中间对话区 ── */}
        <div className="flex flex-1 flex-col min-w-0 min-h-0 overflow-visible rounded-xl border border-gray-100 bg-white shadow-sm">
          {/* AIChatBoxNew 占满剩余高度；允许纵向溢出以便输入区上方的浮层不被裁切 */}
          <div className="flex flex-1 min-h-0 flex-col overflow-visible">
            {!urlSessionId && id ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="w-8 h-8 border-2 border-gray-200 border-t-primary-600 rounded-full animate-spin"></div>
              </div>
            ) : isInitializing ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="w-8 h-8 border-2 border-gray-200 border-t-primary-600 rounded-full animate-spin"></div>
              </div>
            ) : (
            <AIChatBoxNew
              messages={chatMessages}
              todoItems={chatTodoItems}
              studioActions={studioTools}
              activeStudioToolId={activeStudioTool}
              onStudioToolSelect={(tool) => handleSelectStudioTool(tool as typeof studioTools[number] | null)}
              libraryFiles={libraryFiles}
              upstreamInputLocked={uploading || isStreaming}
              upstreamCanStop={Boolean(urlSessionId && isStreaming)}
              upstreamBanner={uploading ? '正在上传附件，请稍候…' : null}
              stoppingUpstream={stoppingUpstream}
              onUpstreamStop={handleUpstreamStop}
              onSendMessage={handleSendMessage}
              autoSend={false}
              defaultInputValue=""
              inputPrefill={studioInputPrefill ?? undefined}
              onCopy={(content) => navigator.clipboard.writeText(content).then(() => addToast('success', '已复制到剪贴板'))}
              onRegenerate={() => addToast('info', '正在准备重新生成...')}
              onSaveAsDocument={async (content) => {
                if (id) {
                  const defaultName = 'AI 提取 (' + new Date().toLocaleTimeString() + ')'
                  const name = await prompt({
                    title: '保存为文档',
                    message: '为这段抽取的知识命名',
                    defaultValue: defaultName,
                    placeholder: '文档名称',
                  })
                  if (!name) return
                  await createResource(id, { type: 'output', name, content, session_id: urlSessionId })
                  fetchResources(id)
                }
              }}
              autoFocus={true}
              isStreaming={isStreaming}
              isLoadingMessages={isLoadingMessages}
              hasMoreOlder={Boolean(currentSessionPagination?.hasMore)}
              loadingOlder={Boolean(currentSessionPagination?.loadingOlder)}
              onLoadOlder={async () => {
                if (!id || !urlSessionId) return
                await loadOlderMessages(id, urlSessionId)
              }}
              // WebSocket 连接状态
              wsConnectionStatus={wsStatus}
              wsReconnectAttempt={wsReconnectAttempt}
              wsReconnectMaxAttempts={wsReconnectMaxAttempts}
              onRetryConnection={urlSessionId ? () => retryWebSocketConnection(urlSessionId) : undefined}
              // 错误状态
              error={error}
              onRetryLoadMessages={urlSessionId && id ? () => fetchMessagesBySession(id, urlSessionId, { mode: 'replaceLatest' }) : undefined}
            />
            )}
          </div>
        </div>

        {/* ── 右侧输出栏 ── */}
        <RightStudioPane collapsed={isRightCollapsed} width={rightWidth} onResizeStart={startDragRight}>
          {!isRightCollapsed && (
            <div className="relative flex flex-col flex-1 overflow-hidden" style={{ width: `${rightWidth}px` }}>
              {/* 顶部：标题 + 操作 + 关闭 */}
              <div
                className="flex items-center justify-between flex-shrink-0 border-b border-gray-100 px-4"
                style={{ height: '44px' }}
              >
                <span className="text-sm font-semibold text-gray-800">
                  作品
                </span>
                <button
                  onClick={() => {
                    setIsRightCollapsed(true)
                  }}
                  className="text-gray-400 hover:text-gray-600 transition-colors duration-200"
                  title="收起"
                >
                  <X size={15} />
                </button>
              </div>

              {/* 内容区域：输出列表 + 预览 或 单个资料预览 */}
              <div className="relative flex-1 min-h-0 flex flex-col">
                <div className="flex-1 border-b border-gray-100 p-3 bg-gray-50/40 overflow-y-auto">
                  <div className="space-y-2">
                    {filteredOutputResources.map((output) => (
                      <div
                        key={output.id}
                        onClick={() => {
                          setRightViewingResource({
                            id: output.id,
                            name: output.name,
                            type: output.type,
                            content: output.content,
                            url: output.url,
                          })
                          setIsRightPreviewExpanded(false)
                          setIsEditingResource(false)
                          setEditContent(output.content || '')
                        }}
                        className={cn(
                          'cursor-pointer group flex items-center gap-3 p-2.5 rounded-lg transition-all duration-200',
                          rightViewingResource?.id === output.id
                            ? 'bg-indigo-50 border border-indigo-200'
                            : 'bg-white hover:bg-gray-50 border border-gray-100 hover:border-gray-200'
                        )}
                      >
                        <div className="p-1.5 bg-indigo-50 rounded-md flex-shrink-0">
                          <FileOutput size={14} className="text-indigo-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-gray-700 truncate">{output.name}</p>
                          <p className="text-xs text-gray-400 flex items-center gap-1.5">
                            <span>
                              {output.type === 'html_page' ? '网页' : output.type === 'artifact' ? 'Artifact' : '输出文档'}
                            </span>
                            <span
                              className={cn(
                                'rounded px-1.5 py-0.5 text-[10px] font-medium',
                                detectOutputOrigin(output) === 'generated'
                                  ? 'bg-indigo-100 text-indigo-700'
                                  : 'bg-emerald-100 text-emerald-700'
                              )}
                            >
                              {detectOutputOrigin(output) === 'generated' ? '生成' : '上传'}
                            </span>
                          </p>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDownloadResource(output)
                          }}
                          className="p-1.5 text-gray-300 hover:text-indigo-500 hover:bg-indigo-50 rounded-md transition-colors opacity-0 group-hover:opacity-100"
                          title="下载"
                        >
                          <Download size={13} />
                        </button>
                        <MoreMenu onRename={() => handleRename('output', output.id)} onDelete={() => handleDelete('output', output.id)} />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              
              {/* 预览面板 */}
              {rightViewingResource && id && (
                <ArtifactPreviewPanel
                  viewingResource={rightViewingResource}
                  projectId={id}
                  isPreviewExpanded={isRightPreviewExpanded}
                  onClose={() => {
                    setRightViewingResource(null)
                    setIsRightPreviewExpanded(false)
                  }}
                  onToggleExpand={() => setIsRightPreviewExpanded(v => !v)}
                />
              )}
            </div>
          )}
        </RightStudioPane>
      </div>
    </div>
  )
}
