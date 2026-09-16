// @ts-check
/**
 * 聊天附件 Blob 仓库：大图不进 base64 / localStorage。
 *
 * - 写入：File/Blob → IndexedDB，返回短引用 `chat-att://<id>`
 * - 预览：短引用 → object URL（内存缓存，带 TTL）
 * - 视觉分析：短引用 → data URL（仅调用时物化，用完即弃）
 *
 * 原生端相册路径仍走 Filesystem + localPath；本仓库主要覆盖 Web 端
 * 以及任何落到 `chat-att://` 的附件。
 */

const DB_NAME = 'goods_chat_attachments'
const DB_VERSION = 1
const STORE_NAME = 'blobs'
const URI_PREFIX = 'chat-att://'
const OBJECT_URL_TTL_MS = 10 * 60 * 1000

/** @type {IDBDatabase | null} */
let dbPromiseCache = null

/**
 * @param {string} id
 */
export function chatAttachmentUri(id) {
  return `${URI_PREFIX}${String(id || '').trim()}`
}

/**
 * @param {string} uri
 * @returns {string} 合法时返回 id，否则 ''
 */
export function parseChatAttachmentUri(uri) {
  const value = String(uri || '').trim()
  if (!value.startsWith(URI_PREFIX)) return ''
  return value.slice(URI_PREFIX.length).trim()
}

/**
 * @param {string} uri
 */
export function isChatAttachmentUri(uri) {
  return !!parseChatAttachmentUri(uri)
}

function openDb() {
  if (dbPromiseCache) return dbPromiseCache
  dbPromiseCache = new Promise((resolve, reject) => {
    const idb = globalThis.indexedDB
    if (!idb) {
      reject(new Error('IndexedDB 不可用'))
      return
    }
    const request = idb.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => {
      dbPromiseCache = null
      reject(request.error || new Error('打开附件库失败'))
    }
  })
  return dbPromiseCache
}

/**
 * @template T
 * @param {IDBTransactionMode} mode
 * @param {(store: IDBObjectStore) => IDBRequest<T>} run
 * @returns {Promise<T>}
 */
async function withStore(mode, run) {
  const db = await openDb()
  return await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode)
    const request = run(tx.objectStore(STORE_NAME))
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('附件库读写失败'))
  })
}

/**
 * 存入 Blob，返回短引用 URI。
 * @param {Blob} blob
 * @param {string} [id] 可选自定义 id（与附件 att.id 对齐，便于删除/孤儿回收）
 * @returns {Promise<string>} chat-att://<id>
 */
export async function putChatAttachmentBlob(blob, id) {
  if (!(blob instanceof Blob)) throw new Error('缺少图片二进制数据')
  const key = String(id || `cab-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`).trim()
  if (!key) throw new Error('附件 id 无效')
  await withStore('readwrite', (store) => store.put(blob, key))
  return chatAttachmentUri(key)
}

/**
 * @param {string} id
 * @returns {Promise<Blob | null>}
 */
export async function getChatAttachmentBlob(id) {
  const key = String(id || '').trim()
  if (!key) return null
  try {
    const value = await withStore('readonly', (store) => store.get(key))
    return value instanceof Blob ? value : null
  } catch {
    return null
  }
}

/**
 * @param {string} id
 */
export async function deleteChatAttachmentBlob(id) {
  const key = String(id || '').trim()
  if (!key) return
  try {
    await withStore('readwrite', (store) => store.delete(key))
  } catch {
    // 清理失败不阻断业务
  }
}

/**
 * 枚举当前库内全部 key（孤儿回收用）。
 * @returns {Promise<string[]>}
 */
export async function listChatAttachmentIds() {
  try {
    const keys = await withStore('readonly', (store) => store.getAllKeys())
    return (Array.isArray(keys) ? keys : []).map((k) => String(k))
  } catch {
    return []
  }
}

/** @type {Map<string, { url: string, timer: ReturnType<typeof setTimeout> }>} */
const objectUrlCache = new Map()

/**
 * 预览用：短引用 → object URL；非 chat-att 原样返回。
 * @param {string} uri
 * @returns {Promise<string>}
 */
export async function resolveChatAttachmentDisplayUri(uri) {
  const id = parseChatAttachmentUri(uri)
  if (!id) return String(uri || '')
  const cached = objectUrlCache.get(id)
  if (cached) {
    clearTimeout(cached.timer)
    cached.timer = setTimeout(() => {
      URL.revokeObjectURL(cached.url)
      objectUrlCache.delete(id)
    }, OBJECT_URL_TTL_MS)
    return cached.url
  }
  const blob = await getChatAttachmentBlob(id)
  if (!blob) return ''
  const url = URL.createObjectURL(blob)
  const timer = setTimeout(() => {
    URL.revokeObjectURL(url)
    objectUrlCache.delete(id)
  }, OBJECT_URL_TTL_MS)
  objectUrlCache.set(id, { url, timer })
  return url
}

/**
 * 视觉分析 / 写入收藏用：短引用 → data URL；非 chat-att 返回 null。
 * @param {string} uri
 * @returns {Promise<string | null>}
 */
export async function resolveChatAttachmentDataUrl(uri) {
  const id = parseChatAttachmentUri(uri)
  if (!id) return null
  const blob = await getChatAttachmentBlob(id)
  if (!blob) return null
  return await blobToDataUrl(blob)
}

/** @param {Blob} blob */
function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(/** @type {string} */ (reader.result))
    reader.onerror = () => reject(new Error('图片读取失败'))
    reader.readAsDataURL(blob)
  })
}

/** @param {string} dataUrl */
function dataUrlToBlob(dataUrl) {
  const match = String(dataUrl || '').match(/^data:([^;,]+)(;base64)?,(.*)$/s)
  if (!match) return null
  const mime = match[1] || 'image/jpeg'
  const isBase64 = !!match[2]
  const payload = match[3] || ''
  if (isBase64) {
    const binary = atob(payload)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
    return new Blob([bytes], { type: mime })
  }
  return new Blob([decodeURIComponent(payload)], { type: mime })
}

/**
 * 把 File/Blob 转为 chat-att 短引用（Web 选图主路径）。
 * @param {Blob | File} blob
 * @param {string} [id]
 * @returns {Promise<string>}
 */
export async function putChatAttachmentFromFile(blob, id) {
  if (!blob) throw new Error('缺少图片文件')
  return await putChatAttachmentBlob(blob, id)
}

/**
 * data: URL → chat-att（兼容旧附件 / 无 File 的回退路径）。
 * @param {string} dataUrl
 * @param {string} [id]
 * @returns {Promise<string>}
 */
export async function putChatAttachmentFromDataUrl(dataUrl, id) {
  const blob = dataUrlToBlob(String(dataUrl || ''))
  if (!blob) throw new Error('无法解析图片数据')
  return await putChatAttachmentBlob(blob, id)
}

/**
 * 孤儿回收：删除 referencedIds 之外的全部 blob。
 * @param {Iterable<string>} referencedIds
 * @returns {Promise<number>} 删除数量
 */
export async function pruneOrphanChatAttachments(referencedIds) {
  const keep = new Set(Array.from(referencedIds || []).map((id) => String(id || '').trim()).filter(Boolean))
  const all = await listChatAttachmentIds()
  let removed = 0
  for (const id of all) {
    if (keep.has(id)) continue
    await deleteChatAttachmentBlob(id)
    removed += 1
  }
  return removed
}
