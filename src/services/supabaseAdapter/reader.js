// src/services/supabaseAdapter/reader.js
// Supabase read operations: pullDomainRows, readJson, getManifest

import { toCamelCase } from '@/utils/sync/columnMapping'
import { withRetry, withTimeout } from '@/services/syncRetry'
import {
  GOODS_SELECT_COLS, RECHARGE_SELECT_COLS, EVENT_SELECT_COLS,
  GOODS_GROUP_SELECT_COLS, GOODS_GROUP_ITEM_SELECT_COLS,
  fetchAllRows, normalizeTimestamp, safeParseJsonArray
} from './helpers'

export function createReader({ getDb, trackSyncStep }) {
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

  async function readPresets() {
    const db = getDb()
    const { data } = await withRetry(() =>
      db.from('sync_presets').select('*').eq('id', 'default').limit(1)
    )
    if (!data || data.length === 0) return null
    const row = toCamelCase(data[0])
    return {
      categories: safeParseJsonArray(row.categories),
      ips: safeParseJsonArray(row.ips),
      characters: safeParseJsonArray(row.characters),
      storageLocations: safeParseJsonArray(row.storageLocations)
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

  async function pullAll({ since = 0 } = {}) {
    const db = getDb()
    const sinceParam = since > 0 ? new Date(since).toISOString() : null

    const { data: rawData, error } = await withRetry(() =>
      db.rpc('sync_pull', { p_since: sinceParam })
    )
    if (error) throw error

    // Supabase rpc 可能返回 JSON 字符串而非对象
    const data = typeof rawData === 'string' ? JSON.parse(rawData) : (rawData || {})

    // goods normalization
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
      return item
    }

    // recharge normalization
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

    // events normalization
    const events = (data.events || []).map((row) => {
      const item = toCamelCase(row)
      item.updatedAt = normalizeTimestamp(item.updatedAt)
      if (item.createdAt) item.createdAt = normalizeTimestamp(item.createdAt)
      item.coverImageData = safeParseJsonArray(item.coverImageData) || {}
      if (typeof item.coverImageData !== 'object') item.coverImageData = {}
      item.photos = safeParseJsonArray(item.photos)
      item.linkedGoodsIds = safeParseJsonArray(item.linkedGoodsIds)
      item.tags = safeParseJsonArray(item.tags)
      item.tracks = safeParseJsonArray(item.tracks)
      item.otherExpenses = safeParseJsonArray(item.otherExpenses)
      return item
    })

    // groups normalization
    const groups = (data.groups || []).map((row) => {
      const item = toCamelCase(row)
      item.updatedAt = normalizeTimestamp(item.updatedAt)
      if (item.createdAt) item.createdAt = normalizeTimestamp(item.createdAt)
      return item
    })

    // group_items normalization
    const groupItems = (data.group_items || []).map((row) => {
      const item = toCamelCase(row)
      item.updatedAt = normalizeTimestamp(item.updatedAt)
      if (item.createdAt) item.createdAt = normalizeTimestamp(item.createdAt)
      return item
    })

    // manifest normalization
    const manifestRow = data.manifest
    const manifest = manifestRow ? (() => {
      const m = toCamelCase(manifestRow)
      return {
        ...m,
        lastSyncAt: m.syncedAt || m.lastSyncAt || '',
        imageGistId: m.imageBucket || m.imageGistId || '',
        budgetMonthly: Number(m.budgetMonthly) || 0,
        budgetYearly: Number(m.budgetYearly) || 0
      }
    })() : null

    // presets normalization
    const presetsRow = data.presets
    const presets = presetsRow ? (() => {
      const p = toCamelCase(presetsRow)
      return {
        categories: safeParseJsonArray(p.categories),
        ips: safeParseJsonArray(p.ips),
        characters: safeParseJsonArray(p.characters),
        storageLocations: safeParseJsonArray(p.storageLocations)
      }
    })() : null

    return {
      manifest,
      goods: (data.goods || []).map(mapGoods),
      trash: (data.goods_trash || []).map(mapGoods),
      recharge,
      rechargeTrash,
      events,
      groups,
      groupItems,
      presets
    }
  }

  return { readJson, getManifest, readPresets, pullDomainRows, pullAll }
}
