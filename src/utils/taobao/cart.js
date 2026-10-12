/**
 * 淘宝购物车在线拉取（mtop.trade.query.bag）
 *
 * 接口形态（2026-10-12 抓包 cart.taobao.com，docs/taobao-mtop-api.md §11）：
 *   POST mtop.trade.query.bag/5.0（form + originaljson）
 *   data={"mixed":false,"netType":0,"extStatus":"0","cartFrom":"main_site",
 *         "isPage":true,"exParams":"{...pcTao...}"}
 * 响应与订单列表同为低代码节点图；商品在 tag=item 节点
 * （fields: cartId/itemId/title/shopTitle/quantity/pic/sku/pay/isInvalid/outerUrl…）。
 */
import { cleanGoodsName, parseCategoryFromName, parseTitleIpName } from '@/utils/mihoyo/index'
import { getTaobaoCookie, isTaobaoCookieReady } from './cookie'
import { mtopCall } from './mtop'
import { normalizeCdnUrl } from './detail'
import { TaobaoRequestError } from './request'
import { ipFromShopName, refineTaobaoIp, stripIpBrackets } from './orders'
import { TaobaoImportError } from './service'

/** 购物车列表 mtop API（PC 已买到的宝贝页同族 trade 网关） */
export const TAOBAO_CART_API = 'mtop.trade.query.bag'
export const TAOBAO_CART_VERSION = '5.0'
export const TAOBAO_CART_REFERER = 'https://cart.taobao.com/cart.htm'

/**
 * 构造 query.bag 的 data 载荷（与 PC 购物车主站一致）
 * @returns {Record<string, any>}
 */
export function buildCartPayload() {
  return {
    mixed: false,
    netType: 0,
    extStatus: '0',
    cartFrom: 'main_site',
    isPage: true,
    exParams: JSON.stringify({
      supportCalculateUpdate: 'true',
      mergeCombo: 'true',
      globalSell: '1',
      spiPage: 'pcTao',
      isPcMixCart: 'true',
      pcOrderFrom: 'pcWeb^cart^mainCart',
      pageVersion: '0.0.56',
    }),
  }
}

/** 分制价格（2000 → 20.00 字符串）；非数字返回 '' */
function centsToYuan(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return ''
  return String(n / 100)
}

/**
 * 从 query.bag 原始响应抽取购物车条目
 * @param {Record<string, any>} body
 * @returns {{
 *   groups: Array<{shopId:string, shopName:string, items:Array<Record<string, any>>}>,
 *   total: number,
 *   invalidCount: number
 * }}
 */
export function parseCartResponse(body) {
  const nodes = body?.data?.data
  if (!nodes || typeof nodes !== 'object') {
    throw new Error('购物车响应缺少 data.data 节点图')
  }

  const items = []
  for (const value of Object.values(nodes)) {
    if (!value || typeof value !== 'object' || value.tag !== 'item') continue
    const f = value.fields || {}
    if (!f.itemId && !f.cartId) continue
    const skuTitle = String(f.sku?.title || '')
    const skuMap = f.sku?.skuMap && typeof f.sku.skuMap === 'object' ? f.sku.skuMap : {}
    items.push({
      cartId: String(f.cartId || ''),
      itemId: String(f.itemId || ''),
      title: String(f.title || ''),
      shopId: String(f.shopId || ''),
      shopName: String(f.shopTitle || ''),
      quantity: Math.max(1, parseInt(f.quantity, 10) || 1),
      pic: normalizeCdnUrl(f.pic || ''),
      priceNowText: String(f.pay?.nowTitle || ''),
      priceNowCents: Number.isFinite(Number(f.pay?.now)) ? Number(f.pay.now) : null,
      skuId: String(f.sku?.skuId || ''),
      skuText: skuTitle,
      skuMap,
      isInvalid: Boolean(f.isInvalid),
      itemUrl: String(f.outerUrl || ''),
    })
  }

  /** @type {Map<string, any>} */
  const byShop = new Map()
  for (const item of items) {
    const key = item.shopId || item.shopName || 'unknown'
    if (!byShop.has(key)) {
      byShop.set(key, {
        shopId: item.shopId,
        shopName: item.shopName,
        items: [],
      })
    }
    byShop.get(key).items.push(item)
  }

  return {
    groups: [...byShop.values()],
    total: items.length,
    invalidCount: items.filter((i) => i.isInvalid).length,
  }
}

/**
 * 购物车条目 → 谷子草稿（字段形状对齐 orderItemToGoods / parseTaobaoXlsx）
 * @param {Record<string, any>} item
 * @returns {Record<string, any>}
 */
export function cartItemToGoods(item) {
  const cleanTitle = cleanGoodsName(item.title)
    .replace(/\s*\[交易快照\]\s*$/i, '')
    .trim()
  const { ip: rawIp, name: rawName } = parseTitleIpName(cleanTitle)
  const name = stripIpBrackets(rawName) || stripIpBrackets(cleanTitle)
  const shopIp = ipFromShopName(item.shopName)
  const ip = shopIp || refineTaobaoIp(rawIp, cleanTitle)
  const category = parseCategoryFromName(cleanTitle) || parseCategoryFromName(name) || parseCategoryFromName(item.skuText)
  const price = item.priceNowCents != null ? centsToYuan(item.priceNowCents) : ''

  return {
    name: name || cleanTitle,
    ip: ip || '',
    characters: [],
    variant: item.skuText || '',
    price,
    // 购物车无下单日期
    acquiredAt: '',
    category: category || '',
    image: item.pic || '',
    images: item.pic ? [item.pic] : [],
    note: '淘宝购物车',
    quantity: item.quantity || 1,
    // 内部元数据（不入库）
    _itemKey: `cart_${item.itemId}_${item.skuId || 0}`,
    _orderNo: `cart_${item.shopId || item.shopName || 'shop'}_${item.itemId}`,
    _status: item.isInvalid ? '已失效' : '',
    _shopName: item.shopName,
    _productUrl: item.itemUrl,
    _displayVariant: item.skuText || '',
    _isInvalid: item.isInvalid,
  }
}

/**
 * 拉取购物车并展开为谷子草稿分组
 * @param {{cookie?:string}} [options]
 * @returns {Promise<{
 *   groups: Array<{shopId:string, shopName:string, goods:Array<Record<string,any>>}>,
 *   total: number,
 *   invalidCount: number
 * }>}
 * @throws {TaobaoImportError} NO_COOKIE / LOGIN_REQUIRED / BLOCKED / HTTP / NETWORK
 */
export async function fetchTaobaoCart(options = {}) {
  const cookie = options.cookie ?? (await getTaobaoCookie())
  if (!isTaobaoCookieReady(cookie)) throw new TaobaoImportError('NO_COOKIE')

  let body
  try {
    body = await mtopCall({
      api: TAOBAO_CART_API,
      v: TAOBAO_CART_VERSION,
      data: buildCartPayload(),
      referer: TAOBAO_CART_REFERER,
      cookie,
      form: true,
      preferProxy: true,
      extraQuery: { __customTag__: 'build', timeout: '6000' },
    })
  } catch (error) {
    if (error instanceof TaobaoRequestError) {
      if (error.code === 'TOKEN' || error.code === 'FAIL') throw new TaobaoImportError('LOGIN_REQUIRED', error.message)
      if (error.code === 'BLOCKED') throw new TaobaoImportError('BLOCKED', error.message)
      if (error.code === 'HTTP') throw new TaobaoImportError('HTTP', error.message)
      throw new TaobaoImportError('NETWORK', error.message)
    }
    throw new TaobaoImportError('NETWORK', error?.message || '')
  }

  const parsed = parseCartResponse(body)
  return {
    groups: parsed.groups.map((group) => ({
      shopId: group.shopId,
      shopName: group.shopName,
      goods: group.items.filter((item) => item.title).map(cartItemToGoods),
    })),
    total: parsed.total,
    invalidCount: parsed.invalidCount,
  }
}
