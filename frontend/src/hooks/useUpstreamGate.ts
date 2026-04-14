import { useQuery } from '@tanstack/react-query'
import { chatApi } from '@/services/api'

export type UpstreamGatePayload = {
  upstream_session_id: string
  status: string
  phase: string
  input_locked: boolean
  can_stop: boolean
  detail?: string
}

function offlineGate(): UpstreamGatePayload {
  return {
    upstream_session_id: '',
    status: '',
    phase: 'offline',
    input_locked: true,
    can_stop: false,
    detail: '无法获取远端状态',
  }
}

/** Banner 提示文案：与 ProjectDetail 原逻辑一致 */
export function getUpstreamGateBannerText(
  gate: UpstreamGatePayload | null | undefined,
  loading: boolean
): string | null {
  if (loading) return '正在检查远端 Agent…'
  if (!gate) return null
  if (gate.detail) return gate.detail
  if (gate.phase === 'busy') return '远端正在运行，可先停止后再输入'
  if (gate.phase === 'blocked') {
    return `远端处理中（${gate.status || '准备中'}），请稍候`
  }
  if (gate.phase === 'offline') return '无法连接远端，请检查网络或上游服务'
  if (gate.phase === 'unbound' && gate.input_locked) {
    return '会话未绑定远端 Agent，无法发送'
  }
  return null
}

export interface UseUpstreamGateOptions {
  projectId?: string
  sessionId?: string
  /** 未传 session 时不请求 */
  enabled?: boolean
  /** 流式生成中暂停轮询，减轻负载 */
  isStreaming: boolean
}

/**
 * 上游 Agent 门控：TanStack Query 轮询 + 自适应间隔（忙/离线更密，就绪更疏）。
 */
export function useUpstreamGate({ projectId, sessionId, enabled = true, isStreaming }: UseUpstreamGateOptions) {
  const query = useQuery({
    queryKey: ['upstreamGate', projectId ?? '', sessionId ?? ''],
    queryFn: async (): Promise<UpstreamGatePayload> => {
      if (!projectId || !sessionId) return offlineGate()
      try {
        return await chatApi.getUpstreamGate({ projectId, sessionId })
      } catch {
        return offlineGate()
      }
    },
    enabled: Boolean(enabled && projectId && sessionId),
    staleTime: 0,
    refetchInterval: (q) => {
      if (!q.state.data) return 2500
      if (isStreaming) return false
      const phase = q.state.data.phase
      if (phase === 'busy' || phase === 'offline' || phase === 'blocked') return 2500
      if (phase === 'ready' || phase === 'unbound') return 12_000
      return 8000
    },
  })

  const gate = query.data ?? null
  const upstreamGateLoading = query.isPending && !query.data
  const upstreamInputLocked = upstreamGateLoading || Boolean(gate?.input_locked)
  const upstreamCanStop = !upstreamGateLoading && Boolean(gate?.can_stop)
  const upstreamBannerText = getUpstreamGateBannerText(gate, upstreamGateLoading)

  return {
    gate,
    upstreamGateLoading,
    upstreamInputLocked,
    upstreamCanStop,
    upstreamBannerText,
    refetchGate: query.refetch,
  }
}
