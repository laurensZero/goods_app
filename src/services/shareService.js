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

/**
 * Get a share's payload by shareId. Returns null if not found or disabled.
 */
export async function getShare(shareId) {
  const { data, error } = await db()
    .from(SHARES_TABLE)
    .select('payload, disabled')
    .eq('share_id', shareId)
    .limit(1)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!data || data.disabled) return null
  return data.payload
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
