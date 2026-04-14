/** 会话与上游同步元信息（供 apiStore / useSessionSync 共享） */
export interface SessionSyncMeta {
  inFlight: boolean
  lastAttemptAt: number
  lastFailedAt?: number
  lastSuccessAt?: number
  lastError?: string
  isTerminal?: boolean
}
