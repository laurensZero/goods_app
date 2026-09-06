// @ts-check
/**
 * MCP 工具实现：把收藏数据（本地 SQLite）暴露给 AI 的只读查询集。
 *
 * 数据访问通过注入的 dbApi 完成（生产环境传 '@/utils/db'，单测传内存假实现），
 * 过滤/聚合在内存中做——个人收藏量级（千条以内）足够快，且与 App 内
 * 「全量读取 + 内存处理」的既有模式一致。
 */

import { MCP_WRITE_TOOL_DEFINITIONS, MCP_SERVER_INFO, MCP_SERVER_INSTRUCTIONS, getToolDefinitions } from './toolDefinitions'
import { createMcpRequestHandler, McpUnknownToolError } from './protocol'
import { buildSaleLedger, extractSaleEntries } from '../../utils/goods/saleStats'
import { getItemSpendEntries } from '../../utils/goods/statistics'

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

const DATE_LIKE_PATTERN = /^\d{4}-\d{2}(-\d{2})?$/

/** 与 statistics.js 一致的金额取整 */
function roundMoney(value) {
  const n = Number(value)
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0
}

/** 首页总金额口径的状态排除项（已出/已赠出/丢失不计入） */
const HOME_EXCLUDED_STATUSES = new Set(['已赠出', '已出', '丢失'])

/**
 * 构造工具名 → 执行函数的映射。
 *
 * @param {McpDbApi} dbApi
 * @param {{
 *   enrichItems?: (items: any[]) => any[] | Promise<any[]>,
 *   convertToCNY?: (amount: number, currency: string) => number
 * }} [money]
 *   官方计费口径注入（见 moneyContext.js）：enrichItems 补齐 CNY 折算字段，
 *   convertToCNY 做币种换算。缺省时回退到原始字段的粗略估算（仅单测使用）。
 */
export function createMcpToolHandlers(dbApi, money = {}) {
  const { getItems, getTrashedItems, getEvents, getRechargeRecords } = dbApi
  const { enrichItems = null, convertToCNY = null } = money

  async function loadEnrichedItems() {
    const items = await getItems()
    return enrichItems ? await enrichItems(items) : items
  }

  /** 单件花费 = 逐件带日期条目之和（官方消费趋势口径，已排除愿望单/已出/已赠出/丢失） */
  function itemSpendCNY(item) {
    return getItemSpendEntries(item).reduce((sum, entry) => sum + entry.price, 0)
  }

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
    const collectionOnly = args.collectionOnly === true
    const limit = Math.min(Math.max(asInt(args.limit) || 20, 1), 100)
    const offset = Math.max(asInt(args.offset), 0)

    const acquiredAfter = asText(args.acquiredAfter).trim()
    const acquiredBefore = asText(args.acquiredBefore).trim()
    if (acquiredAfter && !DATE_LIKE_PATTERN.test(acquiredAfter)) throw new Error('acquiredAfter 需为 YYYY-MM-DD')
    if (acquiredBefore && !DATE_LIKE_PATTERN.test(acquiredBefore)) throw new Error('acquiredBefore 需为 YYYY-MM-DD')
    const hasPriceRange = args.priceMin !== undefined || args.priceMax !== undefined
    const priceMin = hasPriceRange && args.priceMin !== undefined ? Number(args.priceMin) : null
    const priceMax = hasPriceRange && args.priceMax !== undefined ? Number(args.priceMax) : null
    if (priceMin !== null && !Number.isFinite(priceMin)) throw new Error('priceMin 需为数字')
    if (priceMax !== null && !Number.isFinite(priceMax)) throw new Error('priceMax 需为数字')

    const matched = items.filter((item) => {
      if (wishlistOnly && !item.isWishlist) return false
      if (collectionOnly && item.isWishlist) return false
      const acquiredDate = asText(item.acquiredAt).trim()
      if (acquiredAfter && (!acquiredDate || acquiredDate < acquiredAfter)) return false
      if (acquiredBefore && (!acquiredDate || acquiredDate > acquiredBefore)) return false
      if (hasPriceRange) {
        // 条目价格口径：实付价优先，缺省回退标价（不乘数量）
        const price = parseMoney(item.actualPrice) || parseMoney(item.price)
        if (priceMin !== null && price < priceMin) return false
        if (priceMax !== null && price > priceMax) return false
      }
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
    const items = await loadEnrichedItems()
    const collection = items.filter((item) => !item.isWishlist)
    const wishlist = items.filter((item) => item.isWishlist)

    /** @type {Map<string, number>} */
    const spendByCurrency = new Map()
    for (const item of collection) {
      const currency = asText(item.actualPriceCurrency || item.currency || 'CNY').trim() || 'CNY'
      spendByCurrency.set(currency, (spendByCurrency.get(currency) || 0) + estimateItemSpend(item))
    }

    // 首页总金额口径：折算 CNY、排除已出/已赠出/丢失、手动总价谷子组只计一次组总价
    let collectionTotalCNY = null
    if (convertToCNY && dbApi.getGroups && dbApi.getGroupItems) {
      try {
        const [groups, groupItems] = await Promise.all([dbApi.getGroups(), dbApi.getGroupItems()])
        const manualGroups = groups.filter((g) => !g.deleted && g.summaryMode === 'manual')
        /** @type {Set<string>} */
        const manualMemberIds = new Set()
        if (manualGroups.length > 0) {
          const manualIds = new Set(manualGroups.map((g) => g.id))
          for (const groupItem of groupItems) {
            if (!groupItem.deleted && manualIds.has(groupItem.groupId)) {
              manualMemberIds.add(groupItem.goodsId)
            }
          }
        }
        let groupTotalsCNY = 0
        for (const group of manualGroups) {
          groupTotalsCNY += convertToCNY(Number(group.totalAmount) || 0, group.currency || 'CNY')
        }
        let itemsTotal = 0
        for (const item of collection) {
          if (manualMemberIds.has(item.id)) continue
          if (HOME_EXCLUDED_STATUSES.has(asText(item.collectStatus).trim())) continue
          itemsTotal += Number(item.totalValueNumber) || 0
        }
        collectionTotalCNY = roundMoney(itemsTotal + groupTotalsCNY)
      } catch {
        // 组数据异常时退化为逐件估算
      }
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

    const collectionQuantity = collection.reduce((sum, item) => sum + (Number(item.quantity) || 1), 0)

    return {
      // 字段名必须无歧义：collectionCount 是「非愿望单」条目数，grandTotal 才是全部
      grandTotal: items.length,
      collectionCount: collection.length,
      collectionQuantity,
      wishlistCount: wishlist.length,
      estimatedSpend: collectionTotalCNY !== null
        ? [{
            currency: 'CNY',
            amount: collectionTotalCNY,
            note: '与首页总金额同口径：实付价+邮费（缺省回退标价×数量+邮费）、非 CNY 已折算、已出/已赠出/丢失不计、手动总价谷子组只计一次组总价'
          }]
        : [...spendByCurrency.entries()].map(([currency, amount]) => ({
            currency,
            amount: roundMoney(amount),
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
      events: page.map((event) => {
        const dayTickets = Array.isArray(event.dayTicketList) ? event.dayTicketList : []
        const otherExpenses = Array.isArray(event.otherExpenses) ? event.otherExpenses : []
        const dayTicketsTotal = dayTickets.reduce((sum, d) => sum + parseMoney(d?.price), 0)
        const otherTotal = otherExpenses.reduce((sum, e) => sum + parseMoney(e?.amount), 0)
        return {
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
          expenseSummary: {
            ticket: parseMoney(event.ticketPrice),
            dayTicketsTotal: roundMoney(dayTicketsTotal),
            otherTotal: roundMoney(otherTotal),
            total: roundMoney(parseMoney(event.ticketPrice) + dayTicketsTotal + otherTotal)
          },
          dayTicketList: dayTickets.slice(0, 10).map((d) => ({ price: d?.price, ticketType: d?.ticketType })),
          otherExpenses: otherExpenses.slice(0, 8).map((e) => ({ name: e?.name, amount: e?.amount })),
          linkedGoodsCount: Array.isArray(event.linkedGoodsIds) ? event.linkedGoodsIds.length : 0,
          photosCount: Array.isArray(event.photos) ? event.photos.length : 0,
          description: truncate(event.description)
        }
      })
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
    const [items, records] = await Promise.all([loadEnrichedItems(), getRechargeRecords()])

    // 官方消费趋势口径：逐件带日期条目（运费均摊、跨月补货各自归月、
    // 愿望单与 已出/已赠出/丢失 不计入），统一折算 CNY
    /** @type {Map<string, { amount: number, count: number }>} */
    const goodsMonths = new Map()
    let goodsTotal = 0
    for (const item of items) {
      for (const { date, price } of getItemSpendEntries(item)) {
        const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
        if (yearPrefix && !month.startsWith(yearPrefix)) continue
        const bucket = goodsMonths.get(month) || { amount: 0, count: 0 }
        bucket.amount += price
        bucket.count += 1
        goodsMonths.set(month, bucket)
        goodsTotal += price
      }
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

    const monthsToArray = (/** @type {Map<string, { amount: number, count: number }>} */ months) => (
      [...months.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([month, m]) => ({ month, amount: roundMoney(m.amount), count: m.count }))
    )

    return {
      year: year > 0 ? year : null,
      goods: {
        currency: convertToCNY ? 'CNY' : '（混合，未折算）',
        total: roundMoney(goodsTotal),
        byMonth: monthsToArray(goodsMonths)
      },
      recharge: {
        total: roundMoney(rechargeTotal),
        count: rechargeFiltered.length,
        byMonth: monthsToArray(rechargeMonths)
      },
      note: '谷子金额为官方消费趋势口径（实付价+运费均摊，缺省回退标价，逐件按入手日期归月；愿望单与 已出/已赠出/丢失 不计入' +
        (convertToCNY ? '，非 CNY 已折算' : '') + '）；充值按充值时间归月。'
    }
  }

  /**
   * 角色维度统计：条目数/数量/估算花费/已出件数/愿望单件数。
   * 一条目关联多个角色时按件计入每个角色（与收藏页角色筛选口径一致）。
   * @param {Record<string, any>} args
   */
  async function characterLeaderboard(args) {
    const items = await getItems()
    const limit = Math.min(Math.max(asInt(args.limit) || 15, 1), 50)

    /** @type {Map<string, { count: number, quantity: number, wishlistCount: number, soldCount: number, spendByCurrency: Map<string, number> }>} */
    const stats = new Map()
    const ensure = (/** @type {string} */ key) => {
      const entry = stats.get(key) || {
        count: 0, quantity: 0, wishlistCount: 0, soldCount: 0,
        spendByCurrency: new Map()
      }
      stats.set(key, entry)
      return entry
    }

    for (const item of items) {
      const characters = Array.isArray(item.characters) && item.characters.length > 0
        ? item.characters
        : ['（未标注角色）']
      const currency = asText(item.actualPriceCurrency || item.currency || 'CNY').trim() || 'CNY'
      // 花费=官方消费趋势口径（逐件带日期，愿望单/已出等不计）；愿望单单列 wishlistCount
      const spend = item.isWishlist ? 0 : itemSpendCNY(item)
      const soldUnits = item.isWishlist ? 0 : extractSaleEntries(item).sold.reduce((sum, record) => sum + record.count, 0)

      for (const character of characters) {
        const key = asText(character).trim() || '（未标注角色）'
        const entry = ensure(key)
        if (!item.isWishlist) {
          entry.count += 1
          entry.quantity += Number(item.quantity) || 1
        } else {
          entry.wishlistCount += 1
        }
        entry.soldCount += soldUnits
        entry.spendByCurrency.set(currency, (entry.spendByCurrency.get(currency) || 0) + spend)
      }
    }

    const rows = [...stats.entries()]
      .sort((a, b) => b[1].count - a[1].count || b[1].quantity - a[1].quantity)
      .slice(0, limit)
      .map(([name, entry]) => ({
        character: name,
        count: entry.count,
        quantity: entry.quantity,
        wishlistCount: entry.wishlistCount,
        soldCount: entry.soldCount,
        spend: [...entry.spendByCurrency.entries()].map(([currency, amount]) => ({ currency, amount: Math.round(amount * 100) / 100 }))
      }))

    return { total: stats.size, limit, characters: rows }
  }

  /**
   * 收纳位置分布（不含愿望单条目）。
   * @param {Record<string, any>} _args
   */
  async function storageLocations(_args) {
    const items = await getItems()
    /** @type {Map<string, { count: number, quantity: number, spend: number, samples: string[] }>} */
    const stats = new Map()
    for (const item of items) {
      if (item.isWishlist) continue
      const location = asText(item.storageLocation).trim() || '（未收纳）'
      const entry = stats.get(location) || { count: 0, quantity: 0, spend: 0, samples: [] }
      entry.count += 1
      entry.quantity += Number(item.quantity) || 1
      entry.spend += estimateItemSpend(item)
      if (entry.samples.length < 5 && item.name) entry.samples.push(item.name)
      stats.set(location, entry)
    }

    const locations = [...stats.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .map(([location, entry]) => ({
        location,
        count: entry.count,
        quantity: entry.quantity,
        spend: Math.round(entry.spend * 100) / 100,
        samples: entry.samples
      }))
    return { total: locations.length, locations }
  }

  /**
   * 愿望单概览：数量/期望花费/分布/最近加入。
   * @param {Record<string, any>} _args
   */
  async function wishlistOverview(_args) {
    const items = await getItems()
    const wishlist = items.filter((item) => item.isWishlist)

    /** @type {Map<string, number>} */
    const expectedByCurrency = new Map()
    for (const item of wishlist) {
      const currency = asText(item.currency || 'CNY').trim() || 'CNY'
      const expected = parseMoney(item.price) * (Number(item.quantity) || 1)
      expectedByCurrency.set(currency, (expectedByCurrency.get(currency) || 0) + expected)
    }

    /**
     * @param {(item: any) => string} pick
     */
    function topDistribution(pick) {
      /** @type {Map<string, number>} */
      const stats = new Map()
      for (const item of wishlist) {
        const key = asText(pick(item)).trim() || '（未填写）'
        stats.set(key, (stats.get(key) || 0) + 1)
      }
      return [...stats.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name, count]) => ({ name, count }))
    }

    const recent = [...wishlist]
      .sort((a, b) => (Number(b.updatedAt) || 0) - (Number(a.updatedAt) || 0))
      .slice(0, 10)
      .map((item) => ({
        id: item.id,
        name: item.name,
        ip: item.ip,
        category: item.category,
        price: item.price,
        currency: asText(item.currency || 'CNY').trim() || 'CNY',
        quantity: Number(item.quantity) || 1
      }))

    return {
      total: wishlist.length,
      expectedSpend: [...expectedByCurrency.entries()].map(([currency, amount]) => ({
        currency,
        amount: Math.round(amount * 100) / 100,
        note: '期望值：标价×数量，未含折扣'
      })),
      byIp: topDistribution((item) => item.ip),
      byCategory: topDistribution((item) => item.category),
      recent
    }
  }

  /**
   * 出谷账本：复用 utils/goods/saleStats 的口径（整条 + 逐件）。
   * @param {Record<string, any>} args
   */
  async function saleLedger(args) {
    const items = await getItems()
    const yearPrefix = asInt(args.year) > 0 ? String(asInt(args.year)) : ''
    const { soldRows, listingRows } = buildSaleLedger(items)

    const soldFiltered = soldRows.filter((row) => !yearPrefix || asText(row.at).startsWith(yearPrefix))
    const listingFiltered = listingRows.filter((row) => !yearPrefix || asText(row.at).startsWith(yearPrefix))

    // 汇总必须基于过滤后的行：指定年份时回血/盈亏只统计当年（与列表一致）
    let recoveredTotal = 0
    let profitTotal = 0
    let soldCount = 0
    for (const row of soldFiltered) {
      soldCount += row.count
      if (row.hasPrice) {
        recoveredTotal += row.price - row.fee
        profitTotal += row.profit
      }
    }
    let listingTotal = 0
    let listingCount = 0
    for (const row of listingFiltered) {
      listingCount += row.count
      if (row.hasPrice) listingTotal += row.price
    }
    const summary = {
      recoveredTotal: roundMoney(recoveredTotal),
      listingTotal: roundMoney(listingTotal),
      profitTotal: roundMoney(profitTotal),
      soldCount,
      listingCount,
      hasAny: soldFiltered.length > 0 || listingFiltered.length > 0
    }

    const recentSold = soldFiltered.slice(0, 15).map((row) => ({
      id: row.item.id,
      name: row.item.name,
      date: row.at,
      platform: row.platform,
      price: row.price,
      fee: row.fee,
      profit: row.profit,
      count: row.count,
      hasPrice: row.hasPrice
    }))
    const listing = listingRows
      .filter((row) => row.hasPrice)
      .sort((a, b) => b.price - a.price)
      .slice(0, 5)
      .map((row) => ({ id: row.item.id, name: row.item.name, price: row.price, count: row.count }))

    return {
      year: yearPrefix || null,
      summary,
      recentSold,
      listing
    }
  }

  return {
    goods_search: goodsSearch,
    goods_detail: goodsDetail,
    collection_overview: collectionOverview,
    spending_summary: spendingSummary,
    character_leaderboard: characterLeaderboard,
    storage_locations: storageLocations,
    wishlist_overview: wishlistOverview,
    sale_ledger: saleLedger,
    events_list: eventsList,
    recharge_summary: rechargeSummary
  }
}

/**
 * 组装页面侧（以及未来 Android 原生桥）使用的完整 MCP 服务端。
 * @param {{
 *   dbApi: McpDbApi,
 *   money?: object,
 *   allowWriteTools?: boolean,
 *   writeHandlers?: Record<string, (args: Record<string, any>) => Promise<unknown>>
 * }} params
 *   allowWriteTools 开启且提供 writeHandlers（依赖 store 实例，由调用方注入）时，
 *   写工具才会注册并可被外部调用。
 */
export function createMcpServer({ dbApi, money = {}, allowWriteTools = false, writeHandlers = null }) {
  const readHandlers = createMcpToolHandlers(dbApi, money)
  const handlers = (allowWriteTools && writeHandlers)
    ? { ...readHandlers, ...writeHandlers }
    : readHandlers
  return createMcpRequestHandler({
    serverInfo: MCP_SERVER_INFO,
    instructions: MCP_SERVER_INSTRUCTIONS,
    // 工具清单随外部写入开关变化；关闭时写工具既不展示也不可调用
    listTools: () => getToolDefinitions(allowWriteTools),
    callTool: async (name, args) => {
      // 门禁先于 handler 查找：已知的写工具在未开启时返回明确引导信息；
      // 完全未知的名字（拼写错误等）仍走 Unknown tool
      const isWriteTool = MCP_WRITE_TOOL_DEFINITIONS.some((tool) => tool.name === name)
      if (isWriteTool && !allowWriteTools) {
        throw new Error('外部 MCP 写入未开启：请在应用的 AI 服务 (MCP) 设置中允许外部写入')
      }
      const handler = handlers[name]
      if (!handler) throw new McpUnknownToolError(name)
      return handler(args)
    }
  })
}
