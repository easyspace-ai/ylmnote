import type { Message as TMessage } from '@/types'

const SESSION_MESSAGE_CACHE_LIMIT = 20
const SESSION_MESSAGE_CACHE_VERSION = 1

function getSessionMessageCacheKey(projectId: string, sessionId: string) {
  return `youmind:session-messages:v${SESSION_MESSAGE_CACHE_VERSION}:${projectId}:${sessionId}`
}

export function readSessionMessageCache(projectId: string, sessionId: string): TMessage[] {
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

export function writeSessionMessageCache(projectId: string, sessionId: string, messages: TMessage[]) {
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
