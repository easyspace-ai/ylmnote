/**
 * Chat Hook - 封装聊天业务逻辑
 */
import { useState, useCallback, useRef } from 'react'
import { chatApi } from '@/services/api'
import { chatLogger, logError, logInfo } from '@/utils/logger'
import { AIError, AITimeoutError, AIConnectionError, getFriendlyErrorMessage } from '@/services/ai/errors'
import type { ChatMessage, ChatMode, Attachment } from '@/components/AIChatBox'
import type { Skill } from '@/types'

export interface UseChatOptions {
  projectId?: number
  skillId?: string | null
  mode?: ChatMode
  model?: string
  onMessageSent?: (message: ChatMessage) => void
  onError?: (error: Error) => void
}

export function useChat(options: UseChatOptions = {}) {
  const {
    projectId,
    skillId,
    mode = 'chat',
    model,
    onMessageSent,
    onError,
  } = options
  
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isStreaming, setIsStreaming] = useState(false)
  const abortControllerRef = useRef<AbortController | null>(null)
  
  // 发送消息
  const sendMessage = useCallback(async (
    content: string,
    chatMode: ChatMode = mode,
    selectedSkill: string | null = skillId || null,
    attachments: Attachment[] = [],
    selectedModel: string = model || 'google/gemini-3-flash-preview'
  ) => {
    if (!content.trim() || isLoading) return
    
    const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    const userMessage: ChatMessage = {
      id: messageId,
      role: 'user',
      content: content.trim(),
    }
    
    // 添加用户消息到列表
    setMessages(prev => [...prev, userMessage])
    setIsLoading(true)
    
    logInfo('useChat', '发送消息', {
      messageId,
      contentLen: content.length,
      mode: chatMode,
      skillId: selectedSkill,
      model: selectedModel,
      projectId,
    })
    
    try {
      const response = await chatApi.send({
        message: content.trim(),
        projectId: projectId ? String(projectId) : undefined,
        skillId: selectedSkill || undefined,
        mode: chatMode,
        model: selectedModel,
        attachments: attachments.map(a => ({ id: a.id, name: a.name, type: a.type })),
      })
      
      const assistantMessage: ChatMessage = {
        id: `msg_${Date.now()}_assistant`,
        role: 'assistant',
        content: response.content,
      }
      
      setMessages(prev => [...prev, assistantMessage])
      onMessageSent?.(assistantMessage)
      
      logInfo('useChat', '收到响应', {
        messageId: assistantMessage.id,
        contentLen: response.content.length,
      })
      
    } catch (error: any) {
      logError('useChat', '发送消息失败', error as Error, {
        messageId,
        error: error.message,
      })
      
      // 转换为友好的错误消息
      const aiError = error instanceof AIError ? error : new AIError(error.message)
      const friendlyMessage = getFriendlyErrorMessage(aiError)
      
      // 添加错误消息
      const errorMessage: ChatMessage = {
        id: `msg_${Date.now()}_error`,
        role: 'assistant',
        content: `❌ ${friendlyMessage}`,
      }
      setMessages(prev => [...prev, errorMessage])
      
      onError?.(error)
    } finally {
      setIsLoading(false)
    }
  }, [projectId, skillId, mode, model, onMessageSent, onError])
  
  // 流式发送消息
  const sendStreamMessage = useCallback(async (
    content: string,
    chatMode: ChatMode = mode,
    selectedSkill: string | null = skillId || null,
    attachments: Attachment[] = [],
    selectedModel: string = model || 'google/gemini-3-flash-preview'
  ) => {
    if (!content.trim() || isStreaming) return
    
    const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    const userMessage: ChatMessage = {
      id: messageId,
      role: 'user',
      content: content.trim(),
    }
    
    // 添加用户消息
    setMessages(prev => [...prev, userMessage])
    setIsStreaming(true)
    
    // 创建空的助手消息（用于累积流式内容）
    const assistantMessageId = `msg_${Date.now()}_assistant`
    setMessages(prev => [...prev, {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      status: '正在思考...',
    }])
    
    logInfo('useChat', '开始流式消息', {
      messageId,
      contentLen: content.length,
      mode: chatMode,
    })
    
    try {
      abortControllerRef.current = new AbortController()
      
      const stream = chatApi.stream({
        message: content.trim(),
        projectId: projectId ? String(projectId) : undefined,
        skillId: selectedSkill || undefined,
        mode: chatMode,
        model: selectedModel,
        attachments: attachments.map(a => ({ id: a.id, name: a.name, type: a.type })),
      }, (abortControllerRef.current as any).signal)
      
      let fullContent = ''
      
      for await (const event of stream) {
        if (event.type === 'content') {
          fullContent += event.value
          
          // 更新助手消息
          setMessages(prev => prev.map(msg => 
            msg.id === assistantMessageId
              ? { ...msg, content: fullContent }
              : msg
          ))
        } else if (event.type === 'status') {
          // 更新状态
          setMessages(prev => prev.map(msg =>
            msg.id === assistantMessageId
              ? { ...msg, status: event.value }
              : msg
          ))
        } else if (event.type === 'status_clear') {
          // 清除状态
          setMessages(prev => prev.map(msg =>
            msg.id === assistantMessageId
              ? { ...msg, status: undefined }
              : msg
          ))
        } else if (event.type === 'error') {
          throw new AIError(event.value)
        }
      }
      
      logInfo('useChat', '流式完成', {
        assistantMessageId,
        contentLen: fullContent.length,
      })
      
    } catch (error: any) {
      logError('useChat', '流式消息失败', error as Error, {
        messageId,
      })
      
      const aiError = error instanceof AIError ? error : new AIError(error.message)
      const friendlyMessage = getFriendlyErrorMessage(aiError)
      
      // 更新错误状态
      setMessages(prev => prev.map(msg =>
        msg.id === assistantMessageId
          ? { ...msg, content: `❌ ${friendlyMessage}`, status: undefined }
          : msg
      ))
      
      onError?.(error)
    } finally {
      setIsStreaming(false)
      abortControllerRef.current = null
    }
  }, [projectId, skillId, mode, model, onError])
  
  // 取消流式
  const cancelStream = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
      setIsStreaming(false)
      chatLogger.info('流式已取消')
    }
  }, [])
  
  // 复制消息
  const copyMessage = useCallback((content: string) => {
    navigator.clipboard.writeText(content)
    chatLogger.info('消息已复制', { contentLen: content.length })
  }, [])
  
  // 重新生成
  const regenerateLastMessage = useCallback(async () => {
    const lastUserMessage = [...messages].reverse().find(m => m.role === 'user')
    if (!lastUserMessage) {
      chatLogger.warn('没有可重新生成的消息')
      return
    }
    
    // 删除最后一条助手消息
    setMessages(prev => {
      const idx = prev.findIndex((m, i) => 
        i > prev.indexOf(lastUserMessage) && m.role === 'assistant'
      )
      if (idx !== -1) {
        const newMsgs = [...prev]
        newMsgs.splice(idx, 1)
        return newMsgs
      }
      return prev
    })
    
    // 重新发送
    await sendMessage(lastUserMessage.content)
  }, [messages, sendMessage])
  
  // 清空对话
  const clearMessages = useCallback(() => {
    setMessages([])
    chatLogger.info('对话已清空')
  }, [])
  
  return {
    messages,
    isLoading,
    isStreaming,
    sendMessage,
    sendStreamMessage,
    cancelStream,
    copyMessage,
    regenerateLastMessage,
    clearMessages,
  }
}
