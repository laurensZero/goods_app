/**
 * 米游铺「上新」列表 —— 公开列表多页 + 本地缓存合并
 *
 * - shop：search_goods_spu_list，show_sale_type=2（即将上新）+ 高 limit 一次拉全
 * - type=3 是现货+预约（几百件），会把真正的新品挤出前几页，不能用
 * - 点卡片再用 goods_id 调 goods/detail 取 SKU（列表本身没有 SKU）
 * - 封面用列表 cover_url
 * 保留策略：开售后被挤出时靠本机缓存再留一段时间。
 */
import { mihoyoRequest } from '@/utils/mihoyo/request'
import {
  fetchGoodsGiftActivityIds,
  fetchGiftActivityPublic,
} from '@/utils/mihoyo'
import { Capacitor } from '@capacitor/core'

const SHOP_LIST_PATH = '/common/homeishop/v1/goods/search_goods_spu_list'
const POINT_LIST_PATH = '/common/hm_app/v1/goods/point_goods_list'

export const MIHOYO_NEW_ARRIVAL_SHOPS = ['ys', 'xqtd', 'bh3', 'zzz']

/** 商店：开售后 / 掉出列表后，本机再保留的天数 */
const SHOP_RELEASED_DAYS = 7
/** 积分展示窗口 */
const POINT_RELEASED_DAYS = 14
const CACHE_PREFIX = 'goods-app:mihoyo-new-arrivals:'
const CACHE_MAX_ITEMS = 200
/** 列表页：limit 拉满基本可一次取完（type=2 每店约几十条），不必翻页 */
const SHOP_PAGE_LIMIT = 100
const SHOP_MAX_PAGES = 1
/** 本机 first_seen：多久内算「新品」 */
const NEW_FLAG_DAYS = 7
const FIRST_SEEN_KEY = 'goods-app:mihoyo-arrivals-first-seen'
const FIRST_SEEN_MAX = 400

const SHOP_HEADERS = {
  Referer: 'https://www.mihoyogift.com/',
  'x-rpc-language': 'zh-cn',
}

const POINT_HEADERS = {
  Referer: 'https://mihoyogift.com/m/point',
  'x-rpc-language': 'zh-cn',
  'x-rpc-client_type': '5',
  ...(Capacitor.isNativePlatform()
    ? {
        'User-Agent':
          'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148',
      }
    : {}),
}

function mapListItem(item, shopCode, catalog) {
  const rawPrice = Number(item?.price)
  const rawPoint = Number(item?.point)
  return {
    goods_id: String(item?.goods_id || '').trim(),
    name: String(item?.name || '').trim(),
    cover_url: String(item?.cover_url || '').trim(),
    price_cents: Number.isFinite(rawPrice) ? rawPrice : 0,
    point: catalog === 'point' && Number.isFinite(rawPoint) ? rawPoint : 0,
    sale_time: Number(item?.sale_time) || 0,
    shop_code: shopCode,
    catalog,
  }
}

/** sale_time 是北京墙钟对应的 unix 秒，+8h 得真实开售 UTC 时刻 */
function saleUtcMs(saleTimeSec) {
  if (!saleTimeSec) return 0
  return saleTimeSec * 1000 + 8 * 3600_000
}

function isWithinWindow(saleTimeSec, days) {
  const saleMs = saleUtcMs(saleTimeSec)
  if (!saleMs) return true
  return saleMs >= Date.now() - days * 24 * 3600_000
}

function retentionDays(catalog) {
  return catalog === 'point' ? POINT_RELEASED_DAYS : SHOP_RELEASED_DAYS
}

function cacheKey(catalog) {
  return `${CACHE_PREFIX}${catalog}`
}

function loadCache(catalog) {
  try {
    const raw = localStorage.getItem(cacheKey(catalog))
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    const map = {}
    const days = retentionDays(catalog)
    for (const item of Object.values(parsed || {})) {
      if (!item?.goods_id) continue
      // 缓存条目：开售时间仍在窗口内，或「最后见到」仍在窗口内
      const lastSeen = Number(item.cached_at) || 0
      const keepBySale = isWithinWindow(item.sale_time, days)
      const keepBySeen = lastSeen >= Date.now() - days * 24 * 3600_000
      if (!keepBySale && !keepBySeen) continue
      map[String(item.goods_id)] = item
    }
    return map
  } catch {
    return {}
  }
}

function saveCache(catalog, map) {
  try {
    const list = Object.values(map)
      .sort((a, b) => (Number(b.cached_at) || 0) - (Number(a.cached_at) || 0))
      .slice(0, CACHE_MAX_ITEMS)
    const next = {}
    for (const item of list) next[item.goods_id] = item
    localStorage.setItem(cacheKey(catalog), JSON.stringify(next))
  } catch {
    // 配额满等忽略
  }
}

/**
 * 合并：实时列表字段优先；掉出列表但仍在保留窗内的缓存条目补回。
 */
function mergeWithCache(catalog, liveItems) {
  const cache = loadCache(catalog)
  const now = Date.now()
  const days = retentionDays(catalog)
  const merged = new Map()
  const giftKeySeen = new Set()

  for (const item of liveItems) {
    if (!item?.goods_id) continue
    if (item.is_gift) {
      const gKey = giftDedupeKey(item.name) || item.goods_id
      if (giftKeySeen.has(gKey)) continue
      giftKeySeen.add(gKey)
    }
    merged.set(item.goods_id, { ...item, cached_at: now })
  }

  for (const [id, cached] of Object.entries(cache)) {
    if (merged.has(id)) continue
    if (!isWithinWindow(cached.sale_time, days)) continue
    if (cached.is_gift) {
      const gKey = giftDedupeKey(cached.name) || id
      if (giftKeySeen.has(gKey)) continue
      giftKeySeen.add(gKey)
    }
    merged.set(id, { ...cached, catalog })
  }

  const map = {}
  for (const [id, item] of merged) map[id] = item
  saveCache(catalog, map)
  return [...merged.values()]
}

function loadFirstSeenMap() {
  try {
    const raw = localStorage.getItem(FIRST_SEEN_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function saveFirstSeenMap(map) {
  try {
    const cutoff = Date.now() - NEW_FLAG_DAYS * 86_400_000
    const entries = Object.entries(map)
      .filter(([, at]) => (Number(at) || 0) >= cutoff)
      .sort((a, b) => (Number(b[1]) || 0) - (Number(a[1]) || 0))
      .slice(0, FIRST_SEEN_MAX)
    localStorage.setItem(FIRST_SEEN_KEY, JSON.stringify(Object.fromEntries(entries)))
  } catch {
    // 配额满等忽略
  }
}

/**
 * 本机 first_seen 打「新品」标：
 * - 首次建库：只记基线，不把整页都标成新品
 * - 之后新出现的 goods_id 记 now 并标 is_new
 * - 已见过且仍在 NEW_FLAG_DAYS 内继续标
 */
function applyLocalNewFlags(items) {
  const map = loadFirstSeenMap()
  const hasBaseline = Object.keys(map).length > 0
  const now = Date.now()
  const cutoff = now - NEW_FLAG_DAYS * 86_400_000
  let changed = false

  for (const item of items || []) {
    const id = String(item?.goods_id || '').trim()
    if (!id || item.is_gift) continue
    const prev = Number(map[id]) || 0
    if (!hasBaseline) {
      map[id] = now
      changed = true
      // 首次建库：不亮标
      continue
    }
    if (!prev) {
      map[id] = now
      changed = true
      item.is_new = true
      item.first_seen_at = new Date(now).toISOString()
      continue
    }
    if (prev >= cutoff) {
      item.is_new = true
      item.first_seen_at = new Date(prev).toISOString()
    }
  }

  if (changed || Object.keys(map).length) saveFirstSeenMap(map)
  return items
}

async function fetchNewArrivalPage(
  catalog,
  shopCode,
  { limit = SHOP_PAGE_LIMIT, maxPages = SHOP_MAX_PAGES } = {},
) {
  const normalizedShop = String(shopCode || '').trim()
  if (!normalizedShop) return []

  const isPoint = catalog === 'point'
  const path = isPoint ? POINT_LIST_PATH : SHOP_LIST_PATH
  const headers = isPoint ? POINT_HEADERS : SHOP_HEADERS
  const items = []
  let page = 1

  while (page <= maxPages) {
    const q = new URLSearchParams({
      limit: String(limit),
      page: String(page),
      shop_code: normalizedShop,
    })
    if (!isPoint) {
      q.set('order_by', 'online_time')
      // 2 = 即将上新（与网页上新一致）；3 是现货+预约，会淹没新品
      q.set('show_sale_type', '2')
      q.set('hide_sold_out', 'false')
    }

    const json = await mihoyoRequest(`${path}?${q.toString()}`, { headers })
    if (json?.retcode !== 0) {
      throw new Error(json?.message || `接口错误 ${json?.retcode}`)
    }
    const list = Array.isArray(json?.data?.list) ? json.data.list : []
    if (!list.length) break
    // 封面直接用列表 cover_url，不另拉详情
    items.push(...list.map((item) => mapListItem(item, normalizedShop, catalog)))
    if (list.length < limit) break
    page += 1
  }

  const days = retentionDays(catalog)
  return items.filter((item) => isWithinWindow(item.sale_time, days))
}

function sortArrivals(catalog, items) {
  items.sort((a, b) => {
    if (catalog === 'shop') {
      const diff = (b.sale_time || 0) - (a.sale_time || 0)
      if (diff !== 0) return diff
      return String(a.name || '').localeCompare(String(b.name || ''), 'zh-Hans-CN')
    }
    const pointDiff = (b.point || 0) - (a.point || 0)
    if (pointDiff !== 0) return pointDiff
    return String(a.name || '').localeCompare(String(b.name || ''), 'zh-Hans-CN')
  })
  return items
}

/**
 * 赠品 A/B 变体去重键：去掉末尾款式字母（镭射卡A / 镭射卡B → 同一条）。
 * 只处理「…A/B/C」结尾，或「…A【预售】」这类。
 */
export function giftDedupeKey(name) {
  let s = String(name || '').trim()
  s = s.replace(/【[^】]*(?:预售|预计|现货|补款|尾款|发货|到仓|开售)[^】]*】/g, '')
  s = s.replace(/（[^）]*(?:预售|预计|现货|补款|尾款|发货|到仓|开售)[^）]*）/g, '')
  s = s.replace(/\([^)]*(?:预售|预计|现货|补款|尾款|发货|到仓|开售)[^)]*\)/g, '')
  s = s.replace(
    /\s*(?:(?:第?\d+|[一二三四五六七八九十两]+)\s*(?:批|批次|期)\s*)?(?:预售|预计|现货|补款|尾款|发货|到仓|开售)(?:[^\s（）()【】\[\]]*)?$/g,
    '',
  )
  s = s.replace(/[A-E]$/, '')
  return s.trim()
}

/**
 * 拉取多个店铺的上新列表，与本机缓存合并后返回。
 * @returns {Promise<{items: Array, errors: Array<{shopCode: string, message: string}>}>}
 */
export async function fetchMihoyoNewArrivals(
  catalog,
  shopCodes = MIHOYO_NEW_ARRIVAL_SHOPS,
  options = {},
) {
  const codes = (Array.isArray(shopCodes) ? shopCodes : MIHOYO_NEW_ARRIVAL_SHOPS)
    .map((code) => String(code || '').trim())
    .filter(Boolean)

  const results = await Promise.allSettled(
    codes.map((code) => fetchNewArrivalPage(catalog, code, options)),
  )

  const liveItems = []
  const errors = []
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      liveItems.push(...result.value)
    } else {
      errors.push({
        shopCode: codes[index],
        message: result.reason?.message || 'failed',
      })
    }
  })

  if (catalog === 'shop' && liveItems.length) {
    // 满赠独立目录，不再混入商品上新
  }

  const items = mergeWithCache(catalog, liveItems)
  // 本机 first_seen：同步打标（无网络），不拖慢列表
  applyLocalNewFlags(items)
  return { items: sortArrivals(catalog, items), errors }
}

/**
 * 满赠目录：流式发现。
 * 任一店铺/活动一有结果就经 onItems 回调立刻吐出当前列表；
 * 其余店铺与活动在后台继续，并入同一列表。
 * @returns {Promise<{items: Array, errors: Array<{shopCode: string, message: string}>}>}
 */
export async function fetchMihoyoGiftArrivals(
  shopCodes = MIHOYO_NEW_ARRIVAL_SHOPS,
  options = {},
  { onItems } = {},
) {
  const codes = (Array.isArray(shopCodes) ? shopCodes : MIHOYO_NEW_ARRIVAL_SHOPS)
    .map((code) => String(code || '').trim())
    .filter(Boolean)

  const errors = []
  const emittedByGoodsId = new Map()
  /** dedupeKey -> { goodsId, members: string[] }：A/B 系列合并成一条展示 */
  const seriesAgg = new Map()
  const seenGoodsIds = new Set()
  const seenActivityIds = new Set()
  const pending = new Set()

  function emit() {
    if (typeof onItems !== 'function') return
    onItems([...emittedByGoodsId.values()])
  }

  function ingestGifts(activity) {
    if (!activity?.ok) return
    let changed = false
    for (const gift of activity.gifts || []) {
      if (!gift?.goods_id || seenGoodsIds.has(gift.goods_id)) continue
      seenGoodsIds.add(gift.goods_id)
      const gKey = giftDedupeKey(gift.name) || gift.goods_id

      if (seriesAgg.has(gKey)) {
        const agg = seriesAgg.get(gKey)
        agg.members.push(gift.goods_id)
        continue
      }

      const item = {
        goods_id: gift.goods_id,
        name: gift.name,
        cover_url: gift.cover_url,
        price_cents: 0,
        point: 0,
        sale_time: 0,
        shop_code: activity.shopCode || '',
        catalog: 'gift',
        is_gift: true,
        gift_activity_id: activity.activityId,
        gift_activity_name: activity.name,
      }
      seriesAgg.set(gKey, {
        goodsId: gift.goods_id,
        members: [gift.goods_id],
      })
      emittedByGoodsId.set(gift.goods_id, item)
      changed = true
    }
    if (changed) emit()
  }

  function track(promise) {
    const p = promise.finally(() => pending.delete(p))
    pending.add(p)
    return p
  }

  // 每个店铺列表返回后立刻抽样发现活动，不阻塞其它店铺
  await Promise.all(
    codes.map(async (code) => {
      try {
        const shopItems = await fetchNewArrivalPage('shop', code, options)
        const sample = shopItems.slice(0, 3)
        await Promise.all(
          sample.map(async (item) => {
            const acts = await fetchGoodsGiftActivityIds(item.goods_id)
            for (const act of acts) {
              const actId = String(act?.activity_id || '').trim()
              if (!actId || seenActivityIds.has(actId)) continue
              seenActivityIds.add(actId)
              // 活动详情独立返回，到一个吐一个
              void track(
                fetchGiftActivityPublic(actId).then(ingestGifts).catch(() => {}),
              )
            }
          }),
        )
      } catch (e) {
        errors.push({ shopCode: code, message: e?.message || 'failed' })
      }
    }),
  )

  // 等已启动的活动请求收尾
  while (pending.size) {
    await Promise.all([...pending])
  }

  const live = [...emittedByGoodsId.values()].filter((item) => item?.is_gift)
  const merged = mergeWithCache('gift', live).filter((item) => item?.is_gift)
  const map = {}
  for (const item of merged) map[item.goods_id] = item
  saveCache('gift', map)
  if (typeof onItems === 'function') onItems(merged)
  return { items: merged, errors }
}
