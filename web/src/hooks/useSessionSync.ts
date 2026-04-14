import { useEffect, useRef } from 'react'

interface SessionSyncMeta {
  inFlight: boolean
  lastAttemptAt: number
  lastFailedAt?: number
  lastSuccessAt?: number
  lastError?: string
  isTerminal?: boolean
}

interface UseSessionSyncOptions {
  projectId?: string
  sessionId?: string
  intervalMs?: number
  enabled?: boolean
  refreshMessages?: boolean
  syncSessionState: (projectId: string, sessionId: string, options?: { refreshMessages?: boolean }) => Promise<void>
  sessionSyncMeta?: SessionSyncMeta
}

export function useSessionSync({
  projectId,
  sessionId,
  intervalMs = 45_000,
  enabled = true,
  refreshMessages = true,
  syncSessionState,
  sessionSyncMeta,
}: UseSessionSyncOptions) {
  const mountedRef = useRef(false)

  useEffect(() => {
    if (!enabled || !projectId || !sessionId) return
    let cancelled = false

    const runSync = async () => {
      if (cancelled) return
      if ((import.meta as any).env?.DEV) {
        if (sessionSyncMeta?.inFlight) {
          console.debug('[session-sync] skip inFlight', { projectId, sessionId })
        } else if (sessionSyncMeta?.isTerminal) {
          console.debug('[session-sync] skip terminal', { projectId, sessionId, err: sessionSyncMeta.lastError })
        } else if (sessionSyncMeta?.lastFailedAt && Date.now() - sessionSyncMeta.lastFailedAt < 30_000) {
          console.debug('[session-sync] skip cooldown', { projectId, sessionId })
        }
      }
      await syncSessionState(projectId, sessionId, { refreshMessages })
    }

    // first mount for current session
    runSync()
    mountedRef.current = true

    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return
      runSync()
    }, intervalMs)

    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [
    enabled,
    intervalMs,
    projectId,
    refreshMessages,
    sessionId,
    syncSessionState,
  ])
}

