/**
 * 淘宝登录 Cookie 存取（多账号）
 *
 * 淘宝详情/接口必须带登录态（匿名直接落到登录页），Cookie 含 HttpOnly 字段，
 * 可由扫码登录（qrLogin.js）或用户从浏览器粘贴导入。
 * 存储复用 platform/storage 的 secret 通道（原生端加密）。
 *
 * 多账号模型与米游铺 cookie.js 同构：
 *   - `taobao_accounts`：账号列表（id / accountId / label / avatarUrl / cookie / invalid*）
 *   - `taobao_active_account_id`：当前激活账号 id
 *   - `taobao_cookie_state`：激活账号 Cookie 的镜像（getTaobaoCookie 兼容层）
 * 旧版单账号数据在首次读取时迁移到列表。
 */
import { readSecret, writeSecret, removeSecret } from '@/utils/platform/storage'

const STORAGE_KEY = 'taobao_cookie_state'
const ACCOUNTS_KEY = 'taobao_accounts'
const ACTIVE_ID_KEY = 'taobao_active_account_id'

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

/** 本地解析 Cookie 对 */
function parseCookiePairs(cookieStr) {
  const result = {}
  String(cookieStr || '').split(';').forEach((part) => {
    const idx = part.indexOf('=')
    if (idx === -1) return
    const key = part.slice(0, idx).trim()
    const value = part.slice(idx + 1).trim()
    if (key) result[key] = value
  })
  return result
}

/** 从 Cookie 解析淘宝账号标识（unb 优先，其次 cookie17 / tracknick） */
export function parseTaobaoAccountId(cookie) {
  const parsed = parseCookiePairs(cookie)
  return String(
    parsed.unb
    || parsed.userNumId
    || parsed.cookie17
    || parsed.tracknick
    || parsed.dnk
    || '',
  ).trim()
}

/** 展示用标签：昵称或「账号 xxx」 */
export function formatTaobaoAccountLabel(accountId, fallback = '') {
  const id = String(accountId || '').trim()
  if (!id) return String(fallback || '').trim()
  if (id.length <= 8) return `账号 ${id}`
  return `账号 ${id.slice(0, 4)}…${id.slice(-4)}`
}

function hashCookie(cookie) {
  let h = 0
  const text = String(cookie || '')
  for (let i = 0; i < text.length; i += 1) {
    h = ((h << 5) - h + text.charCodeAt(i)) | 0
  }
  return Math.abs(h).toString(36)
}

function normalizeAccount(raw) {
  if (!raw || typeof raw !== 'object') return null
  const cookie = String(raw.cookie || '').trim()
  if (!cookie) return null
  const accountId = String(raw.accountId || parseTaobaoAccountId(cookie) || '').trim()
  const id = String(raw.id || accountId || '').trim()
  if (!id) return null
  return {
    id,
    accountId,
    label: String(raw.label || '').trim() || formatTaobaoAccountLabel(accountId, id),
    avatarUrl: String(raw.avatarUrl || '').trim(),
    cookie,
    updatedAt: String(raw.updatedAt || '').trim(),
    invalidAt: String(raw.invalidAt || '').trim(),
    invalidReason: String(raw.invalidReason || '').trim(),
  }
}

async function readAccounts() {
  const value = await readSecret(ACCOUNTS_KEY)
  if (!value) return []
  try {
    const list = JSON.parse(value)
    if (!Array.isArray(list)) return []
    return list.map(normalizeAccount).filter(Boolean)
  } catch {
    return []
  }
}

async function writeAccounts(accounts) {
  const list = (accounts || []).map(normalizeAccount).filter(Boolean)
  if (list.length === 0) {
    await removeSecret(ACCOUNTS_KEY)
  } else {
    await writeSecret(ACCOUNTS_KEY, JSON.stringify(list))
  }
  return list
}

async function readActiveAccountId() {
  return String((await readSecret(ACTIVE_ID_KEY)) || '').trim()
}

async function writeActiveAccountId(id) {
  const value = String(id || '').trim()
  if (!value) await removeSecret(ACTIVE_ID_KEY)
  else await writeSecret(ACTIVE_ID_KEY, value)
}

async function readLegacyCookie() {
  try {
    return normalizeTaobaoCookie(await readSecret(STORAGE_KEY, ''))
  } catch {
    return ''
  }
}

/** 旧版单账号状态 → 多账号列表（首次迁移） */
async function migrateLegacyStateIfNeeded(accounts) {
  if (accounts.length > 0) return accounts
  const cookie = await readLegacyCookie()
  if (!cookie) return []
  const accountId = parseTaobaoAccountId(cookie)
  const id = accountId || `legacy_${hashCookie(cookie)}`
  const account = normalizeAccount({
    id,
    accountId,
    label: formatTaobaoAccountLabel(accountId, id),
    cookie,
    updatedAt: new Date().toISOString(),
  })
  if (!account) return []
  const next = [account]
  await writeAccounts(next)
  await writeActiveAccountId(account.id)
  return next
}

async function writeActiveCookieState(cookie) {
  const value = String(cookie || '').trim()
  if (!value) {
    await removeSecret(STORAGE_KEY)
    memoryCache = ''
  } else {
    await writeSecret(STORAGE_KEY, value)
    memoryCache = value
  }
  return value
}

/**
 * 读取当前激活账号的 Cookie（带内存缓存，同步可用）
 * @returns {Promise<string>}
 */
export async function getTaobaoCookie() {
  if (memoryCache !== null) return memoryCache
  try {
    const accounts = await migrateLegacyStateIfNeeded(await readAccounts())
    const activeId = await readActiveAccountId()
    const active = accounts.find((item) => item.id === activeId)
    memoryCache = normalizeTaobaoCookie(active?.cookie || '')
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
 * 保存 Cookie 并写入账号列表（按 accountId 去重 upsert），同时设为当前账号。
 * @param {unknown} raw
 * @param {{label?: string, avatarUrl?: string}} [options]
 * @returns {Promise<string>} 归一化后的 Cookie
 */
export async function setTaobaoCookie(raw, options = {}) {
  const value = normalizeTaobaoCookie(raw)
  if (!value) {
    await clearTaobaoCookie()
    return ''
  }

  const accountId = parseTaobaoAccountId(value)
  const id = accountId || `ck_${hashCookie(value)}`
  const accounts = await migrateLegacyStateIfNeeded(await readAccounts())
  const now = new Date().toISOString()
  const existing = accounts.find((item) => item.id === id)
  const incomingLabel = String(options.label || '').trim()
  const label = incomingLabel
    || (existing && !isAutoTaobaoAccountLabel(existing.label, accountId) ? existing.label : '')
    || formatTaobaoAccountLabel(accountId, id)
  const avatarUrl = String(options.avatarUrl || existing?.avatarUrl || '').trim()

  const nextAccount = normalizeAccount({
    id,
    accountId,
    label,
    avatarUrl,
    cookie: value,
    updatedAt: now,
    invalidAt: '',
    invalidReason: '',
  })

  const nextAccounts = existing
    ? accounts.map((item) => (item.id === id ? nextAccount : item))
    : [...accounts, nextAccount]

  await writeAccounts(nextAccounts)
  await writeActiveAccountId(id)
  await writeActiveCookieState(value)
  return value
}

/** 账号备注是否仍是自动标签（便于有昵称时覆盖） */
export function isAutoTaobaoAccountLabel(label, accountId) {
  const text = String(label || '').trim()
  if (!text) return true
  return text === formatTaobaoAccountLabel(accountId, accountId)
}

/** 列出已保存的淘宝账号（保持保存顺序） */
export async function listTaobaoAccounts() {
  return migrateLegacyStateIfNeeded(await readAccounts())
}

/** 当前激活账号；无激活则 null */
export async function getActiveTaobaoAccount() {
  const accounts = await migrateLegacyStateIfNeeded(await readAccounts())
  const activeId = await readActiveAccountId()
  return accounts.find((item) => item.id === activeId) || null
}

/** 切换当前账号：把目标 Cookie 写入激活状态 */
export async function switchTaobaoAccount(accountId) {
  const id = String(accountId || '').trim()
  if (!id) return null
  const accounts = await migrateLegacyStateIfNeeded(await readAccounts())
  const target = accounts.find((item) => item.id === id)
  if (!target?.cookie) return null

  await writeActiveAccountId(target.id)
  await writeActiveCookieState(target.cookie)
  return {
    ...target,
    accountLabel: target.label,
    accountId: target.accountId,
  }
}

/** 重命名账号 */
export async function renameTaobaoAccount(accountId, label) {
  const id = String(accountId || '').trim()
  const nextLabel = String(label || '').trim()
  if (!id || !nextLabel) return null
  const accounts = await readAccounts()
  let updated = null
  const next = accounts.map((item) => {
    if (item.id !== id) return item
    updated = { ...item, label: nextLabel }
    return updated
  })
  if (!updated) return null
  await writeAccounts(next)
  return updated
}

/**
 * 用 getUserSimple 资料刷新账号昵称/头像。
 * 仅当备注仍是自动标签（或头像为空）时覆盖，避免冲掉用户手改备注。
 */
export async function upsertTaobaoAccountProfile(accountId, { label = '', avatarUrl = '' } = {}) {
  const id = String(accountId || '').trim()
  if (!id) return null
  const accounts = await readAccounts()
  let updated = null
  const next = accounts.map((item) => {
    if (item.id !== id) return item
    const incomingLabel = String(label || '').trim()
    const incomingAvatar = String(avatarUrl || '').trim()
    const canOverwriteLabel = incomingLabel && (
      !item.label
      || isAutoTaobaoAccountLabel(item.label, item.accountId || item.id)
      || item.label === formatTaobaoAccountLabel(item.accountId || item.id, item.id)
    )
    const nextLabel = canOverwriteLabel ? incomingLabel : item.label
    const nextAvatar = incomingAvatar || item.avatarUrl || ''
    if (nextLabel === item.label && nextAvatar === (item.avatarUrl || '')) return item
    updated = { ...item, label: nextLabel, avatarUrl: nextAvatar }
    return updated
  })
  if (!updated) return null
  await writeAccounts(next)
  return updated
}

/** 删除某个账号；若删的是当前账号则清空激活状态 */
export async function removeTaobaoAccount(accountId) {
  const id = String(accountId || '').trim()
  if (!id) return false
  const accounts = await readAccounts()
  const next = accounts.filter((item) => item.id !== id)
  await writeAccounts(next)
  const activeId = await readActiveAccountId()
  if (activeId === id) {
    await writeActiveAccountId('')
    await writeActiveCookieState('')
  }
  return next.length !== accounts.length
}

/** 标记 Cookie 失效（保留账号条目，便于列表引导重登） */
export async function markTaobaoCookieInvalid(cookie, reason = '') {
  const value = normalizeTaobaoCookie(cookie)
  if (!value) {
    await clearTaobaoCookie()
    return null
  }
  const accountId = parseTaobaoAccountId(value)
  const id = accountId || `ck_${hashCookie(value)}`
  const accounts = await migrateLegacyStateIfNeeded(await readAccounts())
  const existing = accounts.find((item) => item.id === id)
  const now = new Date().toISOString()
  const nextAccount = normalizeAccount({
    id,
    accountId,
    label: existing?.label,
    avatarUrl: existing?.avatarUrl,
    cookie: value,
    updatedAt: existing?.updatedAt || now,
    invalidAt: now,
    invalidReason: String(reason || '').trim(),
  })
  const nextAccounts = existing
    ? accounts.map((item) => (item.id === id ? nextAccount : item))
    : [...accounts, nextAccount]
  await writeAccounts(nextAccounts)
  if (!existing || existing.id === (await readActiveAccountId())) {
    await writeActiveAccountId(id)
    await writeActiveCookieState(value)
  }
  return nextAccount
}

/**
 * 清除当前会话。
 * keepAccounts=true（默认）：保留账号列表，便于快速切换；
 * keepAccounts=false：连账号列表一起清空。
 */
export async function clearTaobaoCookie(options = {}) {
  const keepAccounts = options.keepAccounts !== false
  await removeSecret(STORAGE_KEY)
  await writeActiveAccountId('')
  memoryCache = ''
  if (!keepAccounts) {
    await removeSecret(ACCOUNTS_KEY)
  }
}

/** 测试用：清空内存缓存 */
export function __resetTaobaoCookieCache() {
  memoryCache = null
}
