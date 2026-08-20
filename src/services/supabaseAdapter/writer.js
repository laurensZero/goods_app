// src/services/supabaseAdapter/writer.js
// Supabase write operations: pushAll, writeManifest, writePresets

import { toSnakeCase } from '@/utils/sync/columnMapping'
import { withRetry } from '@/services/syncRetry'
import i18n from '@/locales'
import {
  syncTableRows,
  toGoodsRows, toEventRows, toGroupRows, toGroupItemRows, toRechargeRow,
  computeDiffRows, computeDeleteIds
} from './helpers'

export function createWriter({ getDb, deviceIdRef, userIdRef }) {
  async function writeManifest(manifestContent) {
    const db = getDb()
    const currentUserId = typeof userIdRef === 'function' ? userIdRef() : (userIdRef?.value || '')
    if (typeof manifestContent === 'string') {
      try { manifestContent = JSON.parse(manifestContent) } catch { manifestContent = {} }
    }

    const manifestRow = toSnakeCase({
      syncedAt: manifestContent.lastSyncAt || manifestContent.updatedAt || new Date().toISOString(),
      deviceId: manifestContent.deviceId || '',
      collectionCount: 0, wishlistCount: 0, goodsCount: 0,
      trashCount: 0, rechargeCount: 0, eventCount: 0, imageCount: 0,
      imageBucket: manifestContent.imageCloudId || manifestContent.imageBucket || 'goods-images',
      rechargeUpdatedAt: manifestContent.rechargeUpdatedAt || null,
      eventUpdatedAt: manifestContent.eventUpdatedAt || null,
      budgetMonthly: Number(manifestContent.budgetMonthly) || 0,
      budgetYearly: Number(manifestContent.budgetYearly) || 0,
      userId: currentUserId || null
    })

    const { error } = await withRetry(() =>
      db.from('sync_manifest').upsert(manifestRow, { onConflict: 'user_id' })
    )
    if (error) throw new Error(i18n.global.t('sync.error.supabaseWriteManifestFailed', { error: error.message }))
  }

  // 设备心跳 upsert：每次同步调用一次，记录 platform / apk_version / bundle_version / last_seen_at。
  // 用 onConflict: 'device_id'，不写 force_resync_at（管理员设的强制重同步标记得以保留）。
  // last_seen_at 由服务端触发器恒取 now()，此处不必传。
  async function writeDeviceHeartbeat({ platform = '', apkVersion = '', bundleVersion = '', manufacturer = '', model = '' } = {}) {
    const db = getDb()
    const currentDeviceId = typeof deviceIdRef === 'function' ? deviceIdRef() : (deviceIdRef?.value || '')
    const currentUserId = typeof userIdRef === 'function' ? userIdRef() : (userIdRef?.value || '')
    if (!currentDeviceId || !currentUserId) return
    const row = {
      device_id: currentDeviceId,
      user_id: currentUserId,
      platform: String(platform || ''),
      apk_version: String(apkVersion || ''),
      bundle_version: String(bundleVersion || ''),
      manufacturer: String(manufacturer || ''),
      model: String(model || '')
    }
    const { error } = await withRetry(() =>
      db.from('devices').upsert(row, { onConflict: 'device_id' })
    )
    if (error) console.warn('[supabase] device heartbeat upsert warning:', error.message)
  }

  // 消费强制重同步标记后清除服务端字段，让 admin「待重同步」随消费消失。
  // 只清自己读到的那个值：若 admin 在消费过程中又设了更新的标记，则不误清。
  async function clearDeviceForceResync(forceResyncAt = '') {
    const db = getDb()
    const currentDeviceId = typeof deviceIdRef === 'function' ? deviceIdRef() : (deviceIdRef?.value || '')
    if (!currentDeviceId) return
    let query = db.from('devices').update({ force_resync_at: null }).eq('device_id', currentDeviceId)
    if (forceResyncAt) query = query.eq('force_resync_at', forceResyncAt)
    const { error } = await withRetry(() => query)
    if (error) console.warn('[supabase] device force_resync clear warning:', error.message)
  }

  async function writePresets(presetsData) {
    const db = getDb()
    const currentUserId = typeof userIdRef === 'function' ? userIdRef() : (userIdRef?.value || '')
    const presetsRow = {
      categories: JSON.stringify(presetsData.categories || []),
      ips: JSON.stringify(presetsData.ips || []),
      characters: JSON.stringify(presetsData.characters || []),
      storage_locations: JSON.stringify(presetsData.storageLocations || []),
      user_id: currentUserId || null
    }
    const { error } = await withRetry(() =>
      db.from('sync_presets').upsert(presetsRow, { onConflict: 'user_id' })
    )
    if (error) console.warn('[supabase] presets upsert warning:', error.message)
  }

  /**
   * Push rows directly to Supabase.
   * Accepts camelCase items from the orchestrator, converts to snake_case, diffs, and upserts.
   */
  async function pushDomainRows(domain, { localItems = [], remoteItems = null, deleteIds = null, isTrash = false } = {}) {
    const db = getDb()
    const currentDeviceId = typeof deviceIdRef === 'function' ? deviceIdRef() : (deviceIdRef?.value || '')
    const currentUserId = typeof userIdRef === 'function' ? userIdRef() : (userIdRef?.value || '')

    if (domain === 'goods') {
      let rowsToUpsert = toGoodsRows(localItems, deviceIdRef, isTrash, currentUserId)
      let idsToDelete = deleteIds
      let isIncremental = deleteIds !== null

      if (remoteItems !== null && idsToDelete === null) {
        const diffItems = await computeDiffRows(localItems, remoteItems)
        rowsToUpsert = toGoodsRows(diffItems, deviceIdRef, isTrash, currentUserId)
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
      let rowsToUpsert = localItems.map(item => toRechargeRow(item, currentDeviceId, isTrash, currentUserId)).filter(Boolean)
      let idsToDelete = deleteIds
      let isIncremental = deleteIds !== null

      if (remoteItems !== null && idsToDelete === null) {
        const diffItems = await computeDiffRows(localItems, remoteItems)
        rowsToUpsert = diffItems.map(item => toRechargeRow(item, currentDeviceId, isTrash, currentUserId)).filter(Boolean)
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
      let rowsToUpsert = toEventRows(localItems, deviceIdRef, currentUserId)
      let idsToDelete = deleteIds
      let isIncremental = deleteIds !== null

      if (remoteItems !== null && idsToDelete === null) {
        const diffItems = await computeDiffRows(localItems, remoteItems)
        rowsToUpsert = toEventRows(diffItems, deviceIdRef, currentUserId)
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
      let rowsToUpsert = toGroupRows(localItems, deviceIdRef, currentUserId)
      let idsToDelete = deleteIds
      let isIncremental = deleteIds !== null

      if (remoteItems !== null && idsToDelete === null) {
        const diffItems = await computeDiffRows(localItems, remoteItems)
        rowsToUpsert = toGroupRows(diffItems, deviceIdRef, currentUserId)
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
      let rowsToUpsert = toGroupItemRows(localItems, deviceIdRef, currentUserId)
      let idsToDelete = deleteIds
      let isIncremental = deleteIds !== null

      if (remoteItems !== null && idsToDelete === null) {
        const diffItems = await computeDiffRows(localItems, remoteItems)
        rowsToUpsert = toGroupItemRows(diffItems, deviceIdRef, currentUserId)
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
    goods = [], goodsTrash = [], groups = [], groupsTrash = [], groupItems = [], groupItemsTrash = [],
    recharge = [], rechargeTrash = [], events = [], eventsTrash = [],
    presets = null,
    deleteGoods = [], deleteGroups = [], deleteGroupItems = [],
    deleteRecharge = [], deleteEvents = [],
    deviceId = '', syncedAt = new Date().toISOString(),
    imageBucket = 'goods-images',
    budgetMonthly = 0, budgetYearly = 0,
    rechargeUpdatedAt = null, eventUpdatedAt = null
  } = {}) {
    const db = getDb()
    const currentDeviceId = typeof deviceIdRef === 'function' ? deviceIdRef() : (deviceIdRef?.value || '')
    const currentUserId = typeof userIdRef === 'function' ? userIdRef() : (userIdRef?.value || '')

    const { data, error } = await withRetry(() => db.rpc('sync_push', {
      p_goods: toGoodsRows(goods, deviceIdRef, false, currentUserId),
      p_goods_trash: toGoodsRows(goodsTrash, deviceIdRef, true, currentUserId),
      p_groups: toGroupRows(groups, deviceIdRef, currentUserId, false),
      p_groups_trash: toGroupRows(groupsTrash, deviceIdRef, currentUserId, true),
      p_group_items: toGroupItemRows(groupItems, deviceIdRef, currentUserId, false),
      p_group_items_trash: toGroupItemRows(groupItemsTrash, deviceIdRef, currentUserId, true),
      p_recharge: recharge.map(r => toRechargeRow(r, currentDeviceId, false, currentUserId)).filter(Boolean),
      p_recharge_trash: rechargeTrash.map(r => toRechargeRow(r, currentDeviceId, true, currentUserId)).filter(Boolean),
      p_events: toEventRows(events, deviceIdRef, currentUserId, false),
      p_events_trash: toEventRows(eventsTrash, deviceIdRef, currentUserId, true),
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

    // 新版 sync_push RPC 返回 { synced_at: <服务器时间> } 作为本地水位线，
    // 消除设备时钟偏移；旧版 RPC 返回 void（data 为 null）→ 调用方回退客户端时间
    let payload = data
    if (typeof payload === 'string') {
      try { payload = JSON.parse(payload) } catch { payload = null }
    }
    const serverSyncedAt = payload && typeof payload === 'object' ? (payload.synced_at || null) : null
    return { syncedAt: serverSyncedAt }
  }

  return { writeManifest, writePresets, pushDomainRows, pushAll, writeDeviceHeartbeat, clearDeviceForceResync }
}
