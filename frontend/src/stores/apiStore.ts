import { create } from 'zustand'
import { projectApi, skillApi, promptTemplateApi } from '@/services/api'
import {
  Project as TProject,
  Message as TMessage,
  Session as TSession,
  Resource,
  Skill as TSkill,
  PromptTemplate as TPromptTemplate
} from '@/types'
import type { SessionSyncMeta } from '@/stores/apiStoreTypes'
import { createChatConversationSlice } from '@/stores/chatConversationSlice'

export type { SessionSyncMeta } from '@/stores/apiStoreTypes'

// Store 状态
interface AppState {
  // 加载状态
  loading: boolean
  isStreaming: boolean
  streamingBySession: Record<string, boolean>
  error: string | null
  
  // 项目
  projects: TProject[]
  currentProject: TProject | null
  sessions: TSession[]
  resources: Resource[]
  messages: TMessage[]
  activeMessageSessionId?: string
  liveTodosBySession: Record<string, Array<{ text: string; done: boolean }>>
  messagePagination: Record<string, { nextSkip: number; hasMore: boolean; loadingOlder: boolean; pageSize: number }>
  sessionSyncMeta: Record<string, SessionSyncMeta>

  // 技能
  skills: TSkill[]
  installedSkills: TSkill[]
  recommendedSkills: TSkill[]
  promptTemplates: TPromptTemplate[]
  
  // Actions
  // 项目
  fetchProjects: (status?: string) => Promise<void>
  fetchProject: (id: string) => Promise<void>
  createProject: (data: { name: string; description?: string }) => Promise<TProject>
  updateProject: (id: string, data: Partial<TProject>) => Promise<void>
  deleteProject: (id: string) => Promise<void>
  setCurrentProject: (project: TProject | null) => void
  
  // 消息
  uploadResource: (projectId: string, file: File) => Promise<any>
  fetchResources: (projectId: string, type?: string) => Promise<void>
  createResource: (projectId: string, data: { type: string; name: string; content?: string; url?: string; session_id?: string }) => Promise<any>
  deleteResource: (projectId: string, resourceId: string) => Promise<void>
  updateMessage: (projectId: string, messageId: string, content: string) => Promise<void>
  deleteMessage: (projectId: string, messageId: string) => Promise<void>
  updateResource: (projectId: string, resourceId: string, data: { name?: string; content?: string }) => Promise<void>
  fetchMessages: (projectId: string) => Promise<void>
  fetchSessions: (projectId: string) => Promise<void>
  fetchMessagesBySession: (
    projectId: string,
    sessionId: string,
    options?: { mode?: 'replaceLatest' | 'prependOlder'; limit?: number }
  ) => Promise<void>
  hydrateSessionMessagesFromCache: (projectId: string, sessionId: string) => void
  setActiveMessageSession: (sessionId?: string) => void
  clearSessionMessages: (sessionId?: string) => void
  loadOlderMessages: (projectId: string, sessionId: string) => Promise<void>
  createSession: (projectId: string, title?: string) => Promise<TSession>
  updateSession: (projectId: string, sessionId: string, title: string) => Promise<void>
  bindSessionUpstream: (projectId: string, sessionId: string, upstreamSessionId: string) => Promise<void>
  deleteSession: (projectId: string, sessionId: string) => Promise<void>
  sendMessage: (projectId: string, content: string, skillId?: string) => Promise<void>
  sendMessageStream: (
    projectId: string,
    sessionId: string | undefined,
    content: string,
    skillId?: string,
    onChunk?: (text: string) => void,
    model?: string,
    mode?: string,
    resourceRefs?: Array<{ id: string; name?: string; type?: string }>,
    /** 可选：与内部 controller 并行中止（例如父组件卸载） */
    externalAbortSignal?: AbortSignal
  ) => Promise<void>
  /** 中止流式读取：不传则中止全部；传 sessionId 则仅中止该会话 */
  abortActiveMessageStream: (sessionId?: string) => void
  sendW6PageFromOutlineStream: (projectId: string, payload: { title: string; outline: string; knowledgePoints?: string }, callbacks?: { onResult?: (resource: any) => void; onError?: (err: string) => void }) => Promise<void>
  syncSessionState: (projectId: string, sessionId: string, options?: { refreshMessages?: boolean; upstreamSessionId?: string; activateUpstream?: boolean; force?: boolean }) => Promise<void>
  getSessionSyncMeta: (projectId: string, sessionId: string) => SessionSyncMeta | undefined
  getSessionSyncStatus: (projectId: string, sessionId: string) => 'idle' | 'syncing' | 'cooldown' | 'error' | 'ready'
  
  // 技能
  fetchSkills: (params?: { category?: string; installed?: boolean; search?: string }) => Promise<void>
  fetchInstalledSkills: () => Promise<void>
  fetchRecommendedSkills: (limit?: number) => Promise<void>
  installSkill: (id: string) => Promise<void>
  uninstallSkill: (id: string) => Promise<void>
  fetchPromptTemplates: () => Promise<void>
  createPromptTemplate: (data: { action_type: string; name: string; prompt: string }) => Promise<TPromptTemplate>
  updatePromptTemplate: (id: string, data: Partial<{ action_type: string; name: string; prompt: string }>) => Promise<TPromptTemplate>
  deletePromptTemplate: (id: string) => Promise<void>
  
  // 工具
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
}

export const useAppStore = create<AppState>((set, get) => ({
  // 初始状态
  loading: false,
  isStreaming: false,
  streamingBySession: {},
  error: null,
  projects: [],
  currentProject: null,
  sessions: [] as TSession[],
  resources: [] as Resource[],
  messages: [],
  activeMessageSessionId: undefined,
  liveTodosBySession: {},
  messagePagination: {},
  skills: [],
  installedSkills: [],
  recommendedSkills: [],
  promptTemplates: [],
  sessionSyncMeta: {},
  
  // 项目操作
  fetchProjects: async (status?: string) => {
    try {
      set({ loading: true, error: null })
      const projects = await projectApi.list({ status, limit: 50 })
      set({ projects, loading: false })
    } catch (error: any) {
      set({ error: error.message, loading: false })
    }
  },
  
  fetchProject: async (id: string) => {
    try {
      set({ loading: true, error: null })
      const project = await projectApi.get(id)
      set({ currentProject: project, loading: false })
    } catch (error: any) {
      set({ error: error.message, loading: false })
    }
  },
  
  createProject: async (data: { name: string; description?: string }) => {
    try {
      set({ loading: true, error: null })
      const project = await projectApi.create(data)
      set(state => ({ 
        projects: [project, ...state.projects],
        loading: false 
      }))
      return project
    } catch (error: any) {
      set({ error: error.message, loading: false })
      throw error
    }
  },
  
  updateProject: async (id: string, data: Partial<TProject>) => {
    try {
      set({ loading: true, error: null })
      const updated = await projectApi.update(id, data)
      set(state => ({
        projects: state.projects.map(p => p.id === id ? updated : p),
        currentProject: state.currentProject?.id === id ? updated : state.currentProject,
        loading: false
      }))
    } catch (error: any) {
      set({ error: error.message, loading: false })
    }
  },
  
  deleteProject: async (id: string) => {
    try {
      set({ loading: true, error: null })
      await projectApi.delete(id)
      set(state => ({
        projects: state.projects.filter(p => p.id !== id),
        currentProject: state.currentProject?.id === id ? null : state.currentProject,
        loading: false
      }))
    } catch (error: any) {
      set({ error: error.message, loading: false })
    }
  },
  
  setCurrentProject: (project: TProject | null) => {
    set({ currentProject: project, messages: [] })
  },
  
  // 消息操作
  
  fetchResources: async (projectId: string, type?: string) => {
    try {
      set({ loading: true, error: null })
      const resources = await projectApi.getResources(projectId, type)
      set({ resources, loading: false })
    } catch (error: any) {
      set({ error: error.message, loading: false })
    }
  },
  createResource: async (projectId: string, data: { type: string; name: string; content?: string; url?: string; session_id?: string }) => {
    try {
      set({ loading: true, error: null })
      const resource = await projectApi.createResource(projectId, data)
      set(state => ({ resources: [resource, ...state.resources], loading: false }))
      return resource
    } catch (error: any) {
      set({ error: error.message, loading: false })
      throw error
    }
  },
  updateMessage: async (projectId, messageId, content) => {
    try {
      await projectApi.updateMessage(projectId, messageId, content)
      set(state => ({
        messages: state.messages.map(m => m.id === messageId ? { ...m, content } : m)
      }))
    } catch (error: any) {
      set({ error: error.message })
    }
  },
  
  deleteMessage: async (projectId, messageId) => {
    try {
      await projectApi.deleteMessage(projectId, messageId)
      set(state => ({
        messages: state.messages.filter(m => m.id !== messageId)
      }))
    } catch (error: any) {
      set({ error: error.message })
    }
  },

  updateResource: async (projectId, resourceId, data) => {
    try {
      const updated = await projectApi.updateResource(projectId, resourceId, data)
      set(state => ({
        resources: state.resources.map(r => r.id === resourceId ? { ...r, ...data } : r)
      }))
    } catch (error: any) {
      set({ error: error.message })
    }
  },

  deleteResource: async (projectId: string, resourceId: string) => {
    try {
      set({ loading: true, error: null })
      await projectApi.deleteResource(projectId, resourceId)
      set(state => ({ 
        resources: state.resources.filter((r: any) => r.id !== resourceId),
        loading: false 
      }))
    } catch (error: any) {
      set({ error: error.message, loading: false })
    }
  },

  uploadResource: async (projectId: string, file: File) => {
    try {
      set({ loading: true, error: null })
      const resource = await projectApi.uploadResource(projectId, file)
      set({ loading: false })
      return resource
    } catch (error: any) {
      set({ error: error.message, loading: false })
      throw error
    }
  },
  fetchMessages: async (projectId: string) => {
    try {
      set({ loading: true, error: null })
      const messages = await projectApi.getMessages(projectId)
      set({ messages, loading: false })
    } catch (error: any) {
      set({ error: error.message, loading: false })
    }
  },

  fetchSessions: async (projectId: string) => {
    try {
      set({ error: null })
      const sessions = await projectApi.listSessions(projectId)
      set({ sessions })
    } catch (error: any) {
      set({ error: error.message, sessions: [] })
    }
  },

  ...createChatConversationSlice(set, get),

  createSession: async (projectId: string, title?: string) => {
    const session = await projectApi.createSession(projectId, title ? { title } : undefined)
    set(state => ({ sessions: [session, ...state.sessions] }))
    return session
  },

  updateSession: async (projectId: string, sessionId: string, title: string) => {
    await projectApi.updateSession(projectId, sessionId, { title })
    set(state => ({
      sessions: state.sessions.map(s => s.id === sessionId ? { ...s, title } : s)
    }))
  },

  bindSessionUpstream: async (projectId: string, sessionId: string, upstreamSessionId: string) => {
    const updated = await projectApi.bindSessionUpstream(projectId, sessionId, upstreamSessionId)
    set(state => ({
      sessions: state.sessions.map(s => s.id === sessionId ? updated : s)
    }))
  },

  deleteSession: async (projectId: string, sessionId: string) => {
    await projectApi.deleteSession(projectId, sessionId)
    set(state => ({ sessions: state.sessions.filter(s => s.id !== sessionId) }))
  },

  // 技能操作
  fetchSkills: async (params?: { category?: string; installed?: boolean; search?: string }) => {
    try {
      set({ loading: true, error: null })
      const skills = await skillApi.list(params)
      set({ skills, loading: false })
    } catch (error: any) {
      set({ error: error.message, loading: false })
    }
  },
  
  fetchInstalledSkills: async () => {
    try {
      const installedSkills = await skillApi.getInstalled()
      set({ installedSkills })
    } catch (error: any) {
      console.error('Failed to fetch installed skills:', error)
    }
  },
  
  fetchRecommendedSkills: async (limit = 4) => {
    try {
      const recommendedSkills = await skillApi.getRecommended(limit)
      set({ recommendedSkills })
    } catch (error: any) {
      console.error('Failed to fetch recommended skills:', error)
    }
  },
  
  installSkill: async (id: string) => {
    try {
      await skillApi.install(id)
      
      // 更新技能状态
      set(state => ({
        skills: state.skills.map(s => 
          s.id === id ? { ...s, is_installed: true, users_count: s.users_count + 1 } : s
        ),
        installedSkills: [...state.installedSkills, state.skills.find(s => s.id === id)].filter(Boolean) as TSkill[],
        recommendedSkills: state.recommendedSkills.map(s =>
          s.id === id ? { ...s, is_installed: true, users_count: s.users_count + 1 } : s
        )
      }))
    } catch (error: any) {
      set({ error: error.message })
    }
  },
  
  uninstallSkill: async (id: string) => {
    try {
      await skillApi.uninstall(id)
      
      // 更新技能状态
      set(state => ({
        skills: state.skills.map(s => 
          s.id === id ? { ...s, is_installed: false } : s
        ),
        installedSkills: state.installedSkills.filter(s => s.id !== id),
        recommendedSkills: state.recommendedSkills.map(s =>
          s.id === id ? { ...s, is_installed: false } : s
        )
      }))
    } catch (error: any) {
      set({ error: error.message })
    }
  },

  fetchPromptTemplates: async () => {
    try {
      set({ error: null })
      const promptTemplates = await promptTemplateApi.list()
      set({ promptTemplates })
    } catch (error: any) {
      set({ error: error.message, promptTemplates: [] })
    }
  },

  createPromptTemplate: async (data) => {
    try {
      const created = await promptTemplateApi.create(data)
      set((state) => ({ promptTemplates: [created, ...state.promptTemplates] }))
      return created
    } catch (error: any) {
      set({ error: error.message })
      throw error
    }
  },

  updatePromptTemplate: async (id, data) => {
    try {
      const updated = await promptTemplateApi.update(id, data)
      set((state) => ({
        promptTemplates: state.promptTemplates.map((item) => (item.id === id ? updated : item)),
      }))
      return updated
    } catch (error: any) {
      set({ error: error.message })
      throw error
    }
  },

  deletePromptTemplate: async (id) => {
    try {
      await promptTemplateApi.delete(id)
      set((state) => ({
        promptTemplates: state.promptTemplates.filter((item) => item.id !== id),
      }))
    } catch (error: any) {
      set({ error: error.message })
      throw error
    }
  },
  
  // 工具方法
  setLoading: (loading: boolean) => set({ loading }),
  setError: (error: string | null) => set({ error }),
}))