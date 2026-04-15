import { MarkdownRenderer } from '@/components/MarkdownRenderer'
import { useState, useEffect, useRef } from 'react'
import { useParams, useLocation, useNavigate } from 'react-router-dom'
import { 
  FileText, Link as LinkIcon, StickyNote,
  Upload, Plus, MoreVertical, FolderOpen, MessageCircle, Pencil, Trash2, 
  FileOutput, ArrowLeft, Clock, ChevronRight, ChevronLeft, X, Archive, Maximize2, Minimize2
} from 'lucide-react'
import { cn } from '@/utils'
import { useToast } from '@/components/ui/Feedback'

import AIChatBoxNew, { type ChatMessage, type Skill, type Attachment } from '@/components/AIChatBoxNew'
import type { MessageStatus } from '@/components/ai-elements'
import { ProjectHeader } from '@/components/project-detail/ProjectHeader'
import { LeftPane } from '@/components/project-detail/LeftPane'
import { RightStudioPane } from '@/components/project-detail/RightStudioPane'
import { useAppStore } from '@/stores/apiStore'
import { queryClient } from '@/lib/queryClient'
import { useSidebarStore } from '@/components/layout/Sidebar'
import { chatApi, projectApi } from '@/services/api'
import { useQueryClient } from '@tanstack/react-query'

type ResourceType = 'documents' | 'links' | 'notes'
type MainTabType = 'resources' | 'chat'

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
              <span>归档项目</span>
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
    sendMessageStream,
    abortActiveMessageStream,
    sendW6PageFromOutlineStream,
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
  const promptTemplates = useAppStore((state) => state.promptTemplates)
  const fetchPromptTemplates = useAppStore((state) => state.fetchPromptTemplates)
  const isStreaming = useAppStore((state) =>
    Boolean(urlSessionId && state.streamingBySession?.[urlSessionId])
  )
  
  const [activeMainTab, setActiveMainTab] = useState<MainTabType>('chat')
  const [viewingResource, setViewingResource] = useState<{id: string, name: string, type?: string, content?: string, url?: string | null} | null>(null)
  const [isNoteModalOpen, setIsNoteModalOpen] = useState(false)
  const [noteForm, setNoteForm] = useState({ title: '', content: '' })
  const [isEditingResource, setIsEditingResource] = useState(false)
  const [editContent, setEditContent] = useState('')
  const [activeResourceTab, setActiveResourceTab] = useState<ResourceType>('documents')
  const [activeDocumentId, setActiveDocumentId] = useState<string | null>(null)
  const [activeStudioTool, setActiveStudioTool] = useState<string | null>(null)
  /** 点击 Studio 技能时仅填入输入框，用 seq 触发子组件同步 */
  const [studioInputPrefill, setStudioInputPrefill] = useState<{ seq: number; text: string } | null>(null)
  const [isLeftCollapsed, setIsLeftCollapsed] = useState(false)
  const [leftWidth, setLeftWidth] = useState(280)
  const [isRightCollapsed, setIsRightCollapsed] = useState(false)
  const [rightWidth, setRightWidth] = useState(280)
  const [isPreviewExpanded, setIsPreviewExpanded] = useState(false)

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
  const { setSidebarCollapsed } = useSidebarStore()
  const { addToast } = useToast()
  
  // 进入项目详情时，收起全局导航栏
  useEffect(() => {
    setSidebarCollapsed(true)
    return () => { setSidebarCollapsed(false) }
  }, [])
  
  // 从主页传递的初始消息（只要发一次就失效）
  const locationState = location.state as any;
  const initialMessage = locationState?.initialMessage || '';
  const autoSendFromState = locationState?.startChat || false;
  // 记录“已经发送过的主题项目ID”，防止跳去别的项目还发
  const hasAutoSentForProject = useRef<string | null>(null);
  
  const [isInitializing, setIsInitializing] = useState(true)
  const hasRedirected = useRef(false)

  // 无 session 时：加载项目与会话后重定向到第一个会话或新建
  useEffect(() => {
    if (!id || urlSessionId) return
    let cancelled = false
    const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms))
    const run = async () => {
      await fetchProject(id)
      await fetchSessions(id)
      if (cancelled) return
      let sessList = useAppStore.getState().sessions
      // 后端会异步创建默认会话；给一点时间避免前端兜底创建导致“双会话”。
      if (sessList.length === 0) {
        for (let i = 0; i < 3 && !cancelled; i++) {
          await sleep(250)
          await fetchSessions(id)
          sessList = useAppStore.getState().sessions
          if (sessList.length > 0) break
        }
      }
      const lastSessionId = localStorage.getItem(getLastSessionStorageKey(id))
      const preferredSession =
        (lastSessionId && sessList.find(s => s.id === lastSessionId)) || sessList[0]
      if (preferredSession && !hasRedirected.current) {
        hasRedirected.current = true
        navigate(`/boards/${id}/sessions/${preferredSession.id}`, { replace: true })
      } else {
        try {
          const newSess = await createSession(id, '新对话')
          if (!cancelled && !hasRedirected.current) {
            hasRedirected.current = true
            navigate(`/boards/${id}/sessions/${newSess.id}`, { replace: true })
          }
        } catch (_) {}
      }
    }
    run()
    return () => { cancelled = true }
  }, [id, urlSessionId, fetchProject, fetchSessions, createSession, navigate])

  // 会话路由切换：切激活会话；先拉会话列表（含 upstream_session_id）再拉消息，保证 localStorage 缓存与当前上游 id 对齐后再读缓存。
  useEffect(() => {
    setActiveMessageSession(urlSessionId)
    if (id && urlSessionId) {
      void (async () => {
        await fetchSessions(id)
        await fetchMessagesBySession(id, urlSessionId, { mode: 'replaceLatest' })
        // 后端会在对话完成后异步回填 timeline；延迟再拉一次确保切回会话时拿到完整历史。
        window.setTimeout(() => {
          if (useAppStore.getState().activeMessageSessionId !== urlSessionId) return
          void fetchMessagesBySession(id, urlSessionId, { mode: 'replaceLatest' })
        }, 1200)
      })()
    } else if (urlSessionId) {
      clearSessionMessages(urlSessionId)
    } else {
      clearSessionMessages()
    }
  }, [id, urlSessionId, setActiveMessageSession, fetchSessions, fetchMessagesBySession, clearSessionMessages])

  useEffect(() => {
    return () => {
      useAppStore.getState().abortActiveMessageStream()
    }
  }, [])

  // 有 projectId + sessionId 时：加载项目、会话列表、该会话消息、资源
  useEffect(() => {
    if (id && urlSessionId) {
      setIsInitializing(true)
      hasRedirected.current = false

      Promise.all([
        fetchProject(id),
        queryClient.refetchQueries({ queryKey: ['projects'] }),
        fetchSessions(id),
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

  // 记录当前项目最近一次打开的会话 ID，刷新后优先恢复到该会话。
  useEffect(() => {
    if (!id || !urlSessionId) return
    localStorage.setItem(getLastSessionStorageKey(id), urlSessionId)
  }, [id, urlSessionId])

  const queryClient = useQueryClient()

  const [stoppingUpstream, setStoppingUpstream] = useState(false)

  const handleUpstreamStop = async () => {
    if (!id || !urlSessionId) return
    setStoppingUpstream(true)
    try {
      useAppStore.getState().abortActiveMessageStream(urlSessionId)
      await chatApi.stopUpstream({ projectId: id, sessionId: urlSessionId })
      addToast('success', '已发送停止指令')
    } catch (e: any) {
      addToast('error', e?.message || '停止失败')
    } finally {
      setStoppingUpstream(false)
    }
  }

  const handleProjectRename = async () => {
    if (!id || !currentProject) return
    const newName = prompt(`重命名对话:`, currentProject.name)
    if (newName && newName !== currentProject.name) {
      await updateProject(id, { name: newName })
      await fetchProject(id)
      void queryClient.invalidateQueries({ queryKey: ['projects'] })
    }
  }

  const handleProjectArchive = async () => {
    if (!id || !currentProject) return
    if (confirm(`确定要归档当前对话 "${currentProject.name}" 吗？`)) {
      await updateProject(id, { status: 'archived' })
      addToast('success', '对话已归档')
      void queryClient.invalidateQueries({ queryKey: ['projects'] })
      navigate('/')
    }
  }

  // 发送消息
  const handleSendMessage = async (message: string, mode: string, skillId: string | null, attachments: Attachment[], model?: string) => {
    if (!id) return
    const sendingMessage = message
    const resourceRefs: Array<{ id: string; name?: string; type?: string }> = []
    
    // 1. 真上传本地文件附件
    const localAttachments = attachments.filter(a => a.type === 'local' && a.file)
    if (localAttachments.length > 0) {
      addToast('info', '正在上传附件...')
      try {
        for (const att of localAttachments) {
          const res = await uploadResource(id, att.file!)
          if (res?.id) {
            resourceRefs.push({
              id: res.id,
              name: res.name || att.name,
              type: res.type || 'document',
            })
          }
        }
        fetchResources(id)
        addToast('success', '附件上传成功')
      } catch (err) {
        console.error('上传附件失败:', err)
        addToast('error', '附件上传失败')
      }
    }
    
    // 2. 引用的资料库文件
    const libraryAttachments = attachments.filter(a => a.type === 'library')
    if (libraryAttachments.length > 0) {
      for (const ref of libraryAttachments) {
        resourceRefs.push({
          id: ref.id,
          name: ref.name,
          type: 'library',
        })
      }
    }

    // 3. 如果当前技能是“动态讲义”，走 W6 流式生成：聊天框实时显示进度，完成后在右侧输出栏展示
    if (skillId && id) {
      const selectedSkill = installedSkills.find(s => s.id === skillId)
      if (selectedSkill && selectedSkill.name.includes('动态讲义')) {
        try {
          setIsRightCollapsed(false)
          await sendW6PageFromOutlineStream(
            id,
            {
              title: sendingMessage.split('\n')[0] || selectedSkill.name || '动态讲义网页',
              outline: sendingMessage,
            },
            {
              onResult: (resource) => {
                addToast('success', '网页已生成，请查看右侧输出内容')
                if (resource?.id) {
                  setViewingResource({
                    id: resource.id,
                    name: resource.name || '动态讲义',
                    type: resource.type || 'html_page',
                    content: resource.content,
                    url: resource.url,
                  })
                  setIsPreviewExpanded(false)
                }
              },
              onError: (msg) => addToast('error', msg || '生成网页失败'),
            }
          )
        } catch (err) {
          console.error(err)
          addToast('error', (err as any)?.message || '生成网页失败')
        }
        return
      }
    }

    await sendMessageStream(
      id,
      urlSessionId ?? undefined,
      sendingMessage,
      skillId || undefined,
      undefined,
      model,
      mode,
      resourceRefs
    )
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
  const activeDocument = activeDocumentId ? docResources.find(d => d.id === activeDocumentId) : null
  const viewingSourceID = viewingResource?.url?.startsWith('source:') ? viewingResource.url.replace('source:', '') : null
  const getResourceExt = (name?: string, url?: string | null) => {
    const fromName = (name || '').split('.').pop()?.toLowerCase() || ''
    if (fromName) return fromName
    const fromURL = (url || '').split('?')[0].split('#')[0]
    const ext = fromURL.split('.').pop()?.toLowerCase() || ''
    return ext
  }
  const viewingExt = getResourceExt(viewingResource?.name, viewingResource?.url)
  const isHTMLPreview = Boolean(viewingResource && (viewingResource.type === 'html_page' || viewingExt === 'html' || viewingExt === 'htm'))
  const [htmlPreviewUrl, setHtmlPreviewUrl] = useState<string | null>(null)
  const [htmlPreviewLoading, setHtmlPreviewLoading] = useState(false)
  const [htmlPreviewError, setHtmlPreviewError] = useState<string | null>(null)
  useEffect(() => {
    if (!isHTMLPreview) {
      setHtmlPreviewUrl(null)
      setHtmlPreviewLoading(false)
      setHtmlPreviewError(null)
      return
    }
    let cancelled = false
    let objectURL: string | null = null

    const run = async () => {
      try {
        setHtmlPreviewLoading(true)
        setHtmlPreviewError(null)

        const inlineContent = (viewingResource?.content || '').trim()
        if (inlineContent) {
          const blob = new Blob([inlineContent], { type: 'text/html;charset=utf-8' })
          objectURL = URL.createObjectURL(blob)
          if (!cancelled) setHtmlPreviewUrl(objectURL)
          return
        }

        if (viewingSourceID) {
          const source = await chatApi.fetchSourceFile(viewingSourceID)
          objectURL = URL.createObjectURL(source.blob)
          if (!cancelled) setHtmlPreviewUrl(objectURL)
          return
        }

        if (!cancelled) {
          setHtmlPreviewUrl(null)
          setHtmlPreviewError('当前网页产物缺少可预览内容')
        }
      } catch (error: any) {
        if (!cancelled) {
          setHtmlPreviewUrl(null)
          setHtmlPreviewError(error?.message || '网页预览加载失败')
        }
      } finally {
        if (!cancelled) setHtmlPreviewLoading(false)
      }
    }
    run()

    return () => {
      cancelled = true
      if (objectURL) URL.revokeObjectURL(objectURL)
    }
  }, [isHTMLPreview, viewingResource?.content, viewingSourceID, viewingResource?.id])
  const downloadOnlyExts = new Set([
    'ppt', 'pptx', 'pdf', 'doc', 'docx', 'xls', 'xlsx', 'zip', 'rar', '7z', 'mp3', 'mp4', 'mov', 'avi'
  ])
  const isDownloadOnlyPreview = Boolean(viewingResource && !isHTMLPreview && downloadOnlyExts.has(viewingExt))
  const canDownloadViewingResource = Boolean(
    viewingResource && (
      (isHTMLPreview && (viewingResource.content || '').trim()) ||
      viewingSourceID
    )
  )

  const handleDownloadViewingResource = async () => {
    if (!viewingResource) return
    if (isHTMLPreview && (viewingResource.content || '').trim()) {
      try {
        const html = viewingResource.content || ''
        const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
        const objectURL = URL.createObjectURL(blob)
        const a = document.createElement('a')
        const fallback = 'preview.html'
        const hasExt = /\.[a-z0-9]+$/i.test(viewingResource.name || '')
        a.href = objectURL
        a.download = hasExt ? (viewingResource.name || fallback) : `${viewingResource.name || 'preview'}.html`
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
    if (!viewingSourceID) {
      addToast('error', '当前产物暂不支持下载')
      return
    }
    try {
      await chatApi.downloadSource(viewingSourceID)
      addToast('success', '下载已开始')
    } catch (error) {
      console.error(error)
      addToast('error', '下载失败')
    }
  }

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

  const applyStudioToolPrompt = (tool: (typeof studioTools)[number]) => {
    if (isStreaming) {
      addToast('info', '当前正在生成中，请稍后再试')
      return
    }
    setActiveStudioTool(tool.id)
    setIsRightCollapsed(false)
    if (!tool.prompt?.trim()) {
      addToast('error', `「${tool.label}」未配置提示词`)
      return
    }
    setStudioInputPrefill({ text: tool.prompt.trim(), seq: Date.now() })
  }

  const resourceTabs = [
    { key: 'documents' as ResourceType, label: '文档', icon: FileText, count: docResources.length },
    { key: 'links' as ResourceType, label: '链接', icon: LinkIcon, count: linkResources.length },
    { key: 'notes' as ResourceType, label: '笔记', icon: StickyNote, count: noteResources.length },
  ]
  
  const handleAddLink = async () => {
    if (!id) return;
    const url = prompt('请输入你要添加的网页链接 (例如: https://example.com):', '');
    if (!url) return;
    try {
      addToast('info', '正在抓取链接内容...');
      await createResource(id, { type: 'link', name: url, url: url });
      addToast('success', '链接添加成功');
      fetchResources(id);
    } catch (err) {
      console.error(err);
      addToast('error', '添加链接失败');
    }
  }

  const handleAddNote = async () => {
    if (!id) return;
    const name = prompt('笔记标题:', '新笔记');
    if (!name) return;
    try {
      await createResource(id, { type: 'note', name: name, content: '' });
      fetchResources(id);
    } catch (err) {
      console.error(err);
      addToast('error', '新建笔记失败');
    }
  }

  const handleRename = async (type: string, resId: string) => {
    if (!id) return;
    const resource = resources.find(r => r.id === resId);
    if (!resource) return;
    const newName = prompt(`重命名:`, resource.name);
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
    if(confirm('确定要删除此资源吗？')) {
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
      addToast('info', '文档上传与解析中，请稍候...', 5000)
      await uploadResource(id, file)
      await fetchResources(id)
      addToast('success', '文档已成功解析入库')
    } catch (err: any) {
      console.error(err)
      addToast('error', err.message || '上传失败，请重试')
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
                项目资料
              </span>
            </div>
          ) : (
            /* 展开态 */
            <div className="flex flex-col flex-1 overflow-hidden" style={{ width: `${leftWidth}px` }}>
              {/* Tab 行 */}
              <div className="flex items-center border-b border-gray-100 flex-shrink-0">
                <button
                  onClick={() => setActiveMainTab('chat')}
                  className={cn(
                    'flex-1 py-2.5 text-sm font-medium transition-colors duration-200 border-b-2',
                    activeMainTab === 'chat'
                      ? 'border-indigo-500 text-indigo-600'
                      : 'border-transparent text-gray-400 hover:text-gray-700'
                  )}
                >
                  对话
                </button>
                <button
                  onClick={() => setActiveMainTab('resources')}
                  className={cn(
                    'flex-1 py-2.5 text-sm font-medium transition-colors duration-200 border-b-2',
                    activeMainTab === 'resources'
                      ? 'border-indigo-500 text-indigo-600'
                      : 'border-transparent text-gray-400 hover:text-gray-700'
                  )}
                >
                  资料
                </button>
                {/* 收起按钮 */}
                <button
                  onClick={() => setIsLeftCollapsed(true)}
                  className="flex items-center justify-center w-7 h-7 rounded-full bg-gray-100 hover:bg-gray-200 transition-colors duration-200 flex-shrink-0 mr-2"
                  title="收起资料栏"
                >
                  <ChevronLeft size={14} className="text-gray-500" />
                </button>
              </div>

              {/* 内容区 */}
              <div className="flex-1 overflow-y-auto">
                {/* 资料 tab */}
                {activeMainTab === 'resources' && (
                  <div>
                    {/* 二级 tab：文档 / 链接 / 笔记 */}
                    <div className="flex border-b border-gray-100 bg-gray-50/60 sticky top-0 z-10">
                      {resourceTabs.map((tab) => (
                        <button
                          key={tab.key}
                          onClick={() => setActiveResourceTab(tab.key)}
                          className={cn(
                            'flex-1 flex items-center justify-center gap-1 py-2.5 text-xs font-medium transition-colors duration-200 border-b-2',
                            activeResourceTab === tab.key
                              ? 'border-indigo-500 text-indigo-600'
                              : 'border-transparent text-gray-400 hover:text-gray-600'
                          )}
                        >
                          <tab.icon size={12} />
                          <span>{tab.label}</span>
                        </button>
                      ))}
                    </div>

                    <div className="p-3 space-y-2">
                      {activeResourceTab === 'documents' && (
                        <>
                          {activeDocument ? (
                            <div className="flex flex-col gap-3">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 min-w-0">
                                  <div className="p-1.5 bg-blue-50 rounded-md flex-shrink-0">
                                    <FileText size={14} className="text-blue-400" />
                                  </div>
                                  <p className="text-xs font-medium text-gray-800 truncate">
                                    {activeDocument.name}
                                  </p>
                                </div>
                                <button
                                  onClick={() => setActiveDocumentId(null)}
                                  className="flex items-center justify-center w-6 h-6 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 transition-colors"
                                  title="返回文档列表"
                                >
                                  <ArrowLeft size={14} />
                                </button>
                              </div>
                              <div className="rounded-lg border border-gray-100 bg-white px-3 py-4 text-xs text-gray-500 leading-relaxed">
                                <p className="mb-1 font-medium text-gray-700">文档预览（占位）</p>
                                <p className="text-gray-400">
                                  这里将展示「{activeDocument.name}」的详细内容和总结，现在仅为交互占位区域。
                                </p>
                              </div>
                            </div>
                          ) : (
                            <>
                              {docResources.length > 0 ? docResources.map((doc) => (
                                <div
                                  key={doc.id}
                                  onClick={() => setActiveDocumentId(doc.id)}
                                  className="group flex items-center gap-3 p-2.5 bg-white hover:bg-gray-50 border border-gray-100 hover:border-gray-200 rounded-lg transition-all duration-200 cursor-pointer"
                                >
                                  <div className="p-1.5 bg-blue-50 rounded-md flex-shrink-0">
                                    <FileText size={14} className="text-blue-400" />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-xs font-medium text-gray-700 truncate">{doc.name}</p>
                                    <p className="text-xs text-gray-400 mt-0.5">{doc.size || '未知大小'}</p>
                                  </div>
                                  <MoreMenu onRename={() => handleRename('document', doc.id)} onDelete={() => handleDelete('document', doc.id)} />
                                </div>
                              )) : (
                                <div className="text-center py-8">
                                  <FileText size={28} className="text-gray-200 mx-auto mb-2" />
                                  <p className="text-xs text-gray-400">暂无文档</p>
                                </div>
                              )}
                              <button
                                onClick={() => document.getElementById('file-upload')?.click()}
                                className="flex items-center justify-center gap-1.5 w-full py-2.5 text-xs text-gray-400 hover:text-gray-600 bg-gray-50 hover:bg-gray-100 border border-dashed border-gray-200 hover:border-gray-300 rounded-lg transition-colors duration-200"
                                disabled={isUploading}
                              >
                                {isUploading ? (
                                  <span className="flex items-center gap-1.5">
                                    <span className="w-3 h-3 border-2 border-gray-300 border-t-gray-500 rounded-full animate-spin" />
                                    <span>上传中...</span>
                                  </span>
                                ) : (
                                  <>
                                    <Upload size={13} />
                                    <span>上传文档</span>
                                  </>
                                )}
                              </button>
                              <input type="file" id="file-upload" accept=".txt,.md,.pdf,.doc,.docx" onChange={handleUpload} className="hidden" />
                            </>
                          )}
                        </>
                      )}

                      {activeResourceTab === 'links' && (
                        <>
                          {linkResources.length > 0 ? linkResources.map((link) => (
                            <div
                              key={link.id}
                              onClick={() => {
                                setViewingResource({
                                  id: link.id,
                                  name: link.name,
                                  type: link.type,
                                  content: (link as any).content,
                                  url: link.url,
                                })
                                setIsPreviewExpanded(false)
                                setIsRightCollapsed(false)
                                setIsEditingResource(false)
                                setEditContent((link as any).content || '')
                              }}
                              className="group flex items-center gap-3 p-2.5 bg-white hover:bg-gray-50 border border-gray-100 hover:border-gray-200 rounded-lg transition-all duration-200 cursor-pointer"
                            >
                              <div className="p-1.5 bg-emerald-50 rounded-md flex-shrink-0">
                                <LinkIcon size={14} className="text-emerald-400" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium text-gray-700 truncate">{link.name}</p>
                                <p className="text-xs text-gray-400 mt-0.5 truncate">{link.url || '无链接'}</p>
                              </div>
                              <MoreMenu onRename={() => handleRename('link', link.id)} onDelete={() => handleDelete('link', link.id)} />
                            </div>
                          )) : (
                            <div className="text-center py-8">
                              <LinkIcon size={28} className="text-gray-200 mx-auto mb-2" />
                              <p className="text-xs text-gray-400">暂无链接</p>
                            </div>
                          )}
                          <button onClick={handleAddLink} className="flex items-center justify-center gap-1.5 w-full py-2.5 text-xs text-gray-400 hover:text-gray-600 bg-gray-50 hover:bg-gray-100 border border-dashed border-gray-200 hover:border-gray-300 rounded-lg transition-colors duration-200">
                            <Plus size={13} />
                            <span>添加链接</span>
                          </button>
                        </>
                      )}

                      {activeResourceTab === 'notes' && (
                        <>
                          {noteResources.length > 0 ? noteResources.map((note) => (
                            <div
                              key={note.id}
                              onClick={() => {
                                setViewingResource({
                                  id: note.id,
                                  name: note.name,
                                  type: note.type,
                                  content: note.content,
                                  url: note.url,
                                })
                                setIsPreviewExpanded(false)
                                setIsRightCollapsed(false)
                                setIsEditingResource(false)
                                setEditContent(note.content || '')
                              }}
                              className="group flex items-start gap-3 p-2.5 bg-white hover:bg-gray-50 border border-gray-100 hover:border-gray-200 rounded-lg transition-all duration-200 cursor-pointer"
                            >
                              <div className="p-1.5 bg-amber-50 rounded-md flex-shrink-0 mt-0.5">
                                <StickyNote size={14} className="text-amber-400" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium text-gray-700">{note.name}</p>
                                <p className="text-xs text-gray-400 mt-1 line-clamp-2">{note.content || '无内容'}</p>
                              </div>
                              <MoreMenu onRename={() => handleRename('note', note.id)} onDelete={() => handleDelete('note', note.id)} />
                            </div>
                          )) : (
                            <div className="text-center py-8">
                              <StickyNote size={28} className="text-gray-200 mx-auto mb-2" />
                              <p className="text-xs text-gray-400">暂无笔记</p>
                            </div>
                          )}
                          <button onClick={handleAddNote} className="flex items-center justify-center gap-1.5 w-full py-2.5 text-xs text-gray-400 hover:text-gray-600 bg-gray-50 hover:bg-gray-100 border border-dashed border-gray-200 hover:border-gray-300 rounded-lg transition-colors duration-200">
                            <Plus size={13} />
                            <span>新建笔记</span>
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )}

                {/* 对话历史 tab：当前项目下的会话列表 */}
                {activeMainTab === 'chat' && (
                  <div className="p-3">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">对话管理</p>
                      <button 
                        onClick={async () => {
                          if (!id) return
                          const sess = await createSession(id, '新对话')
                          if (sess?.id) navigate(`/boards/${id}/sessions/${sess.id}`)
                        }}
                        className="p-1 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
                        title="新建对话"
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                    <div className="space-y-1">
                      {sessions.filter(s => s.project_id === id).map(s => {
                        const isActive = s.id === urlSessionId
                        return (
                          <div 
                            key={s.id}
                            onClick={() => !isActive && navigate(`/boards/${id}/sessions/${s.id}`)}
                            className={cn(
                              "group relative flex items-center justify-between p-2.5 rounded-lg border transition-colors cursor-pointer",
                              isActive 
                                ? "bg-indigo-50 border-indigo-100" 
                                : "bg-white border-transparent hover:bg-gray-50"
                            )}
                          >
                            <div className="flex items-center gap-2.5 min-w-0 pr-6">
                              <div className={cn(
                                "p-1.5 rounded-md shadow-sm shrink-0",
                                isActive ? "bg-white text-indigo-500" : "bg-gray-100 text-gray-400 group-hover:bg-white"
                              )}>
                                <MessageCircle size={14} />
                              </div>
                              <div className="min-w-0">
                                <p className={cn(
                                  "text-xs font-medium truncate",
                                  isActive ? "text-indigo-900" : "text-gray-700"
                                )}>{s.title}</p>
                              </div>
                            </div>
                            <div className={cn("absolute right-2 opacity-0 group-hover:opacity-100 transition-opacity", isActive ? "opacity-100" : "")}>
                              <MoreMenu 
                                onRename={async () => {
                                  const newName = prompt('重命名对话:', s.title)
                                  if (newName && newName !== s.title && id) {
                                    await updateSession(id, s.id, newName)
                                    fetchSessions(id)
                                  }
                                }} 
                                onDelete={async () => {
                                  if (!id || !confirm('确定要删除这条对话吗？')) return
                                  await deleteSession(id, s.id)
                                  fetchSessions(id)
                                  if (isActive) {
                                    const remaining = useAppStore.getState().sessions.filter(x => x.project_id === id && x.id !== s.id)
                                    if (remaining.length > 0) {
                                      navigate(`/boards/${id}/sessions/${remaining[0].id}`, { replace: true })
                                    } else {
                                      const newSess = await createSession(id, '新对话')
                                      if (newSess?.id) navigate(`/boards/${id}/sessions/${newSess.id}`, { replace: true })
                                    }
                                  }
                                }} 
                              />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </LeftPane>

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
              onRunStudioTool={(tool) => applyStudioToolPrompt(tool)}
              libraryFiles={libraryFiles}
              upstreamInputLocked={false}
              upstreamCanStop={Boolean(urlSessionId && isStreaming)}
              upstreamBanner={null}
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
                  const name = prompt('为这段抽取的知识命名:', defaultName)
                  if (!name) return
                  await createResource(id, { type: 'output', name, content, session_id: urlSessionId })
                  fetchResources(id)
                }
              }}
              autoFocus={true}
              isStreaming={isStreaming}
              hasMoreOlder={Boolean(currentSessionPagination?.hasMore)}
              loadingOlder={Boolean(currentSessionPagination?.loadingOlder)}
              onLoadOlder={async () => {
                if (!id || !urlSessionId) return
                await loadOlderMessages(id, urlSessionId)
              }}
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
                  Studio
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

              {/* Studio 功能网格 */}
              <div className="flex-shrink-0 border-b border-gray-100 px-3 py-3 bg-gray-50/60">
                <div className="grid grid-cols-2 gap-2">
                  {studioTools.map(tool => (
                    <button
                      key={tool.id}
                      onClick={() => applyStudioToolPrompt(tool)}
                      disabled={isStreaming}
                      className={cn(
                        'relative flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium text-left shadow-sm transition-all duration-150',
                        'bg-gradient-to-br',
                        tool.color,
                        activeStudioTool === tool.id
                          ? 'ring-2 ring-primary-500/60 shadow-md'
                          : 'hover:shadow-md hover:-translate-y-0.5',
                        isStreaming && 'opacity-60 cursor-not-allowed'
                      )}
                    >
                      <span className={cn('truncate', tool.textColor)}>{tool.label}</span>
                      <span className="ml-2 text-[10px] text-gray-400">AI</span>
                    </button>
                  ))}
                </div>
                {studioTools.length === 0 && (
                  <p className="text-xs text-gray-400 text-center py-2">
                    暂无 Studio 动作，请在设置中检查五条提示词模板
                  </p>
                )}
              </div>

              {/* 内容区域：输出列表 + 预览 或 单个资料预览 */}
              <div className="relative flex-1 min-h-0 flex flex-col">
                <div className="flex-1 border-b border-gray-100 p-3 bg-gray-50/40 overflow-y-auto">
                  <div className="space-y-2">
                    {filteredOutputResources.map((output) => (
                      <div
                        key={output.id}
                        onClick={() => {
                          setViewingResource({
                            id: output.id,
                            name: output.name,
                            type: output.type,
                            content: output.content,
                            url: output.url,
                          })
                          setIsPreviewExpanded(false)
                          setIsEditingResource(false)
                          setEditContent(output.content || '')
                        }}
                        className={cn(
                          'cursor-pointer group flex items-center gap-3 p-2.5 rounded-lg transition-all duration-200',
                          viewingResource?.id === output.id
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
                            <span>{output.type === 'html_page' ? '网页' : '输出文档'}</span>
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
                        <MoreMenu onRename={() => handleRename('output', output.id)} onDelete={() => handleDelete('output', output.id)} />
                      </div>
                    ))}
                    
                  </div>

                   
                </div>

                
              </div>
              {viewingResource && (
                <>
                  {isPreviewExpanded && (
                    <div
                      className="fixed inset-0 bg-black/30 z-[80]"
                      onClick={() => {
                        setViewingResource(null)
                        setIsPreviewExpanded(false)
                      }}
                    />
                  )}
                  <div
                    className={cn(
                      'overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl',
                      isPreviewExpanded
                        ? 'fixed inset-4 z-[90]'
                        : 'absolute inset-0 z-30'
                    )}
                  >
                    <div className="flex items-center justify-between border-b border-gray-100 px-3 py-2">
                      <span className="text-sm font-semibold text-gray-800 truncate">{viewingResource.name}</span>
                      <div className="flex items-center gap-1.5">
                        {isHTMLPreview && viewingResource.content && (
                          <button
                            onClick={() => {
                              if (htmlPreviewUrl) {
                                window.open(htmlPreviewUrl, '_blank', 'noopener,noreferrer')
                                return
                              }
                              const win = window.open('', '_blank')
                              if (!win) return
                              win.document.open()
                              win.document.write(viewingResource.content || '')
                              win.document.close()
                            }}
                            className="text-xs px-2 py-1 rounded-md border border-gray-200 text-gray-600 hover:text-gray-800 hover:border-gray-300"
                            title="在新标签页预览网页"
                          >
                            新标签预览
                          </button>
                        )}
                        {canDownloadViewingResource && (
                          <button
                            onClick={handleDownloadViewingResource}
                            className="text-xs px-2 py-1 rounded-md border border-gray-200 text-gray-600 hover:text-gray-800 hover:border-gray-300"
                            title="下载文件"
                          >
                            下载
                          </button>
                        )}
                        <button
                          onClick={() => setIsPreviewExpanded(v => !v)}
                          className="text-xs p-1.5 rounded-md border border-gray-200 text-gray-600 hover:text-gray-800 hover:border-gray-300"
                          title={isPreviewExpanded ? '缩回右栏' : '放大预览'}
                        >
                          {isPreviewExpanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                        </button>
                        <button
                          onClick={() => {
                            setViewingResource(null)
                            setIsPreviewExpanded(false)
                          }}
                          className="text-xs p-1.5 rounded-md border border-gray-200 text-gray-600 hover:text-gray-800 hover:border-gray-300"
                          title="关闭预览"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    </div>
                    <div className="h-[calc(100%-44px)] min-h-0 overflow-hidden">
                      {isHTMLPreview ? (
                        htmlPreviewLoading ? (
                          <div className="h-full flex items-center justify-center bg-white">
                            <div className="flex items-center gap-2 text-sm text-gray-500">
                              <span className="w-4 h-4 rounded-full border-2 border-gray-300 border-t-gray-600 animate-spin" />
                              <span>正在加载网页预览...</span>
                            </div>
                          </div>
                        ) : htmlPreviewUrl ? (
                          <iframe
                            title={viewingResource.name}
                            className="w-full h-full border-0 bg-white"
                            src={htmlPreviewUrl}
                          />
                        ) : (
                          <div className="h-full flex flex-col items-center justify-center gap-3 bg-white p-4">
                            <p className="text-sm text-gray-500">{htmlPreviewError || '网页预览不可用'}</p>
                            {canDownloadViewingResource && (
                              <button
                                onClick={handleDownloadViewingResource}
                                className="text-xs px-3 py-1.5 rounded-md border border-gray-200 text-gray-700 hover:text-gray-900 hover:border-gray-300"
                              >
                                下载文件
                              </button>
                            )}
                          </div>
                        )
                      ) : isDownloadOnlyPreview || (!viewingResource.content && viewingSourceID) ? (
                        <div className="h-full flex flex-col items-center justify-center gap-3 bg-white p-4">
                          <p className="text-sm text-gray-500">该文件类型不支持内联预览，请直接下载查看。</p>
                          <button
                            onClick={handleDownloadViewingResource}
                            className="text-xs px-3 py-1.5 rounded-md border border-gray-200 text-gray-700 hover:text-gray-900 hover:border-gray-300"
                          >
                            下载文件
                          </button>
                        </div>
                      ) : (
                        <div className="h-full overflow-y-auto p-4 bg-white">
                          <MarkdownRenderer content={viewingResource.content || '无内容'} />
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </RightStudioPane>
      </div>
    </div>
  )
}
