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

interface WSCallbacks {
  onMessage: (data: any) => void;     // 收到上游消息
  onStatusChange: (status: string) => void; // 连接状态变化
  onError: (error: Error) => void;     // 错误处理
  onClose: () => void;                 // 连接关闭
}

class SessionWebSocket {
  private ws: WebSocket | null = null;
  private sessionId: string;
  private projectId: string;
  private callbacks: WSCallbacks;
  private reconnectTimer: number | null = null;
  private intentionalClose = false;
  
  constructor(sessionId: string, projectId: string, callbacks: WSCallbacks) {
    this.sessionId = sessionId;
    this.projectId = projectId;
    this.callbacks = callbacks;
  }
  
  connect(): void {
    const token = useAuthStore.getState().token;
    if (!token) {
      this.callbacks.onError(new Error('未登录'));
      return;
    }
    
    const url = `${WS_BASE_URL}/api/ws/chat?session_id=${this.sessionId}&project_id=${this.projectId}&token=${token}`;
    this.ws = new WebSocket(url);
    
    this.ws.onopen = () => {
      this.callbacks.onStatusChange('connected');
    };
    
    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.callbacks.onMessage(data);
      } catch (e) {
        // 非 JSON 消息直接忽略或转发
        this.callbacks.onMessage(event.data);
      }
    };
    
    this.ws.onerror = (event) => {
      this.callbacks.onError(new Error('WebSocket 连接错误'));
    };
    
    this.ws.onclose = () => {
      this.callbacks.onStatusChange('disconnected');
      this.callbacks.onClose();
      if (!this.intentionalClose) {
        this.scheduleReconnect();
      }
    };
  }
  
  send(message: any): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(typeof message === 'string' ? message : JSON.stringify(message));
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

  // 发送停止消息
  sendStop(): void {
    this.send({ type: 'Stop' });
  }
  
  close(): void {
    this.intentionalClose = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    this.ws?.close();
    this.ws = null;
  }
  
  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.callbacks.onStatusChange('reconnecting');
      this.connect();
    }, 3000); // 3 秒后重连
  }
  
  get readyState(): number {
    return this.ws?.readyState ?? WebSocket.CLOSED;
  }
}

export { SessionWebSocket };
export type { WSCallbacks };
