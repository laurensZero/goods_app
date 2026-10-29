/**
 * 米游铺商品链接解析工具
 * 策略：调用米游铺官方内部 JSON API（无需登录，不依赖 HTML 解析）
 *
 * API 由逆向分析 Nuxt bundle 获得：
 *   GET https://api-mall.mihoyogift.com/common/homeishop/v1/goods/get_goods_spu_detail
 *   参数：goods_id=<19位商品ID>
 *   响应：{ retcode: 0, data: { detail: { name, cover_url, price, ... } } }
 *   price 单位：分（÷100 = 元）
 *
 * CORS 说明：
 *   - Android APK（Capacitor 原生）：使用 CapacitorHttp，无 CORS 限制
 *   - 浏览器 / Web：使用 fetch，跨域会被拦截（开发阶段正常，APK 内正常）
 */
import { Capacitor } from '@capacitor/core'
import { normalizeGoodsVariant } from '@/utils/goods/identity'
import { buildMihoyoHeaders, mihoyoApi, mihoyoRequest } from '@/utils/mihoyo/request'
import { parseCookiePairs } from '@/utils/mihoyo/cookie'
import { allocateCouponByListedPrice } from '@/utils/goods/couponAllocate'
import { createLogger } from '@/utils/logger'
import { CATEGORY_KEYWORDS } from '@/constants/categoryDefinitions'

// isMihoyoCookieExpiredError 已收敛到 authError.js（retcode 优先、文案正则兜底），此处保留导出兼容旧调用方
export { isMihoyoCookieExpiredError } from '@/utils/mihoyo/authError'

// API 相对路径（域名/代理前缀由 mihoyoRequest 统一处理）
const API_GOODS_DETAIL  = '/common/homeishop/v1/goods/get_goods_spu_detail'
const API_GOODS_SEARCH  = '/common/homeishop/v1/search/search_goods_list'
const API_GOODS_SPU_LIST = '/common/homeishop/v1/goods/search_goods_spu_list'
const API_CATEGORY_LIST = '/common/homeishop/v1/category/get_category_list'
const API_GOODS_ITEM_DETAIL = '/common/homeishop/v1/goods/detail'
const API_CART_ADD = '/common/homeishop/v1/shop_car/add_goods_to_shop_car'
const API_GIFT_ACTIVITY = '/common/homeishop/v1/activity/gift'
const log = createLogger('mihoyo')

const MIHOYO_SHOP_CODE_BY_IP = {
  '原神': 'ys',
  '崩坏：星穹铁道': 'xqtd',
  '绝区零': 'zzz'
}

export function getMihoyoShopCodeByIp(ip) {
  return MIHOYO_SHOP_CODE_BY_IP[String(ip || '').trim()] || ''
}

export const MIHOYO_ROLE_SHOP_CODES = Object.values(MIHOYO_SHOP_CODE_BY_IP)

// 反向索引：shop_code -> IP 名称，便于快速查表
// 额外补上「崩坏3」店铺（不在 MIHOYO_SHOP_CODE_BY_IP 里，但上新页会按店铺回填 IP）
const SHOP_CODE_TO_IP = {
  ...Object.fromEntries(
    Object.entries(MIHOYO_SHOP_CODE_BY_IP).map(([ipName, code]) => [String(code || '').trim(), ipName])
  ),
  bh3: '崩坏3',
}

/** 由米游铺店铺 code 取规范 IP 名称（与预设 IP 对齐；未知店铺返回 ''） */
export function getMihoyoIpByShopCode(code) {
  return SHOP_CODE_TO_IP[String(code || '').trim()] || ''
}

// 常出现在【】中但不属于 IP 的词缀（营销/渠道标注）
const NOISE_TITLE_PREFIX_SET = new Set([
  '赠品', '店铺赠品', '礼品', '礼包', '福袋', '特典', '随机', '加购', '满赠',
  '积分兑换', '积分', '兑换', '限定商品', '限定', '预售', '现货', '包邮', '周边'
])

// 标题前缀若为噪音词，不得被 parseTitleIpName 当作 IP
const PSEUDO_IP_SET = NOISE_TITLE_PREFIX_SET

function stripNoiseTitlePrefixes(value) {
  let result = String(value || '')

  while (true) {
    const trimmed = result.trim()
    const match = trimmed.match(/^[【\[(（]\s*([^】\])）]+?)\s*[】\])）]\s*(.+)$/)
    if (!match) return trimmed

    const prefix = String(match[1] || '').trim()
    const rest = String(match[2] || '').trim()
    if (!prefix || !rest || !NOISE_TITLE_PREFIX_SET.has(prefix)) {
      return trimmed
    }

    result = rest
  }
}

// 从商品名称中提取 IP 和去掉前缀的商品名
// 支持：【原神】xxx  /  「崩坏：星穹铁道」xxx
export function parseTitleIpName(title) {
  if (!title) return { ip: '', name: title || '' }

  // 格式1: 【IP名(/附注)】商品名
  const bracketMatch = title.match(/^【([^】]+)】\s*(.+)$/)
  if (bracketMatch) {
    const rawIp = bracketMatch[1].split('/')[0].trim()
    const name = bracketMatch[2].trim()
    if (PSEUDO_IP_SET.has(rawIp)) {
      return { ip: '', name: title } // 被判定为非 IP 词，则原样保留前缀在名称中或根据实际只保留 name，这里保留 title 避免名字过短
    }
    return { ip: rawIp, name }
  }

  // 格式2: 「IP名」商品名
  const quoteMatch = title.match(/^「([^」]+)」\s*(.+)$/)
  if (quoteMatch) {
    const rawIp = quoteMatch[1].split('·')[0].trim()
    const name = quoteMatch[2].trim()
    if (PSEUDO_IP_SET.has(rawIp)) {
      return { ip: '', name: title } // 同上保留名称
    }
    return { ip: rawIp, name }
  }

  return { ip: '', name: title }
}

const MIHOYO_GIFT_HOST = 'mihoyogift.com'

// 从 URL 提取 id，支持商品页与赠品活动页：
// - https://www.mihoyogift.com/goods/123
// - https://www.mihoyogift.com/m/goods/123?...
// - https://www.mihoyogift.com/giveaway/123
// - https://www.mihoyogift.com/m/giveaway/123?order=comprehensive
function extractMihoyoLinkId(url) {
  try {
    const normalized = /^https?:\/\//i.test(url) ? url : `https://${url}`
    const parsed = new URL(normalized)
    if (!parsed.hostname.endsWith(MIHOYO_GIFT_HOST)) return null

    const goodsMatch = parsed.pathname.match(/^\/(?:m\/)?goods\/(\d+)(?:\/)?$/)
    if (goodsMatch) return { type: 'goods', id: goodsMatch[1] }

    const giveawayMatch = parsed.pathname.match(/^\/(?:m\/)?giveaway\/(\d+)(?:\/)?$/)
    if (giveawayMatch) return { type: 'giveaway', id: giveawayMatch[1] }

    return null
  } catch {
    return null
  }
}

function _extractGoodsId(url) {
  const hit = extractMihoyoLinkId(url)
  return hit && hit.type === 'goods' ? hit.id : null
}

// 验证是否是米游铺商品/赠品活动链接
export function isMihoyoGiftUrl(url) {
  return extractMihoyoLinkId(url) != null
}

function normalizeSaleAttrText(text) {
  return String(text || '')
    .replace(/^\s*[\/／]+\s*/g, '')
    .replace(/\s*[\/／]+\s*$/g, '')
    .trim()
}

function normalizeSaleAttrGroups(rawSaleAttrs) {
  const groups = Array.isArray(rawSaleAttrs)
    ? rawSaleAttrs
    : (rawSaleAttrs ? [rawSaleAttrs] : [])

  return groups
    .map((group) => ({
      name: String(group?.name || '').trim(),
      key: String(group?.key || '').trim(),
      content: Array.isArray(group?.content)
        ? group.content
            .map((item) => ({
              text: normalizeSaleAttrText(item?.text),
              key: String(item?.key || '').trim(),
              img_url: item?.img_url || '',
              cover_url: item?.cover_url || '',
            }))
            .filter((item) => item.text && item.key)
            .map((item) => ({
              text: item.text,
              key: item.key,
              img_url: item.img_url || '',
              cover_url: item.cover_url || '',
            }))
        : [],
    }))
    .filter((group) => group.content.length > 0)
}

function buildVariantFromSelections(selections, overrides = {}) {
  const texts = selections.map((item) => item.text).filter(Boolean)
  const keys = selections.map((item) => item.key).filter(Boolean)
  const media = selections.find((item) => item.cover_url || item.img_url) || {}

  return {
    text: texts.join(' / '),
    key: keys.join('_'),
    img_url: overrides.img_url ?? media.img_url ?? '',
    cover_url: overrides.cover_url ?? media.cover_url ?? media.img_url ?? '',
    price: overrides.price ?? null,
  }
}

function buildSaleAttrVariants(rawSaleAttrs) {
  const groups = normalizeSaleAttrGroups(rawSaleAttrs)
  if (!groups.length) return []

  if (groups.length === 1) {
    return groups[0].content.map((item) => buildVariantFromSelections([item]))
  }

  const variants = []
  const walk = (groupIndex, selections) => {
    if (groupIndex >= groups.length) {
      variants.push(buildVariantFromSelections(selections))
      return
    }

    for (const item of groups[groupIndex].content) {
      walk(groupIndex + 1, [...selections, item])
    }
  }

  walk(0, [])
  // 保持米游铺返回的原始款式顺序（不按拼音/文本重排）
  return variants
}

// 维度项在 sale_attrs 中的原始位置（组序 + 组内序）：
// detail.skus 的键顺序与店铺展示顺序不一致，需要用它把 SKU 还原成米游铺原始款式顺序
function buildAttrRankMap(groups) {
  const attrRank = new Map()
  groups.forEach((group, groupIndex) => {
    group.content.forEach((item, itemIndex) => {
      if (!attrRank.has(item.key)) attrRank.set(item.key, { groupIndex, itemIndex })
    })
  })
  return attrRank
}

function rankOfSelections(selections, attrRank) {
  return selections
    .map((selection) => attrRank.get(selection.key))
    .filter(Boolean)
    .sort((a, b) => a.groupIndex - b.groupIndex || a.itemIndex - b.itemIndex)
}

function compareSelectionRank(a, b) {
  const len = Math.min(a.length, b.length)
  for (let i = 0; i < len; i += 1) {
    if (a[i].groupIndex !== b[i].groupIndex) return a[i].groupIndex - b[i].groupIndex
    if (a[i].itemIndex !== b[i].itemIndex) return a[i].itemIndex - b[i].itemIndex
  }
  return a.length - b.length
}

function buildSkuVariantsFromDetail(detail) {
  const groups = normalizeSaleAttrGroups(detail?.sale_attrs)
  if (!groups.length) return []

  // 只有单个可选项的维度组（如「发货时间」）是固定噪音：展示名里去掉，但 key 保留
  // （key 仍指向完整 SKU 组合，供 skuCovers/skuPrices 与库存精确匹配使用）
  const noiseKeys = new Set()
  for (const group of groups) {
    if (group.content.length <= 1) {
      for (const item of group.content) noiseKeys.add(item.key)
    }
  }

  const keyToAttr = new Map()
  for (const group of groups) {
    for (const item of group.content) {
      keyToAttr.set(item.key, item)
    }
  }

  const attrRank = buildAttrRankMap(groups)

  const entries = []
  const skus = detail?.skus && typeof detail.skus === 'object'
    ? Object.entries(detail.skus)
    : []

  for (const [skuKey, sku] of skus) {
    const partKeys = String(skuKey || '')
      .split('_')
      .map((part) => part.trim())
      .filter(Boolean)
    const selections = partKeys
      .map((partKey) => keyToAttr.get(partKey))
      .filter(Boolean)

    if (!selections.length) continue

    const displaySelections = selections.filter((s) => !noiseKeys.has(s.key))
    if (!displaySelections.length) continue

    const rawSkuPrice = sku?.price ?? sku?.sale_price ?? sku?.activity_price ?? sku?.actual_price
    const variant = buildVariantFromSelections(displaySelections, {
      cover_url: sku?.cover_url || '',
      price: rawSkuPrice != null && rawSkuPrice > 0 ? rawSkuPrice / 100 : null,
    })
    // 文本已排除单选项组；key 覆盖为完整组合 key
    variant.key = selections.map((s) => s.key).join('_')
    entries.push({ variant, rank: rankOfSelections(selections, attrRank) })
  }

  if (!entries.length) return buildSaleAttrVariants(groups)

  // 按 sale_attrs 原始顺序（而不是 detail.skus 的键顺序）还原店铺展示顺序
  entries.sort((a, b) => compareSelectionRank(a.rank, b.rank))
  return entries.map((entry) => entry.variant)
}

/**
 * 公开拉取满赠活动（无需登录 Cookie）。giveaway 页 ID 即 activity_id。
 */
export async function fetchGiftActivityPublic(activityId) {
  const id = String(activityId || '').trim()
  if (!id) {
    return {
      ok: false, reason: 'invalid', activityId: '', name: '', shopCode: '',
      startTime: 0, endTime: 0, status: -1, serverTime: 0, outOfStock: false, gifts: [],
    }
  }
  try {
    const json = await mihoyoApi(`${API_GIFT_ACTIVITY}?activity_id=${id}`, { headers: buildMihoyoHeaders() })
    const data = json?.data || {}
    const byGoodsId = new Map()
    for (const stage of (data.stages || [])) {
      for (const gift of (stage.gifts || [])) {
        const goodsId = String(gift?.goods_id || '').trim()
        if (!goodsId || byGoodsId.has(goodsId)) continue
        byGoodsId.set(goodsId, {
          goods_id: goodsId,
          name: String(gift?.name || '').trim(),
          cover_url: String(gift?.cover_url || gift?.img_url || '').trim(),
          stock: Number(gift?.stock ?? gift?.quantity ?? -1),
        })
      }
    }
    return {
      ok: true,
      activityId: id,
      name: String(data.name || '').trim(),
      shopCode: String(data.shop?.shop_code || '').trim(),
      startTime: Number(data.start_time) || 0,
      endTime: Number(data.end_time) || 0,
      // 米游铺状态：1=进行中，>=2=已下线；serverTime 用于以服务端时间判断是否过期
      status: Number.isFinite(Number(data.status)) ? Number(data.status) : 1,
      serverTime: Number(data.server_time) || 0,
      outOfStock: Boolean(data.out_of_stock),
      gifts: [...byGoodsId.values()],
    }
  } catch (error) {
    // 活动被删除/下线时接口返回非 0：调用方据此清理本地活动缓存
    const reason = error?.retcode != null ? 'not_found' : 'network'
    return {
      ok: false, reason, activityId: id, name: '', shopCode: '',
      startTime: 0, endTime: 0, status: -1, serverTime: 0, outOfStock: false, gifts: [],
    }
  }
}

/**
 * 从商品详情的 promotion.gift_activities 收集满赠活动 ID（赠品页入口）。
 */
export async function fetchGoodsGiftActivityIds(goodsId) {
  const id = String(goodsId || '').trim()
  if (!id) return []
  try {
    const json = await mihoyoApi(`${API_GOODS_ITEM_DETAIL}?goods_id=${id}`, { headers: buildMihoyoHeaders() })
    const promotion =
      json?.data?.goods?.promotion ||
      json?.data?.promotion ||
      json?.data?.goods?.detail?.promotion ||
      {}
    const list = Array.isArray(promotion.gift_activities) ? promotion.gift_activities : []
    return list
      .map((item) => ({
        activity_id: String(item?.activity_id || '').trim(),
        promotion_text: String(item?.promotion_text || '').trim(),
      }))
      .filter((item) => item.activity_id)
  } catch {
    return []
  }
}

/**
 * 解析米游铺商品链接 / 赠品活动链接
 * - 原生 Android/iOS：使用 CapacitorHttp（直连，无 CORS 限制）
 * - 浏览器 Web（开发）：使用 fetch + Vite 代理 /mihoyo-api（绕过 CORS）
 */
export async function parseMihoyoUrl(url) {
  const link = extractMihoyoLinkId(url)
  if (!link) {
    throw new Error('请输入米游铺商品/赠品链接，例如：https://www.mihoyogift.com/m/goods/... 或 https://www.mihoyogift.com/m/giveaway/...')
  }

  if (link.type === 'giveaway') {
    const activity = await fetchGiftActivityPublic(link.id)
    if (!activity.ok || !activity.gifts.length) {
      throw new Error('未能识别赠品活动，请确认链接有效')
    }
    const first = activity.gifts[0]
    const { ip, name: cleanedName } = parseTitleIpName(first.name)
    return {
      kind: 'giveaway',
      activityId: activity.activityId,
      activityName: activity.name,
      shopCode: activity.shopCode,
      raw: first.name,
      name: cleanedName,
      ip: SHOP_CODE_TO_IP[activity.shopCode] || ip || '',
      price: 0,
      image: first.cover_url || '',
      banners: [],
      goodsId: first.goods_id,
      variants: [],
      skuCharacters: [],
      gifts: activity.gifts,
    }
  }

  const urlGoodsId = link.id
  if (!urlGoodsId) throw new Error('无法解析商品 ID，请检查链接')

  const json = await mihoyoApi(`${API_GOODS_DETAIL}?goods_id=${urlGoodsId}`, { headers: buildMihoyoHeaders() })

  const detail = json?.data?.detail
  if (!detail || !detail.name) {
    throw new Error('未能识别商品信息，请确认链接有效')
  }

  // 以米游铺详情响应中的 goods_id 为最终 ID，链接 ID 只作为请求参数和兜底。
  // 详情接口的标准字段是 data.goods.detail.goods_id。
  const goodsId = String(detail.goods_id || detail.goodsId || urlGoodsId).trim()

  const { ip: parsedIpFromTitle, name: rawName } = parseTitleIpName(detail.name)

  // 以实际店铺为准反查 IP，标题前缀只做兜底（米游铺标题常带【店铺赠品】等非 IP 词缀）
  const detailShopCode = String(detail?.shop_code || detail?.shop?.shop_code || json?.data?.goods?.shop_code || json?.data?.goods?.shop?.shop_code || '').trim()
  const ip = SHOP_CODE_TO_IP[detailShopCode] || parsedIpFromTitle || ''
  // 去掉标题中的预售标注
  const name = cleanGoodsName(rawName)

  // price 单位是"分"，÷100 转成元；含"赠品"的商品默认 0 元
  const isGift = detail.name.includes('赠品')
  const priceYuan = isGift ? 0 : (detail.price != null ? detail.price / 100 : null)

  // sale_attrs 是数组，每个元素有 name + content[]
  // 例：[{ name: "角色", content: [{text, key, img_url}, ...], is_open }]
  const variants = buildSaleAttrVariants(detail.sale_attrs)

  // 从 SKU 属性中提取 API 明确标注的角色名（attr_name 含 "角色"）
  const skuCharacters = []
  for (const group of (detail.sale_attrs || [])) {
    if (String(group?.name || '').includes('角色')) {
      for (const item of (group.content || [])) {
        const charName = String(item?.text || '').replace(/[A-E]$/, '').trim()
        if (charName) skuCharacters.push(charName)
      }
    }
  }

  return {
    raw: detail.name,
    name,
    ip,
    price: priceYuan,
    image: detail.cover_url || '',
    banners: detail.banner_url || [],
    goodsId,           // 商品 ID，供后续懒加载 main_url 用
    variants,  // { text, key, img_url }[] —— 原始 SKU 选项
    skuGroups: normalizeSaleAttrGroups(detail.sale_attrs),  // 维度组（多级 SKU 用）
    skuCharacters,  // SKU 中明确标注的角色名（降级用）
  }
}

function collectSkuLookupKeys(rawKey, sku = {}) {
  const keys = new Set()

  if (rawKey) {
    keys.add(String(rawKey))
    for (const part of String(rawKey).split('_')) {
      if (part) keys.add(part)
    }
  }

  for (const [field, value] of Object.entries(sku)) {
    if (/^sale_attr\d+_key$/.test(field) && value) {
      keys.add(String(value))
    }
  }

  return [...keys]
}

/**
 * 商品详情缓存：搜索结果封面增强与入队选款会拉同一 goods_id。
 * 成功结果按 ID 缓存，并发请求去重，避免首次点选时被同款重复请求拖慢。
 */
const goodsDetailCache = new Map()
const goodsDetailInflight = new Map()

function cloneGoodsDetailResult(result) {
  return {
    ...result,
    mainImages: [...(result.mainImages || [])],
    skuCovers: { ...(result.skuCovers || {}) },
    skuPrices: { ...(result.skuPrices || {}) },
    skuVariants: (result.skuVariants || []).map((v) => ({ ...v })),
    skuGroups: (result.skuGroups || []).map((group) => ({
      ...group,
      content: (group.content || []).map((item) => ({ ...item })),
    })),
  }
}

async function requestGoodsDetailOnce(goodsId) {
  try {
    const json = await mihoyoApi(`${API_GOODS_ITEM_DETAIL}?goods_id=${goodsId}`, { headers: buildMihoyoHeaders() })
    const detail =
      json?.data?.goods?.detail ||
      json?.data?.detail ||
      json?.data?.goods ||
      null
    const mainImages = Array.isArray(detail?.main_url)
      ? detail.main_url
      : Array.isArray(detail?.banner_url)
        ? detail.banner_url
        : []
    const skuVariants = buildSkuVariantsFromDetail(detail)
    const skuGroups = normalizeSaleAttrGroups(detail?.sale_attrs)
    // skus 是以 key 为属性名的对象，每条有 cover_url 和 price（单位：分）
    const skuCovers = {}
    const skuPrices = {}  // { [key]: priceYuan }
    if (detail?.skus && typeof detail.skus === 'object') {
      for (const [key, sku] of Object.entries(detail.skus)) {
        if (!sku) continue
        const lookupKeys = collectSkuLookupKeys(key, sku)

        // 封面
        if (sku.cover_url) {
          for (const lookupKey of lookupKeys) {
            if (lookupKey && !(lookupKey in skuCovers)) {
              skuCovers[lookupKey] = sku.cover_url
            }
          }
        }

        // 价格（可能字段名有多种）
        const rawSkuPrice = sku.price ?? sku.sale_price ?? sku.activity_price ?? sku.actual_price
        if (rawSkuPrice != null && rawSkuPrice > 0) {
          const priceYuan = rawSkuPrice / 100
          for (const lookupKey of lookupKeys) {
            if (lookupKey && !(lookupKey in skuPrices)) {
              skuPrices[lookupKey] = priceYuan
            }
          }
        }
      }
    }
    if (Array.isArray(detail?.sale_attrs)) {
      for (const group of detail.sale_attrs) {
        if (!Array.isArray(group?.content)) continue

        for (const item of group.content) {
          if (item?.key && item?.cover_url) {
            skuCovers[item.key] = item.cover_url
          }
        }
      }
    }
    return { mainImages, skuCovers, skuPrices, skuVariants, skuGroups, coverUrl: detail?.cover_url || '', ok: true }
  } catch {
    return { mainImages: [], skuCovers: {}, skuPrices: {}, skuVariants: [], skuGroups: [], coverUrl: '', ok: false }
  }
}

/**
 * 获取 detail 接口数据（带会话级缓存 + 并发去重）：
 *   mainImages  - main_url 展示图数组
 *   skuCovers   - { [key]: cover_url } 每个 SKU 的专属封面图
 */
export async function fetchGoodsDetail(goodsId) {
  const id = String(goodsId || '').trim()
  if (!id) {
    return { mainImages: [], skuCovers: {}, skuPrices: {}, skuVariants: [], skuGroups: [], coverUrl: '', ok: false }
  }

  const cached = goodsDetailCache.get(id)
  if (cached) return cloneGoodsDetailResult(cached)

  const inflight = goodsDetailInflight.get(id)
  if (inflight) return cloneGoodsDetailResult(await inflight)

  const promise = requestGoodsDetailOnce(id).then((result) => {
    if (result?.ok) goodsDetailCache.set(id, result)
    return result
  }).finally(() => {
    goodsDetailInflight.delete(id)
  })
  goodsDetailInflight.set(id, promise)
  return cloneGoodsDetailResult(await promise)
}

/** 强制重新请求米游铺商品详情，忽略本会话的商品详情缓存。 */
export async function refreshGoodsDetail(goodsId) {
  const id = String(goodsId || '').trim()
  if (!id) {
    return { mainImages: [], skuCovers: {}, skuPrices: {}, skuVariants: [], skuGroups: [], coverUrl: '', ok: false }
  }
  goodsDetailCache.delete(id)
  goodsDetailInflight.delete(id)
  const result = await requestGoodsDetailOnce(id)
  if (result?.ok) goodsDetailCache.set(id, result)
  return cloneGoodsDetailResult(result)
}

/**
 * 获取指定商品的所有 SKU 变体（含角色封面图）
 * @param {string} goodsId
 * @returns {Promise<Array<{text, cover_url, img_url}>>} variants 数组
 */
export async function fetchGoodsVariants(goodsId) {
  if (!goodsId) return []
  try {
    const json = await mihoyoApi(`${API_GOODS_DETAIL}?goods_id=${goodsId}`, { headers: buildMihoyoHeaders() })
    const detail = json?.data?.detail
    return buildSaleAttrVariants(detail?.sale_attrs)
  } catch {
    return []
  }
}

/**
 * 轻量商品摘要：给「上新速览」在已知 goods_id 时拉名称/封面/价格/开售时间。
 * @param {string} goodsId
 * @returns {Promise<{ok: boolean, goodsId: string, name: string, cover_url: string, price_cents: number, sale_time: number, point: number}>}
 */
export async function fetchGoodsBrief(goodsId) {
  const id = String(goodsId || '').trim()
  if (!id) {
    return { ok: false, goodsId: '', name: '', cover_url: '', price_cents: 0, sale_time: 0, point: 0 }
  }
  try {
    const json = await mihoyoApi(`${API_GOODS_DETAIL}?goods_id=${id}`, { headers: buildMihoyoHeaders() })
    const detail = json?.data?.detail || {}
    const rawPrice = Number(detail.price)
    const rawPoint = Number(detail.point ?? detail.points)
    return {
      ok: true,
      goodsId: String(detail.goods_id || id),
      name: String(detail.name || '').trim(),
      cover_url: String(detail.cover_url || '').trim(),
      price_cents: Number.isFinite(rawPrice) ? rawPrice : 0,
      sale_time: Number(detail.sale_time) || 0,
      point: Number.isFinite(rawPoint) ? rawPoint : 0,
    }
  } catch {
    return { ok: false, goodsId: id, name: '', cover_url: '', price_cents: 0, sale_time: 0, point: 0 }
  }
}

// ─── 商品关键词搜索 ────────────────────────────────────────────────

/**
 * 关键词搜索米游铺商品
 * @param {string} keyword - 搜索关键词
 * @param {number} pageSize - 每页数量（默认 5）
 * @returns {Promise<Array<{goods_id, name, cover_url}>>}
 */
export async function searchGoodsList(keyword, pageSize = 5, page = 1) {
  if (!keyword) return []
  const normalizedPage = Math.max(1, Number(page) || 1)
  try {
    const json = await mihoyoApi(
      `${API_GOODS_SEARCH}?name=${encodeURIComponent(keyword)}&limit=${pageSize}&page=${normalizedPage}`,
      { headers: buildMihoyoHeaders() },
    )
    return (json.data?.list || []).map(item => ({
      goods_id:  item.goods_id,
      name:      item.name,
      cover_url: item.cover_url || '',
      ...(item.price != null ? { price: item.price / 100 } : {}),
    }))
  } catch {
    return []
  }
}

// ─── 账号订单导入 ──────────────────────────────────────────────────

const API_ORDER_LIST = '/common/homeishop/v1/order/order_list'
const API_CART_LIST = '/common/homeishop/v2/shop_car/get_shop_car_list'

/** 解析 Cookie 字符串为 key-value 对象（与 cookie.js 的 parseCookiePairs 同源） */
export function parseCookieString(cookieStr) {
  return parseCookiePairs(cookieStr)
}

/** 检验 Cookie 是否包含米游社常见认证字段 */
export function validateMihoyoCookie(cookieStr) {
  const parsed = parseCookieString(cookieStr)
  const hasUid = !!(parsed.account_id_v2 || parsed.ltuid_v2 || parsed.account_id || parsed.ltuid)
  const hasToken = !!(parsed.cookie_token_v2 || parsed.ltoken_v2 || parsed.ltoken)
  return hasUid && hasToken
}

async function fetchOrderPage(cookieStr, page, limit) {
  const json = await mihoyoApi(`${API_ORDER_LIST}?limit=${limit}&page=${page}`, {
    headers: buildMihoyoHeaders({ authed: true, cookie: cookieStr }),
  })
  return json.data
}

/**
 * 获取账号全部订单（自动分页，最多约 200 条）
 * 分页并发拉取（最多 3 路），避免串行 + 150ms 间隔拖慢导入。
 * @param {string} cookieStr - 完整 Cookie 字符串
 * @param {function} [onProgress] - (loaded: number, total: number) 进度回调
 */
export async function fetchAllOrders(cookieStr, onProgress) {
  const limit = 20
  const first = await fetchOrderPage(cookieStr, 1, limit)
  const total = first.count || 0
  const totalPages = Math.min(Math.ceil(total / limit), 10)
  const pages = Array.from({ length: totalPages }, (_, i) => i + 1)
  const results = new Array(totalPages)
  results[0] = first
  let loaded = first.list?.length || 0
  onProgress?.(loaded, total)

  if (totalPages > 1) {
    const CONCURRENCY = 3
    let cursor = 1
    async function worker() {
      while (cursor < totalPages) {
        const page = pages[cursor]
        cursor += 1
        const data = await fetchOrderPage(cookieStr, page, limit)
        results[page - 1] = data
        loaded += data.list?.length || 0
        onProgress?.(Math.min(loaded, total), total)
      }
    }
    const workers = Array.from({ length: Math.min(CONCURRENCY, totalPages - 1) }, () => worker())
    await Promise.all(workers)
  }

  const list = results.flatMap((data) => (data?.list || []))
  return { list, total, capped: total > list.length }
}

export async function fetchCartList(cookieStr) {
  const json = await mihoyoApi(API_CART_LIST, {
    headers: buildMihoyoHeaders({ authed: true, cookie: cookieStr }),
  })
  return json.data?.list || []
}

/**
 * 将米游铺订单转换为 App 谷子格式
 * @param {Object} order - API 返回的单个订单对象
 * @returns {Object|null}
 */

/** 从商品名关键词推断分类（关键词表见 constants/categoryDefinitions.js） */
export function parseCategoryFromName(name) {
  if (!name) return ''
  const match = CATEGORY_KEYWORDS.find(({ keywords }) => keywords.some((keyword) => name.includes(keyword)))
  return match?.category || ''
}

/** 从店铺名推断 IP（比从商品名解析更稳定） */
const SHOP_IP_KEYWORDS = [
  { keywords: ['原神万有铺子'], ip: '原神' },
  { keywords: ['货全杂货铺'], ip: '崩坏：星穹铁道' },
  { keywords: ['绝区零'], ip: '绝区零' },
  { keywords: ['空港集市'], ip: '崩坏3' },
  { keywords: ['未名商城'], ip: '未定事件簿' },
  { keywords: ['千羽万事屋'], ip: '崩坏学园2nd' },
  { keywords: ['别野百货'], ip: '米游社周边' },
]

function shopToIp(shopName) {
  if (!shopName) return ''
  const match = SHOP_IP_KEYWORDS.find(({ keywords }) => keywords.some((keyword) => shopName.includes(keyword)))
  return match?.ip || ''
}

/** 去除 sku 属性值中的所有括号前缀（角色名等应为纯文本）
 *  同时去除末尾常见变体字母 A-E（如 "昔涟B" → "昔涟"，"叶瞬光A" → "叶瞬光"）
 */
export function cleanGoodsName(str) {
  return stripNoiseTitlePrefixes(String(str || ''))
    .replace(/【[^】]*(?:预售|预计|现货|补款|尾款|发货|到仓|开售)[^】]*】/g, '')
    .replace(/（[^）]*(?:预售|预计|现货|补款|尾款|发货|到仓|开售)[^）]*）/g, '')
    .replace(/\([^)]*(?:预售|预计|现货|补款|尾款|发货|到仓|开售)[^)]*\)/g, '')
    .replace(/^(?:(?:预售|预计|现货)[^-—:：]*?(?:到仓|发货|补款|开售|现货)?\s*[-—:：]\s*)+/g, '')
    .replace(/[（(【\[]?现货[】\])）]?/g, '')
    .replace(/\s*(?:(?:第?\d+|[一二三四五六七八九十两]+)\s*(?:批|批次|期)\s*)?(?:预售|预计|现货|补款|尾款|发货|到仓|开售)(?:[^\s（）()【】\[\]]*)?$/g, '')
    // 末尾预售日期：「菲林斯27年1月下」「立牌2027年1月下旬」「26年12月底」
    .replace(/\s*\d{2,4}年\d{1,2}月(?:上旬|中旬|下旬|[上中下底末])?$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function cleanAttrValue(str) {
  return (str || '')
    .replace(/【[^】]*】/g, '')  // 清除 【...】 括号内容
    .replace(/[A-E]$/, '')       // 去除末尾变体字母 A-E
    .trim()
}

/** 尝试从"款式"属性值推断角色名（米游铺特定规律）
 *  "昔涟B" → "昔涟" (2-6 汉字，去掉末尾变体字母 A-E)
 *  "竖版" / "红色" / "彩色" → 跳过（在常见非角色词表中）
 */
function cleanStyleValue(str) {
  return normalizeGoodsVariant(str)
}

function firstNonEmpty(...values) {
  return values.find((value) => String(value || '').trim()) || ''
}

/** 金额分 → 元字符串；非法返回 '' */
function centsToYuanString(cents) {
  const n = Number(cents)
  if (!Number.isFinite(n) || n < 0) return ''
  return String(Math.round(n) / 100)
}

/** 整行入手价按份数均摊到逐份价（元字符串列表） */
function splitActualPriceToUnits(actualPriceYuan, quantity) {
  const qty = Math.max(1, Math.floor(Number(quantity) || 1))
  if (qty < 2) return []
  const totalCents = Math.round(Number(actualPriceYuan) * 100)
  if (!Number.isFinite(totalCents) || totalCents < 0) return []
  const base = Math.floor(totalCents / qty)
  let rest = totalCents - base * qty
  return Array.from({ length: qty }, () => {
    const extra = rest > 0 ? 1 : 0
    if (rest > 0) rest -= 1
    return String((base + extra) / 100)
  })
}

function getAftersalesStatusText(aftersalesInfo = {}) {
  const code = Number(aftersalesInfo?.aftersales_status)
  const explicitText = firstNonEmpty(
    aftersalesInfo?.aftersales_status_text,
    aftersalesInfo?.status_text,
    aftersalesInfo?.status_desc,
    aftersalesInfo?.status,
  )

  if (explicitText) return explicitText
  if (!code) return ''

  if (code >= 400) return '退款完成'
  if (code >= 300) return '退款中'
  if (code >= 200) return '售后中'
  return '售后中'
}

function extractItemStatusText(goodsWrapper = {}, goods = {}) {
  const aftersalesText = firstNonEmpty(
    getAftersalesStatusText(goodsWrapper.aftersales_info),
    getAftersalesStatusText(goods.aftersales_info),
  )

  return firstNonEmpty(
    aftersalesText,
    goodsWrapper.after_sale_status_text,
    goodsWrapper.after_sale_text,
    goodsWrapper.refund_status_text,
    goodsWrapper.refund_text,
    goodsWrapper.rights_status_text,
    goodsWrapper.rights_text,
    goodsWrapper.status_text,
    goodsWrapper.manage_status_text,
    goodsWrapper.status_desc,
    goodsWrapper.manage_status_desc,
    goodsWrapper.status,
    goods.after_sale_status_text,
    goods.after_sale_text,
    goods.refund_status_text,
    goods.refund_text,
    goods.rights_status_text,
    goods.rights_text,
    goods.status_text,
    goods.manage_status_text,
    goods.status_desc,
    goods.manage_status_desc,
    goods.status,
  )
}

/** 将单件商品 meta_info 转换为 App 谷子格式（内部辅助） */
function metaToGoods(order, goods, index = 0, goodsWrapper = {}) {
  const sourceTitle =
    goods.goods_name || goods.name || goods.title ||
    goods.commodity_name || goods.commodityName || ''
  const rawName = cleanGoodsName(sourceTitle)
  const coverUrl =
    goods.cover_url || goods.img_url || goods.cover ||
    goods.goods_img || goods.image || ''
  // 原价只取标价类字段：actual_price / pay_price 是优惠后金额，不能回填「原价」，
  // 否则券后价会被当成原价写进收藏。
  const rawPrice =
    goods.price ?? goods.sale_price ?? goods.current_price ??
    goods.market_price ?? goods.activity_price ?? 0
  const quantity = Math.max(
    1,
    Number(goods.quantity) ||
    Number(goodsWrapper.quantity) ||
    Number(goods.buy_num) ||
    Number(goodsWrapper.buy_num) ||
    1
  )
  // 行实付（分）：订单/详情里平台分摊后的金额；有则优先进入手价。
  // total_price/pay_price/actual_pay_amount 是行合计，actual_price 是单件价，需乘数量。
  const linePaidCents = readPositiveCents(
    goods.total_price,
    goodsWrapper.total_price,
    goods.pay_price,
    goods.actual_pay_amount,
  ) ?? (() => {
    const unitPaidCents = readPositiveCents(goods.actual_price, goodsWrapper.actual_price)
    return unitPaidCents == null ? null : unitPaidCents * quantity
  })()
  const skuList =
    goods.sku_sales ||
    goods.sku_list ||
    goods.sku_attrs ||
    goods.attrs ||
    goodsWrapper.sku_sales ||
    goodsWrapper.sku_list ||
    goodsWrapper.sku_attrs ||
    goodsWrapper.attrs ||
    []

  // IP 优先从店铺名推断；其次从商品名解析
  // 如果名称前缀是「积分兑换」「特典」等非 IP 标识，则不作为 IP
  const shopName = order.shop?.shop_name || goods.shop_name || ''
  const ipFromShop = shopToIp(shopName)
  const { ip: ipFromName, name } = parseTitleIpName(rawName)
  const ipFromNameFiltered = PSEUDO_IP_SET.has(ipFromName) ? '' : ipFromName
  const ip = ipFromShop || ipFromNameFiltered
  // 是否积分兑换订单：以商品名前缀「积分兑换」为准（最可靠，API 会显式标注）
  // order_type 在列表/详情接口值不同（4 vs 401），不单独依赖
  const isPointsOrder = sourceTitle.includes('积分兑换')

  // 提取角色名：
  //   1. attr_name 含 "角色" → attr_value 是角色名 (如 "角色":"流萤", "角色-对空六课":"比利")
  //   2. attr_name === "款式" → attr_value 可能是"角色名+变体字母" (如 "款式":"昔涟B")
  const charSet = new Set()
  const styleSet = new Set()
  for (const s of skuList) {
    const attrName = s.attr_name || s.attrName || ''
    const attrVal  = s.attr_value || s.attrValue || ''
    if (attrName.includes('角色')) {
      const c = cleanAttrValue(attrVal)
      if (c) charSet.add(c)
    } else if (attrName.includes('款式')) {
      const style = cleanStyleValue(attrVal)
      if (style) styleSet.add(style)
    }
  }
  const characters = [...charSet]
  const fallbackVariant = firstNonEmpty(
    goods.sku_name,
    goods.sku_title,
    goods.sku_desc,
    goods.spec_name,
    goods.spec_title,
    goods.spec_value,
    goods.spec,
    goods.style,
    goods.style_name,
    goods.variant,
    goodsWrapper.sku_name,
    goodsWrapper.sku_title,
    goodsWrapper.sku_desc,
    goodsWrapper.spec_name,
    goodsWrapper.spec_title,
    goodsWrapper.spec_value,
    goodsWrapper.spec,
    goodsWrapper.style,
    goodsWrapper.style_name,
    goodsWrapper.variant,
  )
  const variant = normalizeGoodsVariant([...styleSet].join(' / ') || String(fallbackVariant || '').trim())
  const itemStatusText = extractItemStatusText(goodsWrapper, goods)
  const payTime =
    order.payment_info?.pay_time || order.payment_info?.payTime ||
    order.pay_time || order.payTime || order.order_time || order.orderTime
  const acquiredAt = payTime
    ? new Date(Number(payTime) * 1000).toISOString().split('T')[0]
    : ''
  const orderNo = order.order_no || order.orderNo || ''
  // goodsId 不再用 sku_id 兜底，避免与款式维度混淆
  const goodsId =
    goods.goods_id || goods.goodsId ||
    goodsWrapper.goods_id || goodsWrapper.goodsId || ''
  // 加上 index 防止同订单内 goods_id 相同时 key 碰撞
  const itemKey = `${orderNo}_${index}_${goodsId}`
  // SKU 名称字段（"徽章-茜特菈莉" 等），用于优先提取分类
  const skuName = firstNonEmpty(goods.sku_name, goods.sku_title, goods.sku_desc, goodsWrapper.sku_name, goodsWrapper.sku_title, goodsWrapper.sku_desc)
  return {
    name: name || rawName,
    ip: ip || '',
    characters,
    image: coverUrl,
    // 原价（标价）
    price: String(Math.round(Number(rawPrice) / 100)),
    // 行实付（优惠后）；最终是否可信由 applyOrderDiscountToActualPrices 校验
    actualPrice: linePaidCents != null && linePaidCents > 0 ? centsToYuanString(linePaidCents) : '',
    acquiredAt,
    category: parseCategoryFromName(variant) || parseCategoryFromName(skuName) || parseCategoryFromName(sourceTitle) || parseCategoryFromName(name || rawName),
    quantity,
    variant,
    note: `来自米游铺订单 #${orderNo}${isPointsOrder ? '（积分兑换）' : ''}`,
    // 元数据（不入库）
    _itemKey: itemKey,
    _orderNo: orderNo,
    _statusText: itemStatusText ||
                 order.status_text || order.statusText || order.manage_status_text || '',
    // 仅商品级别的独立状态（不含订单 fallback），用于单件状态徽章
    _wrapperStatus: itemStatusText,
    _coverUrl: coverUrl,
    // 行实付原始分值：供 applyOrderDiscountToActualPrices 判断它是否真的低于标价小计
    _linePaidCents: linePaidCents,
    // 保留原始米游铺商品 ID 供后续懒加载或识别使用
    goodsId: String(goodsId || ''),
  }
}

/**
 * 将米游铺订单展开为所有商品（一个订单可能含多件），返回数组
 * @param {Object} order
 * @returns {Object[]}
 */
export function orderToGoodsList(order) {
  const wrappers = order.goods_list || order.commodity_list || []
  const list = wrappers
    .map((w, index) => {
      const goods = w.meta_info || w
      return metaToGoods(order, goods, index, w)  // 传入 wrapper 以获取商品级状态
    })
    .filter((g) => g.name)  // 过滤掉没有名称的条目

  applyOrderDiscountToActualPrices(order, list)
  return list
}

/**
 * 读取「优惠后金额（分）」：只接受正数，0/空都算没给。
 * @param {...any} values
 * @returns {number|null}
 */
function readPositiveCents(...values) {
  for (const value of values) {
    if (value == null || value === '') continue
    const n = Number(value)
    if (Number.isFinite(n) && n > 0) return n
  }
  return null
}

/**
 * 订单级优惠总额（分）。优先取 discounts 里的正数；列表接口不返回 discounts 时，
 * 用「商品总额 − 实付」兜底，避免有优惠却完全不写入手价。
 * @param {Object} order
 * @returns {number}
 */
export function resolveOrderDiscountCents(order) {
  const discounts = order?.discounts || {}
  const explicitTotal = readPositiveCents(discounts.total_discount)
  if (explicitTotal != null) return explicitTotal

  const parts = [
    discounts.coupon_discount,
    discounts.goods_discount,
    discounts.shop_discount,
  ].map((value) => readPositiveCents(value) || 0)
  const explicitSum = parts.reduce((sum, value) => sum + value, 0)
  if (explicitSum > 0) return explicitSum

  const goodsCents = readPositiveCents(order?.goods_amount)
  const paidCents = readPositiveCents(
    order?.payment_info?.pay_amount,
    order?.pay_amount,
    order?.order_amount,
  )
  if (goodsCents != null && paidCents != null && goodsCents > paidCents) {
    return goodsCents - paidCents
  }
  return 0
}

/**
 * 订单导入入手价（优惠后金额），原价仍保留在 price 里：
 * 1) 明细行实付可信（低于标价小计）→ 直接用作入手价，并按份数写 unitActualPriceList
 * 2) 否则按订单级优惠（discounts，单位分）按标价×数量比例分摊
 *
 * total_price 在部分响应里表示「标价小计」而不是实付，因此不能无条件当入手价；
 * 这里统一先清空行实付，再只接受「确实低于标价小计」的值。
 */
function applyOrderDiscountToActualPrices(order, list) {
  if (!Array.isArray(list) || list.length === 0) return

  // 先清空：避免把 total_price=标价小计 或旧值误当成入手价
  for (const item of list) {
    item.actualPrice = ''
    item.unitActualPriceList = []
  }

  const priced = list.filter((g) => Number(g.price) > 0)
  if (priced.length === 0) return

  const linePaidById = new Map()
  for (const item of priced) {
    const qty = Math.max(1, Number(item.quantity) || 1)
    const listedCents = Math.round(Number(item.price) * 100) * qty
    const paidCents = readPositiveCents(item._linePaidCents)
    // 只有低于标价小计的行实付才可能是「优惠后」；等于/高于说明它是标价小计
    if (paidCents != null && paidCents < listedCents) {
      linePaidById.set(item._itemKey, paidCents)
    }
  }

  if (linePaidById.size === priced.length) {
    for (const item of priced) {
      applyLineActual(item, linePaidById.get(item._itemKey))
    }
    return
  }

  const discountCents = resolveOrderDiscountCents(order)
  if (!discountCents || discountCents <= 0) return

  const result = allocateCouponByListedPrice(
    priced.map((g) => ({
      id: g._itemKey,
      price: g.price,
      quantity: g.quantity
    })),
    discountCents / 100
  )
  if (!result.ok) return

  const byId = new Map(result.rows.map((row) => [row.id, row]))
  for (const item of priced) {
    const row = byId.get(item._itemKey)
    if (!row || !row.eligible) continue
    item.actualPrice = centsToYuanString(Math.round(Number(row.actualTotal) * 100))
    if (Array.isArray(row.unitActualPriceList) && row.unitActualPriceList.length > 0) {
      item.unitActualPriceList = row.unitActualPriceList.map((v) =>
        centsToYuanString(Math.round(Number(v) * 100))
      )
    }
  }
}

/** 写入单行入手价，qty≥2 时同步逐份价 */
function applyLineActual(item, paidCents) {
  const qty = Math.max(1, Number(item.quantity) || 1)
  item.actualPrice = centsToYuanString(paidCents)
  item.unitActualPriceList = qty >= 2 ? splitActualPriceToUnits(item.actualPrice, qty) : []
}

/**
 * 将米游铺订单转换为 App 谷子格式（仅取第一件，兼容旧调用）
 * @param {Object} order
 * @returns {Object|null}
 */
export function orderToGoods(order) {
  return orderToGoodsList(order)[0] || null
}

function cartItemToGoods(shop, item, index = 0) {
  const sourceTitle = cleanGoodsName(item.goods_name || item.name || '')
  const { ip: ipFromName, name } = parseTitleIpName(sourceTitle)
  const ip = shopToIp(shop?.shop_name || shop?.shopName || '') || ipFromName
  const rawVariant = String(item.sale_attr_val || item.sale_attr || '').trim()
  const style = cleanStyleValue(rawVariant)
  const skuName = firstNonEmpty(item.sku_name, item.sku_title, item.sku_desc)
  const quantity = Math.max(1, Number(item.nums) || Number(item.quantity_buy) || 1)
  const priceFee = item.new_price_fee ?? item.price_fee ?? item.old_price_fee ?? 0
  const noteParts = ['来自米游铺购物车']

  if (shop?.shop_name || shop?.shopName) {
    noteParts.push(`店铺：${shop.shop_name || shop.shopName}`)
  }

  return {
    name: name || sourceTitle,
    ip: ip || '',
    characters: [],
    image: item.cover_url || '',
    price: String(Math.round(Number(priceFee) / 100)),
    acquiredAt: '',
    category: parseCategoryFromName(style) || parseCategoryFromName(skuName) || parseCategoryFromName(sourceTitle) || parseCategoryFromName(name || sourceTitle),
    quantity,
    variant: style,
    note: noteParts.join('｜'),
    _itemKey: `cart_${shop?.shop_code || shop?.shopCode || 'unknown'}_${item.goods_id || 'goods'}_${item.sku_id || index}`,
    // 购物车接口字段是 goods_id；统一暴露 goodsId，兼容旧的 _goodsId 调用方。
    goodsId: String(item.goods_id || item.goodsId || ''),
    _goodsId: String(item.goods_id || item.goodsId || ''),
    _skuId: String(item.sku_id || ''),
    _shopCode: String(shop?.shop_code || shop?.shopCode || ''),
    _shopName: String(shop?.shop_name || shop?.shopName || ''),
    _soldOut: Number(item.sold_out_status || 0) !== 0,
    // 不再以售罄状态阻止导入：售罄仅作为一种导入信息，而不是不可导入的判断依据
    _isEffective: item.is_effect !== false && Number(item.quantity || 1) > 0,
    _reason: String(item.noneffecttive_reason || ''),
  }
}

export async function fetchGoodsCategoryList(shopCode) {
  const normalizedShopCode = String(shopCode || '').trim()
  if (!normalizedShopCode) return []

  try {
    const json = await mihoyoApi(
      `${API_CATEGORY_LIST}?shop_code=${encodeURIComponent(normalizedShopCode)}`,
      { headers: buildMihoyoHeaders() },
    )
    return Array.isArray(json.data?.list) ? json.data.list : []
  } catch {
    return []
  }
}

/**
 * 加入购物车
 * @param {Object} params
 * @param {string} params.goodsId - 商品ID
 * @param {number} params.skuId - SKU ID
 * @param {string} params.shopCode - 店铺代码
 * @param {number} [params.nums=1] - 数量
 * @param {string} params.cookie - 米游铺Cookie
 * @returns {Promise<{success: boolean, message?: string}>}
 */
export async function addToCart({ goodsId, skuId, shopCode, nums = 1, cookie }) {
  log.debug('cart:add:start', { goodsId, skuId, shopCode, nums, cookieLength: cookie?.length || 0 })
  if (!goodsId || skuId == null || !cookie) {
    log.debug('cart:add:skipped', {
      reason: 'missing-params',
      hasGoodsId: Boolean(goodsId),
      hasSkuId: skuId != null,
      hasCookie: Boolean(cookie),
      shopCode
    })
    return { success: false, message: '参数不完整' }
  }

  const body = {
    goods_id: String(goodsId),
    sku_id: Number(skuId),
    nums: Number(nums) || 1,
    shop_code: String(shopCode || ''),
    old_sku_id: null,
    inner_source: ''
  }

  try {
    log.debug('cart:add:transport', { transport: Capacitor.isNativePlatform() ? 'capacitor-http' : 'fetch-proxy' })
    const json = await mihoyoRequest(API_CART_ADD, {
      method: 'POST',
      headers: buildMihoyoHeaders({
        authed: true,
        cookie,
        extra: {
          'Content-Type': 'application/json;charset=UTF-8',
          'Origin': 'https://www.mihoyogift.com',
          'x-rpc-mall-platform': 'web',
        },
      }),
      data: body
    })

    log.debug('cart:add:response', {
      retcode: json?.retcode,
      message: json?.message,
      dataCode: json?.data?.code,
      cartFull: json?.data?.code === 2
    })

    // 外层 retcode 检查（携带 retcode，供调用方识别登录态失效）
    if (json.retcode !== 0) {
      return { success: false, message: json.message || `错误码：${json.retcode}`, retcode: json.retcode }
    }

    // 内层 data.code 检查：0=成功，2=购物车满
    const dataCode = json.data?.code ?? 0
    if (dataCode === 0) {
      return { success: true, message: 'OK' }
    }
    if (dataCode === 2) {
      return { success: false, message: '购物车已满', cartFull: true }
    }
    return { success: false, message: `错误码：${dataCode}` }
  } catch (e) {
    log.error('cart:add:failed', { goodsId, skuId, shopCode }, e)
    return { success: false, message: e.message || '网络错误' }
  }
}

/**
 * 获取商品详情（含SKU ID）
 * @param {string} goodsId
 * @returns {Promise<{shopCode: string, skus: Array<{id: number, text: string, key: string}>}>}
 */
export async function fetchGoodsDetailForCart(goodsId) {
  if (!goodsId) return { shopCode: '', skus: [] }
  log.debug('goods-detail:cart:start', { goodsId })

  try {
    log.debug('goods-detail:cart:transport', { goodsId, transport: Capacitor.isNativePlatform() ? 'capacitor-http' : 'fetch-proxy' })
    const json = await mihoyoApi(`${API_GOODS_ITEM_DETAIL}?goods_id=${goodsId}`, { headers: buildMihoyoHeaders() })

    const detail = json?.data?.goods?.detail || json?.data?.detail || json?.data?.goods || null
    log.debug('goods-detail:cart:response', {
      goodsId,
      retcode: json?.retcode,
      message: json?.message,
      hasDetail: Boolean(detail),
      saleAttrCount: Array.isArray(detail?.sale_attrs) ? detail.sale_attrs.length : 0,
      rawSkuCount: detail?.skus && typeof detail.skus === 'object' ? Object.keys(detail.skus).length : 0
    })

    if (!detail) return { shopCode: '', skus: [] }

    const shopCode = String(detail?.shop_code || detail?.shop?.shop_code || json?.data?.goods?.shop_code || '').trim()

    // 构建SKU列表：从skus对象中获取
    const skus = []
    if (detail?.skus && typeof detail.skus === 'object') {
      for (const [key, sku] of Object.entries(detail.skus)) {
        if (!sku || !sku.id) continue
        skus.push({
          id: sku.id,
          text: sku.attr || sku.name || `SKU ${sku.id}`,
          key: String(key)
        })
      }
    }

    log.debug('goods-detail:cart:done', {
      goodsId,
      shopCode,
      skuCount: skus.length,
      skuIds: skus.map((item) => item.id)
    })
    return { shopCode, skus }
  } catch (e) {
    log.error('goods-detail:cart:failed', { goodsId }, e)
    return { shopCode: '', skus: [] }
  }
}

export async function searchGoodsSpuList({
  shopCode,
  categoryId,
  pageSize = 12,
  page = 1,
  orderBy = 'comprehensive',
  showSaleType = 1,
  hideSoldOut = false,
  random = true,
}) {
  const normalizedShopCode = String(shopCode || '').trim()
  const normalizedCategoryId = Number(categoryId)

  if (!normalizedShopCode || !Number.isFinite(normalizedCategoryId) || normalizedCategoryId <= 0) {
    return []
  }

  const query = new URLSearchParams({
    limit: String(pageSize),
    page: String(page),
    shop_code: normalizedShopCode,
    order_by: orderBy,
    category_id: String(normalizedCategoryId),
    show_sale_type: String(showSaleType),
    hide_sold_out: String(Boolean(hideSoldOut)),
    random: String(Boolean(random)),
  })

  try {
    const json = await mihoyoApi(`${API_GOODS_SPU_LIST}?${query.toString()}`, { headers: buildMihoyoHeaders() })

    return (json.data?.list || []).map((item) => ({
      goods_id: item.goods_id,
      name: item.name,
      cover_url: item.cover_url || '',
      price: item.price != null ? item.price / 100 : null,
      shop_code: normalizedShopCode,
      category_id: normalizedCategoryId,
    }))
  } catch {
    return []
  }
}

export function cartShopToGoodsList(shop) {
  const list = Array.isArray(shop?.list) ? shop.list : []
  return list
    .map((item, index) => cartItemToGoods(shop, item, index))
    .filter((item) => item.name)
}
