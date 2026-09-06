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
import { fetchTrackLyrics } from '../../utils/trackLyrics'
import { normalizeGoodsImageList } from '../../utils/goods/images'

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
    // CD/专辑等带曲目列表的条目给概况；明细走 goods_detail
    tracksSummary: trackSummary(trackListOf(item.tracks).map(trackView)),
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
 */
export function createMcpToolHandlers(dbApi, money = {}, budgetApi = null) {
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
    const hasTracks = args.hasTracks === true
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
      if (hasTracks && trackListOf(item.tracks).length === 0) return false
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
   * @param {any} item
   */
  async function goodsDetail(args) {
    const id = asText(args.id).trim()
    if (!id) throw new Error('缺少参数 id')
    const [active, trashed] = await Promise.all([getItems(), getTrashedItems()])
    const item = active.find((entry) => entry.id === id) || trashed.find((entry) => entry.id === id)
    if (!item) throw new Error(`未找到 id 为 ${id} 的条目（可能已被彻底删除）`)

    const statusTimeline = Array.isArray(item.statusTimeline) ? item.statusTimeline : []
    // 图片 uri 本身就是 WebView/远程可直接展示的地址，AI 可用 ![描述](uri) 嵌进回复
    const images = normalizeGoodsImageList(item.images)
      .slice(0, 12)
      .map((image) => ({
        uri: image.uri,
        label: image.label,
        kind: image.kind,
        isPrimary: image.isPrimary
      }))
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
      matched.push({
        id: event.id,
        name: event.name,
        type: event.type,
        startDate: event.startDate,
        endDate: event.endDate,
        city: event.city,
        location: event.location,
        seatInfo: event.seatInfo,
        ticketPrice: event.ticketPrice,
        ticketType: event.ticketType,
        tags: Array.isArray(event.tags) ? event.tags : [],
        description: truncate(event.description),
        photosCount: trackListOf(event.photos).length,
        // 照片 uri 为 WebView/远程可直接展示的地址，AI 可用 ![描述](uri) 嵌进回复
        photos: trackListOf(event.photos)
          .slice(0, 12)
          .map((photo) => ({
            uri: asText(typeof photo === 'string' ? photo : photo?.uri).trim(),
            caption: asText(typeof photo === 'string' ? '' : photo?.caption).trim()
          }))
          .filter((photo) => photo.uri),
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
      hint: '回答「这个月/今年预算还剩多少」「哪个月/哪年超了」看 current 与 overBudget；用户要改预算用 budget_set（0 = 清除）'
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
    recharge_summary: rechargeSummary,
    recharge_search: rechargeSearch,
    budget_overview: budgetOverview
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
