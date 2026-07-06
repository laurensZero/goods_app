// src/services/supabaseAdapter/helpers.js
// Shared constants and utility functions for Supabase adapter

import { toSnakeCase, toCamelCase } from '@/utils/sync/columnMapping'
import { asyncBuildComparableRecordMap } from '@/utils/sync/shared'
import { withRetry } from '@/services/syncRetry'
import i18n from '@/locales'

// ── Column definitions ──

// Allowed columns per table (camelCase) — filters out extra fields from sync payload
export const GOODS_COLS = ['id', 'name', 'category', 'ip', 'goodsId', 'isWishlist', 'characters', 'tags', 'storageLocation', 'variant', 'price', 'actualPrice', 'acquiredAt', 'saleAt', 'saleReminderEnabled', 'saleReminderOffsets', 'unitAcquiredAtList', 'unitActualPriceList', 'unitCharacterList', 'unitCollectStatusList', 'image', 'images', 'tracks', 'note', 'quantity', 'points', 'currency', 'actualPriceCurrency', 'collectStatus', 'shippingFee', 'syncedBy']
export const EVENT_COLS = ['id', 'name', 'type', 'startDate', 'endDate', 'location', 'description', 'coverImage', 'coverImageData', 'photos', 'ticketPrice', 'ticketType', 'seatInfo', 'otherExpenses', 'tracks', 'linkedGoodsIds', 'tags', 'syncedBy']
export const RECHARGE_COLS = ['id', 'game', 'itemName', 'amount', 'chargedAt', 'note', 'image', 'syncedBy']
export const GOODS_GROUP_COLS = ['id', 'name', 'type', 'summaryMode', 'totalAmount', 'currency', 'coverMode', 'coverItemId', 'displayMode', 'note', 'syncedBy']
export const GOODS_GROUP_ITEM_COLS = ['id', 'groupId', 'goodsId', 'sortOrder', 'syncedBy']

// snake_case SELECT column lists — excludes auto-generated columns (e.g. created_at)
export const GOODS_SELECT_COLS = 'id, name, category, ip, goods_id, is_wishlist, characters, tags, storage_location, variant, price, actual_price, acquired_at, sale_at, sale_reminder_enabled, sale_reminder_offsets, unit_acquired_at_list, unit_actual_price_list, unit_character_list, unit_collect_status_list, image, images, tracks, note, quantity, points, currency, actual_price_currency, collect_status, shipping_fee, trashed, updated_at'
export const RECHARGE_SELECT_COLS = 'id, game, item_name, amount, charged_at, note, deleted, updated_at'
export const EVENT_SELECT_COLS = 'id, name, type, start_date, end_date, location, description, cover_image, cover_image_data, photos, ticket_price, ticket_type, seat_info, other_expenses, tracks, linked_goods_ids, tags, updated_at, created_at'
export const GOODS_GROUP_SELECT_COLS = 'id, name, type, summary_mode, total_amount, currency, cover_mode, cover_item_id, display_mode, note, updated_at, created_at'
export const GOODS_GROUP_ITEM_SELECT_COLS = 'id, group_id, goods_id, sort_order, updated_at, created_at'

// ── Primitive helpers ──

export function pickCols(item, allowed) {
  const result = {}
  for (const key of allowed) {
    if (item[key] !== undefined) result[key] = item[key]
  }
  return result
}

// Convert millisecond timestamp or ISO string to ISO string for TIMESTAMPTZ columns
export function toTimestamp(val) {
  if (typeof val === 'string' && val.includes('T')) return val
  const ms = typeof val === 'number' ? val : Number(val) || Date.now()
  return new Date(ms).toISOString()
}

// Normalize Supabase TIMESTAMPTZ string to ms timestamp (matches local data format)
export function normalizeTimestamp(val) {
  if (val == null || val === '') return Date.now()
  if (typeof val === 'number') return val
  const ms = new Date(val).getTime()
  return Number.isFinite(ms) ? ms : Date.now()
}

export function safeParseJsonArray(value) {
  if (Array.isArray(value)) return value
  if (typeof value !== 'string' || !value.trim()) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function normalizeId(value) {
  return String(value ?? '')
}

// ── Pagination / batch helpers ──

const PAGE_SIZE = 1000

/**
 * Paginate through all matching rows for a Supabase query.
 * Supabase defaults to returning at most 1000 rows per request;
 * this helper fetches all pages by re-invoking the builder factory.
 */
export async function fetchAllRows(queryFactory) {
  const allRows = []
  let from = 0
  while (true) {
    const to = from + PAGE_SIZE - 1
    const { data, error } = await withRetry(() => queryFactory().range(from, to))
    if (error) throw error
    if (!data || data.length === 0) break
    allRows.push(...data)
    if (data.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }
  return allRows
}

const UPSERT_CHUNK_SIZE = 200

export async function batchUpsert(db, tableName, rows, options = {}) {
  for (let i = 0; i < rows.length; i += UPSERT_CHUNK_SIZE) {
    const chunk = rows.slice(i, i + UPSERT_CHUNK_SIZE)
    const { error } = await withRetry(() =>
      db.from(tableName).upsert(chunk, options)
    )
    if (error) {
      console.error(`[supabase] upsert ${tableName} 失败 (chunk ${i}-${i + chunk.length}):`, error)
      throw new Error(i18n.global.t('sync.error.supabaseWriteFailed', { table: tableName, error: `${error.message} (code: ${error.code || '?'})` }))
    }
  }
}

export async function deleteRowsByIds(db, tableName, ids) {
  if (!ids || ids.length === 0) return
  const chunkSize = 500
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize)
    const { error } = await withRetry(() =>
      db.from(tableName).delete().in('id', chunk)
    )
    if (error) throw new Error(i18n.global.t('sync.error.supabaseDeleteFailed', { table: tableName, error: error.message }))
  }
}

export function buildIncomingIdSet(rows) {
  return new Set(
    rows
      .map((row) => row.id)
      .filter((id) => id !== undefined && id !== null && id !== '')
      .map(normalizeId)
  )
}

export async function syncTableRows(db, tableName, rows, { label = tableName, incremental = false, deleteIds = [], lastSyncedAt = null } = {}) {
  if (rows.length > 0) {
    let rowsToUpsert = rows
    if (incremental && rows[0]?.updated_at != null) {
      const ids = rows.map(r => r.id).filter(Boolean)
      if (ids.length > 0) {
        try {
          const existing = await fetchAllRows(() =>
            db.from(tableName).select('id, updated_at').in('id', ids)
          )
          const existingMap = new Map((existing || []).map(r => [r.id, r.updated_at]))
          rowsToUpsert = rows.filter(r => !existingMap.has(r.id) || existingMap.get(r.id) !== r.updated_at)
        } catch {
          rowsToUpsert = rows
        }
      }
    }
    if (rowsToUpsert.length > 0) {
      await batchUpsert(db, tableName, rowsToUpsert, { onConflict: 'id' })
    }
  }

  if (incremental) {
    const normalizedDeleteIds = [...new Set((deleteIds || []).map(normalizeId).filter(Boolean))]
    if (normalizedDeleteIds.length > 0) {
      await deleteRowsByIds(db, tableName, normalizedDeleteIds)
    }
    return
  }

  // Non-incremental full sync: only delete rows that were known at last sync time.
  // Rows updated after lastSyncedAt may belong to other devices and must be preserved.
  const incomingIdSet = buildIncomingIdSet(rows)
  if (incomingIdSet.size === 0) {
    if (lastSyncedAt) {
      const { error } = await withRetry(() =>
        db.from(tableName).delete().lte('updated_at', lastSyncedAt)
      )
      if (error) throw new Error(i18n.global.t('sync.error.supabaseClearFailed', { label, error: error.message }))
    }
    // Without lastSyncedAt we cannot safely determine which rows to delete — skip
    return
  }

  let existingRows = await fetchAllRows(() => db.from(tableName).select('id, updated_at'))

  if (lastSyncedAt) {
    // Only delete rows that were known at last sync (updated before or at last sync time)
    existingRows = (existingRows || []).filter(row => {
      if (!row.updated_at) return true
      return row.updated_at <= lastSyncedAt
    })
  }

  const staleIds = (existingRows || [])
    .map((row) => row.id)
    .filter((id) => !incomingIdSet.has(normalizeId(id)))
  await deleteRowsByIds(db, tableName, staleIds)
}

// ── Row converters (camelCase → snake_case) ──

export function toRechargeRow(item, currentDeviceId, deleted) {
  const id = String(item?.id || '').trim()
  if (!id) return null
  return toSnakeCase({
    ...pickCols(item, RECHARGE_COLS),
    id,
    game: String(item?.game || '').trim(),
    itemName: String(item?.itemName || '').trim(),
    note: String(item?.note || '').trim(),
    image: String(item?.image || '').trim(),
    amount: Number(item?.amount) || 0,
    chargedAt: String(item?.chargedAt || '').trim(),
    deleted: deleted ? 1 : 0,
    updatedAt: toTimestamp(item?.updatedAt),
    syncedBy: currentDeviceId
  })
}

export function toGoodsRows(items, deviceIdRef, isTrash = false) {
  const currentDeviceId = typeof deviceIdRef === 'function' ? deviceIdRef() : (deviceIdRef?.value || '')
  return items.map(item => toSnakeCase({
    ...pickCols(item, GOODS_COLS),
    isWishlist: item.isWishlist ? 1 : 0,
    saleReminderEnabled: item.saleReminderEnabled ? 1 : 0,
    saleReminderOffsets: Array.isArray(item.saleReminderOffsets) ? item.saleReminderOffsets : [],
    trashed: isTrash ? 1 : 0,
    quantity: Number(item.quantity) || 1,
    points: item.points != null ? Number(item.points) : null,
    updatedAt: toTimestamp(item.updatedAt),
    syncedBy: currentDeviceId
  }))
}

export function toEventRows(items, deviceIdRef) {
  const currentDeviceId = typeof deviceIdRef === 'function' ? deviceIdRef() : (deviceIdRef?.value || '')
  return items.map(item => toSnakeCase({
    ...pickCols(item, EVENT_COLS),
    updatedAt: toTimestamp(item.updatedAt),
    createdAt: toTimestamp(item.createdAt),
    syncedBy: currentDeviceId
  }))
}

export function toGroupRows(items, deviceIdRef) {
  const currentDeviceId = typeof deviceIdRef === 'function' ? deviceIdRef() : (deviceIdRef?.value || '')
  return items.map(item => toSnakeCase({
    ...pickCols(item, GOODS_GROUP_COLS),
    totalAmount: Number(item.totalAmount) || 0,
    updatedAt: toTimestamp(item.updatedAt),
    createdAt: toTimestamp(item.createdAt),
    syncedBy: currentDeviceId
  }))
}

export function toGroupItemRows(items, deviceIdRef) {
  const currentDeviceId = typeof deviceIdRef === 'function' ? deviceIdRef() : (deviceIdRef?.value || '')
  return items.map(item => toSnakeCase({
    ...pickCols(item, GOODS_GROUP_ITEM_COLS),
    sortOrder: Number(item.sortOrder) || 0,
    updatedAt: toTimestamp(item.updatedAt),
    createdAt: toTimestamp(item.createdAt),
    syncedBy: currentDeviceId
  }))
}

// ── Diff helpers ──

export async function computeDiffRows(localRows = [], remoteRows = []) {
  const stripMeta = (r) => {
    if (!r || typeof r !== 'object') return r
    const copy = { ...r }
    delete copy.syncedBy
    delete copy.synced_by
    return copy
  }
  function normalizeForDiff(item) {
    if (!item || typeof item !== 'object') return item
    const out = { ...item }
    if (Array.isArray(out.images)) {
      out.images = out.images.map((img) => {
        if (!img || typeof img !== 'object') return { id: img?.id || '', gistFileName: '' }
        const gistFileName = String(img.gistFileName || '').trim() || (typeof img.uri === 'string' && img.uri.startsWith('gist-image://') ? img.uri.slice('gist-image://'.length) : '')
        return { id: String(img.id || '').trim(), gistFileName }
      })
      out.images.sort((a, b) => String(a.id || '').localeCompare(String(b.id || '')))
    }
    if (out.image !== undefined) delete out.image
    if (out.coverImageData && typeof out.coverImageData === 'object') {
      out.coverImageData = { gistFileName: String(out.coverImageData.gistFileName || '').trim() }
    }
    if (out.coverImage !== undefined) delete out.coverImage
    if (out.isWishlist === undefined || out.isWishlist === null) out.isWishlist = 0
    else if (typeof out.isWishlist === 'string') out.isWishlist = (out.isWishlist === '1' || out.isWishlist.toLowerCase() === 'true') ? 1 : 0
    else out.isWishlist = out.isWishlist ? 1 : 0
    if (out.points === undefined) out.points = null
    if (out.updatedAt !== undefined && out.updatedAt !== null) out.updatedAt = Number(out.updatedAt) || 0
    if (Array.isArray(out.photos)) {
      out.photos = out.photos.map((p) => {
        if (!p || typeof p !== 'object') return { id: p?.id || '', gistFileName: '' }
        const gistFileName = String(p.gistFileName || '').trim() || (typeof p.uri === 'string' && p.uri.startsWith('gist-image://') ? p.uri.slice('gist-image://'.length) : '')
        return { id: String(p.id || '').trim(), gistFileName }
      })
      out.photos.sort((a, b) => String(a.id || '').localeCompare(String(b.id || '')))
    }
    return out
  }

  const normalizedLocal = localRows.map(stripMeta).map(normalizeForDiff)
  const normalizedRemote = remoteRows.map(stripMeta).map(normalizeForDiff)
  const [localMap, remoteMap] = await Promise.all([
    asyncBuildComparableRecordMap(normalizedLocal),
    asyncBuildComparableRecordMap(normalizedRemote)
  ])
  return localRows.filter((item) => {
    const id = String(item?.id || '').trim()
    if (!id) return false
    return localMap.get(id) !== remoteMap.get(id)
  })
}

export function computeDeleteIds(localRows = [], remoteRows = []) {
  const localIdSet = new Set(localRows.map(item => String(item?.id || '').trim()).filter(Boolean))
  const remoteIdSet = new Set(remoteRows.map(item => String(item?.id || '').trim()).filter(Boolean))
  return [...remoteIdSet].filter(id => !localIdSet.has(id))
}
