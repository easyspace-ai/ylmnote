import type { Message as TMessage } from '@/types'

const SESSION_MESSAGE_CACHE_LIMIT = 20
/** v2：缓存与上游会话 id 绑定，避免换绑 upstream 后仍展示旧 localStorage 内容 */
const SESSION_MESSAGE_CACHE_VERSION = 2

function getSessionMessageCacheKey(projectId: string, sessionId: string) {
  return `youmind:session-messages:v${SESSION_MESSAGE_CACHE_VERSION}:${projectId}:${sessionId}`
}

function normUpstream(u: string | null | undefined): string {
  return (u ?? '').trim()
}

/**
 * @param expectedUpstreamSessionId 当前会话在服务端已知的 `upstream_session_id`（与 sessions 列表一致）。
 *   - 传 `undefined`：表示尚无法确定（例如 sessions 未加载到该会话）——**不**使用缓存，避免误展示。
 *   - 传 `null` 或 `''`：表示尚未绑定上游——仅当缓存条目同样未绑定 upstream 时才命中。
 */
export function readSessionMessageCache(
  projectId: string,
  sessionId: string,
  expectedUpstreamSessionId?: string | null
): TMessage[] {
  if (typeof window === 'undefined') return []
  if (expectedUpstreamSessionId === undefined) {
    return []
  }
  try {
    const raw = localStorage.getItem(getSessionMessageCacheKey(projectId, sessionId))
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed?.messages)) return []
    // v1 或无 upstream 字段的旧数据：视为无效
    if (!('upstream_session_id' in parsed)) {
      return []
    }
    const cachedUp = normUpstream(parsed.upstream_session_id as string | null)
    const exp = normUpstream(expectedUpstreamSessionId)
    if (cachedUp !== exp) {
      return []
    }
    return parsed.messages
      .filter((m: any) => m && m.project_id === projectId && m.session_id === sessionId)
      .slice(-SESSION_MESSAGE_CACHE_LIMIT)
  } catch {
    return []
  }
}

export function writeSessionMessageCache(
  projectId: string,
  sessionId: string,
  messages: TMessage[],
  upstreamSessionId?: string | null
) {
  if (typeof window === 'undefined') return
  try {
    const scoped = messages
      .filter((m) => m.project_id === projectId && m.session_id === sessionId)
      .slice(-SESSION_MESSAGE_CACHE_LIMIT)
    localStorage.setItem(
      getSessionMessageCacheKey(projectId, sessionId),
      JSON.stringify({
        updated_at: Date.now(),
        upstream_session_id: upstreamSessionId ?? null,
        messages: scoped,
      })
    )
  } catch {
    // ignore cache write failures
  }
}
