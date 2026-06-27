// src/services/supabaseAdapter/writer.js
// Supabase write operations: writeData, pushDomainRows, writeManifest, writePresets

import { toSnakeCase } from '@/utils/sync/columnMapping'
import { withRetry, withTimeout } from '@/services/syncRetry'
import i18n from '@/locales'
import {
  GOODS_COLS, EVENT_COLS, RECHARGE_COLS, GOODS_GROUP_COLS, GOODS_GROUP_ITEM_COLS,
  pickCols, toTimestamp, syncTableRows,
  toGoodsRows, toEventRows, toGroupRows, toGroupItemRows, toRechargeRow,
  computeDiffRows, computeDeleteIds
} from './helpers'

export function createWriter({ getDb, deviceIdRef }) {
  /**
   * Write data via JSON dataMap interface (legacy Gist-compatible path).
   * Supabase implementation: converts JSON content to rows and upserts.
   */
  async function writeData(_, dataMap, options = {}) {
    return withTimeout(async () => {
    const db = getDb()
    const incremental = options?.incremental === true
    const deleteIdsByFile = options?.deleteIdsByFile || {}

    for (const [fileName, entry] of Object.entries(dataMap)) {
      const content = entry.content

      if (fileName === 'manifest.json') {
        await writeManifest(content)
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
          await writePresets(content.presets)
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

  async function writeManifest(manifestContent) {
    const db = getDb()
    // accept either object or JSON string
    if (typeof manifestContent === 'string') {
      try { manifestContent = JSON.parse(manifestContent) } catch { manifestContent = {} }
    }

    // 调 RPC：传入非 count 字段，Supabase 内部计算 count 并 upsert 整行
    const { error } = await withRetry(() => db.rpc('upsert_manifest', {
      p_device_id: manifestContent.deviceId || '',
      p_synced_at: manifestContent.lastSyncAt || manifestContent.updatedAt || new Date().toISOString(),
      p_image_bucket: manifestContent.imageGistId || manifestContent.imageBucket || 'goods-images',
      p_recharge_updated_at: manifestContent.rechargeUpdatedAt || null,
      p_event_updated_at: manifestContent.eventUpdatedAt || null,
      p_budget_monthly: Number(manifestContent.budgetMonthly) || 0,
      p_budget_yearly: Number(manifestContent.budgetYearly) || 0
    }))

    if (error) {
      const isMissingFunc = String(error.message || '').includes('function') || String(error.message || '').includes('signature')
      if (!isMissingFunc) throw new Error(i18n.global.t('sync.error.supabaseWriteManifestFailed', { error: error.message }))

      // RPC 不存在时 fallback：直接 upsert（count 字段为 0）
      const manifestRow = toSnakeCase({
        id: 'default',
        syncedAt: manifestContent.lastSyncAt || manifestContent.updatedAt || new Date().toISOString(),
        deviceId: manifestContent.deviceId || '',
        collectionCount: 0, wishlistCount: 0, goodsCount: 0,
        trashCount: 0, rechargeCount: 0, eventCount: 0, imageCount: 0,
        imageBucket: manifestContent.imageGistId || manifestContent.imageBucket || 'goods-images',
        rechargeUpdatedAt: manifestContent.rechargeUpdatedAt || null,
        eventUpdatedAt: manifestContent.eventUpdatedAt || null,
        budgetMonthly: Number(manifestContent.budgetMonthly) || 0,
        budgetYearly: Number(manifestContent.budgetYearly) || 0
      })
      const { error: fallbackError } = await withRetry(() =>
        db.from('sync_manifest').upsert(manifestRow)
      )
      if (fallbackError) throw new Error(i18n.global.t('sync.error.supabaseWriteManifestFailed', { error: fallbackError.message }))
    }
  }

  async function writePresets(presetsData) {
    const db = getDb()
    const presetsRow = {
      id: 'default',
      categories: JSON.stringify(presetsData.categories || []),
      ips: JSON.stringify(presetsData.ips || []),
      characters: JSON.stringify(presetsData.characters || []),
      storage_locations: JSON.stringify(presetsData.storageLocations || [])
    }
    const { error } = await withRetry(() =>
      db.from('sync_presets').upsert(presetsRow, { onConflict: 'id' })
    )
    if (error) console.warn('[supabase] presets upsert warning:', error.message)
  }

  /**
   * Push rows directly to Supabase, bypassing JSON dataMap layer.
   * Accepts camelCase items from the orchestrator, converts to snake_case, diffs, and upserts.
   *
   * @param {'goods'|'recharge'|'events'|'groups'|'groupItems'} domain
   * @param {object} opts
   * @param {Array} opts.localItems - camelCase items from local store
   * @param {Array} [opts.remoteItems] - camelCase items from remote (for diff). If omitted, upserts all localItems.
   * @param {Array} [opts.deleteIds] - IDs to delete. If remoteItems provided, computed automatically.
   * @param {boolean} [opts.isTrash] - goods only: mark as trashed
   */
  async function pushDomainRows(domain, { localItems = [], remoteItems = null, deleteIds = null, isTrash = false } = {}) {
    const db = getDb()

    if (domain === 'goods') {
      let rowsToUpsert = toGoodsRows(localItems, deviceIdRef, isTrash)
      let idsToDelete = deleteIds
      let isIncremental = deleteIds !== null

      if (remoteItems !== null && idsToDelete === null) {
        const diffItems = await computeDiffRows(localItems, remoteItems)
        rowsToUpsert = toGoodsRows(diffItems, deviceIdRef, isTrash)
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
      const currentDeviceId = typeof deviceIdRef === 'function' ? deviceIdRef() : (deviceIdRef?.value || '')
      let rowsToUpsert = localItems.map(item => toRechargeRow(item, currentDeviceId, isTrash)).filter(Boolean)
      let idsToDelete = deleteIds
      let isIncremental = deleteIds !== null

      if (remoteItems !== null && idsToDelete === null) {
        const diffItems = await computeDiffRows(localItems, remoteItems)
        rowsToUpsert = diffItems.map(item => toRechargeRow(item, currentDeviceId, isTrash)).filter(Boolean)
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
      let rowsToUpsert = toEventRows(localItems, deviceIdRef)
      let idsToDelete = deleteIds
      let isIncremental = deleteIds !== null

      if (remoteItems !== null && idsToDelete === null) {
        const diffItems = await computeDiffRows(localItems, remoteItems)
        rowsToUpsert = toEventRows(diffItems, deviceIdRef)
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
      let rowsToUpsert = toGroupRows(localItems, deviceIdRef)
      let idsToDelete = deleteIds
      let isIncremental = deleteIds !== null

      if (remoteItems !== null && idsToDelete === null) {
        const diffItems = await computeDiffRows(localItems, remoteItems)
        rowsToUpsert = toGroupRows(diffItems, deviceIdRef)
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
      let rowsToUpsert = toGroupItemRows(localItems, deviceIdRef)
      let idsToDelete = deleteIds
      let isIncremental = deleteIds !== null

      if (remoteItems !== null && idsToDelete === null) {
        const diffItems = await computeDiffRows(localItems, remoteItems)
        rowsToUpsert = toGroupItemRows(diffItems, deviceIdRef)
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

  async function pushAll({
    goods = [], goodsTrash = [], groups = [], groupItems = [],
    recharge = [], rechargeTrash = [], events = [],
    presets = null,
    deleteGoods = [], deleteGroups = [], deleteGroupItems = [],
    deleteRecharge = [], deleteEvents = [],
    deviceId = '', syncedAt = new Date().toISOString(),
    imageBucket = 'goods-images',
    budgetMonthly = 0, budgetYearly = 0,
    rechargeUpdatedAt = null, eventUpdatedAt = null
  } = {}) {
    const db = getDb()
    const currentDeviceId = typeof deviceIdRef === 'function' ? deviceIdRef() : (deviceIdRef?.value || '') || deviceId

    const { error } = await withRetry(() => db.rpc('sync_push', {
      p_goods: toGoodsRows(goods, deviceIdRef, false),
      p_goods_trash: toGoodsRows(goodsTrash, deviceIdRef, true),
      p_groups: toGroupRows(groups, deviceIdRef),
      p_group_items: toGroupItemRows(groupItems, deviceIdRef),
      p_recharge: recharge.map(r => toRechargeRow(r, currentDeviceId, false)).filter(Boolean),
      p_recharge_trash: rechargeTrash.map(r => toRechargeRow(r, currentDeviceId, true)).filter(Boolean),
      p_events: toEventRows(events, deviceIdRef),
      p_presets: presets ? {
        categories: JSON.stringify(presets.categories || []),
        ips: JSON.stringify(presets.ips || []),
        characters: JSON.stringify(presets.characters || []),
        storage_locations: JSON.stringify(presets.storageLocations || [])
      } : {},
      p_delete_goods: deleteGoods || [],
      p_delete_groups: deleteGroups || [],
      p_delete_group_items: deleteGroupItems || [],
      p_delete_recharge: deleteRecharge || [],
      p_delete_events: deleteEvents || [],
      p_device_id: currentDeviceId,
      p_synced_at: syncedAt,
      p_image_bucket: imageBucket,
      p_budget_monthly: budgetMonthly,
      p_budget_yearly: budgetYearly,
      p_recharge_updated_at: rechargeUpdatedAt || null,
      p_event_updated_at: eventUpdatedAt || null
    }))

    if (error) throw new Error(i18n.global.t('sync.error.supabaseWriteManifestFailed', { error: error.message }))
  }

  return { writeData, writeManifest, writePresets, pushDomainRows, pushAll }
}
