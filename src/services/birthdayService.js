// 角色生日数据服务：按需查询 + 本地缓存。
// 只把「谷子数达标角色」的归一化名字 key 发给 get_character_birthdays RPC，
// 本地也只缓存这些角色的行（不存全表）。表在 Supabase Dashboard 手动维护，
// 改动最长 CACHE_TTL_MS 内生效，达标角色集合变化时立即重查。

import { getSupabaseClient } from '@/utils/sync/supabaseClient'
import { normalizeBirthdayKey } from '@/utils/goods/birthday'

const CACHE_KEY = 'goods_character_birthdays_cache'
const CACHE_TTL_MS = 24 * 60 * 60 * 1000

function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return { queryKeys: [], rows: [], syncedAt: 0 }
    const parsed = JSON.parse(raw)
    return {
      queryKeys: Array.isArray(parsed?.queryKeys) ? parsed.queryKeys : [],
      rows: Array.isArray(parsed?.rows) ? parsed.rows : [],
      syncedAt: Number(parsed?.syncedAt) || 0
    }
  } catch {
    return { queryKeys: [], rows: [], syncedAt: 0 }
  }
}

function persistCache(cache) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache))
  } catch {
    // ignore
  }
}

function normalizeRow(row) {
  if (!row || typeof row !== 'object') return null
  const name = String(row.name || '').trim()
  const month = Number(row.birth_month)
  const day = Number(row.birth_day)
  if (!name || !Number.isInteger(month) || !Number.isInteger(day)) return null
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  return {
    id: String(row.id || ''),
    ip: String(row.ip || '').trim(),
    ipAliases: Array.isArray(row.ip_aliases) ? row.ip_aliases.map((v) => String(v || '')) : [],
    name,
    aliases: Array.isArray(row.aliases) ? row.aliases.map((v) => String(v || '')) : [],
    month,
    day,
    color: String(row.color || '').trim(),
    message: String(row.message || '').trim()
  }
}

function sameKeySet(a, b) {
  if (a.length !== b.length) return false
  return a.every((key, index) => key === b[index])
}

export function loadCachedBirthdayRows() {
  return readCache().rows
}

/**
 * 按达标角色名查询生日行。
 * - key 集合与缓存一致且缓存新鲜（< 24h）→ 直接用缓存
 * - 否则整组重查并整体替换缓存（行数很小，无需增量合并）
 * - 网络失败静默降级为旧缓存
 */
export async function refreshBirthdayRows(names, { force = false } = {}) {
  const keys = [...new Set(
    (Array.isArray(names) ? names : []).map(normalizeBirthdayKey).filter(Boolean)
  )].sort()

  const cache = readCache()
  const isFresh = Date.now() - cache.syncedAt < CACHE_TTL_MS
  if (!force && isFresh && sameKeySet(keys, cache.queryKeys)) {
    return cache.rows
  }

  if (!keys.length) {
    persistCache({ queryKeys: [], rows: [], syncedAt: Date.now() })
    return []
  }

  try {
    const db = getSupabaseClient()
    const { data, error } = await db.rpc('get_character_birthdays', { p_keys: keys })
    if (error) throw new Error(error.message || 'get_character_birthdays failed')
    const rows = (Array.isArray(data) ? data : []).map(normalizeRow).filter(Boolean)
    persistCache({ queryKeys: keys, rows, syncedAt: Date.now() })
    return rows
  } catch {
    return cache.rows
  }
}
