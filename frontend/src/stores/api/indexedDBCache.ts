import type { Message as TMessage } from '@/types'

/** v2: 丢弃旧版可能含重复/错误 id 的缓存（syn: 与 item_id 混用等） */
const DB_NAME = 'chat_cache_v2'
const DB_VERSION = 1
const STORE_MESSAGES = 'messages'
const STORE_SESSION_META = 'session_meta'
const MAX_MESSAGES_PER_SESSION = 1000

interface SessionMeta {
  session_id: string
  last_sync_at: number
  last_message_id: string | null
  message_count: number
  updated_at: number
}

interface DBMessage extends TMessage {
  _db_session_id: string
  _db_updated_at: number
}

let dbInstance: IDBDatabase | null = null

/**
 * 获取 IndexedDB 实例（单例）
 */
async function getDB(): Promise<IDBDatabase> {
  if (dbInstance) return dbInstance
  if (typeof window === 'undefined' || !('indexedDB' in window)) {
    throw new Error('IndexedDB not supported')
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      dbInstance = request.result
      resolve(request.result)
    }

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result

      // 消息存储 - 按 message_id 为主键，session_id 为索引
      if (!db.objectStoreNames.contains(STORE_MESSAGES)) {
        const messageStore = db.createObjectStore(STORE_MESSAGES, { keyPath: 'id' })
        messageStore.createIndex('session_id', '_db_session_id', { unique: false })
        messageStore.createIndex('updated_at', '_db_updated_at', { unique: false })
      }

      // 会话元数据存储
      if (!db.objectStoreNames.contains(STORE_SESSION_META)) {
        db.createObjectStore(STORE_SESSION_META, { keyPath: 'session_id' })
      }
    }
  })
}

/**
 * 将会话消息批量写入 IndexedDB
 * 自动处理上限：保留最新的 MAX_MESSAGES_PER_SESSION 条
 */
export async function setMessages(sessionId: string, messages: TMessage[]): Promise<void> {
  if (!sessionId || !messages.length) return

  const db = await getDB()
  const transaction = db.transaction([STORE_MESSAGES, STORE_SESSION_META], 'readwrite')
  const messageStore = transaction.objectStore(STORE_MESSAGES)
  const metaStore = transaction.objectStore(STORE_SESSION_META)

  // 1. 先删除该会话的所有旧消息
  const index = messageStore.index('session_id')
  const range = IDBKeyRange.only(sessionId)
  const cursorRequest = index.openCursor(range)

  await new Promise<void>((resolve, reject) => {
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result
      if (cursor) {
        messageStore.delete(cursor.primaryKey)
        cursor.continue()
      } else {
        resolve()
      }
    }
    cursorRequest.onerror = () => reject(cursorRequest.error)
  })

  // 2. 按时间排序，只保留最新的 MAX_MESSAGES_PER_SESSION 条
  const sorted = [...messages].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  )
  const toStore = sorted.slice(-MAX_MESSAGES_PER_SESSION)

  // 3. 写入新消息
  const now = Date.now()
  for (const msg of toStore) {
    const dbMsg: DBMessage = {
      ...msg,
      session_id: sessionId, // 确保 session_id 正确
      _db_session_id: sessionId,
      _db_updated_at: now,
    }
    messageStore.put(dbMsg)
  }

  // 4. 更新会话元数据
  const lastMsg = toStore[toStore.length - 1]
  const meta: SessionMeta = {
    session_id: sessionId,
    last_sync_at: now,
    last_message_id: lastMsg?.id || null,
    message_count: toStore.length,
    updated_at: now,
  }
  metaStore.put(meta)

  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
  })
}

/**
 * 获取会话的所有消息（按时间排序）
 */
export async function getMessagesBySession(sessionId: string): Promise<TMessage[]> {
  if (!sessionId) return []

  try {
    const db = await getDB()
    const transaction = db.transaction(STORE_MESSAGES, 'readonly')
    const store = transaction.objectStore(STORE_MESSAGES)
    const index = store.index('session_id')

    const request = index.getAll(IDBKeyRange.only(sessionId))

    const dbMessages = await new Promise<DBMessage[]>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result || [])
      request.onerror = () => reject(request.error)
    })

    // 转换为前端消息格式，移除内部字段
    return dbMessages
      .map((dbMsg) => {
        const { _db_session_id, _db_updated_at, ...msg } = dbMsg as any
        return msg as TMessage
      })
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
  } catch (err) {
    console.error('[indexedDBCache] getMessagesBySession failed:', err)
    return []
  }
}

/**
 * 获取指定 ID 的单条消息
 */
export async function getMessageById(messageId: string): Promise<TMessage | null> {
  if (!messageId) return null

  try {
    const db = await getDB()
    const transaction = db.transaction(STORE_MESSAGES, 'readonly')
    const store = transaction.objectStore(STORE_MESSAGES)

    const request = store.get(messageId)

    const dbMsg = await new Promise<DBMessage | undefined>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })

    if (!dbMsg) return null

    const { _db_session_id, _db_updated_at, ...msg } = dbMsg as any
    return msg as TMessage
  } catch (err) {
    console.error('[indexedDBCache] getMessageById failed:', err)
    return null
  }
}

/**
 * 追加单条消息到缓存
 */
export async function appendMessage(sessionId: string, message: TMessage): Promise<void> {
  if (!sessionId || !message) return

  const db = await getDB()
  const transaction = db.transaction([STORE_MESSAGES, STORE_SESSION_META], 'readwrite')
  const messageStore = transaction.objectStore(STORE_MESSAGES)
  const metaStore = transaction.objectStore(STORE_SESSION_META)

  const now = Date.now()
  const dbMsg: DBMessage = {
    ...message,
    session_id: sessionId,
    _db_session_id: sessionId,
    _db_updated_at: now,
  }

  messageStore.put(dbMsg)

  // 检查并裁剪超出上限的消息
  const index = messageStore.index('session_id')
  const countRequest = index.count(IDBKeyRange.only(sessionId))

  const count = await new Promise<number>((resolve, reject) => {
    countRequest.onsuccess = () => resolve(countRequest.result)
    countRequest.onerror = () => reject(countRequest.error)
  })

  if (count > MAX_MESSAGES_PER_SESSION) {
    // 删除最旧的消息
    const keyRange = IDBKeyRange.only(sessionId)
    const cursorRequest = index.openCursor(keyRange, 'next')
    let deleted = 0
    const toDelete = count - MAX_MESSAGES_PER_SESSION

    await new Promise<void>((resolve, reject) => {
      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result
        if (cursor && deleted < toDelete) {
          messageStore.delete(cursor.primaryKey)
          deleted++
          cursor.continue()
        } else {
          resolve()
        }
      }
      cursorRequest.onerror = () => reject(cursorRequest.error)
    })
  }

  // 更新元数据
  const meta = await new Promise<SessionMeta | undefined>((resolve) => {
    const req = metaStore.get(sessionId)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => resolve(undefined)
  })

  const newMeta: SessionMeta = {
    session_id: sessionId,
    last_sync_at: now,
    last_message_id: message.id,
    message_count: Math.min(count + 1, MAX_MESSAGES_PER_SESSION),
    updated_at: now,
  }
  metaStore.put(newMeta)

  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
  })
}

/**
 * 获取会话元数据
 */
export async function getSessionMeta(sessionId: string): Promise<SessionMeta | null> {
  if (!sessionId) return null

  try {
    const db = await getDB()
    const transaction = db.transaction(STORE_SESSION_META, 'readonly')
    const store = transaction.objectStore(STORE_SESSION_META)

    const request = store.get(sessionId)

    const result = await new Promise<SessionMeta | undefined>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })

    return result || null
  } catch (err) {
    console.error('[indexedDBCache] getSessionMeta failed:', err)
    return null
  }
}

/**
 * 清除指定会话的缓存
 */
export async function clearSessionCache(sessionId: string): Promise<void> {
  if (!sessionId) return

  try {
    const db = await getDB()
    const transaction = db.transaction([STORE_MESSAGES, STORE_SESSION_META], 'readwrite')
    const messageStore = transaction.objectStore(STORE_MESSAGES)
    const metaStore = transaction.objectStore(STORE_SESSION_META)

    // 删除所有该会话的消息
    const index = messageStore.index('session_id')
    const range = IDBKeyRange.only(sessionId)
    const cursorRequest = index.openCursor(range)

    await new Promise<void>((resolve, reject) => {
      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result
        if (cursor) {
          messageStore.delete(cursor.primaryKey)
          cursor.continue()
        } else {
          resolve()
        }
      }
      cursorRequest.onerror = () => reject(cursorRequest.error)
    })

    // 删除元数据
    metaStore.delete(sessionId)

    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
    })
  } catch (err) {
    console.error('[indexedDBCache] clearSessionCache failed:', err)
  }
}

/**
 * 获取所有缓存的会话 ID 列表
 */
export async function getAllCachedSessionIds(): Promise<string[]> {
  try {
    const db = await getDB()
    const transaction = db.transaction(STORE_SESSION_META, 'readonly')
    const store = transaction.objectStore(STORE_SESSION_META)

    const request = store.getAllKeys()

    return await new Promise<string[]>((resolve, reject) => {
      request.onsuccess = () => resolve((request.result as string[]) || [])
      request.onerror = () => reject(request.error)
    })
  } catch (err) {
    console.error('[indexedDBCache] getAllCachedSessionIds failed:', err)
    return []
  }
}

/**
 * 关闭数据库连接（用于测试或清理）
 */
export function closeDB(): void {
  if (dbInstance) {
    dbInstance.close()
    dbInstance = null
  }
}

// 导出类型
export type { SessionMeta }
