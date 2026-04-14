import { create } from 'zustand'
import type { User, Project, Skill, Message, Resource } from '@/types'

interface AppState {
  // 用户状态
  user: User | null
  setUser: (user: User | null) => void
  
  // 项目状态
  projects: Project[]
  currentProject: Project | null
  setProjects: (projects: Project[]) => void
  setCurrentProject: (project: Project | null) => void
  addProject: (project: Project) => void
  updateProject: (id: string, updates: Partial<Project>) => void
  deleteProject: (id: string) => void
  
  // 技能状态
  skills: Skill[]
  installedSkills: Skill[]
  setSkills: (skills: Skill[]) => void
  installSkill: (skillId: string) => void
  uninstallSkill: (skillId: string) => void
  
  // 消息状态
  messages: Message[]
  setMessages: (messages: Message[]) => void
  addMessage: (message: Message) => void
  
  // 资料状态
  resources: Resource[]
  setResources: (resources: Resource[]) => void
  addResource: (resource: Resource) => void
  updateResource: (id: string, updates: Partial<Resource>) => void
  deleteResource: (id: string) => void
  
  // UI 状态
  sidebarCollapsed: boolean
  setSidebarCollapsed: (collapsed: boolean) => void
  toggleSidebar: () => void
  theme: 'light' | 'dark'
  toggleTheme: () => void
}

export const useAppStore = create<AppState>((set) => ({
  // 用户
  user: null,
  setUser: (user) => set({ user }),
  
  // 项目
  projects: [],
  currentProject: null,
  setProjects: (projects) => set({ projects }),
  setCurrentProject: (project) => set({ currentProject: project }),
  addProject: (project) => set((state) => ({ 
    projects: [project, ...state.projects] 
  })),
  updateProject: (id, updates) => set((state) => ({
    projects: state.projects.map((p) => 
      p.id === id ? { ...p, ...updates } : p
    )
  })),
  deleteProject: (id) => set((state) => ({
    projects: state.projects.filter((p) => p.id !== id)
  })),
  
  // 技能
  skills: [],
  installedSkills: [],
  setSkills: (skills) => set({ skills }),
  installSkill: (skillId) => set((state) => {
    const skill = state.skills.find((s) => s.id === skillId)
    if (skill && !state.installedSkills.find((s) => s.id === skillId)) {
      return { installedSkills: [...state.installedSkills, { ...skill, isInstalled: true }] }
    }
    return state
  }),
  uninstallSkill: (skillId) => set((state) => ({
    installedSkills: state.installedSkills.filter((s) => s.id !== skillId)
  })),
  
  // 消息
  messages: [],
  setMessages: (messages) => set({ messages }),
  addMessage: (message) => set((state) => ({ 
    messages: [...state.messages, message] 
  })),
  
  // 资料
  resources: [],
  setResources: (resources) => set({ resources }),
  addResource: (resource) => set((state) => ({ 
    resources: [...state.resources, resource] 
  })),
  updateResource: (id, updates) => set((state) => ({
    resources: state.resources.map((r) => 
      r.id === id ? { ...r, ...updates } : r
    )
  })),
  deleteResource: (id) => set((state) => ({
    resources: state.resources.filter((r) => r.id !== id)
  })),
  
  // UI
  sidebarCollapsed: false,
  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
  toggleSidebar: () => set((state) => ({ 
    sidebarCollapsed: !state.sidebarCollapsed 
  })),
  theme: 'light',
  toggleTheme: () => set((state) => ({ 
    theme: state.theme === 'light' ? 'dark' : 'light' 
  })),
}))
