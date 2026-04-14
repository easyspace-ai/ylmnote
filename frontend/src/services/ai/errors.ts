/**
 * AI 服务结构化错误类
 */

export enum AIErrorCode {
  TIMEOUT = 'AI_TIMEOUT',
  CONNECTION_ERROR = 'AI_CONNECTION_ERROR',
  AUTH_ERROR = 'AI_AUTH_ERROR',
  STREAM_ERROR = 'AI_STREAM_ERROR',
  BILLING_ERROR = 'AI_BILLING_ERROR',
  UNKNOWN = 'AI_UNKNOWN_ERROR',
}

export class AIError extends Error {
  code: AIErrorCode
  context?: Record<string, any>
  
  constructor(
    message: string,
    code: AIErrorCode = AIErrorCode.UNKNOWN,
    context?: Record<string, any>
  ) {
    super(message)
    this.name = 'AIError'
    this.code = code
    this.context = context
    
    // 保持正确的原型链
    Object.setPrototypeOf(this, AIError.prototype)
  }
  
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      context: this.context,
    }
  }
}

export class AITimeoutError extends AIError {
  constructor(message: string = 'AI 响应超时', context?: Record<string, any>) {
    super(message, AIErrorCode.TIMEOUT, context)
    this.name = 'AITimeoutError'
  }
}

export class AIConnectionError extends AIError {
  constructor(message: string = 'AI 服务连接失败', context?: Record<string, any>) {
    super(message, AIErrorCode.CONNECTION_ERROR, context)
    this.name = 'AIConnectionError'
  }
}

export class AIAuthenticationError extends AIError {
  constructor(message: string = 'AI 服务认证失败', context?: Record<string, any>) {
    super(message, AIErrorCode.AUTH_ERROR, context)
    this.name = 'AIAuthenticationError'
  }
}

export class AIStreamError extends AIError {
  constructor(message: string = 'AI 流式响应错误', context?: Record<string, any>) {
    super(message, AIErrorCode.STREAM_ERROR, context)
    this.name = 'AIStreamError'
  }
}

export class AIBillingError extends AIError {
  constructor(message: string = 'Token 计费失败', context?: Record<string, any>) {
    super(message, AIErrorCode.BILLING_ERROR, context)
    this.name = 'AIBillingError'
  }
}

/**
 * 从 API 响应创建错误
 */
export function createErrorFromResponse(error: any): AIError {
  const code = error.code || AIErrorCode.UNKNOWN
  const message = error.message || '未知错误'
  const context = error.context
  
  switch (code) {
    case AIErrorCode.TIMEOUT:
    case 'AI_TIMEOUT':
      return new AITimeoutError(message, context)
    case AIErrorCode.CONNECTION_ERROR:
    case 'AI_CONNECTION_ERROR':
      return new AIConnectionError(message, context)
    case AIErrorCode.AUTH_ERROR:
    case 'AI_AUTH_ERROR':
      return new AIAuthenticationError(message, context)
    case AIErrorCode.STREAM_ERROR:
    case 'AI_STREAM_ERROR':
      return new AIStreamError(message, context)
    case AIErrorCode.BILLING_ERROR:
    case 'AI_BILLING_ERROR':
      return new AIBillingError(message, context)
    default:
      return new AIError(message, code as AIErrorCode, context)
  }
}

/**
 * 友好的错误消息映射
 */
export function getFriendlyErrorMessage(error: AIError | Error): string {
  if (error instanceof AIError) {
    switch (error.code) {
      case AIErrorCode.TIMEOUT:
        return 'AI 响应超时，请稍后重试'
      case AIErrorCode.CONNECTION_ERROR:
        return 'AI 服务暂时不可用，请稍后重试'
      case AIErrorCode.AUTH_ERROR:
        return '认证失败，请检查 API 配置'
      case AIErrorCode.STREAM_ERROR:
        return '流式响应出错，请刷新页面'
      case AIErrorCode.BILLING_ERROR:
        return '积分扣除失败，请联系管理员'
      default:
        return error.message
    }
  }
  
  // 普通 Error
  const msg = error.message
  if (msg.includes('timeout')) return '请求超时，请稍后重试'
  if (msg.includes('network')) return '网络连接失败，请检查网络'
  if (msg.includes('Failed to fetch')) return '无法连接到服务器'
  
  return msg || '发生未知错误'
}
