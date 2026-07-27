// 角色生日数据服务：按需查询 + 本地缓存。
// 只把「谷子数达标角色」的归一化名字 key 发给 get_character_birthdays RPC，
// 本地也只缓存这些角色的行（不存全表）。表在 Supabase Dashboard 手动维护。
//
// 增量更新策略：始终带 p_updated_since 调 RPC，服务端只返回 updated_at 变更过的行；
// 客户端按 id 合并到缓存。这样生日当天在 Dashboard 改了 message/color 也能立即生效，
// 不用等 24h TTL 过期。网络失败静默降级为旧缓存。

import { getSupabaseClient } from '@/utils/sync/supabaseClient'
import { normalizeBirthdayKey } from '@/utils/goods/birthday'

const CACHE_KEY = 'goods_character_birthdays_cache'

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
    // 缓存 updated_at 用于增量合并；客户端不直接消费此字段
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
 * - key 集合变化或 force → 清空缓存，全量拉取（兜底）
 * - 正常路径：带 p_updated_since 增量拉取，按 id 合并到缓存
 * - 网络失败静默降级为旧缓存
 */
export async function refreshBirthdayRows(names, { force = false } = {}) {
  const keys = [...new Set(
    (Array.isArray(names) ? names : []).map(normalizeBirthdayKey).filter(Boolean)
  )].sort()

  const cache = readCache()
  const keySetChanged = !sameKeySet(keys, cache.queryKeys)

  // key 集合变了（新增/移除达标角色）→ 全量重拉
  if (force || keySetChanged) {
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
      // 全量拉取失败：如果 key 集合变了，旧缓存对不上新角色，返回空更安全
      return keySetChanged ? [] : cache.rows
    }
  }

  if (!keys.length) {
    persistCache({ queryKeys: [], rows: [], syncedAt: Date.now() })
    return []
  }

  // 增量拉取：只获取上次同步后变更过的行
  try {
    const db = getSupabaseClient()
    const params = { p_keys: keys }
    if (cache.syncedAt > 0) {
      params.p_updated_since = new Date(cache.syncedAt).toISOString()
    }
    const { data, error } = await db.rpc('get_character_birthdays', params)
    if (error) throw new Error(error.message || 'get_character_birthdays failed')

    const changedRows = (Array.isArray(data) ? data : []).map(normalizeRow).filter(Boolean)
    const now = Date.now()

    if (!changedRows.length) {
      // 无变更，只推进 syncedAt，rows 不变
      persistCache({ queryKeys: keys, rows: cache.rows, syncedAt: now })
      return cache.rows
    }

    // 按 id 合并：新行覆盖旧行，未变的行保留
    const rowMap = new Map(cache.rows.map((r) => [r.id, r]))
    for (const row of changedRows) {
      rowMap.set(row.id, row)
    }
    const merged = [...rowMap.values()]
    persistCache({ queryKeys: keys, rows: merged, syncedAt: now })
    return merged
  } catch {
    // 增量拉取失败 → 降级为旧缓存
    return cache.rows
  }
}
