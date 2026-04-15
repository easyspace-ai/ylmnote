import { API_CONFIG, API_ENDPOINTS } from '@/config/api'
import { useAuthStore } from '@/stores/authStore'

let redirectingToLogin = false

function getAuthToken(): string | null {
  const token = useAuthStore.getState().token
  if (token) return token
  // Fallback for persisted auth state before hydration.
  try {
    const raw = localStorage.getItem('youmind-auth')
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed?.state?.token || null
  } catch {
    return null
  }
}

function handleUnauthorizedResponse(status: number) {
  if (status !== 401) return
  useAuthStore.getState().logout()
  if (typeof window === 'undefined' || redirectingToLogin) return
  const isAuthPage =
    window.location.pathname.startsWith('/login') ||
    window.location.pathname.startsWith('/register')
  if (isAuthPage) return
  redirectingToLogin = true
  const next = `${window.location.pathname}${window.location.search}${window.location.hash}`
  const redirect = encodeURIComponent(next || '/')
  window.location.replace(`/login?redirect=${redirect}&reason=expired`)
}

// 通用请求方法
async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  // Add cache busting
  const hasQuery = endpoint.includes('?') ? '&' : '?'
  const url = `${API_CONFIG.baseUrl}${endpoint}${hasQuery}t=${Date.now()}`
  
  const token = getAuthToken()
  const authHeaders = token ? { Authorization: `Bearer ${token}` } : {}
  
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      // Disable caching explicitly
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
      ...authHeaders,
      ...(options.headers as any),
    } as any
  })
  
  if (!response.ok) {
    handleUnauthorizedResponse(response.status)
    const error = await response.json().catch(() => ({ detail: 'Unknown error' }))
    throw new Error(error.detail || `HTTP ${response.status}`)
  }
  
  return response.json()
}

// ============ 项目 API ============
export const projectApi = {
  // 获取项目列表
  list: (params?: { status?: string; skip?: number; limit?: number }) => {
        const cleanParams: Record<string, string> = {}
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '') {
          cleanParams[k] = String(v)
        }
      })
    }
    const query = new URLSearchParams(cleanParams).toString()
    return request<any[]>(`${API_ENDPOINTS.projects}${query ? `?${query}` : ''}`)
  },
  
  // 获取项目详情
  get: (id: string) => request<any>(API_ENDPOINTS.project(id)),
  
  // 创建项目
  create: (data: { name: string; description?: string }) =>
    request<any>(API_ENDPOINTS.projects, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  
  // 更新项目
  update: (id: string, data: Partial<{ name: string; description: string; status: string }>) =>
    request<any>(API_ENDPOINTS.project(id), {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  
  // 删除项目
  delete: (id: string) =>
    request<{ message: string }>(API_ENDPOINTS.project(id), {
      method: 'DELETE',
    }),
  
  
  // 上传资源
  uploadResource: async (projectId: string, file: File) => {
    const formData = new FormData()
    formData.append("file", file)
    const headers: any = {}
    const token = getAuthToken()
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    } else {
      console.warn('[uploadResource] missing auth token, upload likely returns 401')
    }
    const response = await fetch(`${API_CONFIG.baseUrl}${API_ENDPOINTS.project(projectId)}/upload`, {
      method: "POST",
      headers,
      body: formData,
    })
    if (!response.ok) {
      handleUnauthorizedResponse(response.status)
      const error = await response.json().catch(() => ({ detail: 'Upload failed' }))
      throw new Error(error.detail || `HTTP ${response.status}`)
    }
    return response.json()
  },
  // 会话：按项目列出、创建
  listSessions: (projectId: string) =>
    request<any[]>(`${API_ENDPOINTS.projectSessions(projectId)}?limit=100`),
  createSession: (projectId: string, data?: { title?: string }) =>
    request<any>(API_ENDPOINTS.projectSessions(projectId), {
      method: 'POST',
      body: JSON.stringify(data || { title: '新对话' }),
    }),
  updateSession: (projectId: string, sessionId: string, data: { title: string }) =>
    request<any>(API_ENDPOINTS.projectSession(projectId, sessionId), {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  bindSessionUpstream: (projectId: string, sessionId: string, upstreamSessionId: string) =>
    request<any>(API_ENDPOINTS.projectSessionUpstream(projectId, sessionId), {
      method: 'PATCH',
      body: JSON.stringify({ upstream_session_id: upstreamSessionId }),
    }),
  deleteSession: (projectId: string, sessionId: string) =>
    request<{ message: string }>(API_ENDPOINTS.projectSession(projectId, sessionId), {
      method: 'DELETE',
    }),
  getSessionMessages: (projectId: string, sessionId: string, params?: { skip?: number; limit?: number }) => {
    const query = new URLSearchParams()
    if (typeof params?.skip === 'number') query.set('skip', String(params.skip))
    if (typeof params?.limit === 'number') query.set('limit', String(params.limit))
    const queryString = query.toString()
    return request<any[]>(`${API_ENDPOINTS.projectSessionMessages(projectId, sessionId)}${queryString ? `?${queryString}` : ''}`)
  },

  // 获取消息列表（按项目，兼容）
  getMessages: (projectId: string) =>
    request<any[]>(API_ENDPOINTS.projectMessages(projectId)),

  // 创建消息（需 session_id）
  createMessage: (projectId: string, data: { session_id: string; content: string; skillId?: string }) =>
    request<any>(API_ENDPOINTS.projectMessages(projectId), {
      method: 'POST',
      body: JSON.stringify({ ...data, session_id: data.session_id }),
    }),
  
  // 获取资源列表
  getResources: (projectId: string, type?: string) => {
    const query = type ? `?type=${type}` : ''
    return request<any[]>(`${API_ENDPOINTS.projectResources(projectId)}${query}`)
  },
  
  // 创建资源
  createResource: (projectId: string, data: { type: string; name: string; content?: string; url?: string; session_id?: string }) =>
    request<any>(API_ENDPOINTS.projectResources(projectId), {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  
  // 修改消息
  updateMessage: (projectId: string, messageId: string, content: string) =>
    request<any>(`${API_ENDPOINTS.project(projectId)}/messages/${messageId}`, {
      method: 'PATCH',
      body: JSON.stringify({ content }),
    }),
    
  // 删除消息
  deleteMessage: (projectId: string, messageId: string) =>
    request<any>(`${API_ENDPOINTS.project(projectId)}/messages/${messageId}`, {
      method: 'DELETE',
    }),
    
  // 修改资源
  updateResource: (projectId: string, resourceId: string, data: { name?: string; content?: string }) =>
    request<any>(`${API_ENDPOINTS.project(projectId)}/resources/${resourceId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
    
  // 删除资源
  deleteResource: (projectId: string, resourceId: string) =>
    request<{ message: string }>(`${API_ENDPOINTS.projectResources(projectId)}/${resourceId}`, {
      method: 'DELETE',
    }),

  // 根据大纲生成 HTML 页面（W6 pagemaker）
  generatePageFromOutline: (projectId: string, data: { title: string; knowledgePoints?: string; outline?: string; outlineResourceId?: string }) =>
    request<any>(API_ENDPOINTS.projectPageFromOutline(projectId), {
      method: 'POST',
      body: JSON.stringify({
        title: data.title,
        knowledge_points: data.knowledgePoints || '',
        outline: data.outline,
        outline_resource_id: data.outlineResourceId,
      }),
    }),

  // 流式生成：通过 SSE 在聊天框实时显示进度，完成后 onResult 返回资源
  generatePageFromOutlineStream: async (
    projectId: string,
    data: { title: string; knowledgePoints?: string; outline?: string; outlineResourceId?: string },
    callbacks: {
      onProgress?: (step: string, message: string) => void
      onResult?: (resource: any) => void
      onError?: (detail: string) => void
    }
  ) => {
    const token = useAuthStore.getState().token
    const url = `${API_CONFIG.baseUrl}${API_ENDPOINTS.projectPageFromOutline(projectId)}?stream=1&t=${Date.now()}`
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
        'Cache-Control': 'no-cache',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        title: data.title,
        knowledge_points: data.knowledgePoints || '',
        outline: data.outline,
        outline_resource_id: data.outlineResourceId,
      }),
    })
    if (!res.ok) {
      handleUnauthorizedResponse(res.status)
      const err = await res.json().catch(() => ({ detail: 'Unknown error' }))
      callbacks.onError?.(err.detail || `HTTP ${res.status}`)
      return
    }
    const reader = res.body?.getReader()
    if (!reader) {
      callbacks.onError?.('No response body')
      return
    }
    const dec = new TextDecoder()
    let buf = ''
    const parseBlock = (block: string) => {
      let event = ''
      let data = ''
      for (const line of block.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim()
        if (line.startsWith('data:')) data = line.slice(5).trim()
      }
      if (event === 'progress' && data) {
        try {
          const d = JSON.parse(data)
          callbacks.onProgress?.(d.step, d.message || d.step)
        } catch (_) {}
      } else if (event === 'result' && data) {
        try {
          callbacks.onResult?.(JSON.parse(data))
        } catch (_) {}
      } else if (event === 'error' && data) {
        try {
          const d = typeof data === 'string' && data.startsWith('{') ? JSON.parse(data) : { detail: data }
          callbacks.onError?.(d.detail || data)
        } catch (_) {
          callbacks.onError?.(data)
        }
      }
    }
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += dec.decode(value, { stream: true })
        const parts = buf.split('\n\n')
        buf = parts.pop() || ''
        for (const part of parts) if (part.trim()) parseBlock(part)
      }
      if (buf.trim()) parseBlock(buf)
    } catch (e: any) {
      callbacks.onError?.(e?.message || 'Stream error')
    }
  },
}

// ============ 技能 API ============
export const skillApi = {
  // 获取技能列表
  list: (params?: { category?: string; installed?: boolean; personal?: boolean; search?: string }) => {
        const cleanParams: Record<string, string> = {}
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '') {
          cleanParams[k] = String(v)
        }
      })
    }
    const query = new URLSearchParams(cleanParams).toString()
    return request<any[]>(`${API_ENDPOINTS.skills}${query ? `?${query}` : ''}`)
  },
  
  // 获取已安装技能
  getInstalled: () => request<any[]>(API_ENDPOINTS.skillsInstalled),
  
  // 获取推荐技能
  getRecommended: (limit = 4) =>
    request<any[]>(`${API_ENDPOINTS.skillsRecommended}?limit=${limit}`),
  
  // 获取技能详情
  get: (id: string) => request<any>(API_ENDPOINTS.skill(id)),
  
  // 创建技能
  create: (data: { name: string; description?: string; icon?: string; category?: string }) =>
    request<any>(API_ENDPOINTS.skills, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  
  // 安装技能
  install: (id: string) =>
    request<{ message: string }>(API_ENDPOINTS.skillInstall(id), {
      method: 'POST',
    }),
  
  // 卸载技能
  uninstall: (id: string) =>
    request<{ message: string }>(API_ENDPOINTS.skillUninstall(id), {
      method: 'POST',
    }),
}

// ============ 聊天 API ============
export const chatApi = {
  // 发送消息
  send: async (data: {
    message: string
    projectId?: string
    sessionId?: string
    skillId?: string
    attachments?: Record<string, any>
    resourceRefs?: Array<{ id: string; name?: string; type?: string }>
    model?: string
    mode?: string
  }) => {
    const body = {
      message: data.message,
      project_id: data.projectId,
      session_id: data.sessionId,
      skill_id: data.skillId,
      attachments: data.attachments,
      resource_refs: data.resourceRefs,
      model: data.model,
      mode: data.mode,
    }
    return request<any>(API_ENDPOINTS.chat, {
      method: 'POST',
      body: JSON.stringify(body),
    })
  },
  
  // 流式发送消息
  stream: async function* (
    data: {
      message: string
      projectId?: string
      sessionId?: string
      skillId?: string
      attachments?: Record<string, any>
      resourceRefs?: Array<{ id: string; name?: string; type?: string }>
      model?: string
      mode?: string
    },
    signal?: AbortSignal
  ): AsyncGenerator<any> {
    const body = {
      message: data.message,
      project_id: data.projectId,
      session_id: data.sessionId,
      skill_id: data.skillId,
      attachments: data.attachments,
      resource_refs: data.resourceRefs,
      model: data.model,
      mode: data.mode,
    }
    const streamHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    if (useAuthStore.getState().token) {
      streamHeaders['Authorization'] = `Bearer ${useAuthStore.getState().token}`
    }
    // 超时保护：130s（与后端AI Base 120s对齐，留10s缓冲）
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 130_000)
    const cancelByCaller = () => controller.abort()
    signal?.addEventListener('abort', cancelByCaller)
    let response: Response
    try {
      response = await fetch(`${API_CONFIG.baseUrl}${API_ENDPOINTS.chatStream}`, {
        method: 'POST',
        headers: streamHeaders,
        body: JSON.stringify(body),
        signal: controller.signal,
      })
    } catch (e: any) {
      clearTimeout(timeoutId)
      if (e.name === 'AbortError') throw new Error('AI 响应超时（超过120秒），请稍后重试')
      throw e
    }
    
    if (!response.ok) {
      clearTimeout(timeoutId)
      handleUnauthorizedResponse(response.status)
      throw new Error(`HTTP ${response.status}`)
    }
    
    const reader = response.body?.getReader()
    if (!reader) {
      clearTimeout(timeoutId)
      signal?.removeEventListener('abort', cancelByCaller)
      return
    }
    
    const decoder = new TextDecoder()
    let buffer = ''
    const parseSSEBlock = (block: string): any | null => {
      const lines = block.split('\n')
      const dataLines: string[] = []
      for (const rawLine of lines) {
        const line = rawLine.trimEnd()
        if (line.startsWith('data:')) {
          dataLines.push(line.slice(5).trim())
        }
      }
      if (dataLines.length === 0) return null
      const payload = dataLines.join('\n').trim()
      if (!payload || payload === '[DONE]') return null
      try {
        return JSON.parse(payload)
      } catch {
        return { type: 'content', value: payload }
      }
    }
    
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const blocks = buffer.split('\n\n')
        buffer = blocks.pop() || ''
        for (const block of blocks) {
          const parsed = parseSSEBlock(block)
          if (parsed) {
            yield parsed
          }
        }
      }
      if (buffer.trim()) {
        const parsed = parseSSEBlock(buffer)
        if (parsed) {
          yield parsed
        }
      }
    } finally {
      clearTimeout(timeoutId)
      signal?.removeEventListener('abort', cancelByCaller)
    }
  },
  syncState: (data: { projectId: string; sessionId: string; upstreamSessionId?: string; activateUpstream?: boolean }) =>
    request<{ artifact_count: number; todo_count: number }>(`${API_ENDPOINTS.chat}/sync-state`, {
      method: 'POST',
      body: JSON.stringify({
        project_id: data.projectId,
        session_id: data.sessionId,
        upstream_session_id: data.upstreamSessionId,
        activate_upstream: Boolean(data.activateUpstream),
      }),
    }),

  stopUpstream: (data: { projectId: string; sessionId: string }) =>
    request<{ ok: boolean }>(API_ENDPOINTS.chatUpstreamStop, {
      method: 'POST',
      body: JSON.stringify({
        project_id: data.projectId,
        session_id: data.sessionId,
      }),
    }),

  getRemoteMessages: (
    data: { projectId: string; sessionId: string },
    params?: { skip?: number; limit?: number }
  ) => {
    const query = new URLSearchParams({
      project_id: data.projectId,
      session_id: data.sessionId,
    })
    if (typeof params?.skip === 'number') query.set('skip', String(params.skip))
    if (typeof params?.limit === 'number') query.set('limit', String(params.limit))
    return request<any[]>(`${API_ENDPOINTS.chatRemoteMessages}?${query.toString()}`)
  },
  downloadSource: async (sourceId: string) => {
    const token = getAuthToken()
    const res = await fetch(
      `${API_CONFIG.baseUrl}${API_ENDPOINTS.chat}/source/${encodeURIComponent(sourceId)}?download=1&t=${Date.now()}`,
      {
        method: 'GET',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      }
    )
    if (!res.ok) {
      handleUnauthorizedResponse(res.status)
      throw new Error(`HTTP ${res.status}`)
    }
    const disposition = res.headers.get('content-disposition') || ''
    const match = /filename=\"?([^\";]+)\"?/.exec(disposition)
    const filename = match?.[1] || sourceId
    const blob = await res.blob()
    const objectUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = objectUrl
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(objectUrl)
  },
  fetchSourceFile: async (sourceId: string) => {
    const token = getAuthToken()
    const res = await fetch(
      `${API_CONFIG.baseUrl}${API_ENDPOINTS.chat}/source/${encodeURIComponent(sourceId)}?t=${Date.now()}`,
      {
        method: 'GET',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      }
    )
    if (!res.ok) {
      handleUnauthorizedResponse(res.status)
      throw new Error(`HTTP ${res.status}`)
    }
    const disposition = res.headers.get('content-disposition') || ''
    const match = /filename=\"?([^\";]+)\"?/.exec(disposition)
    const filename = match?.[1] || sourceId
    const contentType = res.headers.get('content-type') || ''
    const blob = await res.blob()
    return { blob, filename, contentType }
  },
}

// ============ Prompt Template API ============
export const promptTemplateApi = {
  list: () => request<any[]>(API_ENDPOINTS.promptTemplates),
  get: (id: string) => request<any>(API_ENDPOINTS.promptTemplate(id)),
  create: (data: { action_type: string; name: string; prompt: string }) =>
    request<any>(API_ENDPOINTS.promptTemplates, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  update: (id: string, data: Partial<{ action_type: string; name: string; prompt: string }>) =>
    request<any>(API_ENDPOINTS.promptTemplate(id), {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  delete: (id: string) =>
    request<{ message: string }>(API_ENDPOINTS.promptTemplate(id), {
      method: 'DELETE',
    }),
}

// ============ 认证 API ============
export const authApi = {
  login: async (data: any) => {
    const formData = new URLSearchParams()
    formData.append('username', data.username)
    formData.append('password', data.password)
    
    const response = await fetch(`${API_CONFIG.baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData.toString()
    })
    if (!response.ok) {
      const errJson = await response.json();
      console.error("Login 422 Detail:", errJson);
      throw new Error(JSON.stringify(errJson) || '登录失败');
    }
    return response.json()
  },
  register: (data: any) => request<any>('/api/auth/register', { method: 'POST', body: JSON.stringify(data) }),
  getMe: () => request<any>('/api/auth/me', { method: 'GET' }),
}

// ============ 搜索 API ============
export interface SearchResult {
  projects: Array<{
    id: string
    name: string
    description?: string
    status: string
  }>
  skills: Array<{
    id: string
    name: string
    description?: string
    icon?: string
    category: string
  }>
  documents: Array<{
    id: string
    name: string
    content_preview?: string
    project_id?: string
  }>
}

export const searchApi = {
  // 全局搜索
  search: (query: string, limit = 10) => {
    const params = new URLSearchParams({ q: query, limit: String(limit) })
    return request<SearchResult>(`${API_ENDPOINTS.search}?${params}`)
  },
}
