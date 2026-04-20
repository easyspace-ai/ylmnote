/**
 * 会话消息、WebSocket 连接等与聊天相关的 store 切片（从 apiStore 拆出以减轻单文件体积）。
 */
import { SessionWebSocket } from '@/services/ws'
import { projectApi } from '@/services/api'
import * as historySync from './api/historySync'
import type { Message as TMessage } from '@/types'

/** artifact 刷新防抖定时器 */
let _artifactRefreshTimer: ReturnType<typeof setTimeout> | null = null

/** 发送 Stop 后延迟再断开 WS，避免 close 先于 Stop 帧被代理读入并转发到上游（见 THIRD_PARTY_INTEGRATION.md 4.1.1） */
const STOP_THEN_DISCONNECT_MS = 220

/** 上游消息格式定义 */
interface WSMessagePart {
  type: string
  text_kind?: string
  content?: string
}

interface WSMessage {
  turn_number: number
  item_id: number
  kind: 'from_user' | 'user_facing' | 'reasoning' | 'internal_thought' | 'episodic_marker' | string
  message_parts: WSMessagePart[]
  author_id?: string | null
  author_display?: string | null
  created_at?: number
  hidden?: boolean
}

interface WSUpdateData {
  type: 'update'
  state: {
    id: string
    status: string
    title?: string
    todos?: Array<{ text: string; done: boolean; children?: any[] }>
    [key: string]: any
  }
  messages: WSMessage[]
}

interface WSStatusData {
  type: 'status'
  status: string
}

type WSData = WSUpdateData | WSStatusData

/** WebSocket 连接状态 - 新增 'failed' 表示达到最大重试次数后失败 */
type WSConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'reconnecting' | 'failed'

type PendingOutgoingMessage = {
  id: string
  content: string
  attachments: string[]
  createdAt: number
}

function mapHistoryMessagesToLocal(sessionId: string, projectId: string, messages: any[]): TMessage[] {
  const seenStableIds = new Set<string>()
  const converted: TMessage[] = []
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i]
    if (!msg || msg.hidden) continue

    const stableId = historySync.stableMessageId(
      {
        item_id: msg.item_id,
        id: msg.id,
        turn_number: msg.turn_number,
        created_at: msg.created_at,
      },
      sessionId,
      i
    )
    if (seenStableIds.has(stableId)) continue
    seenStableIds.add(stableId)

    const role: 'user' | 'assistant' | 'system' =
      msg.kind === 'from_user'
        ? 'user'
        : (msg.kind === 'episodic_marker' || msg.kind === 'system')
          ? 'system'
          : 'assistant'

    const content = Array.isArray(msg.message_parts)
      ? msg.message_parts
          .filter((part: any) => part.type === 'text')
          .map((part: any) => part.content || '')
          .join('')
      : (msg.content || '')

    converted.push({
      id: stableId,
      upstream_message_id: msg.item_id != null ? String(msg.item_id) : (msg.id != null ? String(msg.id) : stableId),
      project_id: projectId,
      session_id: sessionId,
      role,
      content,
      status: 'idle',
      attachments: {
        upstream_kind: msg.kind,
        message_kind: role === 'system' ? 'system' : 'normal',
      },
      created_at: msg.created_at ? new Date(msg.created_at).toISOString?.() || String(msg.created_at) : new Date().toISOString(),
    } as TMessage)
  }
  return converted
}

/** set/get 使用宽松类型，避免与 zustand AppState 循环依赖 */
export function createChatConversationSlice(set: (partial: any) => void, get: () => any) {
  return {
    // WebSocket 连接状态
    wsConnections: {} as Record<string, SessionWebSocket>,
    wsStatus: {} as Record<string, WSConnectionStatus>,
    wsReconnectAttempt: {} as Record<string, number>,     // 当前重试次数
    wsReconnectMaxAttempts: {} as Record<string, number>, // 最大重试次数（用于显示）
    messagesLoadingBySession: {} as Record<string, boolean>,
    pendingOutgoingQueue: {} as Record<string, PendingOutgoingMessage[]>,

    // 连接 WebSocket
    connectWebSocket: (sessionId: string, projectId?: string) => {
      const state = get()

      // 如果已有连接，先关闭
      if (state.wsConnections[sessionId]) {
        state.wsConnections[sessionId].close()
      }

      // 获取最大重试次数配置
      const MAX_RECONNECT_ATTEMPTS = 5;

      const ws = new SessionWebSocket(sessionId, projectId || state.currentProject?.id || '', {
        onMessage: (data: WSData) => {
          // 处理上游 error 类型消息
          if ((data as any).type === 'error') {
            set((state: any) => ({
              error: (data as any).error || '上游连接失败，请稍后重试',
              isStreaming: false,
            }));
            return;
          }

          // 处理上游消息
          if (data.type === 'update' && data.messages) {
            // 使用与 HTTP 历史一致的 stableMessageId（HTTP 用 id，WS 用 item_id；item_id=0 会撞键）
            const upstreamIdCounts = new Map<string, number>()
            data.messages.forEach((msg: any, i: number) => {
              const id = historySync.stableMessageId(
                {
                  item_id: msg.item_id,
                  id: msg.id,
                  turn_number: msg.turn_number,
                  created_at: msg.created_at,
                },
                sessionId,
                i
              )
              upstreamIdCounts.set(id, (upstreamIdCounts.get(id) || 0) + 1)
            })
            const upstreamDuplicates = Array.from(upstreamIdCounts.entries()).filter(([_, count]) => count > 1)
            if (upstreamDuplicates.length > 0) {
              console.warn('[WebSocket] duplicate stable keys in one frame (same turn/ts?)', upstreamDuplicates)
            }

            // 必须用「原始下标」计算 stable id，否则先 filter 再 map 会改变序号，导致同一条消息前后 id 不一致
            const seenStableIds = new Set<string>()
            const convertedMessages: TMessage[] = []
            for (let i = 0; i < data.messages.length; i++) {
              const msg = data.messages[i] as WSMessage & { id?: string | number }
              if (msg.hidden) continue
              const stableId = historySync.stableMessageId(
                {
                  item_id: msg.item_id,
                  id: msg.id,
                  turn_number: msg.turn_number,
                  created_at: msg.created_at,
                },
                sessionId,
                i
              )
              if (seenStableIds.has(stableId)) continue
              seenStableIds.add(stableId)

              const rawUpstream = msg.item_id ?? msg.id

              let content = ''
              if (msg.message_parts) {
                content = msg.message_parts
                  .filter((part) => part.type === 'text')
                  .map((part) => part.content || '')
                  .join('')
              }

              let role: 'user' | 'assistant' | 'system' = 'assistant'
              if (msg.kind === 'from_user') {
                role = 'user'
              } else if (msg.kind === 'episodic_marker' || msg.kind === 'system') {
                role = 'system'
              }

              let messageKind = 'normal'
              if (msg.kind === 'reasoning' || msg.kind === 'internal_thought') {
                messageKind = 'reasoning'
              } else if (msg.kind === 'episodic_marker' || msg.kind === 'system') {
                messageKind = 'system'
              }

              convertedMessages.push({
                id: stableId,
                upstream_message_id: rawUpstream != null ? String(rawUpstream) : stableId,
                project_id: state.currentProject?.id || '',
                session_id: sessionId,
                role,
                content,
                status: data.state?.status || 'idle',
                attachments: {
                  upstream_kind: msg.kind,
                  message_kind: messageKind,
                  turn_number: msg.turn_number,
                },
                created_at: msg.created_at
                  ? new Date(msg.created_at * 1000).toISOString()
                  : new Date().toISOString(),
              } as TMessage)
            }

            if (convertedMessages.length !== data.messages.filter((m) => !m.hidden).length) {
              console.log('[WebSocket] deduped by stable id', {
                raw: data.messages.length,
                converted: convertedMessages.length,
              })
            }

            // 先在 set 外部获取当前状态并计算合并结果
            const currentMessages = get().messages
            const tempMessagesCount = currentMessages.filter((m: TMessage) => m.id.startsWith('temp-')).length

            // 上游 from_user 消息的内容集合，用于去重临时消息
            const upstreamUserContents = new Set(
              convertedMessages
                .filter((m: TMessage) => m.role === 'user')
                .map((m: TMessage) => m.content)
            )

            // 过滤掉已被上游确认的临时消息
            const filteredExisting = currentMessages.filter(
              (m: TMessage) => !(m.id.startsWith('temp-') && upstreamUserContents.has(m.content))
            )

            const removedTempCount = currentMessages.length - filteredExisting.length
            if (removedTempCount > 0 || tempMessagesCount > 0) {
              console.log('[WebSocket] merging messages', {
                tempMessagesCount,
                removedTempCount,
                upstreamUserContents: Array.from(upstreamUserContents).slice(0, 3),
                existingCount: currentMessages.length,
                incomingCount: convertedMessages.length,
              })
            }

            // 使用 Map 来去重
            const messageMap = new Map<string, TMessage>()

            // 先添加已存在的消息
            for (const msg of filteredExisting) {
              messageMap.set(String(msg.id), msg)
            }

            // 再添加/更新新消息
            for (const msg of convertedMessages) {
              const msgId = String(msg.id)
              const existing = messageMap.get(msgId)
              if (existing) {
                // 更新已存在的消息
                messageMap.set(msgId, {
                  ...existing,
                  content: msg.content,
                  status: msg.status,
                  attachments: msg.attachments,
                })
              } else {
                messageMap.set(msgId, msg)
              }
            }

            // 按时间排序得到最终合并消息
            let mergedMessages = Array.from(messageMap.values()).sort(
              (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
            )

            mergedMessages = historySync.dedupeMessagesByCanonicalKey(mergedMessages)

            // 更新 UI
            set({ messages: mergedMessages })

            // 更新会话标题（如果远端返回了标题）
            if (data.state?.title) {
              set((state: any) => {
                const sessionIndex = state.sessions.findIndex((s: any) => s.id === sessionId)
                if (sessionIndex >= 0 && state.sessions[sessionIndex].title !== data.state.title) {
                  const updatedSessions = [...state.sessions]
                  updatedSessions[sessionIndex] = {
                    ...updatedSessions[sessionIndex],
                    title: data.state.title,
                  }
                  return { sessions: updatedSessions }
                }
                return {}
              })
            }

            // 更新 todos
            if (data.state?.todos) {
              set((state: any) => ({
                liveTodosBySession: {
                  ...state.liveTodosBySession,
                  [sessionId]: data.state.todos,
                },
              }))
            }

            // 检测是否有新的 artifact（resource 类型的 message_parts）或 todos 更新，延迟刷新资源列表
            const hasNewArtifacts = data.messages.some((msg: WSMessage) =>
              msg.message_parts?.some((part: WSMessagePart) => part.type === 'resource')
            )
            const hasTodosUpdate = data.state?.todos != null

            if (hasNewArtifacts || hasTodosUpdate) {
              if (_artifactRefreshTimer) clearTimeout(_artifactRefreshTimer)
              _artifactRefreshTimer = setTimeout(() => {
                _artifactRefreshTimer = null
                const projectId = get().currentProject?.id
                if (projectId) {
                  get().fetchResources(projectId)
                }
              }, 500)
            }
          }

          // 处理状态更新
          if (data.type === 'status') {
            set((state: any) => ({
              streamingBySession: {
                ...state.streamingBySession,
                [sessionId]: data.status !== 'idle',
              },
              isStreaming: data.status !== 'idle',
            }))
          }
        },
        onStatusChange: (status: string) => {
          set((state: any) => ({
            wsStatus: { ...state.wsStatus, [sessionId]: status },
            error: status === 'connected' || status === 'reconnecting' ? null : state.error,
          }))
          if (status === 'connected') {
            void get().flushPendingOutgoingQueue(sessionId)
          }
        },
        onError: (error: Error, isFatal?: boolean) => {
          console.error('WebSocket error:', error, isFatal ? '(fatal)' : '')
          set((state: any) => ({
            error:
              isFatal || state.wsStatus?.[sessionId] === 'disconnected'
                ? error.message
                : state.error,
            wsStatus: {
              ...state.wsStatus,
              [sessionId]:
                isFatal
                  ? 'failed'
                  : (state.wsStatus?.[sessionId] === 'reconnecting' || state.wsStatus?.[sessionId] === 'connecting')
                    ? state.wsStatus?.[sessionId]
                    : 'disconnected',
            },
          }))
        },
        onClose: () => {
          // 连接关闭处理 - ws.ts 会自动重连，这里不需要额外处理
          console.log('WebSocket closed for session:', sessionId)
        },
        onReconnectAttempt: (attempt: number, maxAttempts: number) => {
          // 通知重试进度
          console.log(`WebSocket reconnect attempt ${attempt}/${maxAttempts} for session:`, sessionId)
          set((state: any) => ({
            wsReconnectAttempt: { ...state.wsReconnectAttempt, [sessionId]: attempt },
            wsReconnectMaxAttempts: { ...state.wsReconnectMaxAttempts, [sessionId]: maxAttempts },
            wsStatus: { ...state.wsStatus, [sessionId]: 'reconnecting' },
            error: null,
          }))
        },
        onReconnectFailed: () => {
          // 达到最大重试次数后回调
          console.warn(`WebSocket max reconnect attempts reached for session:`, sessionId)
          set((state: any) => ({
            wsStatus: { ...state.wsStatus, [sessionId]: 'failed' },
            error: '连接失败，请检查网络后点击重试',
          }))
        },
      })

      ws.connect()
      set((state: any) => ({
        wsConnections: { ...state.wsConnections, [sessionId]: ws },
        wsStatus: { ...state.wsStatus, [sessionId]: 'connecting' },
        wsReconnectAttempt: { ...state.wsReconnectAttempt, [sessionId]: 0 },
        wsReconnectMaxAttempts: { ...state.wsReconnectMaxAttempts, [sessionId]: MAX_RECONNECT_ATTEMPTS },
      }))
    },

    // 手动触发 WebSocket 重连
    retryWebSocketConnection: (sessionId: string) => {
      const state = get()
      const ws = state.wsConnections[sessionId]
      if (ws) {
        console.log(`[store] Manual retry for session ${sessionId}`)
        ws.retry()
        // 重置状态
        set((state: any) => ({
          wsStatus: { ...state.wsStatus, [sessionId]: 'connecting' },
          wsReconnectAttempt: { ...state.wsReconnectAttempt, [sessionId]: 0 },
          error: null,
        }))
      } else {
        // 如果没有现有连接，创建新连接
        console.log(`[store] No existing connection for ${sessionId}, creating new one`)
        get().connectWebSocket(sessionId, state.currentProject?.id)
      }
    },

    // 断开 WebSocket
    disconnectWebSocket: (sessionId: string) => {
      const state = get()
      const ws = state.wsConnections[sessionId]
      if (ws) {
        ws.destroy()
        set((state: any) => {
          const newConnections = { ...state.wsConnections }
          delete newConnections[sessionId]
          const newStatus = { ...state.wsStatus }
          delete newStatus[sessionId]
          const newAttempts = { ...state.wsReconnectAttempt }
          delete newAttempts[sessionId]
          const newMaxAttempts = { ...state.wsReconnectMaxAttempts }
          delete newMaxAttempts[sessionId]
          return {
            wsConnections: newConnections,
            wsStatus: newStatus,
            wsReconnectAttempt: newAttempts,
            wsReconnectMaxAttempts: newMaxAttempts,
          }
        })
      }
    },

    // 发送消息（通过 WebSocket）
    sendMessageWS: (sessionId: string, content: string, attachments: string[] = []) => {
      const ws = get().wsConnections[sessionId]
      const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      console.log('[sendMessageWS] optimistic update', { tempId, contentLength: content.length })
      const userMsg: TMessage = {
        id: tempId,
        project_id: get().currentProject?.id || '',
        session_id: sessionId,
        role: 'user',
        content,
        resource_refs: attachments.length > 0 ? attachments.map(id => ({ id })) : undefined,
        attachments: { temp: true },
        created_at: new Date().toISOString(),
      }

      set((state: any) => ({
        messages: [...state.messages, userMsg],
      }))

      if (ws && ws.readyState === WebSocket.OPEN) {
        console.log('[sendMessageWS] sending input', { sessionId, contentLength: content.length, attachments: attachments.length > 0 ? attachments : 'none' })
        ws.sendInput(content, attachments)
        return
      }

      // 未连接：先入队，再主动触发连接，用户无感
      const now = Date.now()
      const dedupeSignature = `${content}::${attachments.join(',')}`
      set((state: any) => {
        const queue = (state.pendingOutgoingQueue?.[sessionId] || []) as PendingOutgoingMessage[]
        const hasRecentDuplicate = queue.some(
          (item) => item.content === content && item.attachments.join(',') === attachments.join(',') && now - item.createdAt < 1200
        )
        if (hasRecentDuplicate) {
          return {
            error: '正在重连，消息已排队发送',
            wsStatus: { ...state.wsStatus, [sessionId]: state.wsStatus?.[sessionId] || 'reconnecting' },
          }
        }
        const nextItem: PendingOutgoingMessage = {
          id: `${tempId}-${dedupeSignature.length}`,
          content,
          attachments,
          createdAt: now,
        }
        return {
          pendingOutgoingQueue: {
            ...state.pendingOutgoingQueue,
            [sessionId]: [...queue, nextItem],
          },
          error: '正在重连，消息已排队发送',
          wsStatus: { ...state.wsStatus, [sessionId]: state.wsStatus?.[sessionId] || 'reconnecting' },
        }
      })

      if (ws) {
        void ws.ensureConnected(8000).then((ok: boolean) => {
          if (ok) void get().flushPendingOutgoingQueue(sessionId)
        })
      } else {
        get().connectWebSocket(sessionId, get().currentProject?.id)
      }
    },

    flushPendingOutgoingQueue: async (sessionId: string) => {
      const state = get()
      const ws = state.wsConnections?.[sessionId]
      const queue = (state.pendingOutgoingQueue?.[sessionId] || []) as PendingOutgoingMessage[]
      if (!ws || queue.length === 0) return

      const connected = await ws.ensureConnected(8000)
      if (!connected || ws.readyState !== WebSocket.OPEN) {
        return
      }

      const pending = [...queue]
      pending.forEach((item) => {
        ws.sendInput(item.content, item.attachments)
      })

      set((s: any) => ({
        pendingOutgoingQueue: {
          ...s.pendingOutgoingQueue,
          [sessionId]: [],
        },
        error: s.error === '正在重连，消息已排队发送' ? null : s.error,
      }))
    },

    // 中止当前会话的消息流：先发 Stop（与上游协议一致），再延迟断开，避免 Stop 未送达
    abortActiveMessageStream: (sessionId?: string) => {
      if (sessionId) {
        const ws = get().wsConnections[sessionId]
        const readyState = ws?.readyState
        console.log(`[abortActiveMessageStream] sessionId=${sessionId}, readyState=${readyState} (0=CONNECTING, 1=OPEN, 2=CLOSING, 3=CLOSED)`)
        if (ws && readyState === WebSocket.OPEN) {
          const sent = ws.sendStop()
          console.log(`[abortActiveMessageStream] Stop frame sent: ${sent}`)
          window.setTimeout(() => {
            if (get().wsConnections[sessionId] !== ws) return
            get().disconnectWebSocket(sessionId)
          }, STOP_THEN_DISCONNECT_MS)
        } else {
          console.warn(`[abortActiveMessageStream] WebSocket not open, disconnecting directly`)
          get().disconnectWebSocket(sessionId)
        }
        set((state: any) => ({
          streamingBySession: {
            ...state.streamingBySession,
            [sessionId]: false,
          },
        }))
      } else {
        const snap = { ...get().wsConnections } as Record<string, InstanceType<typeof SessionWebSocket>>
        console.log(`[abortActiveMessageStream] Stopping all sessions, count=${Object.keys(snap).length}`)
        Object.values(snap).forEach((w) => {
          const state = w?.readyState
          console.log(`[abortActiveMessageStream] Session readyState=${state}`)
          if (state === WebSocket.OPEN) {
            const sent = w.sendStop()
            console.log(`[abortActiveMessageStream] Stop frame sent: ${sent}`)
          }
        })
        window.setTimeout(() => {
          Object.keys(get().wsConnections).forEach(sid => get().disconnectWebSocket(sid))
        }, STOP_THEN_DISCONNECT_MS)
        set({ streamingBySession: {}, isStreaming: false })
      }
    },

    fetchMessagesBySession: async (
      projectId: string,
      sessionId: string,
      options?: {
        mode?: 'replaceLatest' | 'prependOlder';
        limit?: number;
        __recoveryScheduled?: boolean;
        __retryAfterError?: boolean;
        __historyFallbackTried?: boolean;
      }
    ) => {
      const mode = options?.mode || 'replaceLatest'
      /** 后端 ListBySessionID：skip=0 取最近一页，skip 递增取更早；每页默认 20 */
      const pageSize = options?.limit ?? 20
      const isActiveSession = () => get().activeMessageSessionId === sessionId
      const pagination = get().messagePagination[sessionId] || {
        nextSkip: 0,
        hasMore: true,
        loadingOlder: false,
        pageSize,
      }
      if (mode === 'prependOlder' && (pagination.loadingOlder || !pagination.hasMore)) {
        return
      }

      const belongsToThisSession = (m: TMessage) => {
        if (m.session_id === sessionId) return true
        if (m.session_id && m.session_id !== sessionId) return false
        return isActiveSession()
      }

      // 设置消息加载状态
      if (mode === 'replaceLatest') {
        set((state: any) => ({
          messagesLoadingBySession: {
            ...state.messagesLoadingBySession,
            [sessionId]: true,
          },
        }))
      }

      try {
        if (mode === 'replaceLatest') {
          set({ loading: true, error: null })

          const skip = 0
          let apiMessages = (await projectApi.getSessionMessages(projectId, sessionId, {
            skip,
            limit: pageSize,
          })) as TMessage[]
          if (!isActiveSession()) {
            if (!options?.__recoveryScheduled) {
              // 路由/状态切换的竞态窗口：短延迟复核后为当前会话再补拉一次
              window.setTimeout(() => {
                if (get().activeMessageSessionId !== sessionId) return
                void get().fetchMessagesBySession(projectId, sessionId, {
                  mode,
                  limit: pageSize,
                  __recoveryScheduled: true,
                  __retryAfterError: options?.__retryAfterError,
                })
              }, 120)
            }
            return
          }

          if (apiMessages.length === 0 && !options?.__historyFallbackTried) {
            try {
              const historyResp = await projectApi.getSessionHistory(projectId, sessionId, {
                offset: 0,
                limit: pageSize,
              })
              const upstreamMessages = Array.isArray(historyResp?.messages) ? historyResp.messages : []
              if (upstreamMessages.length > 0) {
                apiMessages = mapHistoryMessagesToLocal(sessionId, projectId, upstreamMessages)
              }
            } catch (historyErr) {
              console.warn(`[fetchMessagesBySession] history fallback failed for ${sessionId}:`, historyErr)
            }
          }

          const currentMemoryMessages = get().messages
          const tempMessages = currentMemoryMessages.filter(
            (m: TMessage) => m.id.startsWith('temp-') && belongsToThisSession(m)
          )
          const realMessages = currentMemoryMessages.filter(
            (m: TMessage) => !m.id.startsWith('temp-') && belongsToThisSession(m)
          )

          let merged: TMessage[] = [...apiMessages]
          if (realMessages.length > 0) {
            merged = historySync.mergeMessages(merged, realMessages)
          }
          if (tempMessages.length > 0) {
            merged = historySync.mergeMessages(merged, tempMessages)
          }
          merged = historySync.dedupeMessagesByCanonicalKey(merged)

          set({
            messages: merged,
            loading: false,
            messagePagination: {
              ...get().messagePagination,
              [sessionId]: {
                nextSkip: apiMessages.length,
                hasMore: apiMessages.length === pageSize,
                loadingOlder: false,
                pageSize,
              },
            },
          })
        } else {
          // prependOlder：上滑加载更早一页
          set((state: any) => ({
            error: null,
            messagePagination: {
              ...state.messagePagination,
              [sessionId]: { ...pagination, loadingOlder: true },
            },
          }))
          const skip = pagination.nextSkip
          const messages = (await projectApi.getSessionMessages(projectId, sessionId, {
            skip,
            limit: pagination.pageSize || pageSize,
          })) as TMessage[]
          if (!isActiveSession()) {
            return
          }
          set((state: any) => {
            const existingIds = new Set(state.messages.map((m: TMessage) => m.id))
            const older = messages.filter((m) => !existingIds.has(m.id))
            let merged = [...older, ...state.messages] as TMessage[]
            merged = historySync.dedupeMessagesByCanonicalKey(merged)
            return {
              messages: merged,
              messagePagination: {
                ...state.messagePagination,
                [sessionId]: {
                  ...pagination,
                  nextSkip: pagination.nextSkip + messages.length,
                  hasMore: messages.length === (pagination.pageSize || pageSize),
                  loadingOlder: false,
                  pageSize: pagination.pageSize || pageSize,
                },
              },
            }
          })
        }
      } catch (error: any) {
        // 即使会话不再是激活状态，也要记录错误并清理加载状态
        console.error(`[fetchMessagesBySession] Failed for ${sessionId}:`, error)
        const stillActive = isActiveSession()
        if (mode === 'replaceLatest') {
          // 只在会话仍激活时更新错误状态（避免覆盖新会话的状态）
          if (stillActive) {
            if (!options?.__historyFallbackTried) {
              try {
                const historyResp = await projectApi.getSessionHistory(projectId, sessionId, {
                  offset: 0,
                  limit: pageSize,
                })
                const upstreamMessages = Array.isArray(historyResp?.messages) ? historyResp.messages : []
                if (upstreamMessages.length > 0) {
                  const recovered = mapHistoryMessagesToLocal(sessionId, projectId, upstreamMessages)
                  set({
                    messages: recovered,
                    loading: false,
                    error: null,
                    messagePagination: {
                      ...get().messagePagination,
                      [sessionId]: {
                        nextSkip: recovered.length,
                        hasMore: recovered.length === pageSize,
                        loadingOlder: false,
                        pageSize,
                      },
                    },
                  })
                  return
                }
              } catch (historyErr) {
                console.warn(`[fetchMessagesBySession] history fallback after error failed for ${sessionId}:`, historyErr)
              }
            }
            set({
              error: error?.message || '加载消息失败，请稍后重试',
              loading: false,
            })
            if (!options?.__retryAfterError) {
              window.setTimeout(() => {
                if (get().activeMessageSessionId !== sessionId) return
                void get().fetchMessagesBySession(projectId, sessionId, {
                  mode,
                  limit: pageSize,
                  __recoveryScheduled: options?.__recoveryScheduled,
                  __retryAfterError: true,
                })
              }, 400)
            }
          }
        } else {
          set((state: any) => ({
            error: stillActive ? (error?.message || '加载消息失败') : state.error,
            messagePagination: {
              ...state.messagePagination,
              [sessionId]: {
                ...pagination,
                loadingOlder: false,
              },
            },
          }))
        }
      } finally {
        if (mode === 'replaceLatest') {
          set((state: any) => ({
            messagesLoadingBySession: {
              ...state.messagesLoadingBySession,
              [sessionId]: false,
            },
          }))
        }
      }
    },

    hydrateSessionMessagesFromCache: (_projectId: string, sessionId: string) => {
      set((state: any) => ({
        // 保留 API 形状兼容旧调用；新策略不再从本地缓存恢复消息。
        messages: [],
        messagePagination: {
          ...state.messagePagination,
          [sessionId]: {
            nextSkip: 0,
            hasMore: true,
            loadingOlder: false,
            pageSize: state.messagePagination[sessionId]?.pageSize || 20,
          },
        },
      }))
    },

    setActiveMessageSession: (sessionId?: string) => {
      set({ activeMessageSessionId: sessionId })
    },

    clearSessionMessages: (sessionId?: string) => {
      if (!sessionId) {
        set({ messages: [] })
        return
      }
      set((state: any) => ({
        messages: [],
        messagePagination: {
          ...state.messagePagination,
          [sessionId]: {
            nextSkip: 0,
            hasMore: true,
            loadingOlder: false,
            pageSize: state.messagePagination[sessionId]?.pageSize || 20,
          },
        },
      }))
    },

    loadOlderMessages: async (projectId: string, sessionId: string) => {
      await get().fetchMessagesBySession(projectId, sessionId, { mode: 'prependOlder' })
    },

    sendMessage: async (projectId: string, content: string, skillId?: string) => {
      try {
        set({ loading: true, error: null })

        const userMsg = {
          id: 'temp-' + Date.now(),
          project_id: projectId,
          role: 'user' as const,
          content,
          skill_id: skillId,
          created_at: new Date().toISOString(),
        }
        set((state: any) => ({ messages: [...state.messages, userMsg] }))

        // 非流式发送（备用方案）
        const { chatApi } = await import('@/services/api')
        const response = await chatApi.send({
          message: content,
          projectId,
          skillId,
        })

        set((state: any) => ({
          messages: [...state.messages, response],
          loading: false,
        }))
      } catch (error: any) {
        set({ error: error.message, loading: false })
      }
    },

    // 已废弃：使用 sendMessageWS 替代
    sendMessageStream: async () => {
      console.warn('sendMessageStream is deprecated, use sendMessageWS instead')
    },

    // 已废弃：W6 功能已移除
    sendW6PageFromOutlineStream: async () => {
      console.warn('sendW6PageFromOutlineStream is deprecated')
    },

    syncSessionState: async (
      projectId: string,
      sessionId: string,
      options?: { refreshMessages?: boolean; upstreamSessionId?: string; activateUpstream?: boolean; force?: boolean }
    ) => {
      const syncKey = `${projectId}:${sessionId}`
      const now = Date.now()
      const meta = (get().sessionSyncMeta as any)[syncKey]
      const force = Boolean(options?.force)
      if (meta?.inFlight) {
        return
      }
      if (!force && meta?.isTerminal) {
        return
      }
      if (!force && meta?.lastFailedAt && now - meta.lastFailedAt < 30_000) {
        return
      }
      set((state: any) => ({
        sessionSyncMeta: {
          ...state.sessionSyncMeta,
          [syncKey]: {
            inFlight: true,
            lastAttemptAt: now,
            lastFailedAt: force ? undefined : meta?.lastFailedAt,
            lastSuccessAt: meta?.lastSuccessAt,
            lastError: undefined,
            isTerminal: false,
          },
        },
      }))
      try {
        // 新架构下：直接刷新会话列表和资源列表
        await get().fetchSessions(projectId)
        await get().fetchResources(projectId)
        if (options?.refreshMessages) {
          // 与后端单页上限一致，避免同步时只拉到 20 条覆盖界面
          await get().fetchMessagesBySession(projectId, sessionId, { limit: 200 })
        }
        set((state: any) => ({
          sessionSyncMeta: {
            ...state.sessionSyncMeta,
            [syncKey]: {
              inFlight: false,
              lastAttemptAt: now,
              lastSuccessAt: Date.now(),
              lastError: undefined,
              isTerminal: false,
            },
          },
        }))
      } catch (error: any) {
        console.warn('sync session state failed:', error?.message || error)
        set((state: any) => ({
          error: state.error,
          sessionSyncMeta: {
            ...state.sessionSyncMeta,
            [syncKey]: {
              inFlight: false,
              lastAttemptAt: now,
              lastFailedAt: Date.now(),
              lastSuccessAt: meta?.lastSuccessAt,
              lastError: error?.message || 'sync failed',
              isTerminal: false,
            },
          },
        }))
      }
    },

    getSessionSyncMeta: (projectId: string, sessionId: string) => {
      return (get().sessionSyncMeta as any)[`${projectId}:${sessionId}`]
    },

    getSessionSyncStatus: (projectId: string, sessionId: string) => {
      const meta = (get().sessionSyncMeta as any)[`${projectId}:${sessionId}`]
      if (!meta) return 'idle'
      if (meta.inFlight) return 'syncing'
      if (meta.lastFailedAt && Date.now() - meta.lastFailedAt < 30_000) return 'cooldown'
      if (meta.lastError) return 'error'
      return 'ready'
    },
  }
}
