// 角色生日数据服务：按需查询 + 本地缓存。
// 只把「谷子数达标角色」的归一化名字 key 发给 get_character_birthdays RPC，
// 本地也只缓存这些角色的行（不存全表）。表在 Supabase Dashboard 手动维护。
//
// 缓存策略：
// - TTL 内 + key 集合未变：调 RPC 带 p_updated_since 做增量验证（服务端只返回变更行）
// - 无变更 → 推进 syncedAt，rows 不变；有变更 → 按 id 合并
// - TTL 过期 / key 集合变化 / force：全量拉取
// - 网络失败：静默降级为旧缓存

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
    message: String(row.message || '').trim(),
    updatedAt: String(row.updated_at || '')
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
 * - TTL 内 + key 未变 → 带 p_updated_since 增量验证，按 id 合并
 * - TTL 过期 / key 变化 / force → 全量拉取
 * - 网络失败静默降级为旧缓存
 */
export async function refreshBirthdayRows(names, { force = false } = {}) {
  const keys = [...new Set(
    (Array.isArray(names) ? names : []).map(normalizeBirthdayKey).filter(Boolean)
  )].sort()

  const cache = readCache()
  const ttlFresh = Date.now() - cache.syncedAt < CACHE_TTL_MS
  const keysMatch = sameKeySet(keys, cache.queryKeys)
  const useCache = !force && keysMatch

  if (!keys.length) {
    persistCache({ queryKeys: [], rows: [], syncedAt: Date.now() })
    return []
  }

  try {
    const db = getSupabaseClient()
    const now = Date.now()

    if (!useCache) {
      // 全量拉取：TTL 过期 / key 变了 / force
      const { data, error } = await db.rpc('get_character_birthdays', { p_keys: keys })
      if (error) throw new Error(error.message || 'get_character_birthdays failed')
      const rows = (Array.isArray(data) ? data : []).map(normalizeRow).filter(Boolean)
      persistCache({ queryKeys: keys, rows, syncedAt: now })
      return rows
    }

    // TTL 内 + key 匹配 → 增量验证：只拉 updated_at > syncedAt 的行
    if (ttlFresh && cache.syncedAt > 0) {
      const params = { p_keys: keys, p_updated_since: new Date(cache.syncedAt).toISOString() }
      const { data, error } = await db.rpc('get_character_birthdays', params)
      if (error) throw new Error(error.message || 'get_character_birthdays failed')

      const changedRows = (Array.isArray(data) ? data : []).map(normalizeRow).filter(Boolean)
      if (!changedRows.length) {
        // 无变更，推进 syncedAt，保持原 rows
        persistCache({ queryKeys: keys, rows: cache.rows, syncedAt: now })
        return cache.rows
      }

      // 按 id 合并：变更行覆盖旧行，未变的保留
      const rowMap = new Map(cache.rows.map((r) => [r.id, r]))
      for (const row of changedRows) {
        rowMap.set(row.id, row)
      }
      const merged = [...rowMap.values()]
      persistCache({ queryKeys: keys, rows: merged, syncedAt: now })
      return merged
    }

    // 缓存为空但有 key（首次且 key 集合匹配的边界情况，理论上不会走到这里）
    const { data, error } = await db.rpc('get_character_birthdays', { p_keys: keys })
    if (error) throw new Error(error.message || 'get_character_birthdays failed')
    const rows = (Array.isArray(data) ? data : []).map(normalizeRow).filter(Boolean)
    persistCache({ queryKeys: keys, rows, syncedAt: now })
    return rows
  } catch {
    // 网络失败 → 降级为旧缓存；key 集合变了旧缓存对不上新角色，返回空更安全
    return useCache ? cache.rows : (keysMatch ? cache.rows : [])
  }
}
