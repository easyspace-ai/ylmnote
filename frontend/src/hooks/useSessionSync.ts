import { useEffect, useRef } from 'react'
import type { SessionSyncMeta } from '@/stores/apiStoreTypes'

interface UseSessionSyncOptions {
  projectId?: string
  sessionId?: string
  intervalMs?: number
  enabled?: boolean
  refreshMessages?: boolean
  /** 为 true 时不在挂载时立即 sync（由页面在资源就绪后主动 sync 一次，避免与 inFlight 短路竞态） */
  skipInitialSync?: boolean
  syncSessionState: (projectId: string, sessionId: string, options?: { refreshMessages?: boolean }) => Promise<void>
  sessionSyncMeta?: SessionSyncMeta
}

export function useSessionSync({
  projectId,
  sessionId,
  intervalMs = 45_000,
  enabled = true,
  refreshMessages = true,
  skipInitialSync = false,
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

    if (!skipInitialSync) {
      void runSync()
    }
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
    skipInitialSync,
    sessionId,
    syncSessionState,
  ])
}

