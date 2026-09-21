import { readSecret, writeSecret, removeSecret } from '@/utils/platform/storage'
import { Capacitor } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'

const STORAGE_KEY = 'mihoyo_cookie_state'
const ACCOUNTS_KEY = 'mihoyo_accounts'
const ACTIVE_ID_KEY = 'mihoyo_active_account_id'
const NATIVE_STORAGE_KEY = 'mihoyo_native_session'

/** 本地解析 Cookie，避免与 mihoyo/index 循环依赖 */
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

function getDefaultState() {
  return {
    cookie: '',
    updatedAt: '',
    invalidAt: '',
    invalidReason: ''
  }
}

function normalizeState(raw) {
  if (!raw || typeof raw !== 'object') return getDefaultState()

  return {
    cookie: String(raw.cookie || '').trim(),
    updatedAt: String(raw.updatedAt || '').trim(),
    invalidAt: String(raw.invalidAt || '').trim(),
    invalidReason: String(raw.invalidReason || '').trim()
  }
}

/** 从 Cookie 解析米游社账号标识（ltuid / account_id 等） */
export function parseMihoyoAccountId(cookie) {
  const parsed = parseCookiePairs(cookie)
  return String(
    parsed.account_id_v2 ||
    parsed.ltuid_v2 ||
    parsed.account_id ||
    parsed.ltuid ||
    parsed.login_uid ||
    parsed.stuid ||
    ''
  ).trim()
}

/** 展示用标签：UID 前后各 4 位 */
export function formatMihoyoAccountLabel(accountId, fallback = '') {
  const id = String(accountId || '').trim()
  if (!id) return String(fallback || '未命名账号').trim() || '未命名账号'
  if (id.length <= 8) return `账号 ${id}`
  return `账号 ${id.slice(0, 4)}…${id.slice(-4)}`
}

function normalizeAccount(raw) {
  if (!raw || typeof raw !== 'object') return null
  const cookie = String(raw.cookie || '').trim()
  if (!cookie) return null
  const accountId = String(raw.accountId || parseMihoyoAccountId(cookie) || '').trim()
  const id = String(raw.id || accountId || '').trim()
  if (!id) return null
  return {
    id,
    accountId,
    label: String(raw.label || '').trim() || formatMihoyoAccountLabel(accountId, id),
    avatarUrl: String(raw.avatarUrl || '').trim(),
    cookie,
    updatedAt: String(raw.updatedAt || '').trim(),
    invalidAt: String(raw.invalidAt || '').trim(),
    invalidReason: String(raw.invalidReason || '').trim()
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
  const value = await readSecret(ACTIVE_ID_KEY)
  return String(value || '').trim()
}

async function writeActiveAccountId(id) {
  const value = String(id || '').trim()
  if (!value) await removeSecret(ACTIVE_ID_KEY)
  else await writeSecret(ACTIVE_ID_KEY, value)
}

/** 旧版单账号状态 → 多账号列表（首次迁移） */
async function migrateLegacyStateIfNeeded(accounts) {
  if (accounts.length > 0) return accounts
  const legacy = await loadLegacyCookieState()
  const cookie = String(legacy.cookie || '').trim()
  if (!cookie) return []
  const accountId = parseMihoyoAccountId(cookie)
  const id = accountId || `legacy_${Date.now()}`
  const account = normalizeAccount({
    id,
    accountId,
    label: formatMihoyoAccountLabel(accountId, id),
    cookie,
    updatedAt: legacy.updatedAt,
    invalidAt: legacy.invalidAt,
    invalidReason: legacy.invalidReason
  })
  if (!account) return []
  const next = [account]
  await writeAccounts(next)
  await writeActiveAccountId(account.id)
  return next
}

async function loadLegacyCookieState() {
  const value = await readSecret(STORAGE_KEY)
  if (value) {
    try {
      return normalizeState(JSON.parse(value))
    } catch {
      // fall through
    }
  }

  if (Capacitor.isNativePlatform()) {
    try {
      const { value: nativeValue } = await Preferences.get({ key: NATIVE_STORAGE_KEY })
      if (nativeValue && nativeValue.trim()) {
        try {
          const parsed = JSON.parse(nativeValue)
          const cookie = String(parsed.cookie || '').trim()
          if (cookie) {
            return {
              cookie,
              updatedAt: String(parsed.updated_at || parsed.updatedAt || '').trim(),
              invalidAt: '',
              invalidReason: ''
            }
          }
        } catch {
          return {
            cookie: nativeValue.trim(),
            updatedAt: '',
            invalidAt: '',
            invalidReason: ''
          }
        }
      }
    } catch {
      // fall through
    }
  }

  return getDefaultState()
}

async function writeActiveCookieState(state) {
  const next = normalizeState(state)
  if (!next.cookie) {
    await removeSecret(STORAGE_KEY)
  } else {
    await writeSecret(STORAGE_KEY, JSON.stringify(next))
  }
  return next
}

/** 列出已保存的米游铺账号（当前账号在前） */
export async function listMihoyoAccounts() {
  const accounts = await migrateLegacyStateIfNeeded(await readAccounts())
  const activeId = await readActiveAccountId()
  if (!activeId) return accounts
  return [...accounts].sort((a, b) => (a.id === activeId ? -1 : b.id === activeId ? 1 : 0))
}

/** 当前激活账号；无激活则 null（退出会话后不回落到列表首项） */
export async function getActiveMihoyoAccount() {
  const accounts = await migrateLegacyStateIfNeeded(await readAccounts())
  const activeId = await readActiveAccountId()
  return accounts.find((item) => item.id === activeId) || null
}

export async function loadMihoyoCookieState() {
  const accounts = await migrateLegacyStateIfNeeded(await readAccounts())
  const activeId = await readActiveAccountId()
  const active = accounts.find((item) => item.id === activeId)
  if (active?.cookie) {
    return {
      cookie: active.cookie,
      updatedAt: active.updatedAt,
      invalidAt: active.invalidAt,
      invalidReason: active.invalidReason,
      accountId: active.accountId,
      accountLabel: active.label,
      accountAvatarUrl: active.avatarUrl || '',
      accountIdKey: active.id
    }
  }
  return { ...getDefaultState(), accountId: '', accountLabel: '', accountAvatarUrl: '', accountIdKey: '' }
}

/**
 * 保存 Cookie 并写入账号列表（按 accountId 去重 upsert），同时设为当前账号。
 * @param {string} cookie
 * @param {{ label?: string, avatarUrl?: string }} [options]
 */
export async function saveMihoyoCookie(cookie, options = {}) {
  const value = String(cookie || '').trim()
  if (!value) {
    await clearMihoyoCookieState({ keepAccounts: true })
    return { ...getDefaultState(), accountLabel: '', accountId: '' }
  }

  const accountId = parseMihoyoAccountId(value)
  const id = accountId || `ck_${hashCookie(value)}`
  const accounts = await migrateLegacyStateIfNeeded(await readAccounts())
  const now = new Date().toISOString()
  const existing = accounts.find((item) => item.id === id)
  const incomingLabel = String(options.label || '').trim()
  // 用户改过备注则保留；自动 UID 标签可被昵称覆盖
  const label = incomingLabel
    || (existing && !isAutoMihoyoAccountLabel(existing.label, accountId) ? existing.label : '')
    || formatMihoyoAccountLabel(accountId, id)
  const avatarUrl = String(options.avatarUrl || existing?.avatarUrl || '').trim()

  const nextAccount = normalizeAccount({
    id,
    accountId,
    label,
    avatarUrl,
    cookie: value,
    updatedAt: now,
    invalidAt: '',
    invalidReason: ''
  })

  const nextAccounts = existing
    ? accounts.map((item) => (item.id === id ? nextAccount : item))
    : [...accounts, nextAccount]

  await writeAccounts(nextAccounts)
  await writeActiveAccountId(id)
  const state = await writeActiveCookieState(nextAccount)
  return { ...state, accountLabel: nextAccount.label, accountId: nextAccount.accountId }
}

/** 账号备注是否仍是自动 UID 标签（便于有昵称时覆盖） */
export function isAutoMihoyoAccountLabel(label, accountId) {
  const text = String(label || '').trim()
  if (!text) return true
  return text === formatMihoyoAccountLabel(accountId, accountId)
}

function hashCookie(cookie) {
  let h = 0
  const text = String(cookie || '')
  for (let i = 0; i < text.length; i += 1) {
    h = ((h << 5) - h + text.charCodeAt(i)) | 0
  }
  return Math.abs(h).toString(36)
}

/** 切换当前账号：把目标 Cookie 写入激活状态（调用方负责原生会话） */
export async function switchMihoyoAccount(accountId) {
  const id = String(accountId || '').trim()
  if (!id) return null
  const accounts = await migrateLegacyStateIfNeeded(await readAccounts())
  const target = accounts.find((item) => item.id === id)
  if (!target?.cookie) return null

  await writeActiveAccountId(target.id)
  const state = await writeActiveCookieState(target)
  return {
    ...state,
    accountLabel: target.label,
    accountId: target.accountId,
    avatarUrl: target.avatarUrl || '',
    id: target.id
  }
}

/** 重命名账号 */
export async function renameMihoyoAccount(accountId, label) {
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
 * 用 user/info 资料刷新账号昵称/头像。
 * 仅当备注仍是自动 UID 标签（或头像为空）时覆盖，避免冲掉用户手改备注。
 */
export async function upsertMihoyoAccountProfile(accountId, { label = '', avatarUrl = '' } = {}) {
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
      || isAutoMihoyoAccountLabel(item.label, item.accountId || item.id)
      || item.label === formatMihoyoAccountLabel(item.accountId || item.id, item.id)
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
export async function removeMihoyoAccount(accountId) {
  const id = String(accountId || '').trim()
  if (!id) return false
  const accounts = await readAccounts()
  const next = accounts.filter((item) => item.id !== id)
  await writeAccounts(next)
  const activeId = await readActiveAccountId()
  if (activeId === id) {
    await writeActiveAccountId('')
    await writeActiveCookieState(getDefaultState())
  }
  return next.length !== accounts.length
}

export async function markMihoyoCookieInvalid(cookie, reason = '') {
  const value = String(cookie || '').trim()
  if (!value) {
    await clearMihoyoCookieState({ keepAccounts: true })
    return getDefaultState()
  }

  const accountId = parseMihoyoAccountId(value)
  const id = accountId || `ck_${hashCookie(value)}`
  const accounts = await migrateLegacyStateIfNeeded(await readAccounts())
  const existing = accounts.find((item) => item.id === id)
  const now = new Date().toISOString()
  const nextAccount = normalizeAccount({
    id,
    accountId,
    label: existing?.label,
    cookie: value,
    updatedAt: existing?.updatedAt || now,
    invalidAt: now,
    invalidReason: String(reason || '').trim()
  })

  const nextAccounts = existing
    ? accounts.map((item) => (item.id === id ? nextAccount : item))
    : [...accounts, nextAccount]
  await writeAccounts(nextAccounts)

  const activeId = await readActiveAccountId()
  if (!activeId || activeId === id) {
    await writeActiveAccountId(id)
    const state = await writeActiveCookieState(nextAccount)
    return { ...state, accountLabel: nextAccount.label, accountId: nextAccount.accountId }
  }
  return loadMihoyoCookieState()
}

/**
 * 清除当前会话。
 * keepAccounts=true（默认）：保留账号列表，便于快速切换；
 * keepAccounts=false：连账号列表一起清空。
 */
export async function clearMihoyoCookieState(options = {}) {
  const keepAccounts = options.keepAccounts !== false
  await removeSecret(STORAGE_KEY)
  await writeActiveAccountId('')
  if (!keepAccounts) {
    await removeSecret(ACCOUNTS_KEY)
  }
  if (Capacitor.isNativePlatform()) {
    try { await Preferences.remove({ key: NATIVE_STORAGE_KEY }) } catch (e) { /* ignore */ }
    try { await Preferences.remove({ key: 'mihoyo_cookie_state' }) } catch (e) { /* ignore */ }
  }
  return getDefaultState()
}
