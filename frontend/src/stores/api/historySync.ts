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
  /** WebSocket update 帧使用 */
  item_id?: string | number | null
  /** HTTP GET /api/agents/.../messages（Go AgentMessage）使用 json:"id" */
  id?: string | number | null
  turn_number?: number
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

/**
 * 统一消息主键：HTTP 用 `id`，WS 用 `item_id`；缺失或为 0 时多条会撞同一键，必须用合成 id。
 */
export function stableMessageId(
  msg: {
    item_id?: string | number | null
    id?: string | number | null
    turn_number?: number
    created_at?: number
  },
  sessionId: string,
  index: number
): string {
  const raw = msg.item_id ?? msg.id
  if (raw !== undefined && raw !== null && String(raw) !== 'undefined' && String(raw) !== '') {
    const s = String(raw)
    // 多条消息共用 item_id=0 时控制台会出现 ['0',2] 类重复，不能单独用 "0" 做主键
    if (s !== '0') {
      return s
    }
  }
  const t = msg.turn_number ?? index
  const c = msg.created_at ?? 0
  return `syn:${sessionId}:${t}:${c}:${index}`
}

/**
 * 合并多来源消息后的去重键：优先用上游 item_id/id（upstream_message_id），
 * 避免 HTTP 下标生成的 syn: 与 WS 的数值 id 被当成两条。
 */
export function canonicalDedupeKey(m: TMessage): string {
  if (m.id.startsWith('temp-')) {
    return `temp:${m.id}`
  }
  const u = String(m.upstream_message_id ?? '').trim()
  if (u && u !== 'undefined' && u !== '0' && u !== '') {
    return `u:${u}`
  }
  return `id:${m.id}`
}

function pickRicherDuplicate(a: TMessage, b: TMessage): TMessage {
  const aSyn = a.id.startsWith('syn:')
  const bSyn = b.id.startsWith('syn:')
  if (aSyn !== bSyn) {
    return aSyn ? b : a
  }
  const la = a.content?.length ?? 0
  const lb = b.content?.length ?? 0
  if (la !== lb) {
    return la >= lb ? a : b
  }
  if (/^\d+$/.test(a.id) && !/^\d+$/.test(b.id)) {
    return a
  }
  if (/^\d+$/.test(b.id) && !/^\d+$/.test(a.id)) {
    return b
  }
  return a
}

/** 多来源合并后必须调用，消除「同一条上游消息」因 id 表示不一致产生的重复气泡 */
export function dedupeMessagesByCanonicalKey(messages: TMessage[]): TMessage[] {
  const map = new Map<string, TMessage>()
  for (const m of messages) {
    const k = canonicalDedupeKey(m)
    const existing = map.get(k)
    if (!existing) {
      map.set(k, m)
    } else {
      map.set(k, pickRicherDuplicate(existing, m))
    }
  }
  return Array.from(map.values()).sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  )
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
function convertUpstreamMessage(
  msg: UpstreamMessage,
  projectId: string,
  sessionId: string,
  index: number
): TMessage {
  const id = stableMessageId(msg, sessionId, index)
  const rawUpstream = msg.item_id ?? msg.id

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
    upstream_message_id: rawUpstream != null ? String(rawUpstream) : id,
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

  // 转换为本地消息格式（带序号，避免 item_id 为 0 / 缺失时撞键）
  const messages = upstreamMessages.map((msg, index) =>
    convertUpstreamMessage(msg, projectId, sessionId, index)
  )

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
  let upstreamOverlapCount = 0
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
      upstreamOverlapCount++
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

  let result = Array.from(map.values()).sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  )

  result = dedupeMessagesByCanonicalKey(result)

  // 与缓存同 id 的上游行数（刷新历史时多数会「重叠」，属正常，勿与「重复气泡」混为一谈）
  if (upstreamOverlapCount > 0 || tempReplacedCount > 0 || tempPreservedCount > 0) {
    console.log('[mergeMessages] merge stats', {
      cachedCount: cached.length,
      upstreamCount: upstream.length,
      resultCount: result.length,
      upstreamOverlapCount,
      tempReplacedCount,
      tempPreservedCount,
    })
  }

  return result
}

// 导出类型
export type { FetchHistoryOptions, FetchHistoryResult, UpstreamMessage }
