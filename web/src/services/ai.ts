import { AI_CONFIG, getModelConfig } from '@/config/ai'

export interface ChatCompletionMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ChatCompletionOptions {
  messages: ChatCompletionMessage[]
  model?: string
  temperature?: number
  maxTokens?: number
  stream?: boolean
}

export interface ChatCompletionResponse {
  id: string
  choices: {
    message: {
      role: 'assistant'
      content: string
    }
    finish_reason: string
  }[]
  usage?: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

class AIService {
  private baseUrl: string
  private apiKey: string
  
  constructor() {
    this.baseUrl = AI_CONFIG.openRouter.baseUrl
    this.apiKey = AI_CONFIG.openRouter.apiKey
  }
  
  // 检查是否配置了 API Key
  isConfigured(): boolean {
    return !!this.apiKey && this.apiKey !== 'your_api_key_here'
  }
  
  // 发送聊天请求（超时130s，与后端AI Base保持一致）
  async chatCompletion(options: ChatCompletionOptions): Promise<ChatCompletionResponse> {
    if (!this.isConfigured()) {
      throw new Error('请先配置 OpenRouter API Key')
    }
    
    const model = getModelConfig(options.model)
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 130_000) // 比后端120s多10s缓冲
    
    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
          'HTTP-Referer': window.location.origin,
          'X-Title': 'MetaNote Clone',
        },
        body: JSON.stringify({
          model: model.id,
          messages: options.messages,
          temperature: options.temperature ?? 0.7,
          max_tokens: options.maxTokens ?? model.maxTokens,
          stream: options.stream ?? false,
        }),
      })
      
      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.error?.message || `API 请求失败: ${response.status}`)
      }
      
      return response.json()
    } catch (e: any) {
      if (e.name === 'AbortError') throw new Error('AI 响应超时（超过120秒），请稍后重试')
      throw e
    } finally {
      clearTimeout(timeoutId)
    }
  }
  
  // 流式聊天请求（超时130s，与后端AI Base保持一致）
  async *streamChatCompletion(options: ChatCompletionOptions): AsyncGenerator<string> {
    if (!this.isConfigured()) {
      throw new Error('请先配置 OpenRouter API Key')
    }
    
    const model = getModelConfig(options.model)
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 130_000) // 比后端120s多10s缓冲
    
    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
          'HTTP-Referer': window.location.origin,
          'X-Title': 'MetaNote Clone',
        },
        body: JSON.stringify({
          model: model.id,
          messages: options.messages,
          temperature: options.temperature ?? 0.7,
          max_tokens: options.maxTokens ?? model.maxTokens,
          stream: true,
        }),
      })
      
      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.error?.message || `API 请求失败: ${response.status}`)
      }
      
      const reader = response.body?.getReader()
      if (!reader) throw new Error('无法读取响应流')
      
      const decoder = new TextDecoder()
      
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        
        const chunk = decoder.decode(value)
        const lines = chunk.split('\n').filter(line => line.startsWith('data: '))
        
        for (const line of lines) {
          const data = line.slice(6)
          if (data === '[DONE]') continue
          
          try {
            const parsed = JSON.parse(data)
            const content = parsed.choices?.[0]?.delta?.content
            if (content) yield content
          } catch {
            // 忽略解析错误
          }
        }
      }
    } catch (e: any) {
      if (e.name === 'AbortError') throw new Error('AI 响应超时（超过120秒），请稍后重试')
      throw e
    } finally {
      clearTimeout(timeoutId)
    }
  }
}

export const aiService = new AIService()
