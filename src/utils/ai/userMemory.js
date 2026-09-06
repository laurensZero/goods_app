// @ts-check
/**
 * AI 聊天的用户长期记忆（用户特定偏好/习惯），localStorage 持久化。
 *
 * 只做受控的存取：条数上限（满了淘汰最旧）、单条长度上限、完全重复去重。
 * 「该不该记」的判断由系统提示词规则 + memory_save 工具约束，这里不掺 judgment。
 */

const MEMORY_STORAGE_KEY = 'goods_ai_chat_memory_v1'
/** 记忆条数上限，超出按 updatedAt 淘汰最旧的 */
export const MEMORY_MAX_ENTRIES = 50
/** 单条记忆长度上限（字符） */
export const MEMORY_MAX_LENGTH = 120

/** @typedef {{ id: string, text: string, createdAt: number, updatedAt: number }} UserMemoryEntry */

/**
 * @param {unknown} text
 * @returns {string}
 */
export function normalizeMemoryText(text) {
  return String(text ?? '').trim().slice(0, MEMORY_MAX_LENGTH)
}

/** @returns {UserMemoryEntry[]} */
export function loadUserMemories() {
  try {
    const parsed = JSON.parse(localStorage.getItem(MEMORY_STORAGE_KEY) || '[]')
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((entry) => entry && typeof entry.text === 'string' && entry.text.trim() && typeof entry.updatedAt === 'number')
      .slice(0, MEMORY_MAX_ENTRIES)
  } catch {
    return []
  }
}

function persist(list) {
  try {
    localStorage.setItem(MEMORY_STORAGE_KEY, JSON.stringify(list))
  } catch {
    // 存储异常不阻断对话
  }
}

/**
 * 新增一条记忆；完全相同的文本视为重复，只刷新 updatedAt。
 * @param {string} text
 * @returns {{ entry: UserMemoryEntry, total: number, deduped: boolean }}
 */
export function addUserMemory(text) {
  const clean = normalizeMemoryText(text)
  if (!clean) throw new Error('记忆内容不能为空')
  const list = loadUserMemories()
  const now = Date.now()
  const existing = list.find((entry) => entry.text === clean)
  if (existing) {
    existing.updatedAt = now
    persist(list)
    return { entry: existing, total: list.length, deduped: true }
  }
  /** @type {UserMemoryEntry} */
  const entry = { id: `mem-${now}-${Math.random().toString(36).slice(2, 6)}`, text: clean, createdAt: now, updatedAt: now }
  list.push(entry)
  // 超上限时淘汰最旧的（updatedAt 最小）
  while (list.length > MEMORY_MAX_ENTRIES) {
    let oldestIndex = 0
    for (let i = 1; i < list.length; i += 1) {
      if (list[i].updatedAt < list[oldestIndex].updatedAt) oldestIndex = i
    }
    list.splice(oldestIndex, 1)
  }
  persist(list)
  return { entry, total: list.length, deduped: false }
}

/**
 * 按文本精确删除一条记忆。
 * @param {string} text
 * @returns {boolean} 是否删除成功
 */
export function removeUserMemory(text) {
  const clean = normalizeMemoryText(text)
  if (!clean) return false
  const list = loadUserMemories()
  const next = list.filter((entry) => entry.text !== clean)
  if (next.length === list.length) return false
  persist(next)
  return true
}
