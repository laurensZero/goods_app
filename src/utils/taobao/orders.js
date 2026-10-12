/**
 * 淘宝「已买到的宝贝」在线拉取（mtop queryboughtlistv2）
 *
 * 接口形态（2026-10-12 抓包，docs/taobao-mtop-api.md §4）：
 *   POST mtop.taobao.order.queryboughtlistV2/1.0（form + originaljson）
 *   data={"tabCode":"all","page":1,"OrderType":"OrderList","appName":"tborder",…}
 * 响应为低代码 UI 节点图（flat map of {tag,id,fields}），本模块按 tag 抽取
 * shopInfo / orderItemInfo / orderPayment / pagination，映射为与 XLSX 导入
 * 相同的谷子草稿结构（utils/import/taobao.js parseTaobaoXlsx 产出形状）。
 */
import { cleanGoodsName, parseCategoryFromName, parseTitleIpName } from '@/utils/mihoyo/index'
import { getTaobaoCookie, isTaobaoCookieReady } from './cookie'
import { mtopCall } from './mtop'
import { normalizeCdnUrl } from './detail'
import { TaobaoRequestError } from './request'
import { TaobaoImportError } from './service'

/** 订单列表 mtop API（抓包路径小写 v2；query 参数 api 为大写 V，签名/路由两者等价） */
export const TAOBAO_ORDER_LIST_API = 'mtop.taobao.order.queryboughtlistV2'
export const TAOBAO_ORDER_LIST_VERSION = '1.0'
export const TAOBAO_ORDER_LIST_REFERER = 'https://buyertrade.taobao.com/trade/itemlist/list_bought_items.htm'
/** 每页条数（与 PC 已买到的宝贝页一致） */
export const TAOBAO_ORDER_PAGE_SIZE = 30

export { TaobaoImportError }

export function stripIpBrackets(text) {
  return String(text || '').replace(/[【\[（(]([^】\]）)]+)[】\]）)]/g, '$1').trim()
}

export function ipFromShopName(shopName) {
  const name = String(shopName || '')
  if (!name) return ''
  const rules = [
    [/米哈游|miHoYo|原神|崩坏|星穹铁道|绝区零|HoYoverse/i, '原神'],
    [/bilibili|B站/i, '哔哩哔哩'],
    [/明日方舟|鹰角|Arknights/i, '明日方舟'],
    [/光与夜之恋|叠纸/i, '光与夜之恋'],
    [/恋与制作人|恋与/i, '恋与制作人'],
    [/未定事件簿/i, '未定事件簿'],
    [/时空中的绘旅人/i, '时空中的绘旅人'],
    [/世界之外/i, '世界之外'],
    [/第五人格/i, '第五人格'],
  ]
  for (const [re, ip] of rules) {
    if (re.test(name)) return ip
  }
  return ''
}

export function refineTaobaoIp(rawIp, title) {
  const candidates = [rawIp, title]
  const known = /原神|崩坏|星穹铁道|绝区零|明日方舟|光与夜之恋|恋与|未定事件簿|第五人格|哔哩哔哩|初音|Hanser|原神/i
  for (const c of candidates) {
    if (c && known.test(String(c))) {
      const m = String(c).match(/原神|崩坏3|崩坏：星穹铁道|崩坏星穹铁道|绝区零|明日方舟|光与夜之恋|恋与制作人|未定事件簿|第五人格|初音未来|Hanser/i)
      if (m) return m[0] === '崩坏3' ? '崩坏3' : m[0]
    }
  }
  return rawIp || ''
}

/** 解析「￥15.00」/ 分制价格字符串 → 元；失败返回 null */
export function parseMoney(text) {
  const m = String(text || '').replace(/[,，\s]/g, '').match(/¥￥?\s*(\d+(?:\.\d+)?)/)
  if (m) return parseFloat(m[1])
  const plain = String(text || '').replace(/[^0-9.]/g, '')
  if (!plain || plain === '.') return null
  const n = parseFloat(plain)
  return Number.isFinite(n) ? n : null
}

/**
 * 从 queryboughtlistv2 原始响应抽取订单列表
 * @param {Record<string, any>} body mtop 响应体（含 ret/data）
 * @returns {{
 *   orders: Array<{orderId:string, createTime:string, status:string, shopName:string,
 *     items: Array<{itemId:string, title:string, skuText:string, quantity:number,
 *       priceText:string, actualFeeText:string, pic:string, itemUrl:string, refundStatus:string}>}>,
 *   page: number, hasMore: boolean, totalNum: number, pageSize: number
 * }}
 */
export function parseBoughtListResponse(body) {
  const nodes = body?.data?.data
  if (!nodes || typeof nodes !== 'object') {
    throw new Error('订单响应缺少 data.data 节点图')
  }

  /** @type {Map<string, any>} */
  const shopInfoByOrder = new Map()
  /** @type {Map<string, any[]>} */
  const itemsByOrder = new Map()
  /** @type {Map<string, any>} */
  const paymentByOrder = new Map()
  let pagination = null

  for (const value of Object.values(nodes)) {
    if (!value || typeof value !== 'object') continue
    const tag = value.tag
    const id = String(value.id || '')
    if (tag === 'pagination') {
      pagination = value.fields || value
    } else if (tag === 'shopInfo' && id) {
      const fields = value.fields || {}
      // 节点 id 形如 shopInfo_{orderId}；业务字段 orderId 更可靠
      const orderId = String(fields.orderId || id.replace(/^shopInfo_/, ''))
      if (!orderId) continue
      shopInfoByOrder.set(orderId, fields)
    } else if (tag === 'orderItemInfo') {
      const fields = value.fields || {}
      const orderId = String(fields.orderId || id.split('_')[1] || '')
      if (!orderId) continue
      if (!itemsByOrder.has(orderId)) itemsByOrder.set(orderId, [])
      itemsByOrder.get(orderId).push(fields)
    } else if (tag === 'orderPayment' && id) {
      paymentByOrder.set(id.replace(/^orderPayment_/, ''), value.fields || {})
    }
  }

  const orders = []
  for (const [orderId, shop] of shopInfoByOrder) {
    const itemFields = itemsByOrder.get(orderId) || []
    const payment = paymentByOrder.get(orderId) || {}
    const items = itemFields.map((fields) => {
      const item = fields.item || {}
      return {
      itemId: String(item.itemId || ''),
      title: String(item.title || ''),
      skuText: String(item.skuText || ''),
      quantity: Math.max(1, parseInt(item.quantity, 10) || 1),
      priceText: String(item.priceInfo?.actualTotalFee || item.priceInfo?.promotion || ''),
      promotionText: String(item.priceInfo?.promotion || ''),
      pic: normalizeCdnUrl(item.pic || ''),
      itemUrl: String(item.itemUrl || ''),
      refundStatus: String(item.refundStatus || ''),
      }
    })
    orders.push({
      orderId,
      createTime: String(shop.createTime || shop.createDay || ''),
      status: String(shop.tradeTitle || ''),
      shopName: String(shop.shopName || shop.sellerName || ''),
      actualFeeText: String(payment.actualFee?.value || ''),
      freightText: String(payment.pcPostFee?.value || ''),
      totalFeeText: String(payment.totalFee?.value || ''),
      items,
    })
  }

  // 按下单时间倒序（与 PC 页一致）
  orders.sort((a, b) => String(b.createTime || '').localeCompare(String(a.createTime || '')))

  return {
    orders,
    page: Number(pagination?.currentPage) || 1,
    hasMore: Boolean(pagination?.hasMore),
    totalNum: Number(pagination?.totalNum) || orders.length,
    pageSize: Number(pagination?.pageSize) || TAOBAO_ORDER_PAGE_SIZE,
  }
}

/**
 * 订单条目 → 谷子草稿（字段形状对齐 parseTaobaoXlsx）
 * @param {{orderId:string, createTime:string, status:string, shopName:string}} order
 * @param {{itemId:string, title:string, skuText:string, quantity:number, priceText:string, pic:string, itemUrl:string, refundStatus:string}} item
 * @returns {Record<string, any>}
 */
export function orderItemToGoods(order, item) {
  const cleanTitle = cleanGoodsName(item.title)
    .replace(/\s*miHoYo\s*$/i, '')
    .replace(/\s*\[交易快照\]\s*$/i, '')
    .trim()
  const { ip: rawIp, name: rawName } = parseTitleIpName(cleanTitle)
  const name = stripIpBrackets(rawName) || stripIpBrackets(cleanTitle)
  const shopIp = ipFromShopName(order.shopName)
  const ip = shopIp || refineTaobaoIp(rawIp, cleanTitle)
  const category = parseCategoryFromName(cleanTitle) || parseCategoryFromName(name) || parseCategoryFromName(item.skuText)
  const price = parseMoney(item.priceText)
  const date = String(order.createTime || '').slice(0, 10)
  const quantity = Math.max(1, item.quantity || 1)

  return {
    name: name || cleanTitle,
    ip: ip || '',
    characters: [],
    variant: item.skuText || '',
    price: price != null ? String(price) : '',
    acquiredAt: date,
    category: category || '',
    image: item.pic || '',
    images: item.pic ? [item.pic] : [],
    note: `淘宝订单 #${order.orderId}`,
    quantity,
    // 内部元数据（不入库）
    _itemKey: `${order.orderId}_${item.itemId || cleanTitle}_${item.skuText || ''}`,
    _orderNo: order.orderId,
    _status: item.refundStatus ? `${order.status} ${item.refundStatus}`.trim() : order.status,
    _shopName: order.shopName,
    _productUrl: item.itemUrl,
    _displayVariant: item.skuText || '',
  }
}

/**
 * 分页拉取订单并展开为谷子草稿列表
 * @param {{page?:number, tabCode?:string, cookie?:string}} [options]
 * @returns {Promise<{goods:Array<Record<string,any>>, page:number, hasMore:boolean, totalNum:number, orders:number}>}
 * @throws {TaobaoImportError} NO_COOKIE / LOGIN_REQUIRED / BLOCKED / HTTP / NETWORK
 */
export async function fetchTaobaoOrders(options = {}) {
  const page = Math.max(1, Number(options.page) || 1)
  const tabCode = options.tabCode || 'all'
  const cookie = options.cookie ?? (await getTaobaoCookie())
  if (!isTaobaoCookieReady(cookie)) throw new TaobaoImportError('NO_COOKIE')

  let body
  try {
    body = await mtopCall({
      api: TAOBAO_ORDER_LIST_API,
      v: TAOBAO_ORDER_LIST_VERSION,
      data: {
        tabCode,
        page,
        OrderType: 'OrderList',
        appName: 'tborder',
        appVersion: '3.0',
        condition: '{"directRouteToTm2Scene":"1"}',
        __needlessClearProtocol__: true,
      },
      referer: TAOBAO_ORDER_LIST_REFERER,
      cookie,
      form: true,
      preferProxy: true,
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

  const parsed = parseBoughtListResponse(body)
  const goods = []
  for (const order of parsed.orders) {
    for (const item of order.items) {
      if (!item.title) continue
      goods.push(orderItemToGoods(order, item))
    }
  }

  return {
    goods,
    page: parsed.page,
    hasMore: parsed.hasMore,
    totalNum: parsed.totalNum,
    orders: parsed.orders.length,
  }
}
