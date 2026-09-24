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
import { fetchTrackLyrics } from '../../utils/music/trackLyrics'
import { normalizeGoodsImageList } from '../../utils/goods/images'
import { searchNeteaseSongs, fetchNeteaseSongCoverMap } from '../../utils/music/neteaseMusic'
import { searchQQSongs } from '../../utils/music/qqMusic'
import { searchBilibiliVideos } from '../../utils/music/bilibiliMusic'
import { buildAmapWebLink } from '../../utils/ai/jumpLinks'
import {
  fetchMihoyoNewArrivals,
  fetchMihoyoGiftArrivals,
  MIHOYO_NEW_ARRIVAL_SHOPS
} from '../../utils/mihoyo/newArrivals'

/**
 * @typedef {Object} McpDbApi
 * @property {() => Promise<any[]>} getItems
 * @property {() => Promise<any[]>} getTrashedItems
 * @property {() => Promise<any[]>} getEvents
 * @property {() => Promise<any[]>} getRechargeRecords
 * @property {() => Promise<any[]>} [getGroups]
 * @property {() => Promise<any[]>} [getGroupItems]
 */

/** 单条输出字段上限，防止超长备注/描述把响应撑爆 */
const NOTE_MAX_LENGTH = 500
const TIMELINE_MAX_ENTRIES = 20

/** 米游铺店铺展示名（给 AI 直接用的中文，不走 i18n） */
const MIHOYO_SHOP_LABELS = Object.freeze({
  ys: '原神',
  xqtd: '星穹铁道',
  bh3: '崩坏3',
  zzz: '绝区零'
})

/** sale_time 是 UTC unix 秒；展示口径与上新页一致（UTC+8） */
function formatMihoyoSaleDate(unixSec) {
  if (!unixSec) return ''
  const d = new Date(unixSec * 1000 + 8 * 3600_000)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`
}

function formatMihoyoSaleDateTime(unixSec) {
  if (!unixSec) return ''
  const d = new Date(unixSec * 1000 + 8 * 3600_000)
  const p = (n) => String(n).padStart(2, '0')
  return `${formatMihoyoSaleDate(unixSec)} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`
}

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
 * 解析条目的有效价格（标价优先，实付价回退）。
 * @param {any} item
 * @returns {number}
 */
function effectivePrice(item) {
  return parseMoney(item.actualPrice) || parseMoney(item.price)
}

/**
 * @param {any} item
 * @param {(amount: number, currency: string) => number} [convert]
 */
function goodsListItem(item, convert = null) {
  const actualCurrency = asText(item.actualPriceCurrency || item.currency || 'CNY').trim() || 'CNY'
  const officialCurrency = asText(item.currency || 'CNY').trim() || 'CNY'
  // 花费折算：非愿望单用官方逐件口径（getItemSpendEntries：shippingEvents 分笔归月 / 单笔挂最晚月、状态排除，
  // 折算字段存在时价格已是 CNY）；愿望单按 标价×数量 期望值折算
  let spendCNY = null
  let priceCNY = null
  if (convert) {
    const qty = Number(item.quantity) || 1
    if (item.isWishlist) {
      spendCNY = roundMoney(convert(parseMoney(item.price) * qty, officialCurrency))
      priceCNY = spendCNY
    } else {
      spendCNY = roundMoney(getItemSpendEntries(item).reduce((sum, entry) => sum + entry.price, 0))
      priceCNY = roundMoney(convert(effectivePrice(item), actualCurrency))
    }
  }
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
    currency: officialCurrency,
    actualPrice: item.actualPrice,
    actualPriceCurrency: actualCurrency,
    acquiredAt: asText(item.acquiredAt).trim(),
    // 多件跨月补货：带上逐件入手日期，AI 才能说清「上月买的 X 件 + 本月又买 Y 件」
    ...(Array.isArray(item.unitAcquiredAtList) && item.unitAcquiredAtList.length > 0
      ? { unitAcquiredAtList: item.unitAcquiredAtList.map((/** @type {unknown} */ d) => asText(d).trim()) }
      : {}),
    saleAt: asText(item.saleAt).trim(),
    shippingFee: asInt(item.shippingFee),
    sellPrice: item.sellPrice,
    sellPlatform: item.sellPlatform,
    sellFee: item.sellFee,
    sellDate: item.sellDate,
    ...(spendCNY !== null ? { spendCNY } : {}),
    ...(priceCNY !== null ? { priceCNY } : {}),
    // CD/专辑等带曲目列表的条目给概况；明细走 goods_detail
    tracksSummary: trackSummary(trackListOf(item.tracks).map(trackView)),
    note: truncate(item.note),
    updatedAt: Number(item.updatedAt) || 0
  }
}

const DATE_LIKE_PATTERN = /^\d{4}-\d{2}(-\d{2})?$/

/**
 * 展开条目的逐件入手日期（与首页时间线/消费统计同口径）。
 * 多件跨月补货时，unitAcquiredAtList 按份数对齐；缺省份数回落到商品级 acquiredAt。
 * @param {any} item
 * @returns {string[]}
 */
function getUnitAcquiredDates(item) {
  const quantity = Math.max(1, Number(item?.quantity) || 1)
  const acquiredAt = asText(item?.acquiredAt).trim()
  const explicit = Array.isArray(item?.unitAcquiredAtList)
    ? item.unitAcquiredAtList.map((value) => asText(value).trim()).filter(Boolean)
    : []
  if (explicit.length === 0) return acquiredAt ? [acquiredAt] : []
  const fallback = acquiredAt || explicit[0]
  return Array.from({ length: quantity }, (_, index) => explicit[index] || fallback)
}

/**
 * 任一件入手日期落入 [after, before] 即命中。
 * 只看商品级 acquiredAt 会漏掉「上月首购 + 本月补货」的跨月条目。
 * @param {any} item
 * @param {string} after
 * @param {string} before
 */
function matchesAcquiredDateRange(item, after, before) {
  if (!after && !before) return true
  return getUnitAcquiredDates(item).some((date) => {
    if (!date) return false
    if (after && date < after) return false
    if (before && date > before) return false
    return true
  })
}

/** 排序用「最新入手」日期：取逐件日期中最晚的一件，跨月补货也能排到正确位置 */
function latestAcquiredDate(item) {
  return getUnitAcquiredDates(item).reduce((latest, date) => (date > latest ? date : latest), '')
}

/** 与 statistics.js 一致的金额取整 */
function roundMoney(value) {
  const n = Number(value)
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0
}

/** @param {unknown} value */
function trackListOf(value) {
  return Array.isArray(value) ? value : []
}

/** 曲目 → MCP 输出（含在线音源可播状态） */
function trackView(track) {
  const neteaseSongId = asText(track?.neteaseSongId).trim()
  const qqSongId = asText(track?.qqSongId).trim()
  const bilibiliVideoId = asText(track?.bilibiliVideoId).trim()
  const playable = Boolean(neteaseSongId || qqSongId || bilibiliVideoId)
  return {
    id: asText(track?.id).trim(),
    title: asText(track?.title).trim(),
    artist: asText(track?.artist).trim(),
    album: asText(track?.album).trim(),
    durationMs: Math.max(0, Number(track?.durationMs) || 0),
    source: asText(track?.source).trim() || 'manual',
    playable,
    ...(playable ? {} : { note: '仅手动录入、未关联在线音源，无法直接播放' })
  }
}

/** 曲目视图 → 概况统计 */
function trackSummary(view) {
  const playable = view.filter((track) => track.playable).length
  return { total: view.length, playable, manualOnly: view.length - playable }
}

/** 首页总金额口径的状态排除项（已出/已赠出/丢失不计入） */
const HOME_EXCLUDED_STATUSES = new Set(['已赠出', '已出', '丢失'])

/**
 * 构造工具名 → 执行函数的映射。
 *
 * @param {McpDbApi} dbApi
 * @param {{
 *   enrichItems?: (items: any[]) => any[],
 *   convertToCNY?: (amount: number, currency: string) => number
 * }} [money]
 *   官方计费口径注入（见 moneyContext.js）：enrichItems 补齐 CNY 折算字段，
 *   convertToCNY 做币种换算。缺省时回退到原始字段的粗略估算（仅单测使用）。
 * @param {{ read?: () => Promise<{ monthly: number, yearly: number }> }} [budgetApi]
 *   吃谷预算读取注入（见 utils/goods/budget.js）；缺省视为未设置预算。
 * @param {{ resolveDisplayUri?: (uri: string) => Promise<string> | string }} [imageOptions]
 *   图片展示 URI 解析：cloud-image:// → 公开可访问 URL，避免把内部引用丢给模型。
 */
export function createMcpToolHandlers(dbApi, money = {}, budgetApi = null, imageOptions = null) {
  const { getItems, getTrashedItems, getEvents, getRechargeRecords } = dbApi
  const { enrichItems = null, convertToCNY = null } = money
  const resolveDisplayUri = typeof imageOptions?.resolveDisplayUri === 'function'
    ? imageOptions.resolveDisplayUri
    : null

  /**
   * 工具结果里的图片 URI 必须是模型可直接嵌入 markdown 的地址：
   * - cloud-image:// 交给 resolveDisplayUri 换成公开 URL（失败则保持原样）
   * - data:/http(s)/本地 WebView 路径原样返回
   * @param {string} uri
   */
  async function toDisplayImageUri(uri) {
    const value = asText(uri).trim()
    if (!value || !resolveDisplayUri) return value
    const isCloudRef = value.startsWith('cloud-image://') || value.startsWith('gist-image://')
    if (!isCloudRef && (value.startsWith('data:') || value.startsWith('http://') || value.startsWith('https://'))) {
      return value
    }
    try {
      const resolved = await resolveDisplayUri(value)
      return asText(resolved).trim() || value
    } catch {
      return value
    }
  }

  async function loadEnrichedItems() {
    const items = await getItems()
    return enrichItems ? await enrichItems(items) : items
  }

  /** 单件花费 = 逐件带日期条目之和（官方消费趋势口径，已排除愿望单/已出/已赠出/丢失） */
  function itemSpendCNY(item) {
    return getItemSpendEntries(item).reduce((sum, entry) => sum + entry.price, 0)
  }

  /**
   * 读取并汇总谷子组（套组）。overview 与 groups_list 共用同一数据源。
   * @param {'collection'|'|'wishlist'|null} [typeFilter] 只保留某类分组；null 两类都要
   * @param {Map<string, any>} [goodsById] 用于填充成员示例名
   */
  async function loadGroupContext(typeFilter = null, goodsById = null) {
    const canLoad = typeof dbApi.getGroups === 'function' && typeof dbApi.getGroupItems === 'function'
    if (!canLoad) {
      return {
        available: false,
        activeGroups: /** @type {any[]} */ ([]),
        manualGroups: /** @type {any[]} */ ([]),
        manualMemberIds: /** @type {Set<string>} */ (new Set()),
        membersByGroup: /** @type {Map<string, any[]>} */ (new Map()),
        summaries: /** @type {any[]} */ ([])
      }
    }

    let rawGroups = []
    let rawGroupItems = []
    try {
      ;[rawGroups, rawGroupItems] = await Promise.all([
        Promise.resolve(dbApi.getGroups()),
        Promise.resolve(dbApi.getGroupItems())
      ])
    } catch {
      return {
        available: false,
        activeGroups: /** @type {any[]} */ ([]),
        manualGroups: /** @type {any[]} */ ([]),
        manualMemberIds: /** @type {Set<string>} */ (new Set()),
        membersByGroup: /** @type {Map<string, any[]>} */ (new Map()),
        summaries: /** @type {any[]} */ ([])
      }
    }

    const groups = Array.isArray(rawGroups) ? rawGroups : []
    const groupItems = Array.isArray(rawGroupItems) ? rawGroupItems : []
    const activeGroups = groups.filter((group) => {
      if (group?.deleted) return false
      if (typeFilter && asText(group.type).trim() !== typeFilter) return false
      return true
    })
    const activeGroupIds = new Set(activeGroups.map((group) => group.id))
    const activeMemberRows = groupItems.filter((row) => !row?.deleted && activeGroupIds.has(row.groupId))

    /** @type {Map<string, any[]>} */
    const membersByGroup = new Map()
    /** @type {Set<string>} */
    const manualMemberIds = new Set()
    for (const row of activeMemberRows) {
      const list = membersByGroup.get(row.groupId) || []
      list.push(row)
      membersByGroup.set(row.groupId, list)
    }

    const manualGroups = activeGroups.filter((group) => asText(group.summaryMode).trim() === 'manual')
    const manualGroupIds = new Set(manualGroups.map((group) => group.id))
    for (const row of activeMemberRows) {
      if (manualGroupIds.has(row.groupId)) manualMemberIds.add(row.goodsId)
    }

    const summaries = activeGroups.map((group) => {
      const members = membersByGroup.get(group.id) || []
      const summaryMode = asText(group.summaryMode).trim() || 'auto'
      const currency = asText(group.currency).trim() || 'CNY'
      const totalAmount = Number(group.totalAmount) || 0
      const memberSamples = members.slice(0, 8).map((row) => {
        const detail = goodsById?.get(row.goodsId)
        return asText(detail?.name).trim() || row.goodsId
      }).filter(Boolean)
      return {
        id: group.id,
        name: asText(group.name).trim() || '（未命名分组）',
        type: asText(group.type).trim() || 'collection',
        summaryMode,
        totalAmount,
        currency,
        memberCount: members.length,
        memberSamples,
        ...(summaryMode === 'manual' && convertToCNY
          ? { totalCNY: roundMoney(convertToCNY(totalAmount, currency)) }
          : {})
      }
    })

    return {
      available: true,
      activeGroups,
      manualGroups,
      manualMemberIds,
      membersByGroup,
      summaries
    }
  }

  /**
   * 与收藏页 useHomeGoodsList / 愿望单页 _wishlistTotals 同口径的总价：
   * 手动总价谷子组只计一次组总价，成员条目不再逐件累加；收藏侧排除已出/已赠出/丢失。
   * 优先用 enrichItems 补齐的 totalValueNumber（页面同款字段），否则回退估算。
   * @param {any[]} items 已过滤到收藏或愿望单的条目
   * @param {ReturnType<typeof loadGroupContext> extends Promise<infer T> ? T : any} groupCtx
   * @param {{ isWishlist: boolean }} options
   */
  function computePageAlignedTotals(items, groupCtx, { isWishlist }) {
    const manualMemberIds = groupCtx?.manualMemberIds || new Set()
    const manualGroups = groupCtx?.manualGroups || []
    let value = 0
    let quantity = 0
    let count = 0
    let hasNonCny = false
    /** @type {Map<string, number>} */
    const currencyTotals = new Map()

    /**
     * @param {string} currency
     * @param {number} amount
     */
    function addCurrency(currency, amount) {
      currencyTotals.set(currency, (currencyTotals.get(currency) || 0) + amount)
      if (currency !== 'CNY') hasNonCny = true
      if (convertToCNY) {
        value += convertToCNY(amount, currency)
      } else if (currency === 'CNY') {
        value += amount
      }
    }

    for (const item of items) {
      if (!isWishlist && HOME_EXCLUDED_STATUSES.has(asText(item.collectStatus).trim())) continue
      count += 1
      quantity += Number(item.quantity) || 1
      if (manualMemberIds.has(item.id)) continue

      const currency = isWishlist
        ? (asText(item.currency || 'CNY').trim() || 'CNY')
        : (asText(item.actualPriceCurrency || item.currency || 'CNY').trim() || 'CNY')
      const pageVal = item.totalValueNumber
      if (pageVal !== undefined && pageVal !== null && Number.isFinite(Number(pageVal))) {
        // 页面字段：enrichItems 后已是 CNY
        currencyTotals.set('CNY', (currencyTotals.get('CNY') || 0) + Number(pageVal))
        value += Number(pageVal)
        continue
      }
      const raw = isWishlist
        ? parseMoney(item.price) * (Number(item.quantity) || 1)
        : estimateItemSpend(item)
      addCurrency(currency, raw)
    }

    for (const group of manualGroups) {
      const currency = asText(group.currency).trim() || 'CNY'
      addCurrency(currency, Number(group.totalAmount) || 0)
    }

    const canCny = Boolean(convertToCNY) || !hasNonCny
    return {
      value: canCny ? roundMoney(value) : null,
      quantity,
      count,
      currencyTotals,
      hasNonCny
    }
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
    const hasTracks = args.hasTracks === true
    const limit = Math.min(Math.max(asInt(args.limit) || 20, 1), 100)
    const offset = Math.max(asInt(args.offset), 0)

    const SORT_FIELDS = new Set(['updatedAt', 'acquiredAt', 'saleAt', 'price', 'actualPrice', 'quantity'])
    const sortBy = SORT_FIELDS.has(asText(args.sortBy).trim()) ? asText(args.sortBy).trim() : 'updatedAt'
    const sortOrder = asText(args.sortOrder).trim() === 'asc' ? 'asc' : 'desc'
    // 排序价格口径与 priceMin/priceMax 一致：实付价优先，缺省回退标价
    // 折算可用时按 CNY 折算值排序，解决跨币种混排不准的问题
    const sortPriceOf = (/** @type {any} */ item) => (convertToCNY ? (item.priceCNY ?? effectivePrice(item)) : (parseMoney(item.actualPrice) || parseMoney(item.price)))
    const sortValueOf = (/** @type {any} */ item) => {
      if (sortBy === 'price' || sortBy === 'actualPrice') return sortPriceOf(item)
      if (sortBy === 'quantity') return Number(item.quantity) || 1
      if (sortBy === 'acquiredAt') return latestAcquiredDate(item)
      if (sortBy === 'saleAt') return asText(item.saleAt).trim()
      return Number(item.updatedAt) || 0
    }
    const sortDirection = sortOrder === 'asc' ? 1 : -1

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
      if (hasTracks && trackListOf(item.tracks).length === 0) return false
      // 日期过滤按逐件入手日期命中：跨月多件（上月首购 + 本月补货）也能被「本月入手」查到
      if (!matchesAcquiredDateRange(item, acquiredAfter, acquiredBefore)) return false
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

    const sorted = matched.sort((a, b) => {
      const av = sortValueOf(a)
      const bv = sortValueOf(b)
      if (typeof av === 'string' || typeof bv === 'string') {
        return String(av).localeCompare(String(bv)) * sortDirection
      }
      return (Number(av) - Number(bv)) * sortDirection
    })
    const page = sorted.slice(offset, offset + limit)

    return {
      total: matched.length,
      offset,
      limit,
      hasMore: offset + page.length < matched.length,
      items: page.map((item) => goodsListItem(item, convertToCNY))
    }
  }

  /**
   * @param {any} item
   */
  async function goodsDetail(args) {
    const id = asText(args.id).trim()
    if (!id) throw new Error('缺少参数 id')
    const [active, trashed] = await Promise.all([getItems(), getTrashedItems()])
    const item = active.find((entry) => entry.id === id) || trashed.find((entry) => entry.id === id)
    if (!item) throw new Error(`未找到 id 为 ${id} 的条目（可能已被彻底删除）`)

    const statusTimeline = Array.isArray(item.statusTimeline) ? item.statusTimeline : []
    // 图片 uri 解析成 WebView/远程可直接展示的地址，AI 用 ![描述](uri) 嵌进回复
    const images = (await Promise.all(
      normalizeGoodsImageList(item.images)
        .slice(0, 12)
        .map(async (image) => ({
          uri: await toDisplayImageUri(image.uri),
          label: image.label,
          kind: image.kind,
          isPrimary: image.isPrimary
        }))
    )).filter((image) => image.uri)
    return {
      ...goodsListItem(item, convertToCNY),
      trashed: Boolean(item.trashed),
      points: item.points,
      unitAcquiredAtList: Array.isArray(item.unitAcquiredAtList) ? item.unitAcquiredAtList : [],
      unitActualPriceList: Array.isArray(item.unitActualPriceList) ? item.unitActualPriceList : [],
      unitCharacterList: Array.isArray(item.unitCharacterList) ? item.unitCharacterList : [],
      unitCollectStatusList: Array.isArray(item.unitCollectStatusList) ? item.unitCollectStatusList : [],
      unitSaleInfoList: Array.isArray(item.unitSaleInfoList) ? item.unitSaleInfoList : [],
      // CD/专辑谷子的专辑曲目明细（trackId 供 music_play / music_lyrics 使用）
      tracks: trackListOf(item.tracks).map(trackView),
      images,
      coverUrl: images.find((image) => image.isPrimary)?.uri || images[0]?.uri || '',
      imagesCount: images.length,
      statusTimeline: statusTimeline.slice(-TIMELINE_MAX_ENTRIES),
      note: item.note
    }
  }

  async function collectionOverview() {
    const items = await loadEnrichedItems()
    const collection = items.filter((item) => !item.isWishlist)
    const wishlist = items.filter((item) => item.isWishlist)
    const goodsMap = new Map(items.map((item) => [item.id, item]))
    const groupCtx = await loadGroupContext('collection', goodsMap)
    // 与收藏页顶部总价同口径（含手动总价谷子组，排除已出/已赠出/丢失）
    const totals = computePageAlignedTotals(collection, groupCtx, { isWishlist: false })

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

    const canUsePageTotal = convertToCNY || (totals.value !== null && !totals.hasNonCny)

    return {
      // 字段名必须无歧义：collectionCount 是「非愿望单」条目数，grandTotal 才是全部
      grandTotal: items.length,
      collectionCount: collection.length,
      collectionQuantity: totals.quantity,
      wishlistCount: wishlist.length,
      groupCount: groupCtx.summaries.length,
      groups: groupCtx.summaries,
      // 与收藏页顶部总价同一条数（含谷子组）
      totalValueCNY: canUsePageTotal ? totals.value : null,
      estimatedSpend: canUsePageTotal
        ? [{
            currency: 'CNY',
            amount: totals.value ?? 0,
            note: '与收藏页总价同口径：已出/已赠出/丢失不计、手动总价谷子组只计一次组总价；分组明细见 groups'
          }]
        : [...totals.currencyTotals.entries()].map(([currency, amount]) => ({
            currency,
            amount: roundMoney(amount),
            note: '估算值：优先按逐件价格求和，否则按 实付价×数量；手动总价谷子组按组总价计入对应币种'
          })),
      byCategory: topDistribution((item) => item.category),
      byIp: topDistribution((item) => item.ip),
      byAcquiredYear: [...byYear.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([year, count]) => ({ year, count })),
      acquiredDateRange: acquiredDates.length
        ? { earliest: acquiredDates[0], latest: acquiredDates[acquiredDates.length - 1] }
        : null,
      note: groupCtx.available
        ? 'groups=收藏套组；回答「收藏花了多少」用 totalValueCNY/estimatedSpend，不要绕开套组自己加总'
        : '当前环境未提供分组数据接口'
    }
  }

  /**
   * @param {Record<string, any>} args
   */
  async function eventsList(args) {
    const events = await getEvents()
    const limit = Math.min(Math.max(asInt(args.limit) || 20, 1), 100)
    const offset = Math.max(asInt(args.offset), 0)
    const cityQuery = asText(args.city).trim().toLowerCase()
    let active = events.filter((event) => !event.deleted)
    if (cityQuery) {
      active = active.filter((event) => {
        const city = asText(event.city).toLowerCase()
        const location = asText(event.location).toLowerCase()
        return city.includes(cityQuery) || location.includes(cityQuery)
      })
    }
    const page = active.slice(offset, offset + limit)

    return {
      total: active.length,
      offset,
      limit,
      hasMore: offset + page.length < active.length,
      mapButtonLink: 'app://event_map',
      events: page.map((event) => {
        const dayTickets = Array.isArray(event.dayTicketList) ? event.dayTicketList : []
        const otherExpenses = Array.isArray(event.otherExpenses) ? event.otherExpenses : []
        const dayTicketsTotal = dayTickets.reduce((sum, d) => sum + parseMoney(d?.price), 0)
        const otherTotal = otherExpenses.reduce((sum, e) => sum + parseMoney(e?.amount), 0)
        const latitude = asText(event.latitude).trim()
        const longitude = asText(event.longitude).trim()
        const amapLink = buildAmapWebLink({
          latitude,
          longitude,
          location: event.location,
          city: event.city,
          name: event.name
        })
        return {
          id: event.id,
          name: event.name,
          type: event.type,
          startDate: event.startDate,
          endDate: event.endDate,
          city: event.city,
          location: event.location,
          latitude,
          longitude,
          // 应用内活动地图：[打开活动地图](app://event_map)；外跳高德用 amapLink
          mapButtonLink: 'app://event_map',
          amapLink,
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
          tracksCount: Array.isArray(event.tracks) ? event.tracks.length : 0,
          description: truncate(event.description)
        }
      })
    }
  }

  /**
   * 演出曲单：演出基本信息 + 曲目概况/明细（含在线音源关联与可播状态）。
   * 默认只给 tracksSummary 概况——用户没问歌单时模型不应该罗列曲目，
   * 所以明细（含 trackId）只在传 includeTracks: true 时返回。
   * @param {Record<string, any>} args
   */
  async function eventTracks(args) {
    const events = await getEvents()
    const eventId = asText(args.eventId).trim()
    const query = asText(args.query).trim().toLowerCase()
    const includeTracks = args.includeTracks === true
    if (eventId && query) throw new Error('eventId 与 query 二选一，不要同时传')
    const limit = Math.min(Math.max(asInt(args.limit) || 10, 1), 50)
    const offset = Math.max(asInt(args.offset), 0)

    let candidates = events.filter((event) => !event.deleted)
    if (eventId) {
      candidates = candidates.filter((event) => event.id === eventId)
      if (candidates.length === 0) throw new Error(`未找到 id 为 ${eventId} 的演出（可能已被删除）`)
    }

    const matched = []
    for (const event of candidates) {
      const tracks = trackListOf(event.tracks)
      if (!eventId && tracks.length === 0) continue
      let visibleTracks = tracks
      if (query) {
        // 演出名命中 → 返回整场曲单；否则按歌名/歌手过滤曲目
        const nameHit = asText(event.name).toLowerCase().includes(query)
        if (!nameHit) {
          visibleTracks = tracks.filter((track) => (
            asText(track?.title).toLowerCase().includes(query) ||
            asText(track?.artist).toLowerCase().includes(query)
          ))
        }
        if (visibleTracks.length === 0) continue
      }
      const view = visibleTracks.map(trackView)
      const latitude = asText(event.latitude).trim()
      const longitude = asText(event.longitude).trim()
      matched.push({
        id: event.id,
        name: event.name,
        type: event.type,
        startDate: event.startDate,
        endDate: event.endDate,
        city: event.city,
        location: event.location,
        latitude,
        longitude,
        mapButtonLink: 'app://event_map',
        amapLink: buildAmapWebLink({
          latitude,
          longitude,
          location: event.location,
          city: event.city,
          name: event.name
        }),
        seatInfo: event.seatInfo,
        ticketPrice: event.ticketPrice,
        ticketType: event.ticketType,
        tags: Array.isArray(event.tags) ? event.tags : [],
        description: truncate(event.description),
        photosCount: trackListOf(event.photos).length,
        // 照片 uri 解析成可直接展示的地址；cloud-image:// 在此换成公开 URL，
        // 避免模型把内部引用「脑补」成错误的 Supabase 链接
        photos: (await Promise.all(
          trackListOf(event.photos)
            .slice(0, 12)
            .map(async (photo) => ({
              uri: await toDisplayImageUri(typeof photo === 'string' ? photo : photo?.uri),
              caption: asText(typeof photo === 'string' ? '' : photo?.caption).trim()
            }))
        )).filter((photo) => photo.uri),
        linkedGoodsCount: Array.isArray(event.linkedGoodsIds) ? event.linkedGoodsIds.length : 0,
        tracksSummary: trackSummary(view),
        ...(includeTracks ? { tracks: view } : {})
      })
    }

    const page = matched.slice(offset, offset + limit)
    return {
      total: matched.length,
      offset,
      limit,
      hasMore: offset + page.length < matched.length,
      hint: includeTracks
        ? '播放用 music_play（传 eventId + trackId）；playable 为 false 的曲目无法播放'
        : '默认只返回曲单概况；用户要完整歌单、找具体歌或要播放时，再传 includeTracks: true 获取曲目明细（含 trackId）',
      events: page
    }
  }

  /** 歌词行数上限：普通歌 ~100 行，超长串烧截断防止响应膨胀 */
  const LYRICS_MAX_LINES = 400

  /**
   * 歌词查询：按演出曲单或 CD/专辑谷子里的曲目 id 拉取歌词。
   * 网易云/QQ 直连歌曲 ID；B 站曲目按标题跨源匹配。
   * @param {Record<string, any>} args
   */
  async function musicLyrics(args) {
    const trackId = asText(args.trackId).trim()
    if (!trackId) throw new Error('trackId 必填（来自 event_tracks 或 goods_detail 的曲目明细）')
    const eventId = asText(args.eventId).trim()
    const goodsId = asText(args.goodsId).trim()
    if (eventId && goodsId) throw new Error('eventId 与 goodsId 二选一，不要同时传')
    if (!eventId && !goodsId) throw new Error('eventId（演出曲单）或 goodsId（CD/专辑谷子）必填')

    let track = null
    let containerName = ''
    if (eventId) {
      const event = (await getEvents()).find((item) => !item.deleted && item.id === eventId)
      if (!event) throw new Error(`未找到 id 为 ${eventId} 的演出`)
      containerName = event.name
      track = trackListOf(event.tracks).find((item) => asText(item?.id).trim() === trackId)
    } else {
      const item = (await getItems()).find((entry) => entry.id === goodsId)
      if (!item) throw new Error(`未找到 id 为 ${goodsId} 的谷子条目`)
      containerName = item.name
      track = trackListOf(item.tracks).find((entry) => asText(entry?.id).trim() === trackId)
    }
    if (!track) throw new Error(`「${containerName}」下未找到 id 为 ${trackId} 的曲目`)

    const hasPlayableSource = Boolean(
      asText(track?.neteaseSongId).trim() ||
      asText(track?.qqSongId).trim() ||
      asText(track?.bilibiliVideoId).trim() ||
      (asText(track?.lyricSource).trim() && asText(track?.lyricSongId).trim())
    )
    if (!hasPlayableSource) {
      throw new Error(`《${asText(track?.title).trim() || '未命名曲目'}》未关联在线音源，无法读取歌词；请在详情页的曲目编辑中为它导入音源`)
    }

    const result = await fetchTrackLyrics(track)
    if (!result) {
      throw new Error(`《${asText(track?.title).trim() || '未命名曲目'}》未关联在线音源，无法读取歌词`)
    }
    const lines = result.lines.slice(0, LYRICS_MAX_LINES).map((line) => ({
      timeMs: Math.max(0, Number(line?.timeMs) || 0),
      text: asText(line?.text)
    }))
    return {
      track: {
        id: trackId,
        title: asText(track?.title).trim(),
        artist: asText(track?.artist).trim()
      },
      ...(eventId ? { eventId } : { goodsId }),
      from: containerName,
      lyricSource: result.source,
      matched: result.matched,
      linesCount: lines.length,
      lines,
      text: lines.map((line) => line.text).join('\n'),
      note: lines.length ? '' : '该音源没有可用歌词（可能是纯音乐或未收录歌词）'
    }
  }

  /**
   * 在线搜歌：网易云 / QQ / Bilibili 三源可选，返回统一 track 形状。
   * 供 event_tracks_manage add 时取 neteaseSongId / qqSongId / bilibiliVideoId。
   * @param {Record<string, any>} args
   */
  async function musicSearch(args) {
    const keyword = asText(args.keyword).trim()
    if (!keyword) throw new Error('keyword 必填')
    const source = asText(args.source).trim() || 'all'
    const limit = Math.min(20, Math.max(1, asInt(args.limit) || 8))

    /** @type {Array<{ source: string, items: any[] }>} */
    const results = []
    const errors = []

    const safeSearch = async (name, fn) => {
      try {
        const items = await fn()
        results.push({ source: name, items })
      } catch (e) {
        errors.push({ source: name, error: e instanceof Error ? e.message : String(e) })
      }
    }

    if (source === 'all' || source === 'netease') {
      await safeSearch('netease', async () => {
        const songs = (await searchNeteaseSongs(keyword, limit)).slice(0, limit)
        const hits = songs.map(viewMusicSearchHit)
        // 网易云搜索接口常不带 album.picUrl：缺封面的用 songId 批量补拉
        const missingIds = hits
          .filter((hit) => !hit.coverUrl && hit.neteaseSongId)
          .map((hit) => hit.neteaseSongId)
        if (missingIds.length > 0) {
          try {
            const coverMap = await fetchNeteaseSongCoverMap(missingIds)
            for (const hit of hits) {
              if (!hit.coverUrl && hit.neteaseSongId && coverMap[hit.neteaseSongId]) {
                hit.coverUrl = coverMap[hit.neteaseSongId]
              }
            }
          } catch {
            // 封面补齐失败不影响搜索结果本身
          }
        }
        return hits
      })
    }
    if (source === 'all' || source === 'qq') {
      await safeSearch('qq', async () => {
        const songs = await searchQQSongs(keyword, limit)
        return songs.slice(0, limit).map(viewMusicSearchHit)
      })
    }
    if (source === 'all' || source === 'bilibili') {
      await safeSearch('bilibili', async () => {
        const videos = await searchBilibiliVideos(keyword, limit)
        return videos.slice(0, limit).map(viewMusicSearchHit)
      })
    }

    const total = results.reduce((sum, group) => sum + group.items.length, 0)
    if (total === 0 && errors.length > 0) {
      throw new Error(`搜索失败：${errors.map((e) => `${e.source}: ${e.error}`).join('；')}`)
    }
    return {
      keyword,
      requestedSource: source,
      total,
      sources: results,
      ...(errors.length ? { partialErrors: errors } : {}),
      hint: '可播候选给试听链接 [▶歌名 · 歌手](app://play_music/<source>/<id>)；要加演出再 ask_user 选一。'
    }
  }

  /**
   * @param {Record<string, any>} track
   */
  function viewMusicSearchHit(track) {
    return {
      title: asText(track?.title).trim(),
      artist: asText(track?.artist).trim(),
      album: asText(track?.album).trim(),
      durationMs: Math.max(0, Number(track?.durationMs) || 0),
      source: asText(track?.source).trim(),
      // 封面必须透传：B 站没有事后补封面的接口，丢了就永久空白
      ...(asText(track?.coverUrl).trim() ? { coverUrl: asText(track?.coverUrl).trim() } : {}),
      ...(asText(track?.neteaseSongId).trim() ? { neteaseSongId: asText(track?.neteaseSongId).trim() } : {}),
      ...(asText(track?.qqSongId).trim() ? { qqSongId: asText(track?.qqSongId).trim() } : {}),
      ...(asText(track?.bilibiliVideoId).trim() ? { bilibiliVideoId: asText(track?.bilibiliVideoId).trim() } : {})
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

    // 按充值项目细分（如 空月祝福/月卡/648）：回答「某项目买了几次」类问题
    const byItem = groupSum((record) => {
      const game = asText(record.game).trim()
      const item = asText(record.itemName).trim()
      return item ? (game ? `${game}·${item}` : item) : ''
    }).slice(0, 15)

    return {
      year: year > 0 ? year : null,
      totalAmount: Math.round(total * 100) / 100,
      count: filtered.length,
      byGame: groupSum((record) => record.game),
      byItem,
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
   * 充值记录检索：按游戏/项目/关键词过滤并聚合（总数、笔数、按项目、按月）。
   * @param {Record<string, any>} args
   */
  async function rechargeSearch(args) {
    const records = await getRechargeRecords()
    const game = asText(args.game).trim().toLowerCase()
    const itemName = asText(args.itemName).trim().toLowerCase()
    const query = asText(args.query).trim().toLowerCase()
    const year = asInt(args.year)
    const month = asInt(args.month)
    if (month > 0 && year <= 0) throw new Error('month 需与 year 搭配使用')
    if (month > 12) throw new Error('month 需为 1-12')
    const limit = Math.min(Math.max(asInt(args.limit) || 50, 1), 200)
    const offset = Math.max(asInt(args.offset), 0)

    const matched = records.filter((record) => {
      if (record.deleted) return false
      const recordGame = asText(record.game).toLowerCase()
      const recordItem = asText(record.itemName).toLowerCase()
      if (game && !recordGame.includes(game)) return false
      if (itemName && !recordItem.includes(itemName)) return false
      if (query && !(recordGame.includes(query) || recordItem.includes(query) || asText(record.note).toLowerCase().includes(query))) return false
      const chargedAt = asText(record.chargedAt)
      if (year > 0 && !chargedAt.startsWith(String(year))) return false
      if (month > 0 && !chargedAt.startsWith(`${year}-${String(month).padStart(2, '0')}`)) return false
      return true
    })

    const totalAmount = matched.reduce((sum, record) => sum + (Number(record.amount) || 0), 0)

    /** @type {Map<string, { item: string, game: string, total: number, count: number }>} */
    const itemStats = new Map()
    for (const record of matched) {
      const item = asText(record.itemName).trim() || '（未填写）'
      const recordGame = asText(record.game).trim()
      const key = recordGame ? `${recordGame}·${item}` : item
      const entry = itemStats.get(key) || { item, game: recordGame, total: 0, count: 0 }
      entry.total += Number(record.amount) || 0
      entry.count += 1
      itemStats.set(key, entry)
    }
    const byItem = [...itemStats.values()]
      .sort((a, b) => b.count - a.count || b.total - a.total)
      .map((entry) => ({ item: entry.item, game: entry.game, total: Math.round(entry.total * 100) / 100, count: entry.count }))

    /** @type {Map<string, { total: number, count: number }>} */
    const monthStats = new Map()
    for (const record of matched) {
      const monthKey = asText(record.chargedAt).slice(0, 7) || '（未知）'
      const entry = monthStats.get(monthKey) || { total: 0, count: 0 }
      entry.total += Number(record.amount) || 0
      entry.count += 1
      monthStats.set(monthKey, entry)
    }
    const byMonth = [...monthStats.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([monthKey, stat]) => ({ month: monthKey, total: Math.round(stat.total * 100) / 100, count: stat.count }))

    const sorted = matched.sort((a, b) => asText(b.chargedAt).localeCompare(asText(a.chargedAt)))
    const page = sorted.slice(offset, offset + limit)

    return {
      totalAmount: Math.round(totalAmount * 100) / 100,
      count: matched.length,
      offset,
      limit,
      hasMore: offset + page.length < matched.length,
      byItem: byItem.slice(0, 20),
      byMonth,
      records: page.map((record) => ({
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

    // 官方花费口径：getItemSpendEntries（shippingEvents 分笔归月 / 单笔挂最晚月、跨月补货各自归月、
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
      note: '谷子金额为官方花费口径（实付价+运费，缺省回退标价×数量；shippingEvents 按日期分月，无则整笔挂最晚入手月；愿望单与 已出/已赠出/丢失 不计入' +
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
   * 愿望单概览：数量/期望花费/分布/最近加入/最贵条目 + 心愿单谷子组。
   * 金额与愿望单页总价同口径：手动总价组只计组总价。
   * @param {Record<string, any>} _args
   */
  async function wishlistOverview(_args) {
    const items = await loadEnrichedItems()
    const wishlist = items.filter((item) => item.isWishlist)
    const goodsMap = new Map(items.map((item) => [item.id, item]))
    const groupCtx = await loadGroupContext('wishlist', goodsMap)
    const totals = computePageAlignedTotals(wishlist, groupCtx, { isWishlist: true })

    const withExpected = wishlist.map((item) => {
      const currency = asText(item.currency || 'CNY').trim() || 'CNY'
      const quantity = Number(item.quantity) || 1
      const expected = parseMoney(item.price) * quantity
      const inManualGroup = groupCtx.manualMemberIds.has(item.id)
      const expectedCNY = convertToCNY ? roundMoney(convertToCNY(expected, currency)) : null
      return { item, currency, quantity, expected, expectedCNY, inManualGroup }
    })

    /** @type {Map<string, number>} */
    const expectedByCurrency = new Map()
    for (const row of withExpected) {
      // 手动总价组成员不再逐件计入，组总价在下面单独加（与愿望单页一致）
      if (row.inManualGroup) continue
      expectedByCurrency.set(row.currency, (expectedByCurrency.get(row.currency) || 0) + row.expected)
    }
    for (const group of groupCtx.manualGroups) {
      const currency = asText(group.currency).trim() || 'CNY'
      const amount = Number(group.totalAmount) || 0
      expectedByCurrency.set(currency, (expectedByCurrency.get(currency) || 0) + amount)
    }

    // 最贵的几件：有汇率折算时按 CNY 排（跨币种可比），否则只能按原币数值近似
    // 手动总价组成员仍按标价展示（代表单件价值），总价看 expectedSpendCNY / groups
    const mostExpensive = [...withExpected]
      .sort((a, b) => (b.expectedCNY ?? b.expected) - (a.expectedCNY ?? a.expected))
      .slice(0, 5)
      .map(({ item, currency, quantity, expected, expectedCNY, inManualGroup }) => ({
        id: item.id,
        name: item.name,
        ip: item.ip,
        category: item.category,
        currency,
        price: item.price,
        quantity,
        expected: roundMoney(expected),
        ...(expectedCNY !== null ? { expectedCNY } : {}),
        ...(inManualGroup ? { inManualGroup: true } : {})
      }))

    // 无汇率注入时保持 null（与既有测试/文档一致）；生产环境 money 注入后与愿望单页总价一致
    const expectedSpendCNY = convertToCNY ? totals.value : null

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
        quantity: Number(item.quantity) || 1,
        ...(groupCtx.manualMemberIds.has(item.id) ? { inManualGroup: true } : {})
      }))

    return {
      total: wishlist.length,
      groupCount: groupCtx.summaries.length,
      groups: groupCtx.summaries,
      // 与愿望单页总价同口径（含心愿单组；手动总价组只计组总价）
      totalValueCNY: expectedSpendCNY,
      expectedSpend: [...expectedByCurrency.entries()].map(([currency, amount]) => ({
        currency,
        amount: Math.round(amount * 100) / 100,
        note: '期望值：标价×数量，未含折扣；手动总价谷子组按组总价计入；不同币种分开列出，禁止跨币种相加'
      })),
      expectedSpendCNY,
      mostExpensive,
      byIp: topDistribution((item) => item.ip),
      byCategory: topDistribution((item) => item.category),
      recent,
      note: groupCtx.available
        ? 'groups=心愿单谷子组；回答「愿望单要花多少」用 expectedSpendCNY/totalValueCNY，不要绕开套组自己加总'
        : '当前环境未提供分组数据接口'
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

  /**
   * 列出收藏/愿望单分组，附带成员数与可选成员明细。
   * @param {Record<string, any>} args
   */
  async function groupsList(args) {
    const getGroups = typeof dbApi.getGroups === 'function' ? dbApi.getGroups : null
    const getGroupItems = typeof dbApi.getGroupItems === 'function' ? dbApi.getGroupItems : null
    if (!getGroups || !getGroupItems) {
      return { total: 0, groups: [], note: '当前环境未提供分组数据接口' }
    }

    const typeFilter = asText(args?.type).trim()
    if (typeFilter && typeFilter !== 'collection' && typeFilter !== 'wishlist') {
      throw new Error('type 需为 collection 或 wishlist')
    }
    const query = asText(args?.query).trim().toLowerCase()
    const includeMembers = args?.includeMembers === true

    const [groups, groupItems, goods] = await Promise.all([
      getGroups(),
      getGroupItems(),
      includeMembers ? getItems() : Promise.resolve([])
    ])
    const goodsMap = new Map(goods.map((item) => [item.id, item]))
    const goodsById = new Map([
      ...goods,
      ...(await getTrashedItems())
    ].map((item) => [item.id, item]))

    const activeGroups = groups.filter((group) => {
      if (group?.deleted) return false
      if (typeFilter && asText(group.type).trim() !== typeFilter) return false
      if (query && !asText(group.name).toLowerCase().includes(query)) return false
      return true
    })

    const rows = activeGroups.map((group) => {
      const memberRows = groupItems.filter((item) => item.groupId === group.id && !item.deleted)
      const sample = memberRows
        .slice(0, 20)
        .map((member) => {
          const detail = goodsById.get(member.goodsId) || goodsMap.get(member.goodsId)
          return {
            goodsId: member.goodsId,
            name: asText(detail?.name).trim() || '(已删除或不在当前列表)',
            isWishlist: Boolean(detail?.isWishlist)
          }
        })
      return {
        id: group.id,
        name: group.name,
        type: asText(group.type).trim() || 'collection',
        summaryMode: asText(group.summaryMode).trim() || 'auto',
        totalAmount: Number(group.totalAmount) || 0,
        currency: asText(group.currency).trim() || 'CNY',
        note: truncate(group.note),
        memberCount: memberRows.length,
        ...(includeMembers ? { members: sample, membersTruncated: memberRows.length > sample.length } : {})
      }
    })

    return {
      total: rows.length,
      groups: rows,
      hint: '单件最多一个分组；改组用 groups_manage。'
    }
  }

  /**
   * 列出回收站条目（软删除、尚未永久清除）。
   * @param {Record<string, any>} args
   */
  async function trashList(args) {
    const query = asText(args?.query).trim().toLowerCase()
    const limit = Math.min(Math.max(asInt(args?.limit) || 50, 1), 100)
    const offset = Math.max(asInt(args?.offset), 0)

    const trashed = await getTrashedItems()
    const matched = trashed.filter((item) => {
      if (!query) return true
      const haystack = [
        item.name, item.ip, item.category, item.variant, item.note,
        ...(Array.isArray(item.characters) ? item.characters : [])
      ].map((part) => asText(part).toLowerCase())
      return haystack.some((part) => part.includes(query))
    })

    const page = matched
      .slice(offset, offset + limit)
      .map((item) => ({
        id: item.id,
        name: item.name,
        category: item.category,
        ip: item.ip,
        quantity: Number(item.quantity) || 1,
        collectStatus: item.collectStatus,
        isWishlist: Boolean(item.isWishlist),
        note: truncate(item.note),
        updatedAt: Number(item.updatedAt) || 0
      }))

    return {
      total: matched.length,
      items: page,
      hasMore: offset + page.length < matched.length,
      hint: '恢复 goods_restore；永久删除 goods_purge（需确认）'
    }
  }

  /**
   * 吃谷预算总览：当前预算、本月/今年进度、按月/按年花费与超支标记。
   * 花费口径与「我的-吃谷预算」一致（官方逐件口径）。
   */
  async function budgetOverview() {
    const [items, budgets] = await Promise.all([
      loadEnrichedItems(),
      budgetApi && typeof budgetApi.read === 'function'
        ? budgetApi.read()
        : Promise.resolve({ monthly: 0, yearly: 0 })
    ])
    const monthlyBudget = Math.max(0, Number(budgets?.monthly) || 0)
    const yearlyBudget = Math.max(0, Number(budgets?.yearly) || 0)

    /** @type {Map<string, number>} */
    const monthSpend = new Map()
    /** @type {Map<string, number>} */
    const yearSpend = new Map()
    for (const item of items) {
      for (const { date, price } of getItemSpendEntries(item)) {
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
        monthSpend.set(monthKey, (monthSpend.get(monthKey) || 0) + price)
        yearSpend.set(String(date.getFullYear()), (yearSpend.get(String(date.getFullYear())) || 0) + price)
      }
    }

    const now = new Date()
    const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const currentYearKey = String(now.getFullYear())

    /** @param {number} spent @param {number} budget */
    function progress(spent, budget) {
      return {
        budget,
        spent: roundMoney(spent),
        remaining: budget > 0 ? roundMoney(budget - spent) : 0,
        percent: budget > 0 ? Math.round((spent / budget) * 1000) / 10 : 0,
        isOver: budget > 0 && spent > budget,
        hasBudget: budget > 0
      }
    }

    return {
      budget: { monthly: monthlyBudget, yearly: yearlyBudget, note: '0 表示未设置' },
      current: {
        month: currentMonthKey,
        monthProgress: progress(monthSpend.get(currentMonthKey) || 0, monthlyBudget),
        year: currentYearKey,
        yearProgress: progress(yearSpend.get(currentYearKey) || 0, yearlyBudget)
      },
      byMonth: Array.from({ length: 12 }, (_, index) => {
        const key = `${now.getFullYear()}-${String(index + 1).padStart(2, '0')}`
        const spent = monthSpend.get(key) || 0
        return { month: key, spent: roundMoney(spent), budget: monthlyBudget, overBudget: monthlyBudget > 0 && spent > monthlyBudget }
      }),
      byYear: [...yearSpend.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([year, spent]) => ({ year, spent: roundMoney(spent), budget: yearlyBudget, overBudget: yearlyBudget > 0 && spent > yearlyBudget })),
      hint: '看 current 与 overBudget；改预算 budget_set（0=清除）'
    }
  }

  /**
   * 米游铺上新速览：商品上新 / 积分兑换 / 满赠。
   * @param {Record<string, any>} args
   */
  async function mihoyoNewArrivals(args) {
    const catalog = asText(args?.catalog).trim() || 'shop'
    const shopCode = asText(args?.shopCode).trim()
    const query = asText(args?.query).trim().toLowerCase()
    const limit = Math.min(50, Math.max(1, asInt(args?.limit) || 20))

    if (!['shop', 'point', 'gift', 'all'].includes(catalog)) {
      throw new Error('catalog 需为 shop/point/gift/all')
    }
    if (shopCode && !MIHOYO_NEW_ARRIVAL_SHOPS.includes(shopCode)) {
      throw new Error(`shopCode 需为 ${MIHOYO_NEW_ARRIVAL_SHOPS.join('/')}`)
    }
    const shopCodes = shopCode ? [shopCode] : MIHOYO_NEW_ARRIVAL_SHOPS
    const catalogs = catalog === 'all' ? ['shop', 'point', 'gift'] : [catalog]

    /** @type {any[]} */
    const rawItems = []
    /** @type {Array<{ catalog?: string, shopCode?: string, message: string }>} */
    const errors = []

    await Promise.all(
      catalogs.map(async (cat) => {
        try {
          if (cat === 'gift') {
            const { items, errors: giftErrors } = await fetchMihoyoGiftArrivals(shopCodes)
            rawItems.push(...(items || []))
            for (const err of giftErrors || []) {
              errors.push({ catalog: 'gift', shopCode: err.shopCode, message: err.message })
            }
          } else {
            const { items, errors: catErrors } = await fetchMihoyoNewArrivals(cat, shopCodes)
            rawItems.push(...(items || []))
            for (const err of catErrors || []) {
              errors.push({ catalog: cat, shopCode: err.shopCode, message: err.message })
            }
          }
        } catch (e) {
          errors.push({
            catalog: cat,
            message: e instanceof Error ? e.message : String(e)
          })
        }
      })
    )

    let items = rawItems.map(viewMihoyoArrival)
    if (query) {
      items = items.filter((item) => item.name.toLowerCase().includes(query)
        || item.shopName.toLowerCase().includes(query)
        || (item.giftActivityName || '').toLowerCase().includes(query))
    }
    // 与上新页一致：shop/gift 按开售时间倒序，point 按积分倒序
    items.sort((a, b) => {
      if (a.catalog === 'point' || b.catalog === 'point') {
        const pointDiff = (b.points || 0) - (a.points || 0)
        if (pointDiff !== 0) return pointDiff
      } else {
        const saleDiff = (b.saleTime || 0) - (a.saleTime || 0)
        if (saleDiff !== 0) return saleDiff
      }
      return String(a.name || '').localeCompare(String(b.name || ''), 'zh-Hans-CN')
    })
    const total = items.length
    items = items.slice(0, limit)

    return {
      catalog,
      shopCodes,
      total,
      count: items.length,
      items,
      ...(errors.length ? { partialErrors: errors } : {}),
      hint: '加心愿单：字段原样 goods_add（isWishlist:true）；浏览 navigate mihoyo_new_arrivals。'
    }
  }

  /**
   * @param {Record<string, any>} item
   */
  function viewMihoyoArrival(item) {
    const shopCode = asText(item?.shop_code).trim()
    const saleTime = Number(item?.sale_time) || 0
    const priceCents = Number(item?.price_cents) || 0
    const points = Number(item?.point) || 0
    const priceYuan = priceCents > 0 ? priceCents / 100 : null
    return {
      goodsId: asText(item?.goods_id).trim(),
      name: asText(item?.name).trim(),
      catalog: asText(item?.catalog).trim() || 'shop',
      shopCode,
      shopName: MIHOYO_SHOP_LABELS[shopCode] || shopCode,
      priceYuan,
      priceCents,
      points: points > 0 ? points : null,
      saleTime,
      saleAt: formatMihoyoSaleDate(saleTime),
      saleAtLocal: formatMihoyoSaleDateTime(saleTime),
      onSale: !saleTime || saleTime * 1000 <= Date.now(),
      isNew: Boolean(item?.is_new),
      coverUrl: asText(item?.cover_url).trim(),
      ...(item?.is_gift
        ? {
            isGift: true,
            giftActivityId: asText(item?.gift_activity_id).trim(),
            giftActivityName: asText(item?.gift_activity_name).trim()
          }
        : {})
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
    event_tracks: eventTracks,
    music_lyrics: musicLyrics,
    music_search: musicSearch,
    recharge_summary: rechargeSummary,
    recharge_search: rechargeSearch,
    groups_list: groupsList,
    trash_list: trashList,
    budget_overview: budgetOverview,
    mihoyo_new_arrivals: mihoyoNewArrivals
  }
}

/**
 * 组装页面侧（以及未来 Android 原生桥）使用的完整 MCP 服务端。
 * @param {{
 *   dbApi: McpDbApi,
 *   money?: object,
 *   budgetApi?: { read?: () => Promise<{ monthly: number, yearly: number }> },
 *   allowWriteTools?: boolean,
 *   writeHandlers?: Record<string, (args: Record<string, any>) => Promise<unknown>>
 * }} params
 *   allowWriteTools 开启且提供 writeHandlers（依赖 store 实例，由调用方注入）时，
 *   写工具才会注册并可被外部调用。
 */
export function createMcpServer({ dbApi, money = {}, budgetApi = null, allowWriteTools = false, writeHandlers = null }) {
  const readHandlers = createMcpToolHandlers(dbApi, money, budgetApi)
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
