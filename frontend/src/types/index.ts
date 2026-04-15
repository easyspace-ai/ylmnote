export interface User {
  id: string
  username: string
  email: string
  subscription_plan: string
  credits_balance: number
  credits_used: number
  created_at: string
}

export interface Project {
  id: string
  name: string
  description?: string
  cover_image?: string | null
  status: 'active' | 'archived' | 'deleted'
  created_at: string
  updated_at: string
}

/** 会话：属于项目，一个项目下可有多个会话 */
export interface Session {
  id: string
  project_id: string
  upstream_session_id?: string | null
  /** 与上游 WSS 握手确认 update.state.id 与本地 hint 对齐后为 true */
  upstream_verified?: boolean
  title: string
  created_at: string
  updated_at: string
}

export interface Message {
  id: string
  upstream_message_id?: string | null
  project_id: string
  session_id?: string
  role: 'user' | 'assistant' | 'system'
  content: string
  status?: string
  skill_id?: string | null
  attachments?: any
  resource_refs?: Array<{ id: string; name?: string; type?: string }>
  created_at: string
}

export interface Resource {
  id: string
  project_id: string
  session_id?: string | null
  type: 'document' | 'link' | 'note' | 'output' | 'pdf' | 'text' | 'html_page' | 'artifact' | 'todo_state'
  name: string
  content?: string
  url?: string | null
  size?: string | null
  created_at: string
}

export interface Skill {
  id: string
  name: string
  description?: string
  icon?: string | null
  category: string
  author?: string | null
  users_count: number
  rating: number
  tags?: string[] | null
  is_installed: boolean
  is_personal: boolean
  is_recommended: boolean
  created_at: string
  updated_at: string
}

export interface PromptTemplate {
  id: string
  action_type: string
  name: string
  prompt: string
  created_at: string
  updated_at: string
}
