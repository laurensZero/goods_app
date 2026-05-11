// src/services/supabaseBackendAdapter.js
import { createSyncBackendAdapter } from './syncBackendAdapter'
import { getSupabaseClient } from '@/utils/supabaseClient'
import { toSnakeCase, toCamelCase, mapRowsToCamelCase } from '@/utils/syncColumnMapping'
import { withRetry } from './syncRetry'

export function createSupabaseBackendAdapter({
  trackSyncStep
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
  const GOODS_COLS = ['id', 'name', 'category', 'ip', 'goodsId', 'isWishlist', 'characters', 'tags', 'storageLocation', 'variant', 'price', 'actualPrice', 'acquiredAt', 'unitAcquiredAtList', 'unitActualPriceList', 'unitCharacterList', 'image', 'images', 'tracks', 'note', 'quantity', 'points', 'currency', 'actualPriceCurrency', 'collectStatus', 'shippingFee']
  const EVENT_COLS = ['id', 'name', 'type', 'startDate', 'endDate', 'location', 'description', 'coverImage', 'coverImageData', 'photos', 'ticketPrice', 'ticketType', 'seatInfo', 'tracks', 'linkedGoodsIds', 'tags']
  const RECHARGE_COLS = ['id', 'game', 'itemName', 'amount', 'chargedAt', 'note', 'image']

  function pickCols(item, allowed) {
    const result = {}
    for (const key of allowed) {
      if (item[key] !== undefined) result[key] = item[key]
    }
    return result
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

  function normalizeBucketName(bucketLike) {
    if (typeof bucketLike === 'string' && bucketLike.trim()) return bucketLike.trim()
    if (bucketLike && typeof bucketLike === 'object') {
      const candidate = bucketLike.id || bucketLike.bucket || bucketLike.bucketName || bucketLike.name || bucketLike.imageBucket || bucketLike.imageGistId
      if (typeof candidate === 'string' && candidate.trim()) return candidate.trim()
    }
    return 'goods-images'
  }

  function normalizeId(value) {
    return String(value ?? '')
  }

  async function deleteRowsByIds(db, tableName, ids) {
    if (!ids || ids.length === 0) return
    const chunkSize = 500
    for (let i = 0; i < ids.length; i += chunkSize) {
      const chunk = ids.slice(i, i + chunkSize)
      const { error } = await withRetry(() =>
        db.from(tableName).delete().in('id', chunk)
      )
      if (error) throw new Error(`删除 ${tableName} 旧记录失败: ${error.message}`)
    }
  }

  // ── Ensure operations (no-op for Supabase, tables are pre-created) ──

  async function ensureDataGist() {
    return { id: 'supabase-data' }
  }

  async function ensureImageGist() {
    const db = getDb()
    const bucketName = 'goods-images'
    const { data, error } = await db.storage.getBucket(bucketName)
    if (data) return { id: bucketName }

    if (error && !isBucketNotFoundError(error)) {
      throw new Error(`读取 bucket 失败: ${error.message}`)
    }

    const { error: createError } = await db.storage.createBucket(bucketName, { public: true })
    if (createError && !isBucketAlreadyExistsError(createError)) {
      throw new Error(`创建 bucket 失败: ${createError.message}`)
    }
    return { id: bucketName }
  }

  async function ensureRechargeGist() {
    return { id: 'supabase-recharge' }
  }

  async function ensureEventGist() {
    return { id: 'supabase-events' }
  }

  // ── Existing lookups ──

  async function getExistingImageGist() {
    const db = getDb()
    const { data, error } = await db.storage.from('goods-images').list('', { limit: 10000 })
    if (error || !data) return { id: 'goods-images', files: {} }
    const files = {}
    for (const file of data) {
      if (!file.name || file.name === '.emptyFolderPlaceholder') continue
      files[file.name] = { name: file.name }
      files[file.name + '.txt'] = { name: file.name }
    }
    return { id: 'goods-images', files }
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
    successDetail = null
  }) {
    const result = await trackSyncStep(title, async () => {
      const db = getDb()

      if (fileName === 'data.json') {
        const [goodsRes, trashRes, presetsRes] = await Promise.all([
          withRetry(() => db.from('goods').select('*').eq('trashed', 0)),
          withRetry(() => db.from('goods').select('*').eq('trashed', 1)),
          withRetry(() => db.from('sync_presets').select('*').eq('id', 'default').limit(1))
        ])
        if (goodsRes.error) throw new Error(`读取 goods 失败: ${goodsRes.error.message}`)
        if (trashRes.error) throw new Error(`读取 trash 失败: ${trashRes.error.message}`)

        const presets = presetsRes.data && presetsRes.data.length > 0 ? toCamelCase(presetsRes.data[0]) : { categories: '[]', ips: '[]', characters: '[]', storageLocations: '[]' }
        return {
          parsed: {
            goods: mapRowsToCamelCase(goodsRes.data || []),
            trash: mapRowsToCamelCase(trashRes.data || []),
            presets: {
              categories: safeParseJsonArray(presets.categories),
              ips: safeParseJsonArray(presets.ips),
              characters: safeParseJsonArray(presets.characters),
              storageLocations: safeParseJsonArray(presets.storageLocations)
            }
          },
          source: 'Supabase'
        }
      }

      if (fileName === 'recharge-data.json') {
        const { data, error } = await withRetry(() =>
          db.from('recharge_records').select('*').eq('deleted', 0)
        )
        if (error) throw new Error(`读取 recharge 失败: ${error.message}`)
        return {
          parsed: { recharge: mapRowsToCamelCase(data || []), rechargeTrash: [] },
          source: 'Supabase'
        }
      }

      if (fileName === 'events-data.json') {
        const { data, error } = await withRetry(() =>
          db.from('events').select('*')
        )
        if (error) throw new Error(`读取 events 失败: ${error.message}`)
        return {
          parsed: { events: mapRowsToCamelCase(data || []) },
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
    }, {
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
    const bucketName = normalizeBucketName(bucket)
    const storagePath = toStoragePath(filePath)
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

  async function writeData(_, dataMap) {
    const db = getDb()

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
          imageCount: imageCountVal,
          goodsCount: goodsCountVal,
          trashCount: manifestContent.trashCount || 0,
          rechargeCount: manifestContent.rechargeCount || 0,
          eventCount: manifestContent.eventCount || 0,
          imageBucket: manifestContent.imageGistId || manifestContent.imageBucket || 'goods-images'
        })
        const { error } = await withRetry(() =>
          db.from('sync_manifest').upsert(manifestRow)
        )
        if (error) throw new Error(`写入 manifest 失败: ${error.message}`)
        continue
      }

      if (fileName === 'data.json') {
        const goods = Array.isArray(content.goods) ? content.goods : []
        const trash = Array.isArray(content.trash) ? content.trash : []

        const goodsRows = goods.map(item => toSnakeCase({
          ...pickCols(item, GOODS_COLS),
          isWishlist: item.isWishlist ? 1 : 0,
          trashed: 0,
          quantity: Number(item.quantity) || 1,
          points: item.points != null ? Number(item.points) : null,
          updatedAt: toTimestamp(item.updatedAt)
        }))
        const trashRows = trash.map(item => toSnakeCase({
          ...pickCols(item, GOODS_COLS),
          isWishlist: item.isWishlist ? 1 : 0,
          trashed: 1,
          quantity: Number(item.quantity) || 1,
          points: item.points != null ? Number(item.points) : null,
          updatedAt: toTimestamp(item.updatedAt)
        }))
        const mergedRows = [...goodsRows, ...trashRows]

        if (mergedRows.length > 0) {
          const { error } = await withRetry(() =>
            db.from('goods').upsert(mergedRows, { onConflict: 'id' })
          )
          if (error) throw new Error(`写入 data.json 失败: ${error.message}`)
        }

        const incomingIdSet = new Set(
          mergedRows
            .map((row) => row.id)
            .filter((id) => id !== undefined && id !== null && id !== '')
            .map(normalizeId)
        )
        if (incomingIdSet.size === 0) {
          const { error } = await withRetry(() =>
            db.from('goods').delete().neq('id', '')
          )
          if (error) throw new Error(`清空 goods 失败: ${error.message}`)
        } else {
          const { data: existingRows, error: existingError } = await withRetry(() =>
            db.from('goods').select('id')
          )
          if (existingError) throw new Error(`读取 goods 现有记录失败: ${existingError.message}`)
          const staleIds = (existingRows || [])
            .map((row) => row.id)
            .filter((id) => !incomingIdSet.has(normalizeId(id)))
          await deleteRowsByIds(db, 'goods', staleIds)
        }

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
        continue
      }

      if (fileName === 'recharge-data.json') {
        const recharge = Array.isArray(content.recharge) ? content.recharge : []
        const rechargeTrash = Array.isArray(content.rechargeTrash) ? content.rechargeTrash : []
        const rechargeRows = recharge.map(item => toSnakeCase({
          ...pickCols(item, RECHARGE_COLS),
          amount: Number(item.amount) || 0,
          deleted: 0,
          updatedAt: toTimestamp(item.updatedAt)
        }))
        const rechargeTrashRows = rechargeTrash.map(item => toSnakeCase({
          ...pickCols(item, RECHARGE_COLS),
          amount: Number(item.amount) || 0,
          deleted: 1,
          updatedAt: toTimestamp(item.updatedAt)
        }))
        const mergedRows = [...rechargeRows, ...rechargeTrashRows]

        if (mergedRows.length > 0) {
          const { error } = await withRetry(() =>
            db.from('recharge_records').upsert(mergedRows, { onConflict: 'id' })
          )
          if (error) throw new Error(`写入 recharge 失败: ${error.message}`)
        }

        const incomingIdSet = new Set(
          mergedRows
            .map((row) => row.id)
            .filter((id) => id !== undefined && id !== null && id !== '')
            .map(normalizeId)
        )
        if (incomingIdSet.size === 0) {
          const { error } = await withRetry(() =>
            db.from('recharge_records').delete().neq('id', '')
          )
          if (error) throw new Error(`清空 recharge_records 失败: ${error.message}`)
        } else {
          const { data: existingRows, error: existingError } = await withRetry(() =>
            db.from('recharge_records').select('id')
          )
          if (existingError) throw new Error(`读取 recharge 现有记录失败: ${existingError.message}`)
          const staleIds = (existingRows || [])
            .map((row) => row.id)
            .filter((id) => !incomingIdSet.has(normalizeId(id)))
          await deleteRowsByIds(db, 'recharge_records', staleIds)
        }
        continue
      }

      if (fileName === 'events-data.json') {
        const events = Array.isArray(content.events) ? content.events : []
        const rows = events.map(item => toSnakeCase({
          ...pickCols(item, EVENT_COLS),
          updatedAt: toTimestamp(item.updatedAt),
          createdAt: toTimestamp(item.createdAt)
        }))
        if (rows.length > 0) {
          const { error } = await withRetry(() =>
            db.from('events').upsert(rows, { onConflict: 'id' })
          )
          if (error) throw new Error(`写入 events 失败: ${error.message}`)
        }

        const incomingIdSet = new Set(
          rows
            .map((row) => row.id)
            .filter((id) => id !== undefined && id !== null && id !== '')
            .map(normalizeId)
        )
        if (incomingIdSet.size === 0) {
          const { error } = await withRetry(() =>
            db.from('events').delete().neq('id', '')
          )
          if (error) throw new Error(`清空 events 失败: ${error.message}`)
        } else {
          const { data: existingRows, error: existingError } = await withRetry(() =>
            db.from('events').select('id')
          )
          if (existingError) throw new Error(`读取 events 现有记录失败: ${existingError.message}`)
          const staleIds = (existingRows || [])
            .map((row) => row.id)
            .filter((id) => !incomingIdSet.has(normalizeId(id)))
          await deleteRowsByIds(db, 'events', staleIds)
        }
        continue
      }
    }
  }

  // Strip .txt suffix from Gist-style filenames for Supabase Storage (stores binary, not base64 text)
  function toStoragePath(filePath) {
    return filePath.endsWith('.txt') ? filePath.slice(0, -4) : filePath
  }

  async function writeImages(_, imageFiles) {
    if (!imageFiles || Object.keys(imageFiles).length === 0) return
    const db = getDb()

    await trackSyncStep('上传图片到 Supabase Storage', async () => {
      const entries = Object.entries(imageFiles)
      let uploaded = 0
      let failed = 0

      for (const [filePath, fileObj] of entries) {
        const storagePath = toStoragePath(filePath)
        try {
          if (!fileObj || !fileObj.content) {
            await db.storage.from('goods-images').remove([storagePath])
            continue
          }

          const response = await fetch(fileObj.content)
          const blob = await response.blob()
          const { error } = await db.storage.from('goods-images').upload(storagePath, blob, {
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

      return `上传完成: ${uploaded} 成功, ${failed} 失败`
    }, {
      startDetail: `上传 ${Object.keys(imageFiles).length} 张图片`,
      category: 'image',
      successDetail: () => '图片已上传到 Supabase Storage'
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
      imageGistId: row.imageBucket || row.imageGistId || ''
    }
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
    const { data } = db.storage.from('goods-images').getPublicUrl(storagePath)
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
    getImagePublicUrl
  })
}
