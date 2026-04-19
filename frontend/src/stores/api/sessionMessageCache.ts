/**
 * @deprecated 已弃用 - 请使用 indexedDBCache.ts
 * 该模块仅保留用于向后兼容，新代码应使用 IndexedDB 缓存层
 * 迁移指南：将 readSessionMessageCache/writeSessionMessageCache 调用替换为
 * indexedDBCache.getMessagesBySession / indexedDBCache.setMessages
 */
import type { Message as TMessage } from '@/types'

const SESSION_MESSAGE_CACHE_LIMIT = 20
/** v3：移除 upstream_session_id 绑定 */
const SESSION_MESSAGE_CACHE_VERSION = 3

console.warn('[sessionMessageCache] This module is deprecated. Please migrate to indexedDBCache.ts')

function getSessionMessageCacheKey(projectId: string, sessionId: string) {
  return `youmind:session-messages:v${SESSION_MESSAGE_CACHE_VERSION}:${projectId}:${sessionId}`
}

/**
 * 读取会话消息缓存
 */
export function readSessionMessageCache(
  projectId: string,
  sessionId: string
): TMessage[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(getSessionMessageCacheKey(projectId, sessionId))
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed?.messages)) return []
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
  messages: TMessage[]
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
        messages: scoped,
      })
    )
  } catch {
    // ignore cache write failures
  }
}
