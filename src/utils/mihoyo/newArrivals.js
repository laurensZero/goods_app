/**
 * 米游铺「上新」列表 —— 公开列表多页 + 本地缓存合并
 *
 * - shop：search_goods_spu_list，show_sale_type=2（即将上新）+ 高 limit 一次拉全
 * - type=3 是现货+预约（几百件），会把真正的新品挤出前几页，不能用
 * - 点卡片再用 goods_id 调 goods/detail 取 SKU（列表本身没有 SKU）
 * - 封面用列表 cover_url
 * 保留策略：开售后被挤出时靠本机缓存再留一段时间。
 */
import { mihoyoRequest, buildMihoyoHeaders } from '@/utils/mihoyo/request'
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

/* ── 满赠目录 ── */

/** 满赠发现：每店拉取多少个「现货+预约」最新商品（按系列归并后探测） */
const GIFT_DISCOVERY_LIMIT = 40
/**
 * 满赠发现：单店单轮最多探测多少个「没探过 / 该重探」的商品。
 * 已探过的商品会跳过且不占预算，所以没探到的系列会在后续几次进入时逐步补齐，
 * 不会像全量遍历那样每次把几十个详情请求打一遍。
 */
const GIFT_PROBE_NEW_LIMIT = 12
/** 首次进满赠（本机还没有探测缓存）：每店多铺一些，但仍不做全量遍历 */
const GIFT_PROBE_COLD_LIMIT = 14
/** 满赠发现：商品详情并发数 */
const GIFT_PROBE_CONCURRENCY = 3
/** 满赠活动详情并发数 */
const GIFT_ACTIVITY_CONCURRENCY = 4
/** 本机已发现的满赠活动（activity_id → 元数据）：商品开售后仍可继续跟踪、按时过期 */
const GIFT_ACTIVITY_STORE_KEY = 'goods-app:mihoyo-gift-activities'
const GIFT_ACTIVITY_MAX = 60
/** 活动详情复用时长：同一活动 30 分钟内不重复请求 */
const GIFT_ACTIVITY_TTL_MS = 30 * 60_000
/** 旧缓存（没有活动结束时间）最多再保留多少天 */
const GIFT_LEGACY_CACHE_DAYS = 14
/** 商品 → 满赠活动 ID 的本机探测缓存（避免每次进页面重探全部商品） */
const GIFT_PROBE_CACHE_KEY = 'goods-app:mihoyo-gift-probe-cache'
const GIFT_PROBE_CACHE_MAX = 600
/** 「现货+预约」列表的扫描时间：这份列表几百条且变化慢，每店最多 6 小时扫一次 */
const GIFT_ONSALE_SCAN_KEY = 'goods-app:mihoyo-gift-onsale-scan'
const GIFT_ONSALE_SCAN_TTL = 6 * 3600_000
/** 老商品补探时间：平常只探「列表里新出现的商品」，老商品每 24 小时最多补探一轮 */
const GIFT_BACKFILL_KEY = 'goods-app:mihoyo-gift-backfill-at'
const GIFT_BACKFILL_INTERVAL = 24 * 3600_000
/** 上新列表本机缓存：10 分钟内反复进页面不重复拉列表 */
const GIFT_LIST_CACHE_KEY = 'goods-app:mihoyo-gift-list-cache'
const GIFT_LIST_CACHE_TTL = 10 * 60_000
/** 列表快照保留期：用于对比「多了哪些新商品」，所以要比复用期长得多 */
const GIFT_LIST_CACHE_KEEP = 7 * 86_400_000
/** 探到过活动的商品：24 小时内不重复探测（活动可能后续加挂到同一商品，需要定期复查） */
const GIFT_PROBE_HIT_TTL = 24 * 3600_000
/** 没探到活动的商品：12 小时后再探（满赠经常是上架后才补挂的） */
const GIFT_PROBE_MISS_TTL = 12 * 3600_000
/** 探测缓存过期时间加一点随机抖动，避免同一批商品每次都在同一时刻集中重探 */
const GIFT_PROBE_JITTER = 0.35

const SHOP_HEADERS = buildMihoyoHeaders()

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

/** sale_time 是标准 UTC unix 秒，直接转毫秒即可与 Date.now() 比较 */
function saleUtcMs(saleTimeSec) {
  if (!saleTimeSec) return 0
  return saleTimeSec * 1000
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
    const now = Date.now()
    for (const item of Object.values(parsed || {})) {
      if (!item?.goods_id) continue
      // 满赠条目跟随活动结束时间过期；老缓存没有结束时间，按最后见到时间兜底
      if (catalog === 'gift') {
        if (isGiftActivityExpired(item, now)) continue
        const endSec = Number(item.gift_activity_end_time) || 0
        if (!endSec) {
          const lastSeen = Number(item.cached_at) || 0
          if (lastSeen < now - GIFT_LEGACY_CACHE_DAYS * 24 * 3600_000) continue
        }
        map[String(item.goods_id)] = item
        continue
      }
      // 缓存条目：开售时间仍在窗口内，或「最后见到」仍在窗口内
      const lastSeen = Number(item.cached_at) || 0
      const keepBySale = isWithinWindow(item.sale_time, days)
      const keepBySeen = lastSeen >= now - days * 24 * 3600_000
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
    let cachedAt = now
    if (item.is_gift) {
      const gKey = giftDedupeKey(item.name) || item.goods_id
      if (giftKeySeen.has(gKey)) continue
      giftKeySeen.add(gKey)
      // 旧版本缓存的满赠条目没有活动结束时间：不要刷新 cached_at，让它按兜底期限自然过期
      if (!Number(item.gift_activity_end_time)) cachedAt = Number(item.cached_at) || now
    }
    merged.set(item.goods_id, { ...item, cached_at: cachedAt })
  }

  for (const [id, cached] of Object.entries(cache)) {
    if (merged.has(id)) continue
    if (cached.is_gift) {
      if (isGiftActivityExpired(cached, now)) continue
    } else if (!isWithinWindow(cached.sale_time, days)) {
      continue
    }
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
  {
    limit = SHOP_PAGE_LIMIT,
    maxPages = SHOP_MAX_PAGES,
    saleType = '2',
    /** false = 不按开售时间窗过滤（满赠发现要覆盖开售较久、仍挂着活动的商品） */
    applyWindow = true,
  } = {},
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
      // 2 = 即将上新（与网页上新一致）；3 是现货+预约
      q.set('show_sale_type', String(saleType))
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

  // 满赠发现传 applyWindow:false —— 商品开售后才补挂的活动也要能探到
  if (!applyWindow) return items
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
 * 满赠活动是否已结束。
 * 米游铺 giveaway 页在活动结束后仍然可访问（接口也照常返回），
 * 因此不能以「能否拉到活动」判断有效性，必须看 end_time / status。
 * @param {{ endTime?: number, end_time?: number, status?: number }} activity
 */
export function isGiftActivityExpired(activity, now = Date.now()) {
  if (!activity) return true
  const endSec = Number(activity.gift_activity_end_time ?? activity.endTime ?? activity.end_time) || 0
  if (endSec > 0 && endSec * 1000 <= now) return true
  const status = Number(activity.status)
  // 1=进行中，>=2=已下线；-1/未知不据此判定，避免误杀
  if (Number.isFinite(status) && status >= 2) return true
  return false
}

/**
 * 商品系列键：满赠通常按系列挂载，同系列只探一个商品即可发现活动。
 * 「【绝区零】PINK甜蜜暴击系列 亚克力立牌」→「PINK甜蜜暴击系列」
 */
export function giftSeriesKey(name) {
  let s = String(name || '').trim()
  s = s.replace(/^【[^】]*】\s*/, '')
  s = s.replace(/^「[^」]*」\s*/, '')
  s = s.replace(/\s*(?:第\s*[0-9一二三四五六七八九十百]+\s*(?:弹|批|期|波))\s*$/g, '')
  const hit = s.match(/^(.{2,20}?(?:系列|シリーズ))/)
  if (hit) return hit[1].trim()
  // 无「系列」标识：用去掉营销后缀的完整名，避免把不同商品并成一条
  return s.trim()
}

/** 并发受限的 map（保持结果顺序无关，只关心副作用） */
async function runLimited(items, limit, worker) {
  const list = Array.isArray(items) ? items : []
  if (!list.length) return
  let cursor = 0
  const size = Math.max(1, Math.min(limit, list.length))
  await Promise.all(
    Array.from({ length: size }, async () => {
      while (cursor < list.length) {
        const item = list[cursor]
        cursor += 1
        await worker(item)
      }
    }),
  )
}

function loadGiftActivityStore() {
  try {
    const raw = localStorage.getItem(GIFT_ACTIVITY_STORE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function saveGiftActivityStore(store) {
  try {
    const now = Date.now()
    const entries = Object.entries(store || {})
      .filter(([id, meta]) => {
        if (!id || !meta) return false
        const endSec = Number(meta.endTime) || 0
        // 已结束的活动再留 7 天（避免时钟偏差），之后彻底清掉
        if (endSec > 0 && endSec * 1000 < now - 7 * 86_400_000) return false
        return true
      })
      .sort((a, b) => (Number(b[1].lastSeenAt) || 0) - (Number(a[1].lastSeenAt) || 0))
      .slice(0, GIFT_ACTIVITY_MAX)
    localStorage.setItem(GIFT_ACTIVITY_STORE_KEY, JSON.stringify(Object.fromEntries(entries)))
  } catch {
    // 配额满等忽略
  }
}

/**
 * 商品 → 满赠活动 ID 的本机探测缓存。
 * 商品详情是发现满赠的唯一入口，但同一个商品没必要每次进页面都重探。
 */
function loadGiftProbeCache() {
  try {
    const raw = localStorage.getItem(GIFT_PROBE_CACHE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function saveGiftProbeCache(cache) {
  try {
    const now = Date.now()
    const maxTtl = GIFT_PROBE_HIT_TTL * 2
    const entries = Object.entries(cache || {})
      .filter(([id, meta]) => {
        if (!id || !meta) return false
        const at = Number(meta.at) || 0
        return now - at < maxTtl
      })
      .sort((a, b) => (Number(b[1].at) || 0) - (Number(a[1].at) || 0))
      .slice(0, GIFT_PROBE_CACHE_MAX)
    localStorage.setItem(GIFT_PROBE_CACHE_KEY, JSON.stringify(Object.fromEntries(entries)))
  } catch {
    // 配额满等忽略
  }
}

/** 探测缓存是否还新鲜：探到过活动留得久，没探到要定期复查（满赠常在开售后才补挂） */
function isGiftProbeFresh(entry, now) {
  const at = Number(entry?.at) || 0
  if (!at) return false
  const hasHit = Array.isArray(entry.activityIds) && entry.activityIds.length > 0
  const ttl = hasHit ? GIFT_PROBE_HIT_TTL : GIFT_PROBE_MISS_TTL
  return now - at < ttl + (Number(entry?.jitter) || 0)
}

/** 同批商品错开复查时间，避免下次全部挤在一起 */
function nextProbeJitter(ttl) {
  return Math.floor(ttl * GIFT_PROBE_JITTER * Math.random())
}

function loadGiftOnSaleScanMap() {
  try {
    const raw = localStorage.getItem(GIFT_ONSALE_SCAN_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function saveGiftOnSaleScanMap(map) {
  try {
    localStorage.setItem(GIFT_ONSALE_SCAN_KEY, JSON.stringify(map || {}))
  } catch {
    // 配额满等忽略
  }
}

function loadGiftListCache() {
  try {
    const raw = localStorage.getItem(GIFT_LIST_CACHE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function saveGiftListCache(cache) {
  try {
    const now = Date.now()
    const entries = Object.entries(cache || {})
      .filter(([, entry]) => now - (Number(entry?.at) || 0) < GIFT_LIST_CACHE_KEEP)
      .slice(0, 12)
    localStorage.setItem(GIFT_LIST_CACHE_KEY, JSON.stringify(Object.fromEntries(entries)))
  } catch {
    // 配额满等忽略
  }
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
 * 满赠目录：缓存优先 + 增量发现（不做全量遍历）。
 *
 * 请求预算（关键：不能每次进页面把全部商品重探一遍）：
 *   1. 本机已有赠品缓存 → 先直接返回，页面立刻有内容，不等网络；
 *   2. 上新列表 10 分钟内复用本机快照；「现货+预约」列表每店 6 小时扫一次；
 *   3. 商品详情只探「列表里新出现的商品」（和 24 小时一轮的老商品补探），
 *      探过的记在 GIFT_PROBE_CACHE_KEY（探到活动留 24 小时、没探到留 12 小时）；
 *   4. 活动详情按 GIFT_ACTIVITY_TTL_MS（30 分钟）复用，未到期的活动不再请求。
 *
 * 于是：商品没变时再次进入 = 0 请求；新增商品时只请求新增的那几个。
 *
 * 发现链路（接口没有活动列表，只能靠商品详情反查 activity_id）：
 *   - 「即将上架」列表（show_sale_type=2）+ 「现货+预约」最新一批（show_sale_type=3），
 *     按系列归并后探测，覆盖「开售后才补挂满赠」的情况；
 *   - 已发现的活动记在本机台账，商品开售后掉出上新列表也不会消失。
 *
 * 过期判定：giveaway 页在活动结束后仍可访问、接口也照常返回，
 * 所以只看活动自身的 end_time / status，过期即从列表与本机缓存移除。
 *
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
  const seenActivityIds = new Set()
  const pending = new Set()
  /** activityId -> 进行中的复核 Promise（同一活动只请求一次） */
  const refreshing = new Map()
  /** 本轮确认结束/已删除的活动：连本机缓存里的赠品一起清掉 */
  const droppedActivityIds = new Set()
  /** activityId -> { shopCode, endTime, name, lastSeenAt, checkedAt } */
  const activityStore = loadGiftActivityStore()
  const probeCache = loadGiftProbeCache()
  const listCache = loadGiftListCache()
  const now = Date.now()

  /**
   * 上新列表本机缓存：10 分钟内反复进页面只拉一次。
   * 同时返回上一次列表的商品 id，用来判断「这次是不是真的多了新商品」。
   */
  async function fetchGiftList(code, { saleType = '2', limit, maxPages = 1 }) {
    const key = `${code}:${saleType}:${limit}`
    const cached = listCache[key]
    if (
      cached &&
      Array.isArray(cached.items) &&
      now - (Number(cached.at) || 0) < GIFT_LIST_CACHE_TTL
    ) {
      // 直接命中缓存 = 和上次同一份列表，没有新商品
      return {
        items: cached.items,
        previousIds: new Set(cached.items.map((item) => item.goods_id)),
      }
    }
    const items = await fetchNewArrivalPage('shop', code, {
      limit,
      maxPages,
      saleType,
      applyWindow: false,
    })
    const previousIds = new Set((cached?.items || []).map((item) => item.goods_id))
    listCache[key] = { at: now, items }
    return { items, previousIds }
  }

  function emit() {
    if (typeof onItems !== 'function') return
    onItems([...emittedByGoodsId.values()])
  }

  function ingestGifts(activity) {
    if (!activity?.ok) return
    if (isGiftActivityExpired(activity)) return
    let changed = false
    for (const gift of activity.gifts || []) {
      if (!gift?.goods_id) continue
      const existing = emittedByGoodsId.get(gift.goods_id)
      if (existing) {
        // 缓存里已有这条赠品：只更新活动口径（结束时间可能被延长），不重复展示
        if (existing.gift_activity_id === activity.activityId) {
          const endTime = Number(activity.endTime) || 0
          if (existing.gift_activity_end_time !== endTime) {
            existing.gift_activity_end_time = endTime
            changed = true
          }
        }
        continue
      }
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
        // 活动结束时间（unix 秒）：列表过滤 + 本机缓存过期都靠它
        gift_activity_end_time: Number(activity.endTime) || 0,
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

  /** 复核单个活动：成功后刷新台账；确认已结束/不存在则移除 */
  async function refreshActivity(actId) {
    const inflight = refreshing.get(actId)
    if (inflight) return inflight
    const task = (async () => {
      const activity = await fetchGiftActivityPublic(actId)
      if (!activity.ok) {
        // 网络抖动：保留台账等下一轮；接口明确说没有该活动才清理
        if (activity.reason === 'not_found') {
          delete activityStore[actId]
          droppedActivityIds.add(actId)
        }
        return
      }
      if (isGiftActivityExpired(activity)) {
        delete activityStore[actId]
        droppedActivityIds.add(actId)
        return
      }
      activityStore[actId] = {
        shopCode: activity.shopCode || activityStore[actId]?.shopCode || '',
        endTime: Number(activity.endTime) || 0,
        name: activity.name || activityStore[actId]?.name || '',
        lastSeenAt: Date.now(),
        checkedAt: Date.now(),
      }
      ingestGifts(activity)
    })().finally(() => refreshing.delete(actId))
    refreshing.set(actId, task)
    return task
  }

  /** 本机台账里是否有仍在生效、且详情还新鲜的缓存赠品可直接展示 */
  function hydrateFromCache() {
    const cache = loadCache('gift')
    let changed = false
    for (const item of Object.values(cache)) {
      if (!item?.is_gift || !item.goods_id) continue
      if (droppedActivityIds.has(item.gift_activity_id)) continue
      if (isGiftActivityExpired(item, now)) continue
      if (seriesAgg.has(giftDedupeKey(item.name) || item.goods_id)) continue
      if (emittedByGoodsId.has(item.goods_id)) continue
      const gKey = giftDedupeKey(item.name) || item.goods_id
      seriesAgg.set(gKey, { goodsId: item.goods_id, members: [item.goods_id] })
      emittedByGoodsId.set(item.goods_id, item)
      changed = true
    }
    if (changed) emit()
  }

  /**
   * 探测一批商品，登记新发现的活动。
   * 只探「本机探测缓存里没有 / 已过期」的商品，同一系列只探一个。
   * 商品没变时（不在 previousIds 里的才叫新商品）默认一个都不探；
   * 老商品的补探由 ctx.backfill 控制，每 24 小时最多一轮。
   */
  async function discoverFrom(items, shopCode, ctx, previousIds) {
    const probes = []
    for (const item of items) {
      const id = String(item?.goods_id || '').trim()
      if (!id) continue
      const isNew = !previousIds || !previousIds.has(id)
      if (!isNew && !ctx.backfill) continue
      if (ctx.budget <= 0) break
      const key = giftSeriesKey(item.name) || id
      if (ctx.seriesSeen.has(key)) continue
      ctx.seriesSeen.add(key)
      const cached = probeCache[id]
      if (isGiftProbeFresh(cached, now)) {
        // 探过：直接把缓存里的活动 id 接进台账，不再请求详情
        for (const actId of cached.activityIds || []) {
          if (!actId || seenActivityIds.has(actId)) continue
          if (droppedActivityIds.has(actId)) continue
          seenActivityIds.add(actId)
          if (!activityStore[actId]) {
            activityStore[actId] = {
              shopCode,
              endTime: 0,
              name: '',
              lastSeenAt: now,
            }
          }
        }
        continue
      }
      probes.push(id)
      ctx.budget -= 1
    }
    if (!probes.length) return

    await runLimited(probes, GIFT_PROBE_CONCURRENCY, async (goodsId) => {
      const acts = await fetchGoodsGiftActivityIds(goodsId)
      const activityIds = []
      for (const act of acts) {
        const actId = String(act?.activity_id || '').trim()
        if (!actId) continue
        activityIds.push(actId)
        if (seenActivityIds.has(actId)) continue
        seenActivityIds.add(actId)
        const prev = activityStore[actId]
        if (prev) {
          prev.lastSeenAt = now
          if (shopCode) prev.shopCode = prev.shopCode || shopCode
        } else {
          activityStore[actId] = {
            shopCode,
            endTime: 0,
            name: String(act.promotion_text || '').trim(),
            lastSeenAt: now,
          }
        }
        // 活动详情独立返回，到一个吐一个
        void track(refreshActivity(actId).catch(() => {}))
      }
      // 记住「这个商品探过、挂的是哪些活动」，下次不再重复请求
      probeCache[goodsId] = {
        at: now,
        shopCode,
        activityIds,
        jitter: nextProbeJitter(
          activityIds.length ? GIFT_PROBE_HIT_TTL : GIFT_PROBE_MISS_TTL,
        ),
      }
    })
  }

  function track(promise) {
    const p = promise.finally(() => pending.delete(p))
    pending.add(p)
    return p
  }

  // 先让缓存出图，页面不必等网络
  hydrateFromCache()

  const onSaleScanMap = loadGiftOnSaleScanMap()
  const backfillAt = Number(localStorage.getItem(GIFT_BACKFILL_KEY)) || 0
  const allowBackfill = now >= backfillAt
  // 首次进满赠（探测缓存为空）：本店商品全是「新」，预算给足，一次把活动摸全
  const coldStart = Object.keys(probeCache).length === 0

  // 每店增量发现：即将上架 + 最新现货；商品没变就一个详情都不探
  await Promise.all(
    codes.map(async (code) => {
      const ctx = {
        seriesSeen: new Set(),
        backfill: allowBackfill,
        budget: Number(options?.giftProbeLimit) > 0
          ? Number(options.giftProbeLimit)
          : (coldStart ? GIFT_PROBE_COLD_LIMIT : GIFT_PROBE_NEW_LIMIT),
      }

      try {
        const { items: upcoming, previousIds } = await fetchGiftList(code, {
          saleType: '2',
          limit: Math.max(Number(options?.limit) || 0, GIFT_DISCOVERY_LIMIT),
        })
        await discoverFrom(upcoming, code, ctx, previousIds)
      } catch (e) {
        errors.push({ shopCode: code, message: e?.message || 'failed' })
      }

      // 「现货+预约」列表几百条、变化慢：每店 6 小时内只扫一次，避免反复拉大列表
      const lastScan = Number(onSaleScanMap[code]) || 0
      if (now - lastScan < GIFT_ONSALE_SCAN_TTL) return
      try {
        // 已开售商品也可能才补挂满赠；只取最新一批，避免拉全量几百条
        const { items: onSale, previousIds } = await fetchGiftList(code, {
          saleType: '3',
          limit: GIFT_DISCOVERY_LIMIT,
        })
        await discoverFrom(onSale, code, ctx, previousIds)
        onSaleScanMap[code] = now
      } catch (e) {
        errors.push({ shopCode: code, message: e?.message || 'failed' })
      }
    }),
  )
  // 本轮做过老商品补探：24 小时内不再补探，避免反复扫老商品
  if (allowBackfill) {
    try {
      localStorage.setItem(GIFT_BACKFILL_KEY, String(now + GIFT_BACKFILL_INTERVAL))
    } catch {
      // 忽略
    }
  }

  // 复核台账里的活动：详情 30 分钟内不重复请求，过期/下线的活动移除
  const trackedIds = Object.keys(activityStore).filter((id) => {
    const meta = activityStore[id]
    if (!meta) return false
    if (isGiftActivityExpired({ endTime: meta.endTime })) {
      droppedActivityIds.add(id)
      delete activityStore[id]
      return false
    }
    return now - (Number(meta.checkedAt) || 0) >= GIFT_ACTIVITY_TTL_MS
  })
  await runLimited(trackedIds, GIFT_ACTIVITY_CONCURRENCY, (actId) =>
    refreshActivity(actId).catch(() => {}),
  )

  // 等已启动的活动请求收尾
  while (pending.size) {
    await Promise.all([...pending])
  }

  saveGiftActivityStore(activityStore)
  saveGiftProbeCache(probeCache)
  saveGiftOnSaleScanMap(onSaleScanMap)
  saveGiftListCache(listCache)

  const isLiveGift = (item) =>
    Boolean(item?.is_gift) &&
    !droppedActivityIds.has(item.gift_activity_id) &&
    !isGiftActivityExpired(item)

  const live = [...emittedByGoodsId.values()].filter(isLiveGift)
  const merged = mergeWithCache('gift', live).filter(isLiveGift)
  const map = {}
  for (const item of merged) map[item.goods_id] = item
  saveCache('gift', map)
  if (typeof onItems === 'function') onItems(merged)
  return { items: merged, errors }
}
