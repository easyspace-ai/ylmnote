export const API_CONFIG = {
  baseUrl: ((import.meta as any).env?.VITE_API_URL || '') || '',
  timeout: 30000,
}

export const API_ENDPOINTS = {
  projects: '/api/projects',
  project: (id: string) => `/api/projects/${id}`,
  projectSessions: (projectId: string) => `/api/projects/${projectId}/sessions`,
  projectSession: (projectId: string, sessionId: string) => `/api/projects/${projectId}/sessions/${sessionId}`,
  projectSessionUpstream: (projectId: string, sessionId: string) => `/api/projects/${projectId}/sessions/${sessionId}/upstream`,
  projectSessionMessages: (projectId: string, sessionId: string) => `/api/projects/${projectId}/sessions/${sessionId}/messages`,
  projectMessages: (id: string) => `/api/projects/${id}/messages`,
  projectResources: (id: string) => `/api/projects/${id}/resources`,
  projectPageFromOutline: (id: string) => `/api/projects/${id}/page-from-outline`,
  
  skills: '/api/skills',
  skillsInstalled: '/api/skills/installed',
  skillsRecommended: '/api/skills/recommended',
  skill: (id: string) => `/api/skills/${id}`,
  skillInstall: (id: string) => `/api/skills/${id}/install`,
  skillUninstall: (id: string) => `/api/skills/${id}/uninstall`,
  
  chat: '/api/chat',
  chatStream: '/api/chat/stream',
  chatRemoteMessages: '/api/chat/remote-messages',
  chatUpstreamGate: '/api/chat/upstream-gate',
  chatUpstreamStop: '/api/chat/upstream-stop',
  promptTemplates: '/api/prompt-templates',
  promptTemplate: (id: string) => `/api/prompt-templates/${id}`,
  
  search: '/api/search',
}
