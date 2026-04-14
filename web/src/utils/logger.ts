/**
 * 前端日志工具
 * 
 * 提供分级日志和错误追踪
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

interface LogContext {
  [key: string]: any
}

class Logger {
  private prefix: string
  private minLevel: LogLevel = 'info'
  
  constructor(prefix: string = 'App') {
    this.prefix = prefix
  }
  
  private shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ['debug', 'info', 'warn', 'error']
    return levels.indexOf(level) >= levels.indexOf(this.minLevel)
  }
  
  private formatMessage(message: string, context?: LogContext): string {
    const timestamp = new Date().toISOString().slice(11, 23)
    const base = `[${timestamp}] [${this.prefix}] ${message}`
    
    if (context && Object.keys(context).length > 0) {
      const ctxStr = Object.entries(context)
        .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
        .join(' ')
      return `${base} {${ctxStr}}`
    }
    
    return base
  }
  
  debug(message: string, context?: LogContext) {
    if (!this.shouldLog('debug')) return
    console.debug(this.formatMessage(message, context))
  }
  
  info(message: string, context?: LogContext) {
    if (!this.shouldLog('info')) return
    console.info(this.formatMessage(message, context))
  }
  
  warn(message: string, context?: LogContext) {
    if (!this.shouldLog('warn')) return
    console.warn(this.formatMessage(message, context))
  }
  
  error(message: string, error?: Error, context?: LogContext) {
    if (!this.shouldLog('error')) return
    const formatted = this.formatMessage(message, context)
    console.error(formatted, error || '')
  }
  
  setMinLevel(level: LogLevel) {
    this.minLevel = level
  }
}

// 创建模块级 logger
export const chatLogger = new Logger('Chat')
export const aiLogger = new Logger('AI')
export const apiLogger = new Logger('API')

// 便捷函数
export function logDebug(module: string, message: string, context?: LogContext) {
  new Logger(module).debug(message, context)
}

export function logInfo(module: string, message: string, context?: LogContext) {
  new Logger(module).info(message, context)
}

export function logWarn(module: string, message: string, context?: LogContext) {
  new Logger(module).warn(message, context)
}

export function logError(module: string, message: string, error?: Error, context?: LogContext) {
  new Logger(module).error(message, error, context)
}
