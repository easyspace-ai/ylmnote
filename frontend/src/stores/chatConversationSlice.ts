/**
 * 会话消息、流式对话、sync-state 等与聊天相关的 store 切片（从 apiStore 拆出以减轻单文件体积）。
 */
import { projectApi, chatApi } from '@/services/api'
import type { Message as TMessage } from '@/types'

const chatStreamAbortBySession = new Map<string, AbortController>()

/** set/get 使用宽松类型，避免与 zustand AppState 循环依赖 */
export function createChatConversationSlice(set: (partial: any) => void, get: () => any) {
  const markSessionStreaming = (sessionId: string | undefined, streaming: boolean) => {
    if (!sessionId) return
    set((state: any) => {
      const next = { ...(state.streamingBySession || {}) } as Record<string, boolean>
      if (streaming) next[sessionId] = true
      else delete next[sessionId]
      return {
        streamingBySession: next,
        isStreaming: Object.keys(next).length > 0,
      }
    })
  }

  return {
    abortActiveMessageStream: (sessionId?: string) => {
      if (sessionId) {
        const ctrl = chatStreamAbortBySession.get(sessionId)
        if (ctrl) {
          ctrl.abort()
          chatStreamAbortBySession.delete(sessionId)
        }
        markSessionStreaming(sessionId, false)
        return
      }
      for (const ctrl of chatStreamAbortBySession.values()) {
        ctrl.abort()
      }
      chatStreamAbortBySession.clear()
      set({ streamingBySession: {}, isStreaming: false })
    },

    fetchMessagesBySession: async (
      projectId: string,
      sessionId: string,
      options?: { mode?: 'replaceLatest' | 'prependOlder'; limit?: number }
    ) => {
      const mode = options?.mode || 'replaceLatest'
      // 切会话/刷新时优先一次拉取更多最近消息，避免“看起来没更新”。
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
      try {
        if (mode === 'replaceLatest') {
          set({ loading: true, error: null })
          // 直接走服务端真源：切会话时先清空当前展示，避免旧会话残留。
          if (isActiveSession()) {
            set({ messages: [] })
          }
        } else {
          set((state: any) => ({
            error: null,
            messagePagination: {
              ...state.messagePagination,
              [sessionId]: { ...pagination, loadingOlder: true },
            },
          }))
        }
        const skip = mode === 'replaceLatest' ? 0 : pagination.nextSkip
        const messages = (await projectApi.getSessionMessages(projectId, sessionId, {
          skip,
          limit: pageSize,
        })) as TMessage[]
        if (!isActiveSession()) {
          return
        }
        if (mode === 'replaceLatest') {
          set((state: any) => ({
            messages,
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

    sendMessageStream: async (
      projectId: string,
      sessionId: string | undefined,
      content: string,
      skillId?: string,
      onChunk?: (text: string) => void,
      model?: string,
      mode?: string,
      resourceRefs?: Array<{ id: string; name?: string; type?: string }>,
      externalAbortSignal?: AbortSignal
    ) => {
      const streamCtrl = new AbortController()
      let streamKey = sessionId || `pending:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`
      const prev = chatStreamAbortBySession.get(streamKey)
      if (prev) prev.abort()
      chatStreamAbortBySession.set(streamKey, streamCtrl)
      const onExternalAbort = () => streamCtrl.abort()
      if (externalAbortSignal) {
        if (externalAbortSignal.aborted) streamCtrl.abort()
        else externalAbortSignal.addEventListener('abort', onExternalAbort)
      }

      let visibleSessionId = sessionId
      markSessionStreaming(visibleSessionId, true)
      let resolvedSessionId = sessionId
      const todoSessionKey = () => resolvedSessionId || sessionId || `${projectId}:pending`
      const userMsg = {
        id: 'temp-' + Date.now(),
        project_id: projectId,
        session_id: sessionId,
        role: 'user' as const,
        content,
        skill_id: skillId,
        created_at: new Date().toISOString(),
      }
      set((state: any) => ({ messages: [...state.messages, userMsg] }))

      const aiMsgId = 'ai-' + Date.now()
      const aiMsg = {
        id: aiMsgId,
        project_id: projectId,
        session_id: sessionId,
        role: 'assistant' as const,
        content: '',
        created_at: new Date().toISOString(),
      }
      set((state: any) => ({ messages: [...state.messages, aiMsg] }))

      let fullContent = ''
      try {
        for await (const chunkEvent of chatApi.stream(
          { message: content, projectId, sessionId, skillId, model, mode, resourceRefs },
          streamCtrl.signal
        ) as any) {
          if (chunkEvent.type === 'session_id' && chunkEvent.value) {
            const prevKey = todoSessionKey()
            const nextSessionID = String(chunkEvent.value)
            if (streamKey !== nextSessionID) {
              chatStreamAbortBySession.delete(streamKey)
              streamKey = nextSessionID
              chatStreamAbortBySession.set(streamKey, streamCtrl)
            }
            if (visibleSessionId !== nextSessionID) {
              markSessionStreaming(visibleSessionId, false)
              visibleSessionId = nextSessionID
              markSessionStreaming(visibleSessionId, true)
            }
            resolvedSessionId = nextSessionID
            set((state: any) => ({
              messages: state.messages.map((m: TMessage) =>
                m.id === aiMsgId ? { ...m, session_id: nextSessionID } : m
              ),
              liveTodosBySession: (() => {
                const next = { ...state.liveTodosBySession }
                const nextKey = todoSessionKey()
                if (prevKey !== nextKey && next[prevKey] && !next[nextKey]) {
                  next[nextKey] = next[prevKey]
                  delete next[prevKey]
                }
                return next
              })(),
            }))
            continue
          } else if (chunkEvent.type === 'tool') {
            let toolPayload: any = null
            try {
              toolPayload = typeof chunkEvent.value === 'string' ? JSON.parse(chunkEvent.value) : chunkEvent.value
            } catch {
              toolPayload = null
            }
            if (toolPayload?.kind === 'todos' && Array.isArray(toolPayload.todos)) {
              const todos = toolPayload.todos
                .map((item: any) => ({
                  text: String(item?.text || '').trim(),
                  done: Boolean(item?.done),
                }))
                .filter((item: { text: string }) => item.text)
              const key = todoSessionKey()
              set((state: any) => ({
                liveTodosBySession: {
                  ...state.liveTodosBySession,
                  [key]: todos,
                },
              }))
            }
            continue
          } else if (chunkEvent.type === 'status') {
            set((state: any) => ({
              messages: state.messages.map((m: TMessage) =>
                m.id === aiMsgId ? { ...m, status: chunkEvent.value } : m
              ),
            }))
            continue
          } else if (chunkEvent.type === 'status_clear') {
            set((state: any) => ({
              messages: state.messages.map((m: TMessage) =>
                m.id === aiMsgId ? { ...m, status: undefined } : m
              ),
            }))
            continue
          } else if (chunkEvent.type === 'upstream_handshake') {
            // WSS 握手完成（auth→id→update/status），早于 content；勿当作文本追加
            continue
          }

          const chunkText = chunkEvent.value || ''
          fullContent += chunkText

          set((state: any) => ({
            messages: state.messages.map((m: TMessage) =>
              m.id === aiMsgId ? { ...m, content: fullContent } : m
            ),
          }))

          onChunk?.(chunkText)
        }
        markSessionStreaming(visibleSessionId, false)
        await get().fetchSessions(projectId)
      } catch (error: any) {
        const aborted =
          error?.name === 'AbortError' || /abort/i.test(String(error?.message || ''))
        if (aborted) {
          set((state: any) => ({
            messages: state.messages.map((m: TMessage) => {
              if (m.id !== aiMsgId) return m
              const cur = (fullContent || m.content || '').trim()
              return { ...m, content: cur || '（生成已中断）', status: undefined }
            }),
          }))
          markSessionStreaming(visibleSessionId, false)
        } else if (String(error?.message || '').includes('501')) {
          try {
            const resp = await chatApi.send({ message: content, projectId, sessionId, skillId, model, mode, resourceRefs })
            fullContent = resp.content || ''
            set((state: any) => ({
              messages: state.messages.map((m: TMessage) =>
                m.id === aiMsgId ? { ...m, content: fullContent } : m
              ),
            }))
            markSessionStreaming(visibleSessionId, false)
          } catch (e: any) {
            markSessionStreaming(visibleSessionId, false)
            set({ error: e?.message || '发送失败' })
          }
        } else {
          set((state: any) => ({
            error: error.message,
            messages: state.messages.map((m: TMessage) =>
              m.id === aiMsgId ? { ...m, content: (fullContent || m.content || '').trim() || '（生成失败）' } : m
            ),
          }))
          markSessionStreaming(visibleSessionId, false)
        }
      } finally {
        if (externalAbortSignal) {
          externalAbortSignal.removeEventListener('abort', onExternalAbort)
        }
        if (chatStreamAbortBySession.get(streamKey) === streamCtrl) {
          chatStreamAbortBySession.delete(streamKey)
        }
      }

      if (projectId) {
        await get().fetchResources(projectId)
      }
    },

    sendW6PageFromOutlineStream: async (
      projectId: string,
      payload: { title: string; outline: string; knowledgePoints?: string },
      callbacks: { onResult?: (resource: any) => void; onError?: (err: string) => void } = {}
    ) => {
      const { onResult, onError } = callbacks
      const userMsg = {
        id: 'temp-' + Date.now(),
        project_id: projectId,
        role: 'user' as const,
        content: payload.outline || payload.title,
        created_at: new Date().toISOString(),
      }
      set((state: any) => ({ messages: [...state.messages, userMsg] }))
      const aiMsgId = 'w6-' + Date.now()
      const aiMsg = {
        id: aiMsgId,
        project_id: projectId,
        role: 'assistant' as const,
        content: '',
        created_at: new Date().toISOString(),
      }
      set((state: any) => ({ messages: [...state.messages, aiMsg] }))
      const steps: string[] = []
      await projectApi.generatePageFromOutlineStream(
        projectId,
        { title: payload.title, outline: payload.outline, knowledgePoints: payload.knowledgePoints },
        {
          onProgress: (_step: string, message: string) => {
            steps.push(message)
            set((state: any) => ({
              messages: state.messages.map((m: TMessage) =>
                m.id === aiMsgId ? { ...m, content: '正在生成动态讲义…\n\n' + steps.join('\n') } : m
              ),
            }))
          },
          onResult: (resource: any) => {
            set((state: any) => ({
              messages: state.messages.map((m: TMessage) =>
                m.id === aiMsgId ? { ...m, content: '动态讲义已生成，请查看右侧「输出内容」。' } : m
              ),
            }))
            get().fetchResources(projectId)
            onResult?.(resource)
          },
          onError: (detail: string) => {
            set((state: any) => ({
              messages: state.messages.map((m: TMessage) =>
                m.id === aiMsgId ? { ...m, content: '生成失败：' + detail } : m
              ),
            }))
            onError?.(detail)
          },
        }
      )
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
        await chatApi.syncState({
          projectId,
          sessionId,
          upstreamSessionId: options?.upstreamSessionId,
          activateUpstream: options?.activateUpstream,
        })
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
        const msg = String(error?.message || '').toLowerCase()
        const isTerminal = msg.includes('session upstream id conflict')
        set((state: any) => ({
          error: isTerminal ? (error?.message || '会话绑定异常，请重新绑定后再试') : state.error,
          sessionSyncMeta: {
            ...state.sessionSyncMeta,
            [syncKey]: {
              inFlight: false,
              lastAttemptAt: now,
              lastFailedAt: Date.now(),
              lastSuccessAt: meta?.lastSuccessAt,
              lastError: error?.message || 'sync failed',
              isTerminal,
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
