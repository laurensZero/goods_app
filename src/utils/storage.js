/**
 * utils/storage.js
 * 对 localStorage 做轻量封装。
 * - 自动处理 JSON 序列化 / 反序列化
 * - 统一异常捕获，避免隐式报错
 */

const ITEMS_KEY = 'goods_list'

// ============================================================
// 语义化 API：针对 goods 列表的直接操作
// ============================================================

/**
 * 从 localStorage 读取全部物品
 * @returns {Array}
 */
export function getItems() {
  return getStorage(ITEMS_KEY, [])
}

/**
 * 添加单个物品（如果 id 已存在则覆盖）
 * @param {{ id:string, name:string, category:string, price:string, acquiredAt:string, image:string, note:string }} item
 */
export function addItem(item) {
  const list = getItems()
  const idx = list.findIndex((i) => i.id === item.id)
  if (idx !== -1) {
    list[idx] = item
  } else {
    list.push(item)
  }
  saveItems(list)
}

/**
 * 直接将整个列表写入 localStorage
 * @param {Array} items
 */
export function saveItems(items) {
  setStorage(ITEMS_KEY, items)
}

// ============================================================
// 通用 localStorage 封装
// ============================================================

/**
 * 读取数据
 * @param {string} key
 * @param {*} defaultValue 读取失败时的默认返回值
 */
export function getStorage(key, defaultValue = null) {
  try {
    const raw = localStorage.getItem(key)
    return raw !== null ? JSON.parse(raw) : defaultValue
  } catch {
    return defaultValue
  }
}

/**
 * 写入数据
 * @param {string} key
 * @param {*} value
 */
export function setStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch (e) {
    console.warn('[storage] 写入失败:', e)
  }
}

/**
 * 删除指定键
 * @param {string} key
 */
export function removeStorage(key) {
  localStorage.removeItem(key)
}

/**
 * 清空所有本地数据
 */
export function clearStorage() {
  localStorage.clear()
}
