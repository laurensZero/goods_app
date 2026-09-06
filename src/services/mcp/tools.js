// @ts-check
/**
 * MCP 工具实现：把收藏数据（本地 SQLite）暴露给 AI 的只读查询集。
 *
 * 数据访问通过注入的 dbApi 完成（生产环境传 '@/utils/db'，单测传内存假实现），
 * 过滤/聚合在内存中做——个人收藏量级（千条以内）足够快，且与 App 内
 * 「全量读取 + 内存处理」的既有模式一致。
 */

import { MCP_TOOL_DEFINITIONS, MCP_SERVER_INFO, MCP_SERVER_INSTRUCTIONS } from './toolDefinitions'
import { createMcpRequestHandler, McpUnknownToolError } from './protocol'

/**
 * @typedef {Object} McpDbApi
 * @property {() => Promise<any[]>} getItems
 * @property {() => Promise<any[]>} getTrashedItems
 * @property {() => Promise<any[]>} getEvents
 * @property {() => Promise<any[]>} getRechargeRecords
 */

/** 单条输出字段上限，防止超长备注/描述把响应撑爆 */
const NOTE_MAX_LENGTH = 500
const TIMELINE_MAX_ENTRIES = 20

/**
 * @param {unknown} value
 * @returns {string}
 */
function asText(value) {
  return String(value ?? '')
}

/** @param {unknown} value @returns {number} */
function asInt(value) {
  const n = Number.parseInt(String(value), 10)
  return Number.isFinite(n) ? n : 0
}

/**
 * 宽松地把用户手填的价格解析成数字；与 GoodsCard 的展示口径一致（parseFloat 截断）。
 * @param {unknown} value
 * @returns {number}
 */
function parseMoney(value) {
  const n = Number.parseFloat(asText(value).trim())
  return Number.isFinite(n) ? n : 0
}

/** @param {unknown} value @returns {string} */
function truncate(value) {
  const text = asText(value)
  return text.length > NOTE_MAX_LENGTH ? `${text.slice(0, NOTE_MAX_LENGTH)}…` : text
}

/**
 * 单件条目的估算花费：有逐件价格按逐件求和，否则 实付价 × 数量。
 * @param {any} item
 * @returns {number}
 */
function estimateItemSpend(item) {
  const unitPrices = Array.isArray(item.unitActualPriceList) ? item.unitActualPriceList : []
  if (unitPrices.length > 0) {
    return unitPrices.reduce((/** @type {number} */ sum, /** @type {any} */ value) => sum + parseMoney(value), 0)
  }
  return parseMoney(item.actualPrice) * (Number(item.quantity) || 1)
}

/**
 * @param {any} item
 */
function goodsListItem(item) {
  return {
    id: item.id,
    name: item.name,
    category: item.category,
    ip: item.ip,
    goodsId: item.goodsId,
    characters: Array.isArray(item.characters) ? item.characters : [],
    tags: Array.isArray(item.tags) ? item.tags : [],
    variant: item.variant,
    storageLocation: item.storageLocation,
    isWishlist: Boolean(item.isWishlist),
    collectStatus: item.collectStatus,
    quantity: Number(item.quantity) || 1,
    price: item.price,
    actualPrice: item.actualPrice,
    currency: item.actualPriceCurrency || item.currency || 'CNY',
    acquiredAt: item.acquiredAt,
    saleAt: item.saleAt,
    note: truncate(item.note),
    updatedAt: Number(item.updatedAt) || 0
  }
}

/**
 * 构造工具名 → 执行函数的映射。
 * @param {McpDbApi} dbApi
 */
export function createMcpToolHandlers(dbApi) {
  const { getItems, getTrashedItems, getEvents, getRechargeRecords } = dbApi

  /**
   * @param {Record<string, any>} args
   */
  async function goodsSearch(args) {
    const items = await getItems()
    const query = asText(args.query).trim().toLowerCase()
    const category = asText(args.category).trim()
    const ip = asText(args.ip).trim()
    const character = asText(args.character).trim().toLowerCase()
    const storageLocation = asText(args.storageLocation).trim()
    const wishlistOnly = args.wishlistOnly === true
    const limit = Math.min(Math.max(asInt(args.limit) || 20, 1), 100)
    const offset = Math.max(asInt(args.offset), 0)

    const matched = items.filter((item) => {
      if (wishlistOnly && !item.isWishlist) return false
      if (category && asText(item.category).trim() !== category) return false
      if (ip && asText(item.ip).trim() !== ip) return false
      if (storageLocation && asText(item.storageLocation).trim() !== storageLocation) return false
      if (character) {
        const characters = Array.isArray(item.characters) ? item.characters : []
        if (!characters.some((/** @type {unknown} */ c) => asText(c).trim().toLowerCase() === character)) return false
      }
      if (query) {
        const haystack = [
          item.name, item.ip, item.category, item.variant, item.note, item.storageLocation, item.goodsId,
          ...(Array.isArray(item.characters) ? item.characters : []),
          ...(Array.isArray(item.tags) ? item.tags : [])
        ].map((part) => asText(part).toLowerCase())
        if (!haystack.some((part) => part.includes(query))) return false
      }
      return true
    })

    const sorted = matched.sort((a, b) => (Number(b.updatedAt) || 0) - (Number(a.updatedAt) || 0))
    const page = sorted.slice(offset, offset + limit)

    return {
      total: matched.length,
      offset,
      limit,
      hasMore: offset + page.length < matched.length,
      items: page.map(goodsListItem)
    }
  }

  /**
   * @param {Record<string, any>} args
   */
  async function goodsDetail(args) {
    const id = asText(args.id).trim()
    if (!id) throw new Error('缺少参数 id')
    const [active, trashed] = await Promise.all([getItems(), getTrashedItems()])
    const item = active.find((entry) => entry.id === id) || trashed.find((entry) => entry.id === id)
    if (!item) throw new Error(`未找到 id 为 ${id} 的条目（可能已被彻底删除）`)

    const statusTimeline = Array.isArray(item.statusTimeline) ? item.statusTimeline : []
    return {
      ...goodsListItem(item),
      trashed: Boolean(item.trashed),
      points: item.points,
      shippingFee: item.shippingFee,
      sellPrice: item.sellPrice,
      sellPlatform: item.sellPlatform,
      sellFee: item.sellFee,
      sellDate: item.sellDate,
      unitAcquiredAtList: Array.isArray(item.unitAcquiredAtList) ? item.unitAcquiredAtList : [],
      unitActualPriceList: Array.isArray(item.unitActualPriceList) ? item.unitActualPriceList : [],
      unitCharacterList: Array.isArray(item.unitCharacterList) ? item.unitCharacterList : [],
      unitCollectStatusList: Array.isArray(item.unitCollectStatusList) ? item.unitCollectStatusList : [],
      unitSaleInfoList: Array.isArray(item.unitSaleInfoList) ? item.unitSaleInfoList : [],
      imagesCount: Array.isArray(item.images) ? item.images.length : 0,
      statusTimeline: statusTimeline.slice(-TIMELINE_MAX_ENTRIES),
      note: item.note
    }
  }

  async function collectionOverview() {
    const items = await getItems()
    const collection = items.filter((item) => !item.isWishlist)
    const wishlist = items.filter((item) => item.isWishlist)

    /** @type {Map<string, number>} */
    const spendByCurrency = new Map()
    for (const item of collection) {
      const currency = asText(item.actualPriceCurrency || item.currency || 'CNY').trim() || 'CNY'
      spendByCurrency.set(currency, (spendByCurrency.get(currency) || 0) + estimateItemSpend(item))
    }

    /**
     * @param {(item: any) => string} pick
     */
    function topDistribution(pick) {
      /** @type {Map<string, { count: number, quantity: number }>} */
      const stats = new Map()
      for (const item of collection) {
        const key = asText(pick(item)).trim() || '（未填写）'
        const entry = stats.get(key) || { count: 0, quantity: 0 }
        entry.count += 1
        entry.quantity += Number(item.quantity) || 1
        stats.set(key, entry)
      }
      return [...stats.entries()]
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 10)
        .map(([name, stat]) => ({ name, count: stat.count, quantity: stat.quantity }))
    }

    /** @type {Map<string, number>} */
    const byYear = new Map()
    const acquiredDates = []
    for (const item of collection) {
      const date = asText(item.acquiredAt).trim()
      if (date) acquiredDates.push(date)
      if (/^\d{4}/.test(date)) {
        const year = date.slice(0, 4)
        byYear.set(year, (byYear.get(year) || 0) + 1)
      }
    }
    acquiredDates.sort()

    const totalQuantity = collection.reduce((sum, item) => sum + (Number(item.quantity) || 1), 0)

    return {
      totalItems: collection.length,
      totalQuantity,
      wishlistCount: wishlist.length,
      estimatedSpend: [...spendByCurrency.entries()].map(([currency, amount]) => ({
        currency,
        amount: Math.round(amount * 100) / 100,
        note: '估算值：优先按逐件价格求和，否则按 实付价×数量'
      })),
      byCategory: topDistribution((item) => item.category),
      byIp: topDistribution((item) => item.ip),
      byAcquiredYear: [...byYear.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([year, count]) => ({ year, count })),
      acquiredDateRange: acquiredDates.length
        ? { earliest: acquiredDates[0], latest: acquiredDates[acquiredDates.length - 1] }
        : null
    }
  }

  /**
   * @param {Record<string, any>} args
   */
  async function eventsList(args) {
    const events = await getEvents()
    const limit = Math.min(Math.max(asInt(args.limit) || 20, 1), 100)
    const offset = Math.max(asInt(args.offset), 0)
    const active = events.filter((event) => !event.deleted)
    const page = active.slice(offset, offset + limit)

    return {
      total: active.length,
      offset,
      limit,
      hasMore: offset + page.length < active.length,
      events: page.map((event) => ({
        id: event.id,
        name: event.name,
        type: event.type,
        startDate: event.startDate,
        endDate: event.endDate,
        city: event.city,
        location: event.location,
        ticketPrice: event.ticketPrice,
        ticketType: event.ticketType,
        seatInfo: event.seatInfo,
        tags: Array.isArray(event.tags) ? event.tags : [],
        linkedGoodsCount: Array.isArray(event.linkedGoodsIds) ? event.linkedGoodsIds.length : 0,
        photosCount: Array.isArray(event.photos) ? event.photos.length : 0,
        description: truncate(event.description)
      }))
    }
  }

  /**
   * @param {Record<string, any>} args
   */
  async function rechargeSummary(args) {
    const records = await getRechargeRecords()
    const year = asInt(args.year)
    const filtered = records.filter((record) => {
      if (record.deleted) return false
      if (year > 0 && !asText(record.chargedAt).startsWith(String(year))) return false
      return true
    })

    /**
     * @param {(record: any) => string} pick
     */
    function groupSum(pick) {
      /** @type {Map<string, { total: number, count: number }>} */
      const stats = new Map()
      for (const record of filtered) {
        const key = asText(pick(record)).trim() || '（未填写）'
        const entry = stats.get(key) || { total: 0, count: 0 }
        entry.total += Number(record.amount) || 0
        entry.count += 1
        stats.set(key, entry)
      }
      return [...stats.entries()]
        .sort((a, b) => b[1].total - a[1].total)
        .map(([name, stat]) => ({ name, total: Math.round(stat.total * 100) / 100, count: stat.count }))
    }

    const sorted = filtered.sort((a, b) => asText(b.chargedAt).localeCompare(asText(a.chargedAt)))
    const total = filtered.reduce((sum, record) => sum + (Number(record.amount) || 0), 0)

    return {
      year: year > 0 ? year : null,
      totalAmount: Math.round(total * 100) / 100,
      count: filtered.length,
      byGame: groupSum((record) => record.game),
      byYear: groupSum((record) => asText(record.chargedAt).slice(0, 4)),
      recent: sorted.slice(0, 10).map((record) => ({
        game: record.game,
        itemName: record.itemName,
        amount: Number(record.amount) || 0,
        chargedAt: record.chargedAt,
        note: truncate(record.note)
      }))
    }
  }

  /**
   * 按月汇总消费：谷子（按入手日期归月，估算金额）+ 游戏充值（按充值时间归月）。
   * @param {Record<string, any>} args
   */
  async function spendingSummary(args) {
    const year = asInt(args.year)
    const yearPrefix = year > 0 ? String(year) : ''
    const [items, records] = await Promise.all([getItems(), getRechargeRecords()])

    /** @type {Map<string, { total: number, months: Map<string, { amount: number, count: number }> }>} */
    const goodsByCurrency = new Map()
    for (const item of items) {
      if (item.isWishlist) continue
      const date = asText(item.acquiredAt).trim()
      if (!/^\d{4}-\d{2}/.test(date)) continue
      if (yearPrefix && !date.startsWith(yearPrefix)) continue
      const month = date.slice(0, 7)
      const currency = asText(item.actualPriceCurrency || item.currency || 'CNY').trim() || 'CNY'
      const bucket = goodsByCurrency.get(currency) || { total: 0, months: new Map() }
      const amount = estimateItemSpend(item)
      bucket.total += amount
      const monthBucket = bucket.months.get(month) || { amount: 0, count: 0 }
      monthBucket.amount += amount
      monthBucket.count += 1
      bucket.months.set(month, monthBucket)
      goodsByCurrency.set(currency, bucket)
    }

    const rechargeFiltered = records.filter((record) => {
      if (record.deleted) return false
      return !yearPrefix || asText(record.chargedAt).startsWith(yearPrefix)
    })
    /** @type {Map<string, { amount: number, count: number }>} */
    const rechargeMonths = new Map()
    let rechargeTotal = 0
    for (const record of rechargeFiltered) {
      const month = asText(record.chargedAt).slice(0, 7) || '（未知）'
      const amount = Number(record.amount) || 0
      rechargeTotal += amount
      const bucket = rechargeMonths.get(month) || { amount: 0, count: 0 }
      bucket.amount += amount
      bucket.count += 1
      rechargeMonths.set(month, bucket)
    }

    const round2 = (/** @type {number} */ n) => Math.round(n * 100) / 100
    const monthsToArray = (/** @type {Map<string, { amount: number, count: number }>} */ months) => (
      [...months.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([month, m]) => ({ month, amount: round2(m.amount), count: m.count }))
    )

    return {
      year: year > 0 ? year : null,
      goods: [...goodsByCurrency.entries()].map(([currency, bucket]) => ({
        currency,
        total: round2(bucket.total),
        byMonth: monthsToArray(bucket.months)
      })),
      recharge: {
        total: round2(rechargeTotal),
        count: rechargeFiltered.length,
        byMonth: monthsToArray(rechargeMonths)
      },
      note: '谷子金额为估算值（优先按逐件价格求和，否则实付价×数量），按入手日期归月；充值按充值时间归月。当月消费 = 月份前缀匹配当月。'
    }
  }

  return {
    goods_search: goodsSearch,
    goods_detail: goodsDetail,
    collection_overview: collectionOverview,
    spending_summary: spendingSummary,
    events_list: eventsList,
    recharge_summary: rechargeSummary
  }
}

/**
 * 组装页面侧（以及未来 Android 原生桥）使用的完整 MCP 服务端。
 * @param {{ dbApi: McpDbApi }} params
 */
export function createMcpServer({ dbApi }) {
  const handlers = createMcpToolHandlers(dbApi)
  return createMcpRequestHandler({
    serverInfo: MCP_SERVER_INFO,
    instructions: MCP_SERVER_INSTRUCTIONS,
    listTools: () => MCP_TOOL_DEFINITIONS,
    callTool: async (name, args) => {
      const handler = /** @type {Record<string, (args: Record<string, any>) => Promise<unknown>>} */ (handlers)[name]
      if (!handler) throw new McpUnknownToolError(name)
      return handler(args)
    }
  })
}
