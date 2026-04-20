// WebSocket 服务 - 连接后端 WS 代理
import { useAuthStore } from '../stores/authStore';

// WS 连接配置
const WS_BASE_URL = (() => {
  const apiBase = ((import.meta as any).env?.VITE_API_URL || '');
  // http -> ws, https -> wss
  if (apiBase.startsWith('http')) {
    return apiBase.replace(/^http/, 'ws');
  }
  // 相对路径，使用当前 host
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}`;
})();

// 重连配置 - 指数退避策略
const RECONFIG = {
  maxAttempts: 5,           // 最大重试次数
  baseDelay: 1000,          // 基础延迟 1 秒
  maxDelay: 30000,          // 最大延迟 30 秒
  multiplier: 2,            // 指数倍数
  failedRetryDelay: 5000,   // 达到最大重试次数后的下一轮自动重试间隔
};

/** 计算指数退避延迟 */
function getBackoffDelay(attempt: number): number {
  const delay = RECONFIG.baseDelay * Math.pow(RECONFIG.multiplier, attempt - 1);
  return Math.min(delay, RECONFIG.maxDelay);
}

interface WSCallbacks {
  onMessage: (data: any) => void;                    // 收到上游消息
  onStatusChange: (status: string) => void;          // 连接状态变化
  onError: (error: Error, isFatal?: boolean) => void; // 错误处理（isFatal=true 表示达到最大重试次数）
  onClose: () => void;                                // 连接关闭
  onReconnectAttempt?: (attempt: number, maxAttempts: number) => void; // 重试回调
  onReconnectFailed?: () => void;                     // 达到最大重试次数后回调
}

type ConnectionWaiter = {
  resolve: (ok: boolean) => void;
  timeoutId: number;
};

class SessionWebSocket {
  private ws: WebSocket | null = null;
  private sessionId: string;
  private projectId: string;
  private callbacks: WSCallbacks;
  private reconnectTimer: number | null = null;
  private connectionTimeoutTimer: number | null = null;
  private intentionalClose = false;
  private reconnectAttempts = 0;           // 当前重试次数
  private maxAttemptsReached = false;    // 是否已达到最大重试次数
  private isConnecting = false;            // 是否正在连接中
  private connectionVersion = 0;           // 连接代次，避免旧连接事件污染新连接
  private waiters: ConnectionWaiter[] = []; // 等待连接成功的请求

  constructor(sessionId: string, projectId: string, callbacks: WSCallbacks) {
    this.sessionId = sessionId;
    this.projectId = projectId;
    this.callbacks = callbacks;
  }
  
  connect(): void {
    // 如果已达到最大重试次数且不是手动触发，则不再尝试
    if (this.maxAttemptsReached && this.reconnectAttempts >= RECONFIG.maxAttempts) {
      console.log(`[WebSocket] Skipping connection attempt for session ${this.sessionId}: max attempts reached`);
      return;
    }

    // 防止重复连接
    if (this.isConnecting) {
      console.log(`[WebSocket] Connection already in progress for session ${this.sessionId}`);
      return;
    }

    // 清理任何现有的超时定时器
    this.clearConnectionTimeout();

    const token = useAuthStore.getState().token;
    if (!token) {
      this.callbacks.onError(new Error('未登录'), true);
      return;
    }

    this.isConnecting = true;
    this.intentionalClose = false;

    const url = `${WS_BASE_URL}/api/ws/chat?session_id=${this.sessionId}&project_id=${this.projectId}&token=${token}`;
    console.log(`[WebSocket] Connecting to session ${this.sessionId} (attempt ${this.reconnectAttempts + 1}/${RECONFIG.maxAttempts})`);

    let socket: WebSocket;
    try {
      socket = new WebSocket(url);
    } catch (err) {
      console.error(`[WebSocket] Failed to create WebSocket for session ${this.sessionId}:`, err);
      this.isConnecting = false;
      this.handleReconnectOrFail();
      return;
    }
    this.ws = socket;
    const version = ++this.connectionVersion;

    // 设置连接超时 - 10秒内必须建立连接
    this.connectionTimeoutTimer = window.setTimeout(() => {
      if (!this.isCurrentSocket(socket, version)) {
        return;
      }
      if (socket.readyState !== WebSocket.OPEN) {
        console.warn(`[WebSocket] Connection timeout for session ${this.sessionId}`);
        this.cleanupConnection();
        this.handleReconnectOrFail();
      }
    }, 10000);

    socket.onopen = () => {
      if (!this.isCurrentSocket(socket, version)) return;
      console.log(`[WebSocket] Connected successfully to session ${this.sessionId}`);
      this.clearConnectionTimeout();
      this.isConnecting = false;
      // 重置重试计数
      this.reconnectAttempts = 0;
      this.maxAttemptsReached = false;
      this.callbacks.onStatusChange('connected');
      this.resolveWaiters(true);
    };

    socket.onmessage = (event) => {
      if (!this.isCurrentSocket(socket, version)) return;
      try {
        const data = JSON.parse(event.data);
        this.callbacks.onMessage(data);
      } catch (e) {
        // 非 JSON 消息直接忽略或转发
        this.callbacks.onMessage(event.data);
      }
    };

    socket.onerror = (event) => {
      if (!this.isCurrentSocket(socket, version)) return;
      console.error(`[WebSocket] Error for session ${this.sessionId}:`, event);
      // 错误回调 - 让外部知道有错误发生
      const isFatal = this.reconnectAttempts >= RECONFIG.maxAttempts && this.maxAttemptsReached;
      this.callbacks.onError(new Error('WebSocket 连接错误'), isFatal);
    };

    socket.onclose = (event) => {
      if (!this.isCurrentSocket(socket, version)) return;
      console.log(`[WebSocket] Closed for session ${this.sessionId}: code=${event.code}, reason=${event.reason}, wasClean=${event.wasClean}, intentionalClose=${this.intentionalClose}`);
      this.clearConnectionTimeout();
      this.isConnecting = false;
      this.callbacks.onClose();

      if (!this.intentionalClose) {
        // 非主动关闭，需要重连
        this.handleReconnectOrFail();
      } else {
        // 主动关闭才显示 disconnected
        this.callbacks.onStatusChange('disconnected');
      }
    };
  }

  private isCurrentSocket(socket: WebSocket, version: number): boolean {
    return this.ws === socket && this.connectionVersion === version;
  }

  /** 处理重连或失败 */
  private handleReconnectOrFail(): void {
    if (this.reconnectAttempts < RECONFIG.maxAttempts) {
      // 还有重试次数，继续重连
      this.scheduleReconnect();
    } else {
      // 达到最大重试次数
      console.warn(`[WebSocket] Max reconnection attempts (${RECONFIG.maxAttempts}) reached for session ${this.sessionId}`);
      this.maxAttemptsReached = true;
      this.callbacks.onStatusChange('failed');
      this.callbacks.onError(new Error(`连接失败，已尝试 ${RECONFIG.maxAttempts} 次`), true);
      this.callbacks.onReconnectFailed?.();
      this.scheduleRetryCycleAfterFailed();
    }
  }

  /** 达到最大重试后自动进入下一轮重连，避免长期卡在 failed */
  private scheduleRetryCycleAfterFailed(): void {
    if (this.reconnectTimer || this.intentionalClose) {
      return;
    }
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      if (this.intentionalClose) return;
      this.reconnectAttempts = 0;
      this.maxAttemptsReached = false;
      this.callbacks.onStatusChange('reconnecting');
      this.callbacks.onReconnectAttempt?.(0, RECONFIG.maxAttempts);
      this.connect();
    }, RECONFIG.failedRetryDelay);
  }

  private resolveWaiters(ok: boolean): void {
    if (this.waiters.length === 0) return;
    const pending = [...this.waiters];
    this.waiters = [];
    pending.forEach((w) => {
      clearTimeout(w.timeoutId);
      w.resolve(ok);
    });
  }

  /** 清理连接资源 */
  private cleanupConnection(): void {
    this.clearConnectionTimeout();
    if (this.ws) {
      this.detachSocketHandlers(this.ws);
      
      // 如果连接还没关闭，强制关闭
      if (this.ws.readyState === WebSocket.CONNECTING || this.ws.readyState === WebSocket.OPEN) {
        this.ws.close();
      }
      this.ws = null;
    }
  }

  private detachSocketHandlers(socket: WebSocket): void {
    socket.onopen = null;
    socket.onmessage = null;
    socket.onerror = null;
    socket.onclose = null;
  }

  /** 清理连接超时定时器 */
  private clearConnectionTimeout(): void {
    if (this.connectionTimeoutTimer) {
      clearTimeout(this.connectionTimeoutTimer);
      this.connectionTimeoutTimer = null;
    }
  }
  
  send(message: any): void {
    const socket = this.ws;
    const readyState = socket?.readyState;
    if (socket && readyState === WebSocket.OPEN) {
      const payload = typeof message === 'string' ? message : JSON.stringify(message);
      console.log(`[WebSocket] Sending to session ${this.sessionId}:`, payload);
      socket.send(payload);
    } else {
      console.warn(`[WebSocket] Cannot send message, readyState=${readyState} (0=CONNECTING, 1=OPEN, 2=CLOSING, 3=CLOSED)`);
    }
  }
  
  // 发送用户消息
  sendInput(content: string, attachments: string[] = []): void {
    this.send({
      type: 'input',
      id: this.sessionId,
      content,
      attachments,
    });
  }

  // 发送停止消息（上游标准格式：{ "type": "Stop" }）
  sendStop(): boolean {
    const socket = this.ws;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      console.warn(`[WebSocket] Cannot send stop, connection not open (state: ${socket?.readyState})`);
      return false;
    }
    const stopFrame = { type: 'stop' };
    console.log(`[WebSocket] Sending stop frame to session ${this.sessionId}:`, stopFrame);
    socket.send(JSON.stringify(stopFrame));
    return true;
  }
  
  close(): void {
    this.intentionalClose = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.cleanupConnection();
    this.resolveWaiters(false);
  }

  /** 完全关闭并重置所有状态（用于清理） */
  destroy(): void {
    this.intentionalClose = true;
    this.reconnectAttempts = 0;
    this.maxAttemptsReached = false;
    this.isConnecting = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.cleanupConnection();
    this.resolveWaiters(false);
  }
  
  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      console.log(`[WebSocket] Reconnect already scheduled for session ${this.sessionId}`);
      return;
    }

    // 清理现有连接（确保干净状态）
    this.cleanupConnection();

    // 增加重试计数
    this.reconnectAttempts++;

    // 计算指数退避延迟
    const delay = getBackoffDelay(this.reconnectAttempts);
    console.log(`[WebSocket] Scheduling reconnect for session ${this.sessionId}: attempt ${this.reconnectAttempts}/${RECONFIG.maxAttempts}, delay ${delay}ms`);

    // 立即通知外部正在重试（而不是等到 delay 后）
    this.callbacks.onStatusChange('reconnecting');
    this.callbacks.onReconnectAttempt?.(this.reconnectAttempts, RECONFIG.maxAttempts);

    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.isConnecting = false; // 重置连接状态
      this.connect();
    }, delay);
  }

  /** 手动触发重连 - 重置计数器并立即连接 */
  retry(): void {
    console.log(`[WebSocket] Manual retry triggered for session ${this.sessionId}`);
    this.reconnectAttempts = 0;
    this.maxAttemptsReached = false;
    this.isConnecting = false;

    // 清除任何待定的重连定时器
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    // 安全关闭当前连接（先解绑事件，避免旧连接回调污染）
    this.intentionalClose = true;
    this.cleanupConnection();
    this.intentionalClose = false;

    // 立即连接
    this.connect();
  }

  /** 确保连接已就绪：未连接时主动触发重连并等待 onopen */
  ensureConnected(timeoutMs: number = 8000): Promise<boolean> {
    if (this.ws?.readyState === WebSocket.OPEN) {
      return Promise.resolve(true);
    }

    if (this.maxAttemptsReached) {
      this.retry();
    } else if (!this.isConnecting && !this.reconnectTimer) {
      this.connect();
    } else if (!this.isConnecting && this.ws?.readyState === WebSocket.CLOSED) {
      this.connect();
    }

    return new Promise<boolean>((resolve) => {
      const timeoutId = window.setTimeout(() => {
        this.waiters = this.waiters.filter((w) => w.timeoutId !== timeoutId);
        resolve(this.ws?.readyState === WebSocket.OPEN);
      }, timeoutMs);
      this.waiters.push({ resolve, timeoutId });
    });
  }

  /** 获取当前重试次数 */
  getReconnectAttempts(): number {
    return this.reconnectAttempts;
  }

  /** 检查是否已达到最大重试次数 */
  hasReachedMaxAttempts(): boolean {
    return this.maxAttemptsReached;
  }
  
  get readyState(): number {
    return this.ws?.readyState ?? WebSocket.CLOSED;
  }
}

export { SessionWebSocket };
export type { WSCallbacks };
