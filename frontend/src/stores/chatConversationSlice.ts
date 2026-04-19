/**
 * 会话消息、WebSocket 连接等与聊天相关的 store 切片（从 apiStore 拆出以减轻单文件体积）。
 */
import { SessionWebSocket } from '@/services/ws'
import { projectApi } from '@/services/api'
import * as indexedDBCache from './api/indexedDBCache'
import * as historySync from './api/historySync'
import type { Message as TMessage } from '@/types'

/** artifact 刷新防抖定时器 */
let _artifactRefreshTimer: ReturnType<typeof setTimeout> | null = null

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

/** WebSocket 连接状态 */
type WSConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'reconnecting'

/** set/get 使用宽松类型，避免与 zustand AppState 循环依赖 */
export function createChatConversationSlice(set: (partial: any) => void, get: () => any) {
  return {
    // WebSocket 连接状态
    wsConnections: {} as Record<string, SessionWebSocket>,
    wsStatus: {} as Record<string, WSConnectionStatus>,
    messagesLoadingBySession: {} as Record<string, boolean>,

    // 连接 WebSocket
    connectWebSocket: (sessionId: string, projectId?: string) => {
      const state = get()
      
      // 如果已有连接，先关闭
      if (state.wsConnections[sessionId]) {
        state.wsConnections[sessionId].close()
      }

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
            // 转换上游消息格式为本地消息格式
            const convertedMessages: TMessage[] = data.messages
              .filter((msg) => !msg.hidden) // 过滤隐藏消息
              .map((msg) => {
                // 提取文本内容
                let content = ''
                if (msg.message_parts) {
                  content = msg.message_parts
                    .filter((part) => part.type === 'text')
                    .map((part) => part.content || '')
                    .join('')
                }

                // 映射 role
                let role: 'user' | 'assistant' | 'system' = 'assistant'
                if (msg.kind === 'from_user') {
                  role = 'user'
                } else if (msg.kind === 'episodic_marker' || msg.kind === 'system') {
                  role = 'system'
                }

                // 映射 messageKind
                let messageKind = 'normal'
                if (msg.kind === 'reasoning' || msg.kind === 'internal_thought') {
                  messageKind = 'reasoning'
                } else if (msg.kind === 'episodic_marker' || msg.kind === 'system') {
                  messageKind = 'system'
                }

                return {
                  id: String(msg.item_id),
                  upstream_message_id: String(msg.item_id),
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
                } as TMessage
              })

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
            const mergedMessages = Array.from(messageMap.values()).sort(
              (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
            )

            // 更新 UI
            set({ messages: mergedMessages })

            // 同步到 IndexedDB 缓存（使用相同的 mergedMessages，确保一致）
            indexedDBCache.setMessages(sessionId, mergedMessages).catch((err) => {
              console.error('[WebSocket] Failed to update cache:', err)
            })

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
          }))
        },
        onError: (error: Error) => {
          console.error('WebSocket error:', error)
          set((state: any) => ({
            error: error.message,
            wsStatus: { ...state.wsStatus, [sessionId]: 'disconnected' },
          }))
        },
        onClose: () => {
          // 连接关闭处理 - ws.ts 会自动重连，这里不需要额外处理
          console.log('WebSocket closed for session:', sessionId)
        },
      })

      ws.connect()
      set((state: any) => ({
        wsConnections: { ...state.wsConnections, [sessionId]: ws },
        wsStatus: { ...state.wsStatus, [sessionId]: 'connecting' },
      }))
    },

    // 断开 WebSocket
    disconnectWebSocket: (sessionId: string) => {
      const state = get()
      const ws = state.wsConnections[sessionId]
      if (ws) {
        ws.close()
        set((state: any) => {
          const newConnections = { ...state.wsConnections }
          delete newConnections[sessionId]
          const newStatus = { ...state.wsStatus }
          delete newStatus[sessionId]
          return {
            wsConnections: newConnections,
            wsStatus: newStatus,
          }
        })
      }
    },

    // 发送消息（通过 WebSocket）
    sendMessageWS: (sessionId: string, content: string, attachments: string[] = []) => {
      const ws = get().wsConnections[sessionId]
      if (ws && ws.readyState === WebSocket.OPEN) {
        console.log('[sendMessageWS] sending input', { sessionId, contentLength: content.length, attachments: attachments.length > 0 ? attachments : 'none' })
        ws.sendInput(content, attachments)

        // 乐观更新：立即添加用户消息到列表
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
      } else {
        set({ error: 'WebSocket 未连接，请稍后重试' })
      }
    },

    // 中止当前会话的消息流（通过关闭 WebSocket）
    abortActiveMessageStream: (sessionId?: string) => {
      if (sessionId) {
        const ws = get().wsConnections[sessionId]
        if (ws && ws.readyState === WebSocket.OPEN) {
          // 先发送 Stop 消息到上游
          ws.sendStop()
        }
        // 断开连接
        get().disconnectWebSocket(sessionId)
        set((state: any) => ({
          streamingBySession: {
            ...state.streamingBySession,
            [sessionId]: false,
          },
        }))
      } else {
        // 中止所有
        const connections = get().wsConnections
        Object.values(connections).forEach((ws: any) => {
          if (ws?.readyState === WebSocket.OPEN) {
            ws.sendStop()
          }
        })
        Object.keys(get().wsConnections).forEach(sid => get().disconnectWebSocket(sid))
        set({ streamingBySession: {}, isStreaming: false })
      }
    },

    fetchMessagesBySession: async (
      projectId: string,
      sessionId: string,
      options?: { mode?: 'replaceLatest' | 'prependOlder'; limit?: number; useCache?: boolean }
    ) => {
      const mode = options?.mode || 'replaceLatest'
      const useCache = options?.useCache !== false // 默认启用缓存
      const pageSize = options?.limit || (mode === 'replaceLatest' ? 200 : 20)
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

          // ==== 缓存优先加载策略 ====
          if (useCache) {
            // 1. 先尝试从 IndexedDB 读取缓存并立即显示（秒开体验）
            const cachedMessages = await indexedDBCache.getMessagesBySession(sessionId)
            if (cachedMessages.length > 0 && isActiveSession()) {
              console.log('[fetchMessages] cache hit', { sessionId, count: cachedMessages.length })
              set({ messages: cachedMessages, loading: true }) // 保持 loading 状态，等待 HTTP 更新
            }

            // 2. 调用后端代理接口获取上游历史消息
            try {
              const { messages: upstreamMessages } = await historySync.fetchHistory(
                projectId,
                sessionId,
                { limit: 1000 }
              )
              console.log('[fetchMessages] upstream fetched', { sessionId, count: upstreamMessages.length })

              // 3. 合并缓存、上游消息和当前内存中的 temp 消息
              // 注意：用户可能在加载过程中发送了新消息（temp），需要保留
              const currentMemoryMessages = get().messages
              const tempMessages = currentMemoryMessages.filter((m: TMessage) => m.id.startsWith('temp-'))

              let merged = historySync.mergeMessages(cachedMessages, upstreamMessages)

              // 如果内存中有 temp 消息，追加到合并结果中（避免被覆盖）
              if (tempMessages.length > 0) {
                console.log('[fetchMessages] preserving temp messages during merge', {
                  tempCount: tempMessages.length,
                  tempIds: tempMessages.map((m: TMessage) => m.id),
                })
                merged = historySync.mergeMessages(merged, tempMessages)
              }

              // 4. 更新 IndexedDB 缓存（不包含 temp 消息）
              const nonTempMessages = merged.filter((m: TMessage) => !m.id.startsWith('temp-'))
              await indexedDBCache.setMessages(sessionId, nonTempMessages)

              // 5. 更新 UI（如果会话仍活跃）
              if (isActiveSession()) {
                set({
                  messages: merged,
                  loading: false,
                  messagePagination: {
                    ...get().messagePagination,
                    [sessionId]: {
                      nextSkip: merged.length,
                      hasMore: upstreamMessages.length === 1000,
                      loadingOlder: false,
                      pageSize,
                    },
                  },
                })
              }
            } catch (err) {
              // 上游获取失败，但缓存已有数据，保留缓存不报错
              console.error('[fetchMessages] upstream failed, using cache', err)
              if (cachedMessages.length > 0 && isActiveSession()) {
                set({ loading: false })
              } else {
                // 没有缓存且上游失败，设置错误状态
                set({ error: 'Failed to fetch messages', loading: false })
              }
            }
            return
          }

          // 旧逻辑作为 fallback（当缓存禁用或上游失败且无缓存时）
          const skip = 0
          const messages = (await projectApi.getSessionMessages(projectId, sessionId, {
            skip,
            limit: pageSize,
          })) as TMessage[]
          if (!isActiveSession()) {
            return
          }
          // 仅当接口确有消息时才替换列表；接口为空时只结束 loading，保留当前内存中的消息。
          set((state: any) => ({
            ...(messages.length > 0 ? { messages } : {}),
            loading: false,
            messagePagination: {
              ...state.messagePagination,
              [sessionId]: {
                nextSkip: messages.length,
                hasMore: messages.length === pageSize,
                loadingOlder: false,
                pageSize,
              },
            },
          }))
        } else {
          // prependOlder 模式：加载更多历史消息
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
            limit: pageSize,
          })) as TMessage[]
          if (!isActiveSession()) {
            return
          }
          set((state: any) => {
            const existingIds = new Set(state.messages.map((m: TMessage) => m.id))
            const older = messages.filter((m) => !existingIds.has(m.id))
            const merged = [...older, ...state.messages]
            return {
              messages: merged,
              messagePagination: {
                ...state.messagePagination,
                [sessionId]: {
                  ...pagination,
                  nextSkip: pagination.nextSkip + messages.length,
                  hasMore: messages.length === pageSize,
                  loadingOlder: false,
                  pageSize,
                },
              },
            }
          })
        }
      } catch (error: any) {
        if (!isActiveSession()) {
          return
        }
        if (mode === 'replaceLatest') {
          set({ error: error.message, loading: false })
        } else {
          set((state: any) => ({
            error: error.message,
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
          await get().fetchMessagesBySession(projectId, sessionId)
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
