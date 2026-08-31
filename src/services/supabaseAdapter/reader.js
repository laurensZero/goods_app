// src/services/supabaseAdapter/reader.js
// Supabase read operations: pullAll, readPresets

import { toCamelCase } from '@/utils/sync/columnMapping'
import { withRetry } from '@/services/syncRetry'
import {
  GOODS_SELECT_COLS, RECHARGE_SELECT_COLS, EVENT_SELECT_COLS, EVENT_JSON_KEYS,
  GOODS_GROUP_SELECT_COLS, GOODS_GROUP_ITEM_SELECT_COLS,
  fetchAllRows, normalizeTimestamp, safeParseJsonArray, parsePresetsField
} from './helpers'

// events 行的 JSONB 数组列统一解析（coverImageData 是对象，单独处理）。
// 字段清单由 helpers.js 的 EVENT_JSON_KEYS 声明，加字段不再需要改这里
function parseEventJsonKeys(item) {
  for (const key of EVENT_JSON_KEYS) {
    item[key] = safeParseJsonArray(item[key])
  }
  return item
}

// 增量拉取：sinceMs 由调用方（orchestrator）减去重叠窗口后传入，
// 用于吸收设备间时钟偏移；合并是幂等 LWW，多拉无害
async function fetchRowsSince(makeQuery, sinceMs) {
  return fetchAllRows(makeQuery(sinceMs > 0 ? 'updated_at' : null))
}

export function createReader({ getDb, trackSyncStep, userIdRef, deviceIdRef }) {
  // 读当前设备行（devices 表）：返回 forceResyncAt，供设备级强制重同步判定。
  // 无行（尚未心跳）返回 null。
  async function readDeviceRow() {
    const db = getDb()
    const currentDeviceId = typeof deviceIdRef === 'function' ? deviceIdRef() : (deviceIdRef?.value || '')
    if (!currentDeviceId) return null
    const { data, error } = await withRetry(() =>
      db.from('devices').select('*').eq('device_id', currentDeviceId).limit(1)
    )
    if (error) throw error
    if (!data || data.length === 0) return null
    // 直接读原始列名：force_resync_at 不在 columnMapping 静态映射表里，
    // toCamelCase 会原样保留键名，row.forceResyncAt 会取到 undefined
    return { forceResyncAt: data[0].force_resync_at || '' }
  }

  async function readPresets() {
    const db = getDb()
    const uid = typeof userIdRef === 'function' ? userIdRef() : (userIdRef?.value || '')
    const { data } = await withRetry(() =>
      db.from('sync_presets').select('*').eq('user_id', uid).limit(1)
    )
    if (!data || data.length === 0) return null
    const row = toCamelCase(data[0])
    return {
      categories: parsePresetsField(row.categories),
      ips: parsePresetsField(row.ips),
      characters: parsePresetsField(row.characters),
      storageLocations: parsePresetsField(row.storageLocations)
    }
  }

  // manifest-only 读取：fullSync 第 1 步只需要清单；
  // 走 sync_pull RPC 会以 since=0 全量拉整库后丢弃，多付一次全量读
  async function readManifest() {
    const db = getDb()
    const uid = typeof userIdRef === 'function' ? userIdRef() : (userIdRef?.value || '')
    const { data, error } = await withRetry(() =>
      db.from('sync_manifest').select('*').eq('user_id', uid).limit(1)
    )
    if (error) throw error
    if (!data || data.length === 0) return null
    const m = toCamelCase(data[0])
    return {
      ...m,
      lastSyncAt: m.syncedAt || m.lastSyncAt || '',
      imageCloudId: m.imageBucket || m.imageCloudId || '',
      budgetMonthly: Number(m.budgetMonthly) || 0,
      budgetYearly: Number(m.budgetYearly) || 0,
      maintenanceMode: m.maintenanceMode || null
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
      const buildQuery = (trashed) => (sinceCol) => () => {
        let query = db.from('goods').select(GOODS_SELECT_COLS)
        query = trashed ? query.eq('trashed', 1) : query.or('trashed.is.null,trashed.eq.0')
        if (sinceCol) query = query.gt(sinceCol, new Date(sinceMs).toISOString())
        return query
      }
      const [goodsData, trashData] = await Promise.all([
        fetchRowsSince(buildQuery(false), sinceMs),
        fetchRowsSince(buildQuery(true), sinceMs)
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
      const data = await fetchRowsSince((sinceCol) => () => {
        let query = db.from('recharge_records').select(RECHARGE_SELECT_COLS)
        if (sinceCol) query = query.gt(sinceCol, new Date(sinceMs).toISOString())
        return query
      }, sinceMs)
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
      const data = await fetchRowsSince((sinceCol) => () => {
        let query = db.from('events').select(EVENT_SELECT_COLS)
        if (sinceCol) query = query.gt(sinceCol, new Date(sinceMs).toISOString())
        return query
      }, sinceMs)
      return (data || []).map(row => {
        const item = toCamelCase(row)
        item.updatedAt = normalizeTimestamp(item.updatedAt)
        item.createdAt = normalizeTimestamp(item.createdAt)
        item.coverImageData = safeParseJsonArray(item.coverImageData) || {}
        if (typeof item.coverImageData !== 'object') item.coverImageData = {}
        parseEventJsonKeys(item)
        return item
      })
    }

    if (domain === 'groups') {
      const data = await fetchRowsSince((sinceCol) => () => {
        let query = db.from('goods_groups').select(GOODS_GROUP_SELECT_COLS)
        if (sinceCol) query = query.gt(sinceCol, new Date(sinceMs).toISOString())
        return query
      }, sinceMs)
      return (data || []).map(row => {
        const item = toCamelCase(row)
        item.updatedAt = normalizeTimestamp(item.updatedAt)
        item.createdAt = normalizeTimestamp(item.createdAt)
        return item
      })
    }

    if (domain === 'groupItems') {
      const data = await fetchRowsSince((sinceCol) => () => {
        let query = db.from('goods_group_items').select(GOODS_GROUP_ITEM_SELECT_COLS)
        if (sinceCol) query = query.gt(sinceCol, new Date(sinceMs).toISOString())
        return query
      }, sinceMs)
      return (data || []).map(row => {
        const item = toCamelCase(row)
        item.updatedAt = normalizeTimestamp(item.updatedAt)
        item.createdAt = normalizeTimestamp(item.createdAt)
        return item
      })
    }

    return []
  }

  async function pullAll({ since = 0 } = {}) {
    const db = getDb()
    const sinceParam = since > 0 ? new Date(since).toISOString() : null

    const { data: rawData, error } = await withRetry(() =>
      db.rpc('sync_pull', { p_since: sinceParam })
    )
    if (error) throw error

    const data = typeof rawData === 'string' ? JSON.parse(rawData) : (rawData || {})

    const mapGoods = (row) => {
      const item = toCamelCase(row)
      item.isWishlist = Number(item.isWishlist) === 1
      item.saleReminderEnabled = Number(item.saleReminderEnabled) === 1
      item.quantity = Number(item.quantity) || 1
      item.updatedAt = normalizeTimestamp(item.updatedAt)
      item.images = safeParseJsonArray(item.images)
      item.characters = safeParseJsonArray(item.characters)
      item.tags = safeParseJsonArray(item.tags)
      item.tracks = safeParseJsonArray(item.tracks)
      item.saleReminderOffsets = safeParseJsonArray(item.saleReminderOffsets)
      item.unitAcquiredAtList = safeParseJsonArray(item.unitAcquiredAtList)
      item.unitActualPriceList = safeParseJsonArray(item.unitActualPriceList)
      item.unitCharacterList = safeParseJsonArray(item.unitCharacterList)
      item.unitCollectStatusList = safeParseJsonArray(item.unitCollectStatusList)
      item.unitSaleInfoList = safeParseJsonArray(item.unitSaleInfoList)
      return item
    }

    const recharge = []
    const rechargeTrash = []
    for (const row of (data.recharge || [])) {
      const item = toCamelCase(row)
      item.updatedAt = normalizeTimestamp(item.updatedAt)
      item.deleted = Boolean(item.deleted)
      if (Number(row.deleted) === 1) rechargeTrash.push(item)
      else recharge.push(item)
    }
    for (const row of (data.recharge_trash || [])) {
      const item = toCamelCase(row)
      item.updatedAt = normalizeTimestamp(item.updatedAt)
      item.deleted = true
      rechargeTrash.push(item)
    }

    const events = []
    const eventsTrash = []
    for (const row of (data.events || [])) {
      const item = toCamelCase(row)
      item.updatedAt = normalizeTimestamp(item.updatedAt)
      if (item.createdAt) item.createdAt = normalizeTimestamp(item.createdAt)
      item.coverImageData = safeParseJsonArray(item.coverImageData) || {}
      if (typeof item.coverImageData !== 'object') item.coverImageData = {}
      parseEventJsonKeys(item)
      if (Number(row.deleted) === 1) eventsTrash.push(item)
      else events.push(item)
    }
    for (const row of (data.events_trash || [])) {
      const item = toCamelCase(row)
      item.updatedAt = normalizeTimestamp(item.updatedAt)
      if (item.createdAt) item.createdAt = normalizeTimestamp(item.createdAt)
      item.coverImageData = safeParseJsonArray(item.coverImageData) || {}
      if (typeof item.coverImageData !== 'object') item.coverImageData = {}
      parseEventJsonKeys(item)
      item.deleted = true
      eventsTrash.push(item)
    }

    const groups = []
    const groupsTrash = []
    for (const row of (data.groups || [])) {
      const item = toCamelCase(row)
      item.updatedAt = normalizeTimestamp(item.updatedAt)
      if (item.createdAt) item.createdAt = normalizeTimestamp(item.createdAt)
      if (Number(row.deleted) === 1) groupsTrash.push(item)
      else groups.push(item)
    }
    for (const row of (data.groups_trash || [])) {
      const item = toCamelCase(row)
      item.updatedAt = normalizeTimestamp(item.updatedAt)
      if (item.createdAt) item.createdAt = normalizeTimestamp(item.createdAt)
      item.deleted = true
      groupsTrash.push(item)
    }

    const groupItems = []
    const groupItemsTrash = []
    for (const row of (data.group_items || [])) {
      const item = toCamelCase(row)
      item.updatedAt = normalizeTimestamp(item.updatedAt)
      if (item.createdAt) item.createdAt = normalizeTimestamp(item.createdAt)
      if (Number(row.deleted) === 1) groupItemsTrash.push(item)
      else groupItems.push(item)
    }
    for (const row of (data.group_items_trash || [])) {
      const item = toCamelCase(row)
      item.updatedAt = normalizeTimestamp(item.updatedAt)
      if (item.createdAt) item.createdAt = normalizeTimestamp(item.createdAt)
      item.deleted = true
      groupItemsTrash.push(item)
    }

    const manifestRow = data.manifest
    const manifest = manifestRow ? (() => {
      const m = toCamelCase(manifestRow)
      return {
        ...m,
        lastSyncAt: m.syncedAt || m.lastSyncAt || '',
        imageCloudId: m.imageBucket || m.imageCloudId || '',
        budgetMonthly: Number(m.budgetMonthly) || 0,
        budgetYearly: Number(m.budgetYearly) || 0,
        maintenanceMode: m.maintenanceMode || null
      }
    })() : null

    const presetsRow = data.presets
    const presets = presetsRow ? (() => {
      const p = toCamelCase(presetsRow)
      return {
        categories: parsePresetsField(p.categories),
        ips: parsePresetsField(p.ips),
        characters: parsePresetsField(p.characters),
        storageLocations: parsePresetsField(p.storageLocations)
      }
    })() : null

    return {
      manifest,
      goods: (data.goods || []).map(mapGoods),
      trash: (data.goods_trash || []).map(mapGoods),
      recharge,
      rechargeTrash,
      events,
      eventsTrash,
      groups,
      groupsTrash,
      groupItems,
      groupItemsTrash,
      presets
    }
  }

  return { readPresets, readManifest, pullDomainRows, pullAll, readDeviceRow }
}
