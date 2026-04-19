import { API_CONFIG } from '@/config/api'
import { useAuthStore } from '@/stores/authStore'
import type { Message as TMessage } from '@/types'

interface FetchHistoryOptions {
  limit?: number
  offset?: number
  since?: number // 时间戳，只获取 since 之后的消息
}

interface FetchHistoryResult {
  messages: TMessage[]
  total: number
  hasMore: boolean
}

interface UpstreamMessage {
  item_id: string | number
  kind?: string
  role?: string
  content?: string
  message_parts?: Array<{
    type: string
    content?: string
  }>
  created_at?: number
  attachments?: any
  state?: any
}

function getAuthToken(): string | null {
  const token = useAuthStore.getState().token
  if (token) return token
  try {
    const raw = localStorage.getItem('youmind-auth')
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed?.state?.token || null
  } catch {
    return null
  }
}

/**
 * 将上游消息格式转换为本地消息格式
 */
function convertUpstreamMessage(msg: UpstreamMessage, projectId: string, sessionId: string): TMessage {
  const id = String(msg.item_id)

  // 提取文本内容
  let content = msg.content || ''
  if (!content && msg.message_parts) {
    content = msg.message_parts
      .filter((part) => part.type === 'text')
      .map((part) => part.content || '')
      .join('')
  }

  // 映射 role
  let role: 'user' | 'assistant' | 'system' = 'assistant'
  if (msg.role === 'user' || msg.kind === 'from_user') {
    role = 'user'
  } else if (msg.role === 'system' || msg.kind === 'episodic_marker' || msg.kind === 'system') {
    role = 'system'
  }

  // 映射 messageKind
  let messageKind = 'normal'
  if (msg.kind === 'reasoning' || msg.kind === 'internal_thought' || msg.kind === 'subliminal_thought') {
    messageKind = 'reasoning'
  } else if (msg.kind === 'episodic_marker' || msg.kind === 'system') {
    messageKind = 'system'
  }

  return {
    id,
    upstream_message_id: id,
    project_id: projectId,
    session_id: sessionId,
    role,
    content,
    status: 'idle',
    attachments: {
      upstream_kind: msg.kind,
      message_kind: messageKind,
      ...(msg.attachments || {}),
    },
    created_at: msg.created_at
      ? new Date(msg.created_at * 1000).toISOString()
      : new Date().toISOString(),
  }
}

/**
 * 从后端代理接口获取历史消息
 * 后端会调用上游 /api/agents/{session_id}/messages 接口
 */
export async function fetchHistory(
  projectId: string,
  sessionId: string,
  options: FetchHistoryOptions = {}
): Promise<FetchHistoryResult> {
  const { limit = 1000, offset = 0, since } = options

  const token = getAuthToken()
  if (!token) {
    throw new Error('Authentication required')
  }

  // 构建查询参数
  const params = new URLSearchParams()
  params.set('limit', String(Math.min(limit, 1000)))
  params.set('offset', String(offset))
  if (since) {
    params.set('since', String(since))
  }

  // 调用后端代理接口
  // 注意：后端需要提供这个代理接口，转发到上游 /api/agents/{session_id}/messages
  const url = `${API_CONFIG.baseUrl}/api/projects/${encodeURIComponent(projectId)}/sessions/${encodeURIComponent(sessionId)}/history?${params.toString()}`

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  })

  if (!response.ok) {
    if (response.status === 404) {
      // 后端代理接口不存在，可能是还没部署
      console.warn('[historySync] History proxy endpoint not found (404), returning empty')
      return { messages: [], total: 0, hasMore: false }
    }
    const error = await response.json().catch(() => ({ detail: 'Unknown error' }))
    throw new Error(error.detail || `HTTP ${response.status}`)
  }

  const data = await response.json()

  // 处理响应格式
  let upstreamMessages: UpstreamMessage[] = []
  if (Array.isArray(data)) {
    upstreamMessages = data
  } else if (data.messages && Array.isArray(data.messages)) {
    upstreamMessages = data.messages
  } else {
    upstreamMessages = []
  }

  // 转换为本地消息格式
  const messages = upstreamMessages.map((msg) => convertUpstreamMessage(msg, projectId, sessionId))

  return {
    messages,
    total: data.total || messages.length,
    hasMore: messages.length === limit,
  }
}

/**
 * 增量获取历史消息（只获取上次同步后的新消息）
 */
export async function fetchIncrementalHistory(
  projectId: string,
  sessionId: string,
  lastSyncAt: number
): Promise<FetchHistoryResult> {
  return fetchHistory(projectId, sessionId, {
    since: lastSyncAt,
    limit: 100, // 增量通常不会太多
  })
}

/**
 * 合并缓存消息和上游消息
 * 策略：上游消息覆盖缓存，保留本地临时消息
 */
export function mergeMessages(cached: TMessage[], upstream: TMessage[]): TMessage[] {
  const map = new Map<string, TMessage>()
  let duplicateCount = 0
  let tempReplacedCount = 0
  let tempPreservedCount = 0

  // 先放入缓存消息
  cached.forEach((m) => {
    map.set(m.id, m)
  })

  // 用上游消息覆盖（但不覆盖 temp 消息，等待上游确认）
  upstream.forEach((m) => {
    if (map.has(m.id)) {
      const existing = map.get(m.id)!
      duplicateCount++
      // 如果本地是临时消息，且上游有确认，替换临时消息
      if (existing.id.startsWith('temp-')) {
        // 检查内容是否匹配（确认是同一个消息）
        if (existing.content === m.content && m.role === 'user') {
          map.set(m.id, m)
          tempReplacedCount++
        } else {
          // 内容不匹配，保留 temp 消息，添加新消息（如果 ID 不同）
          if (m.id !== existing.id) {
            map.set(m.id, m)
          } else {
            tempPreservedCount++
          }
        }
      } else {
        // 非临时消息，使用上游数据覆盖（更新状态）
        map.set(m.id, m)
      }
    } else {
      map.set(m.id, m)
    }
  })

  const result = Array.from(map.values()).sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  )

  // 调试日志：当检测到重复时输出
  if (duplicateCount > 0 || tempReplacedCount > 0 || tempPreservedCount > 0) {
    console.log('[mergeMessages] merge stats', {
      cachedCount: cached.length,
      upstreamCount: upstream.length,
      resultCount: result.length,
      duplicateCount,
      tempReplacedCount,
      tempPreservedCount,
    })
  }

  return result
}

// 导出类型
export type { FetchHistoryOptions, FetchHistoryResult, UpstreamMessage }
