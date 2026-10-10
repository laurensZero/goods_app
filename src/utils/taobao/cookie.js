/**
 * 淘宝登录 Cookie 存取
 *
 * 淘宝详情/接口必须带登录态（匿名直接落到登录页），Cookie 含 HttpOnly 字段，
 * 只能由用户从浏览器请求头/cookies.txt 导出后粘贴，与米游铺同一体验。
 * 存储复用 platform/storage 的 secret 通道（原生端加密）。
 */
import { readSecret, writeSecret, removeSecret } from '@/utils/platform/storage'

const STORAGE_KEY = 'taobao_cookie_state'

let memoryCache = null

/**
 * 归一化用户粘贴的 Cookie：
 * - 去掉 `Cookie:` 前缀
 * - 支持 Netscape cookies.txt（制表符分隔，`#HttpOnly_` 行前缀）
 * - 支持每行一个 `name=value` 的纯文本导出
 * - 支持单行 `a=1; b=2` 直接粘贴
 * @param {unknown} raw
 * @returns {string}
 */
export function normalizeTaobaoCookie(raw) {
  const text = String(raw || '').trim()
  if (!text) return ''

  const withoutPrefix = text.replace(/^\s*cookie\s*:\s*/i, '')

  if (withoutPrefix.includes('\t')) {
    const pairs = []
    for (const originalLine of withoutPrefix.split(/\r?\n/)) {
      let line = originalLine.trim()
      if (!line) continue
      if (line.startsWith('#HttpOnly_')) line = line.slice('#HttpOnly_'.length)
      else if (line.startsWith('#')) continue
      const columns = line.split('\t')
      if (columns.length >= 7 && columns[5] && columns[6] !== undefined) {
        pairs.push(`${columns[5]}=${columns[6]}`)
      }
    }
    if (pairs.length > 0) return pairs.join('; ')
  }

  const lines = withoutPrefix.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  if (lines.length > 1 && !withoutPrefix.includes(';')) {
    return lines.join('; ')
  }

  return lines.join('; ').replace(/\s*;\s*/g, '; ').replace(/;\s*$/, '').trim()
}

/**
 * 判断 Cookie 是否像一份可用的淘宝登录态
 * @param {unknown} cookie
 * @returns {boolean}
 */
export function isTaobaoCookieReady(cookie) {
  const value = String(cookie || '').trim()
  if (value.length < 40) return false
  // _m_h5_tk 是 mtop 签名令牌；cookie2/unb 是登录态，缺一会被风控拦
  return /(?:^|;\s*)_m_h5_tk=/.test(value)
}

/**
 * 读取已保存的 Cookie（带内存缓存，同步可用）
 * @returns {Promise<string>}
 */
export async function getTaobaoCookie() {
  if (memoryCache !== null) return memoryCache
  try {
    const value = await readSecret(STORAGE_KEY, '')
    memoryCache = normalizeTaobaoCookie(value)
  } catch {
    memoryCache = ''
  }
  return memoryCache
}

/**
 * 同步读取（仅内存缓存，未加载时返回 ''）
 * @returns {string}
 */
export function getTaobaoCookieSync() {
  return memoryCache || ''
}

/**
 * @param {unknown} raw
 * @returns {Promise<string>} 归一化后的 Cookie
 */
export async function setTaobaoCookie(raw) {
  const value = normalizeTaobaoCookie(raw)
  if (!value) {
    await removeSecret(STORAGE_KEY)
    memoryCache = ''
    return ''
  }
  await writeSecret(STORAGE_KEY, value)
  memoryCache = value
  return value
}

export async function clearTaobaoCookie() {
  await removeSecret(STORAGE_KEY)
  memoryCache = ''
}

/** 测试用：清空内存缓存 */
export function __resetTaobaoCookieCache() {
  memoryCache = null
}
