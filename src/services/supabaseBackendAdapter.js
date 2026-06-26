// src/services/supabaseBackendAdapter.js
import { createSyncBackendAdapter } from './syncBackendAdapter'
import { getSupabaseClient } from '@/utils/sync/supabaseClient'
import { toSnakeCase, toCamelCase, mapRowsToCamelCase } from '@/utils/sync/columnMapping'
import { asyncBuildComparableRecordMap } from '@/utils/sync/shared'
import { withRetry, withTimeout } from './syncRetry'
import { EVENT_PHOTO_PREFIX } from '@/constants/syncConstants'
import i18n from '@/locales'

export function createSupabaseBackendAdapter({
  trackSyncStep,
  deviceIdRef
}) {
  function getDb() {
    return getSupabaseClient()
  }

  // Convert millisecond timestamp or ISO string to ISO string for TIMESTAMPTZ columns
  function toTimestamp(val) {
    if (typeof val === 'string' && val.includes('T')) return val
    const ms = typeof val === 'number' ? val : Number(val) || Date.now()
    return new Date(ms).toISOString()
  }

  // Allowed columns per table (camelCase) — filters out extra fields from sync payload
  const GOODS_COLS = ['id', 'name', 'category', 'ip', 'goodsId', 'isWishlist', 'characters', 'tags', 'storageLocation', 'variant', 'price', 'actualPrice', 'acquiredAt', 'saleAt', 'saleReminderEnabled', 'saleReminderOffsets', 'unitAcquiredAtList', 'unitActualPriceList', 'unitCharacterList', 'unitCollectStatusList', 'image', 'images', 'tracks', 'note', 'quantity', 'points', 'currency', 'actualPriceCurrency', 'collectStatus', 'shippingFee', 'syncedBy']
  const EVENT_COLS = ['id', 'name', 'type', 'startDate', 'endDate', 'location', 'description', 'coverImage', 'coverImageData', 'photos', 'ticketPrice', 'ticketType', 'seatInfo', 'otherExpenses', 'tracks', 'linkedGoodsIds', 'tags', 'syncedBy']
  const RECHARGE_COLS = ['id', 'game', 'itemName', 'amount', 'chargedAt', 'note', 'image', 'syncedBy']
  const GOODS_GROUP_COLS = ['id', 'name', 'type', 'summaryMode', 'totalAmount', 'currency', 'coverMode', 'coverItemId', 'displayMode', 'note', 'syncedBy']
  const GOODS_GROUP_ITEM_COLS = ['id', 'groupId', 'goodsId', 'sortOrder', 'syncedBy']

  // snake_case SELECT column lists — excludes auto-generated columns (e.g. created_at)
  // that would cause comparison diffs between local and remote data
  const GOODS_SELECT_COLS = 'id, name, category, ip, goods_id, is_wishlist, characters, tags, storage_location, variant, price, actual_price, acquired_at, sale_at, sale_reminder_enabled, sale_reminder_offsets, unit_acquired_at_list, unit_actual_price_list, unit_character_list, unit_collect_status_list, image, images, tracks, note, quantity, points, currency, actual_price_currency, collect_status, shipping_fee, trashed, updated_at'
  const RECHARGE_SELECT_COLS = 'id, game, item_name, amount, charged_at, note, deleted, updated_at'
  const EVENT_SELECT_COLS = 'id, name, type, start_date, end_date, location, description, cover_image, cover_image_data, photos, ticket_price, ticket_type, seat_info, other_expenses, tracks, linked_goods_ids, tags, updated_at, created_at'
  const GOODS_GROUP_SELECT_COLS = 'id, name, type, summary_mode, total_amount, currency, cover_mode, cover_item_id, display_mode, note, updated_at, created_at'
  const GOODS_GROUP_ITEM_SELECT_COLS = 'id, group_id, goods_id, sort_order, updated_at, created_at'
  const GOODS_IMAGE_BUCKET = 'goods-images'
  const EVENT_PHOTO_BUCKET = 'event-photos'

  function pickCols(item, allowed) {
    const result = {}
    for (const key of allowed) {
      if (item[key] !== undefined) result[key] = item[key]
    }
    return result
  }

  // Normalize Supabase TIMESTAMPTZ string to ms timestamp (matches local data format)
  function normalizeTimestamp(val) {
    if (val == null || val === '') return Date.now()
    if (typeof val === 'number') return val
    const ms = new Date(val).getTime()
    return Number.isFinite(ms) ? ms : Date.now()
  }

  function safeParseJsonArray(value) {
    if (Array.isArray(value)) return value
    if (typeof value !== 'string' || !value.trim()) return []
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }

  function isBucketNotFoundError(error) {
    const message = String(error?.message || '').toLowerCase()
    return message.includes('not found') || message.includes('does not exist') || message.includes('no such bucket')
  }

  function isBucketAlreadyExistsError(error) {
    const message = String(error?.message || '').toLowerCase()
    return message.includes('already exists') || message.includes('duplicate')
  }

  function isBucketCreatePermissionError(error) {
    const code = String(error?.code || '').toUpperCase()
    const message = String(error?.message || '').toLowerCase()
    return code === '42501' || message.includes('row-level security') || message.includes('permission denied') || message.includes('not allowed')
  }

  function normalizeBucketName(bucketLike) {
    if (typeof bucketLike === 'string' && bucketLike.trim()) return bucketLike.trim()
    if (bucketLike && typeof bucketLike === 'object') {
      const candidate = bucketLike.id || bucketLike.bucket || bucketLike.bucketName || bucketLike.name || bucketLike.imageBucket || bucketLike.imageGistId
      if (typeof candidate === 'string' && candidate.trim()) return candidate.trim()
    }
    return GOODS_IMAGE_BUCKET
  }

  function resolveStorageBucketByPath(filePath, fallbackBucket = GOODS_IMAGE_BUCKET) {
    const normalizedPath = String(filePath || '').trim()
    if (normalizedPath.startsWith(EVENT_PHOTO_PREFIX)) return EVENT_PHOTO_BUCKET
    return fallbackBucket || GOODS_IMAGE_BUCKET
  }

  async function ensureStorageBucket(db, bucketName) {
    const { data, error } = await db.storage.getBucket(bucketName)
    if (data) return { id: bucketName }

    if (error && !isBucketNotFoundError(error)) {
      throw new Error(i18n.global.t('sync.error.supabaseReadBucketFailed', { error: error.message }))
    }

    const { error: createError } = await db.storage.createBucket(bucketName, { public: true })
    if (createError && !isBucketAlreadyExistsError(createError)) {
      if (isBucketCreatePermissionError(createError)) {
        // Anon key usually cannot create buckets; keep data sync usable even when storage setup is incomplete.
        console.warn('[supabase] createBucket permission denied, skip auto-create:', createError.message)
        return { id: bucketName }
      }
      throw new Error(i18n.global.t('sync.error.supabaseCreateBucketFailed', { error: createError.message }))
    }
    return { id: bucketName }
  }

  async function listStorageBucketFiles(db, bucketName) {
    const { data, error } = await db.storage.from(bucketName).list('', { limit: 10000 })
    if (error || !data) return []
    return data
      .map((file) => String(file?.name || '').trim())
      .filter((name) => !!name && name !== '.emptyFolderPlaceholder')
  }

  function normalizeId(value) {
    return String(value ?? '')
  }

  const PAGE_SIZE = 1000

  /**
   * Paginate through all matching rows for a Supabase query.
   * Supabase defaults to returning at most 1000 rows per request;
   * this helper fetches all pages by re-invoking the builder factory.
   *
   * @param {() => object} queryFactory - function that returns a fresh query builder each call
   */
  async function fetchAllRows(queryFactory) {
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

  async function batchUpsert(db, tableName, rows, options = {}) {
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

  async function deleteRowsByIds(db, tableName, ids) {
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

  function buildIncomingIdSet(rows) {
    return new Set(
      rows
        .map((row) => row.id)
        .filter((id) => id !== undefined && id !== null && id !== '')
        .map(normalizeId)
    )
  }

  async function syncTableRows(db, tableName, rows, { label = tableName, incremental = false, deleteIds = [] } = {}) {
    if (rows.length > 0) {
      let rowsToUpsert = rows
      // In incremental mode, skip rows whose updated_at hasn't changed to avoid redundant realtime events
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
            // If the pre-check fails, fall back to upserting all rows
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

    const incomingIdSet = buildIncomingIdSet(rows)
    if (incomingIdSet.size === 0) {
      const { error } = await withRetry(() =>
        db.from(tableName).delete().neq('id', '')
      )
      if (error) throw new Error(i18n.global.t('sync.error.supabaseClearFailed', { label, error: error.message }))
      return
    }

    const existingRows = await fetchAllRows(() => db.from(tableName).select('id'))

    const staleIds = (existingRows || [])
      .map((row) => row.id)
      .filter((id) => !incomingIdSet.has(normalizeId(id)))
    await deleteRowsByIds(db, tableName, staleIds)
  }

  function toRechargeRow(item, currentDeviceId, deleted) {
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

  // ── Ensure operations (no-op for Supabase, tables are pre-created) ──

  async function ensureDataGist() {
    return { id: 'supabase-data' }
  }

  async function ensureImageGist() {
    const db = getDb()
    await ensureStorageBucket(db, GOODS_IMAGE_BUCKET)
    await ensureStorageBucket(db, EVENT_PHOTO_BUCKET)
    return { id: GOODS_IMAGE_BUCKET }
  }

  async function ensureRechargeGist() {
    return { id: 'supabase-recharge' }
  }

  async function ensureEventGist() {
    return { id: 'supabase-events' }
  }

  // ── Existing lookups ──

  // Cache image file listing to avoid expensive Storage API calls on every sync.
  // Auto-push fires every ~2s; listing all files is O(n) and slow.
  const IMAGE_GIST_CACHE_TTL = 30_000 // 30 seconds
  let imageGistCache = null
  let imageGistCacheTime = 0

  function invalidateImageGistCache() {
    imageGistCache = null
    imageGistCacheTime = 0
  }

  async function getExistingImageGist() {
    const now = Date.now()
    if (imageGistCache && (now - imageGistCacheTime) < IMAGE_GIST_CACHE_TTL) {
      return imageGistCache
    }

    const db = getDb()
    const files = {}

    const [goodsFiles, eventPhotoFiles] = await Promise.all([
      listStorageBucketFiles(db, GOODS_IMAGE_BUCKET),
      listStorageBucketFiles(db, EVENT_PHOTO_BUCKET)
    ])

    for (const fileName of [...goodsFiles, ...eventPhotoFiles]) {
      files[fileName] = { name: fileName }
      files[fileName + '.txt'] = { name: fileName }
    }
    const result = { id: GOODS_IMAGE_BUCKET, files }
    imageGistCache = result
    imageGistCacheTime = now
    return result
  }

  async function getExistingRechargeGist() {
    return { id: 'supabase-recharge' }
  }

  async function getExistingEventGist() {
    return { id: 'supabase-events' }
  }

  // ── Read operations ──

  async function readJson({
    title,
    fileName,
    startDetail = '',
    category = '',
    successDetail = null,
    incrementalSince = 0
  }) {
    const result = await trackSyncStep(title, () => withTimeout(async () => {
      const db = getDb()

      if (fileName === 'data.json') {
        const incrementalSinceMs = Number(incrementalSince) || 0
        const buildGoodsQuery = (trashed) => () => {
          let query = db.from('goods').select(GOODS_SELECT_COLS)
          query = trashed ? query.eq('trashed', 1) : query.or('trashed.is.null,trashed.eq.0')
          if (incrementalSinceMs > 0) {
            query = query.gt('updated_at', new Date(incrementalSinceMs).toISOString())
          }
          return query
        }
        const buildGroupsQuery = () => () => {
          let query = db.from('goods_groups').select(GOODS_GROUP_SELECT_COLS)
          if (incrementalSinceMs > 0) {
            query = query.gt('updated_at', new Date(incrementalSinceMs).toISOString())
          }
          return query
        }
        const buildGroupItemsQuery = () => () => {
          let query = db.from('goods_group_items').select(GOODS_GROUP_ITEM_SELECT_COLS)
          if (incrementalSinceMs > 0) {
            query = query.gt('updated_at', new Date(incrementalSinceMs).toISOString())
          }
          return query
        }

        const [goodsData, trashData, presetsRes, groupsData, groupItemsData] = await Promise.all([
          fetchAllRows(buildGoodsQuery(false)),
          fetchAllRows(buildGoodsQuery(true)),
          withRetry(() => db.from('sync_presets').select('*').eq('id', 'default').limit(1)),
          fetchAllRows(buildGroupsQuery()),
          fetchAllRows(buildGroupItemsQuery())
        ])

        const normalizeGoodsRows = (rows) => rows.map((row) => {
          const item = toCamelCase(row)
          item.updatedAt = normalizeTimestamp(item.updatedAt)
          delete item.trashed
          return item
        })

        const presets = presetsRes.data && presetsRes.data.length > 0 ? toCamelCase(presetsRes.data[0]) : { categories: '[]', ips: '[]', characters: '[]', storageLocations: '[]' }

        const goodsGroups = (groupsData || []).map(row => {
          const item = toCamelCase(row)
          item.updatedAt = normalizeTimestamp(item.updatedAt)
          if (item.createdAt) item.createdAt = normalizeTimestamp(item.createdAt)
          return item
        })
        const goodsGroupItems = (groupItemsData || []).map(row => {
          const item = toCamelCase(row)
          item.updatedAt = normalizeTimestamp(item.updatedAt)
          if (item.createdAt) item.createdAt = normalizeTimestamp(item.createdAt)
          return item
        })

        return {
          parsed: {
            goods: normalizeGoodsRows(goodsData || []),
            trash: normalizeGoodsRows(trashData || []),
            presets: {
              categories: safeParseJsonArray(presets.categories),
              ips: safeParseJsonArray(presets.ips),
              characters: safeParseJsonArray(presets.characters),
              storageLocations: safeParseJsonArray(presets.storageLocations)
            },
            goodsGroups,
            goodsGroupItems
          },
          source: 'Supabase'
        }
      }

      if (fileName === 'recharge-data.json') {
        const incrementalSinceMs = Number(incrementalSince) || 0
        const data = await fetchAllRows(() => {
          let query = db.from('recharge_records').select(RECHARGE_SELECT_COLS)
          if (incrementalSinceMs > 0) {
            query = query.gt('updated_at', new Date(incrementalSinceMs).toISOString())
          }
          return query
        })
        const recharge = []
        const rechargeTrash = []
        for (const row of data || []) {
          const item = toCamelCase(row)
          item.updatedAt = normalizeTimestamp(item.updatedAt)
          item.deleted = Boolean(item.deleted)
          if (item.deleted) rechargeTrash.push(item)
          else recharge.push(item)
        }
        return {
          parsed: { recharge, rechargeTrash },
          source: 'Supabase'
        }
      }

      if (fileName === 'events-data.json') {
        const incrementalSinceMs = Number(incrementalSince) || 0
        const data = await fetchAllRows(() => {
          let query = db.from('events').select(EVENT_SELECT_COLS)
          if (incrementalSinceMs > 0) {
            query = query.gt('updated_at', new Date(incrementalSinceMs).toISOString())
          }
          return query
        })
        const events = (data || []).map((row) => {
          const item = toCamelCase(row)
          item.updatedAt = normalizeTimestamp(item.updatedAt)
          if (item.createdAt) item.createdAt = normalizeTimestamp(item.createdAt)
          return item
        })
        return {
          parsed: { events },
          source: 'Supabase'
        }
      }

      if (fileName === 'manifest.json') {
        const { data, error } = await withRetry(() =>
          db.from('sync_manifest').select('*').eq('id', 'default').limit(1)
        )
        if (error || !data || data.length === 0) return null
        const row = toCamelCase(data[0])
        return {
          parsed: {
            ...row,
            lastSyncAt: row.syncedAt || row.lastSyncAt || '',
            imageGistId: row.imageBucket || row.imageGistId || ''
          },
          source: 'Supabase'
        }
      }

      return null
    }), {
      startDetail,
      category,
      successDetail: (value) => {
        if (!successDetail) return ''
        return successDetail(value?.parsed ?? null, value?.source || 'Supabase')
      }
    })

    return result?.parsed ?? null
  }

  async function readImage(bucket, filePath) {
    const db = getDb()
    const storagePath = toStoragePath(filePath)
    const fallbackBucket = normalizeBucketName(bucket)
    const bucketName = resolveStorageBucketByPath(storagePath, fallbackBucket)
    const { data, error } = await withRetry(() =>
      db.storage.from(bucketName).download(storagePath)
    )
    if (error || !data) return null
    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result)
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(data)
    })
  }

  // ── Write operations ──

  async function writeData(_, dataMap, options = {}) {
    return withTimeout(async () => {
    const db = getDb()
    const incremental = options?.incremental === true
    const deleteIdsByFile = options?.deleteIdsByFile || {}

    for (const [fileName, entry] of Object.entries(dataMap)) {
      const content = entry.content

      if (fileName === 'manifest.json') {
        // accept either object or JSON string
        let manifestContent = content
        if (typeof manifestContent === 'string') {
          try { manifestContent = JSON.parse(manifestContent) } catch { manifestContent = {} }
        }
        const imageCountVal = Number(manifestContent.imageCount || manifestContent.imageFileCount || 0)
        const goodsCountVal = Number(manifestContent.goodsCount || ((manifestContent.collectionCount || 0) + (manifestContent.wishlistCount || 0)) || 0)
        const manifestRow = toSnakeCase({
          id: 'default',
          syncedAt: manifestContent.lastSyncAt || manifestContent.updatedAt || new Date().toISOString(),
          deviceId: manifestContent.deviceId || '',
          collectionCount: Number(manifestContent.collectionCount) || 0,
          wishlistCount: Number(manifestContent.wishlistCount) || 0,
          imageCount: imageCountVal,
          goodsCount: goodsCountVal,
          trashCount: manifestContent.trashCount || 0,
          rechargeCount: manifestContent.rechargeCount || 0,
          eventCount: manifestContent.eventCount || 0,
          imageBucket: manifestContent.imageGistId || manifestContent.imageBucket || 'goods-images',
          rechargeUpdatedAt: manifestContent.rechargeUpdatedAt || null,
          eventUpdatedAt: manifestContent.eventUpdatedAt || null,
          budgetMonthly: Number(manifestContent.budgetMonthly) || 0,
          budgetYearly: Number(manifestContent.budgetYearly) || 0
        })
        let { error } = await withRetry(() =>
          db.from('sync_manifest').upsert(manifestRow)
        )
        if (error) {
          const isMissingColumn = String(error.message || '').includes('column')
          if (!isMissingColumn) throw new Error(i18n.global.t('sync.error.supabaseWriteManifestFailed', { error: error.message }))

          const fallbackManifestRow = toSnakeCase({
            id: 'default',
            syncedAt: manifestContent.lastSyncAt || manifestContent.updatedAt || new Date().toISOString(),
            deviceId: manifestContent.deviceId || '',
            collectionCount: Number(manifestContent.collectionCount) || 0,
            wishlistCount: Number(manifestContent.wishlistCount) || 0,
            imageCount: imageCountVal,
            goodsCount: goodsCountVal,
            trashCount: manifestContent.trashCount || 0,
            rechargeCount: manifestContent.rechargeCount || 0,
            eventCount: manifestContent.eventCount || 0,
            imageBucket: manifestContent.imageGistId || manifestContent.imageBucket || 'goods-images'
          })

          ;({ error } = await withRetry(() =>
            db.from('sync_manifest').upsert(fallbackManifestRow)
          ))
          if (error) throw new Error(i18n.global.t('sync.error.supabaseWriteManifestFailed', { error: error.message }))
        }
        continue
      }

      if (fileName === 'data.json') {
        const goods = Array.isArray(content.goods) ? content.goods : []
        const trash = Array.isArray(content.trash) ? content.trash : []

        const currentDeviceId = typeof deviceIdRef === 'function' ? deviceIdRef() : (deviceIdRef?.value || '')
        const goodsRows = goods.map(item => toSnakeCase({
          ...pickCols(item, GOODS_COLS),
          isWishlist: item.isWishlist ? 1 : 0,
          saleReminderEnabled: item.saleReminderEnabled ? 1 : 0,
          saleReminderOffsets: Array.isArray(item.saleReminderOffsets) ? item.saleReminderOffsets : [],
          trashed: 0,
          quantity: Number(item.quantity) || 1,
          points: item.points != null ? Number(item.points) : null,
          updatedAt: toTimestamp(item.updatedAt),
          syncedBy: currentDeviceId
        }))
        const trashRows = trash.map(item => toSnakeCase({
          ...pickCols(item, GOODS_COLS),
          isWishlist: item.isWishlist ? 1 : 0,
          saleReminderEnabled: item.saleReminderEnabled ? 1 : 0,
          saleReminderOffsets: Array.isArray(item.saleReminderOffsets) ? item.saleReminderOffsets : [],
          trashed: 1,
          quantity: Number(item.quantity) || 1,
          points: item.points != null ? Number(item.points) : null,
          updatedAt: toTimestamp(item.updatedAt),
          syncedBy: currentDeviceId
        }))
        const mergedRows = [...goodsRows, ...trashRows]
        await syncTableRows(db, 'goods', mergedRows, {
          label: 'goods',
          incremental,
          deleteIds: deleteIdsByFile[fileName] || []
        })

        if (content.presets) {
          const presetsRow = {
            id: 'default',
            categories: JSON.stringify(content.presets.categories || []),
            ips: JSON.stringify(content.presets.ips || []),
            characters: JSON.stringify(content.presets.characters || []),
            storage_locations: JSON.stringify(content.presets.storageLocations || [])
          }
          const { error } = await withRetry(() =>
            db.from('sync_presets').upsert(presetsRow, { onConflict: 'id' })
          )
          if (error) console.warn('[supabase] presets upsert warning:', error.message)
        }

        // Sync goods_groups
        const goodsGroups = Array.isArray(content.goodsGroups) ? content.goodsGroups : []
        const goodsGroupDeleteIds = deleteIdsByFile.goodsGroups || []
        if (goodsGroups.length > 0 || goodsGroupDeleteIds.length > 0) {
          const groupRows = goodsGroups.map(item => toSnakeCase({
            ...pickCols(item, GOODS_GROUP_COLS),
            totalAmount: Number(item.totalAmount) || 0,
            updatedAt: toTimestamp(item.updatedAt),
            createdAt: toTimestamp(item.createdAt),
            syncedBy: currentDeviceId
          }))
          await syncTableRows(db, 'goods_groups', groupRows, {
            label: 'goods_groups',
            incremental,
            deleteIds: goodsGroupDeleteIds
          })
        }

        // Sync goods_group_items
        const goodsGroupItems = Array.isArray(content.goodsGroupItems) ? content.goodsGroupItems : []
        const goodsGroupItemDeleteIds = deleteIdsByFile.goodsGroupItems || []
        if (goodsGroupItems.length > 0 || goodsGroupItemDeleteIds.length > 0) {
          const itemRows = goodsGroupItems.map(item => toSnakeCase({
            ...pickCols(item, GOODS_GROUP_ITEM_COLS),
            sortOrder: Number(item.sortOrder) || 0,
            updatedAt: toTimestamp(item.updatedAt),
            createdAt: toTimestamp(item.createdAt),
            syncedBy: currentDeviceId
          }))
          await syncTableRows(db, 'goods_group_items', itemRows, {
            label: 'goods_group_items',
            incremental,
            deleteIds: goodsGroupItemDeleteIds
          })
        }

        continue
      }

      if (fileName === 'recharge-data.json') {
        const currentDeviceId = typeof deviceIdRef === 'function' ? deviceIdRef() : (deviceIdRef?.value || '')
        const recharge = Array.isArray(content.recharge) ? content.recharge : []
        const rechargeTrash = Array.isArray(content.rechargeTrash) ? content.rechargeTrash : []
        const rechargeRows = recharge
          .map((item) => toRechargeRow(item, currentDeviceId, false))
          .filter(Boolean)
        const rechargeTrashRows = rechargeTrash
          .map((item) => toRechargeRow(item, currentDeviceId, true))
          .filter(Boolean)
        const mergedRows = [...rechargeRows, ...rechargeTrashRows]

        await syncTableRows(db, 'recharge_records', mergedRows, {
          label: 'recharge_records',
          incremental,
          deleteIds: deleteIdsByFile[fileName] || []
        })
        continue
      }

      if (fileName === 'events-data.json') {
        const currentDeviceId = typeof deviceIdRef === 'function' ? deviceIdRef() : (deviceIdRef?.value || '')
        const events = Array.isArray(content.events) ? content.events : []
        const rows = events.map(item => toSnakeCase({
          ...pickCols(item, EVENT_COLS),
          updatedAt: toTimestamp(item.updatedAt),
          createdAt: toTimestamp(item.createdAt),
          syncedBy: currentDeviceId
        }))
        await syncTableRows(db, 'events', rows, {
          label: 'events',
          incremental,
          deleteIds: deleteIdsByFile[fileName] || []
        })
        continue
      }
    }
    })
  }

  // Strip .txt suffix from Gist-style filenames for Supabase Storage (stores binary, not base64 text)
  function toStoragePath(filePath) {
    return filePath.endsWith('.txt') ? filePath.slice(0, -4) : filePath
  }

  async function writeImages(_, imageFiles) {
    if (!imageFiles || Object.keys(imageFiles).length === 0) return
    const db = getDb()

    await trackSyncStep(i18n.global.t('sync.step.uploadSupabaseImages'), async () => {
      const entries = Object.entries(imageFiles)
      let uploaded = 0
      let failed = 0

      // Process 5 images concurrently for faster uploads
      const CONCURRENT_UPLOADS = 5
      let index = 0
      async function uploadWorker() {
        while (index < entries.length) {
          const i = index++
          const [filePath, fileObj] = entries[i]
          const storagePath = toStoragePath(filePath)
          const bucketName = resolveStorageBucketByPath(storagePath)
          try {
            if (!fileObj || !fileObj.content) {
              await db.storage.from(bucketName).remove([storagePath])
              continue
            }

            const response = await fetch(fileObj.content)
            const blob = await response.blob()
            const { error } = await db.storage.from(bucketName).upload(storagePath, blob, {
              upsert: true,
              contentType: blob.type || 'image/jpeg'
            })
            if (error) {
              console.warn(`[supabase] upload failed for ${storagePath}:`, error.message)
              failed++
            } else {
              uploaded++
            }
          } catch (e) {
            console.warn(`[supabase] upload error for ${storagePath}:`, e.message)
            failed++
          }
        }
      }

      const workers = Array.from(
        { length: Math.min(CONCURRENT_UPLOADS, entries.length) },
        () => uploadWorker()
      )
      await Promise.all(workers)

      // Invalidate image cache so next sync sees the newly uploaded files
      invalidateImageGistCache()

      return i18n.global.t('sync.step.uploadSupabaseImages.result', { uploaded, failed })
    }, {
      startDetail: i18n.global.t('sync.step.uploadSupabaseImages.start', { count: Object.keys(imageFiles).length }),
      category: 'image',
      successDetail: () => i18n.global.t('sync.step.uploadSupabaseImages.success')
    })
  }

  async function getManifest() {
    const db = getDb()
    const { data, error } = await withRetry(() =>
      db.from('sync_manifest').select('*').eq('id', 'default').limit(1)
    )
    if (error || !data || data.length === 0) return null
    const row = toCamelCase(data[0])
    return {
      ...row,
      lastSyncAt: row.syncedAt || row.lastSyncAt || '',
      imageGistId: row.imageBucket || row.imageGistId || '',
      budgetMonthly: Number(row.budgetMonthly) || 0,
      budgetYearly: Number(row.budgetYearly) || 0
    }
  }

  // ── Direct row operations (bypass JSON layer) ──

  // camelCase items → snake_case DB rows, per domain
  function toGoodsRows(items, isTrash = false) {
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

  function toEventRows(items) {
    const currentDeviceId = typeof deviceIdRef === 'function' ? deviceIdRef() : (deviceIdRef?.value || '')
    return items.map(item => toSnakeCase({
      ...pickCols(item, EVENT_COLS),
      updatedAt: toTimestamp(item.updatedAt),
      createdAt: toTimestamp(item.createdAt),
      syncedBy: currentDeviceId
    }))
  }

  function toGroupRows(items) {
    const currentDeviceId = typeof deviceIdRef === 'function' ? deviceIdRef() : (deviceIdRef?.value || '')
    return items.map(item => toSnakeCase({
      ...pickCols(item, GOODS_GROUP_COLS),
      totalAmount: Number(item.totalAmount) || 0,
      updatedAt: toTimestamp(item.updatedAt),
      createdAt: toTimestamp(item.createdAt),
      syncedBy: currentDeviceId
    }))
  }

  function toGroupItemRows(items) {
    const currentDeviceId = typeof deviceIdRef === 'function' ? deviceIdRef() : (deviceIdRef?.value || '')
    return items.map(item => toSnakeCase({
      ...pickCols(item, GOODS_GROUP_ITEM_COLS),
      sortOrder: Number(item.sortOrder) || 0,
      updatedAt: toTimestamp(item.updatedAt),
      createdAt: toTimestamp(item.createdAt),
      syncedBy: currentDeviceId
    }))
  }

  // Compute which rows actually changed (camelCase comparison, same logic as orchestrator's buildRowsDiff)
  async function computeDiffRows(localRows = [], remoteRows = []) {
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

  function computeDeleteIds(localRows = [], remoteRows = []) {
    const localIdSet = new Set(localRows.map(item => String(item?.id || '').trim()).filter(Boolean))
    const remoteIdSet = new Set(remoteRows.map(item => String(item?.id || '').trim()).filter(Boolean))
    return [...remoteIdSet].filter(id => !localIdSet.has(id))
  }

  /**
   * Push rows directly to Supabase, bypassing JSON dataMap layer.
   * Accepts camelCase items from the orchestrator, converts to snake_case, diffs, and upserts.
   *
   * @param {'goods'|'recharge'|'events'|'groups'} domain
   * @param {object} opts
   * @param {Array} opts.localItems - camelCase items from local store
   * @param {Array} [opts.remoteItems] - camelCase items from remote (for diff). If omitted, upserts all localItems.
   * @param {Array} [opts.deleteIds] - IDs to delete. If remoteItems provided, computed automatically.
   * @param {boolean} [opts.isTrash] - goods only: mark as trashed
   */
  async function pushDomainRows(domain, { localItems = [], remoteItems = null, deleteIds = null, isTrash = false } = {}) {
    const db = getDb()

    if (domain === 'goods') {
      let rowsToUpsert = toGoodsRows(localItems, isTrash)
      let idsToDelete = deleteIds
      let isIncremental = deleteIds !== null

      if (remoteItems !== null && idsToDelete === null) {
        // Diff mode: only upsert changed rows, delete stale remote rows
        const diffItems = await computeDiffRows(localItems, remoteItems)
        rowsToUpsert = toGoodsRows(diffItems, isTrash)
        idsToDelete = computeDeleteIds(localItems, remoteItems)
        isIncremental = true
      }

      await syncTableRows(db, 'goods', rowsToUpsert, {
        label: 'goods',
        incremental: isIncremental,
        deleteIds: idsToDelete || []
      })
      return
    }

    if (domain === 'recharge') {
      let rowsToUpsert = localItems.map(item => toRechargeRow(item, typeof deviceIdRef === 'function' ? deviceIdRef() : (deviceIdRef?.value || ''), isTrash)).filter(Boolean)
      let idsToDelete = deleteIds
      let isIncremental = deleteIds !== null

      if (remoteItems !== null && idsToDelete === null) {
        const diffItems = await computeDiffRows(localItems, remoteItems)
        rowsToUpsert = diffItems.map(item => toRechargeRow(item, typeof deviceIdRef === 'function' ? deviceIdRef() : (deviceIdRef?.value || ''), isTrash)).filter(Boolean)
        idsToDelete = computeDeleteIds(localItems, remoteItems)
        isIncremental = true
      }

      await syncTableRows(db, 'recharge_records', rowsToUpsert, {
        label: 'recharge_records',
        incremental: isIncremental,
        deleteIds: idsToDelete || []
      })
      return
    }

    if (domain === 'events') {
      let rowsToUpsert = toEventRows(localItems)
      let idsToDelete = deleteIds
      let isIncremental = deleteIds !== null

      if (remoteItems !== null && idsToDelete === null) {
        const diffItems = await computeDiffRows(localItems, remoteItems)
        rowsToUpsert = toEventRows(diffItems)
        idsToDelete = computeDeleteIds(localItems, remoteItems)
        isIncremental = true
      }

      await syncTableRows(db, 'events', rowsToUpsert, {
        label: 'events',
        incremental: isIncremental,
        deleteIds: idsToDelete || []
      })
      return
    }

    if (domain === 'groups') {
      let rowsToUpsert = toGroupRows(localItems)
      let idsToDelete = deleteIds
      let isIncremental = deleteIds !== null

      if (remoteItems !== null && idsToDelete === null) {
        const diffItems = await computeDiffRows(localItems, remoteItems)
        rowsToUpsert = toGroupRows(diffItems)
        idsToDelete = computeDeleteIds(localItems, remoteItems)
        isIncremental = true
      }

      await syncTableRows(db, 'goods_groups', rowsToUpsert, {
        label: 'goods_groups',
        incremental: isIncremental,
        deleteIds: idsToDelete || []
      })
      return
    }

    if (domain === 'groupItems') {
      let rowsToUpsert = toGroupItemRows(localItems)
      let idsToDelete = deleteIds
      let isIncremental = deleteIds !== null

      if (remoteItems !== null && idsToDelete === null) {
        const diffItems = await computeDiffRows(localItems, remoteItems)
        rowsToUpsert = toGroupItemRows(diffItems)
        idsToDelete = computeDeleteIds(localItems, remoteItems)
        isIncremental = true
      }

      await syncTableRows(db, 'goods_group_items', rowsToUpsert, {
        label: 'goods_group_items',
        incremental: isIncremental,
        deleteIds: idsToDelete || []
      })
      return
    }
  }

  /**
   * Pull rows directly from Supabase, returning camelCase objects (no JSON wrapper).
   *
   * @param {'goods'|'recharge'|'events'|'groups'|'groupItems'} domain
   * @param {object} [opts]
   * @param {number} [opts.since] - incremental: only rows updated after this timestamp (ms)
   * @returns {Array|object} camelCase items (goods returns { goods, trash })
   */
  async function pullDomainRows(domain, { since = 0 } = {}) {
    const db = getDb()
    const sinceMs = Number(since) || 0

    if (domain === 'goods') {
      const buildQuery = (trashed) => () => {
        let query = db.from('goods').select(GOODS_SELECT_COLS)
        query = trashed ? query.eq('trashed', 1) : query.or('trashed.is.null,trashed.eq.0')
        if (sinceMs > 0) query = query.gt('updated_at', new Date(sinceMs).toISOString())
        return query
      }
      const [goodsData, trashData] = await Promise.all([
        fetchAllRows(buildQuery(false)),
        fetchAllRows(buildQuery(true))
      ])
      const mapRow = (row) => {
        const item = toCamelCase(row)
        item.isWishlist = Number(item.isWishlist) === 1
        item.saleReminderEnabled = Number(item.saleReminderEnabled) === 1
        item.quantity = Number(item.quantity) || 1
        item.updatedAt = normalizeTimestamp(item.updatedAt)
        return item
      }
      return {
        goods: (goodsData || []).map(mapRow),
        trash: (trashData || []).map(mapRow)
      }
    }

    if (domain === 'recharge') {
      const data = await fetchAllRows(() => {
        let query = db.from('recharge_records').select(RECHARGE_SELECT_COLS)
        if (sinceMs > 0) query = query.gt('updated_at', new Date(sinceMs).toISOString())
        return query
      })
      const recharge = []
      const rechargeTrash = []
      for (const row of (data || [])) {
        const item = toCamelCase(row)
        item.updatedAt = normalizeTimestamp(item.updatedAt)
        if (Number(row.deleted) === 1) rechargeTrash.push(item)
        else recharge.push(item)
      }
      return { recharge, rechargeTrash }
    }

    if (domain === 'events') {
      const data = await fetchAllRows(() => {
        let query = db.from('events').select(EVENT_SELECT_COLS)
        if (sinceMs > 0) query = query.gt('updated_at', new Date(sinceMs).toISOString())
        return query
      })
      return (data || []).map(row => {
        const item = toCamelCase(row)
        item.updatedAt = normalizeTimestamp(item.updatedAt)
        item.createdAt = normalizeTimestamp(item.createdAt)
        item.coverImageData = safeParseJsonArray(item.coverImageData) || {}
        if (typeof item.coverImageData !== 'object') item.coverImageData = {}
        item.photos = safeParseJsonArray(item.photos)
        item.linkedGoodsIds = safeParseJsonArray(item.linkedGoodsIds)
        item.tags = safeParseJsonArray(item.tags)
        item.tracks = safeParseJsonArray(item.tracks)
        item.otherExpenses = safeParseJsonArray(item.otherExpenses)
        return item
      })
    }

    if (domain === 'groups') {
      const data = await fetchAllRows(() => {
        let query = db.from('goods_groups').select(GOODS_GROUP_SELECT_COLS)
        if (sinceMs > 0) query = query.gt('updated_at', new Date(sinceMs).toISOString())
        return query
      })
      return (data || []).map(row => {
        const item = toCamelCase(row)
        item.updatedAt = normalizeTimestamp(item.updatedAt)
        item.createdAt = normalizeTimestamp(item.createdAt)
        return item
      })
    }

    if (domain === 'groupItems') {
      const data = await fetchAllRows(() => {
        let query = db.from('goods_group_items').select(GOODS_GROUP_ITEM_SELECT_COLS)
        if (sinceMs > 0) query = query.gt('updated_at', new Date(sinceMs).toISOString())
        return query
      })
      return (data || []).map(row => {
        const item = toCamelCase(row)
        item.updatedAt = normalizeTimestamp(item.updatedAt)
        item.createdAt = normalizeTimestamp(item.createdAt)
        return item
      })
    }

    return []
  }

  // ── Supabase-specific helpers ──

  function getDataGistId() {
    return 'supabase-data'
  }

  async function getDataGist() {
    return { id: 'supabase-data' }
  }

  function getImagePublicUrl(filePath) {
    const db = getDb()
    const storagePath = toStoragePath(filePath)
    const bucketName = resolveStorageBucketByPath(storagePath)
    const { data } = db.storage.from(bucketName).getPublicUrl(storagePath)
    return data?.publicUrl || ''
  }

  function isEncryptionEnabled() {
    return false
  }

  return createSyncBackendAdapter({
    ensureDataGist,
    ensureImageGist,
    ensureRechargeGist,
    ensureEventGist,
    getExistingImageGist,
    getExistingRechargeGist,
    getExistingEventGist,
    readJson,
    readImage,
    writeData,
    writeImages,
    getManifest,
    isEncryptionEnabled,
    getDataGistId,
    getDataGist,
    getImagePublicUrl,
    pushDomainRows,
    pullDomainRows,
    getDb
  })
}
