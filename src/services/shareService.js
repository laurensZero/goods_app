// src/services/shareService.js
// Supabase-based sharing CRUD

import { getSupabaseClient } from '@/utils/sync/supabaseClient'

const SHARES_TABLE = 'shares'

function db() {
  return getSupabaseClient()
}

/**
 * Create a new share. Returns the created row.
 */
export async function createShare(userId, shareId, payload) {
  const { data, error } = await db()
    .from(SHARES_TABLE)
    .insert({
      share_id: shareId,
      user_id: userId,
      payload
    })
    .select()
    .single()

  if (error) throw new Error(error.message)
  return data
}

// RPC 尚未在线上部署时（函数不存在）识别并回退旧路径
function isMissingRpc(error) {
  return error?.code === 'PGRST202' || /could not find the function|does not exist/i.test(error?.message || '')
}

/**
 * Get a share by shareId.
 * Returns { payload, disabled } or null (share code does not exist).
 * — payload !== null         → success（payload 为数据本体）
 * — payload === null, disabled === true  → 分享存在但已停用，且读取者非创建者
 *
 * `disabled` 创建者本人读到已停用分享时亦为 true（RPC 允许 owner 保留可读），
 * 供界面提示“已停用”。
 * Goes through the get_share RPC (shares SELECT is owner-only now);
 * falls back to the legacy direct select when the RPC is not deployed yet.
 */
export async function getShare(shareId) {
  const { data, error } = await db().rpc('get_share', { p_share_id: shareId })

  if (error) {
    if (!isMissingRpc(error)) throw new Error(error.message)
    return getShareLegacy(shareId)
  }

  // 新版 RPC 信封：{ payload, disabled }；码不存在时 RPC 返回 SQL NULL
  if (data && typeof data === 'object' && 'payload' in data) {
    const raw = data.payload
    const payload = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : null
    return { payload, disabled: !!data.disabled }
  }

  // 兼容旧版 RPC：直接返回 payload（无 disabled 信息），创建者补充直查
  if (data && typeof data === 'object' && 'goods' in data) {
    const disabled = await getShareDisabledForOwner(shareId)
    return { payload: data, disabled }
  }

  return null
}

/**
 * 读取者即创建者时，直查 shares 表拿 disabled 标志（RLS 仅允许创建者 SELECT，
 * 非创建者这里返回空数组，disabled 视为 false，正好与 RPC 的语义一致）。
 */
async function getShareDisabledForOwner(shareId) {
  try {
    const { data, error } = await db()
      .from(SHARES_TABLE)
      .select('disabled')
      .eq('share_id', shareId)
      .maybeSingle()

    if (error || !data) return false
    return !!data.disabled
  } catch {
    return false
  }
}

async function getShareLegacy(shareId) {
  const { data, error } = await db()
    .from(SHARES_TABLE)
    .select('payload, disabled')
    .eq('share_id', shareId)
    .limit(1)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!data || data.disabled) return null
  return { payload: data.payload, disabled: false }
}

/**
 * List all shares for a user, newest first.
 */
export async function listUserShares(userId) {
  const { data, error } = await db()
    .from(SHARES_TABLE)
    .select('share_id, payload, disabled, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)
  return data || []
}

/**
 * Toggle the disabled flag on a share.
 */
export async function toggleShareDisabled(shareId, disabled) {
  const { error } = await db()
    .from(SHARES_TABLE)
    .update({ disabled })
    .eq('share_id', shareId)

  if (error) throw new Error(error.message)
}

/**
 * Update an existing share's payload.
 */
export async function updateShare(shareId, payload) {
  const { error } = await db()
    .from(SHARES_TABLE)
    .update({ payload })
    .eq('share_id', shareId)

  if (error) throw new Error(error.message)
}

/**
 * Delete a share row.
 */
export async function deleteShare(shareId) {
  const { error } = await db()
    .from(SHARES_TABLE)
    .delete()
    .eq('share_id', shareId)

  if (error) throw new Error(error.message)
}

/**
 * Find an existing share with the same goods (by goods names).
 * Returns { shareId, disabled, payload } or null.
 */
export async function findMatchingShare(userId, goodsNames) {
  const sortedNames = [...goodsNames].sort().join('|')

  const { data, error } = await db()
    .from(SHARES_TABLE)
    .select('share_id, payload, disabled')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) throw new Error(error.message)
  if (!data) return null

  for (const row of data) {
    if (!row.payload?.goods) continue
    const existingNames = row.payload.goods.map(g => g.name || '').sort().join('|')
    if (existingNames === sortedNames) {
      return { shareId: row.share_id, disabled: row.disabled, payload: row.payload }
    }
  }
  return null
}
