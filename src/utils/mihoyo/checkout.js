/**
 * 米游铺下单 API 层
 * 流程：地址 → 商品详情 → 领券 → 赠品详情 → 预创建订单 → 创建订单
 */
import { mihoyoRequest, mihoyoRequestWithResponse } from '@/utils/mihoyo/request'
import { createLogger } from '@/utils/logger'
import { compareByPinyin } from '@/utils/pinyin'

const log = createLogger('checkout')

const API_ADDRESS_LIST = '/common/homeishop/v1/address/list'
const API_GOODS_DETAIL = '/common/homeishop/v1/goods/detail'
const API_USER_POINTS = '/common/hm_app/v1/point/user_point'
const API_POINT_GOODS_LIST = '/common/hm_app/v1/goods/point_goods_list'
const API_RECEIVE_COUPON = '/common/homeishop/v1/coupon/receive_coupon'
const API_GIFT_ACTIVITY = '/common/homeishop/v1/activity/gift'
const API_PRE_CREATE_ORDER = '/common/homeishop/v1/shop_car/pre_create_order'
const API_CREATE_ORDER = '/common/homeishop/v1/shop_car/create_order'

const COMMON_HEADERS = {
  'Referer': 'https://www.mihoyogift.com/',
  'Origin': 'https://www.mihoyogift.com',
  'x-rpc-language': 'zh-cn',
  'x-rpc-mall-platform': 'web',
}

function authHeaders(cookie) {
  return { ...COMMON_HEADERS, Cookie: cookie }
}

/**
 * Step 1: 获取收货地址列表
 * @param {string} cookie
 * @returns {Promise<Array<{id, connect_name, phone, province_name, city_name, county_name, addr_ext, is_default}>>}
 */
export async function fetchAddressList(cookie) {
  const json = await mihoyoRequest(API_ADDRESS_LIST, { headers: authHeaders(cookie) })
  if (json.retcode !== 0) {
    throw new Error(json.message || `获取地址失败 (${json.retcode})`)
  }
  const list = json.data?.list || []
  log.debug('address:list', { count: list.length })
  return list
}

/**
 * Step 2: 获取商品详情（SKU、赠品活动、优惠券、上架时间）
 * @param {string} goodsId
 * @param {string} cookie
 * @returns {Promise<{name, shopCode, price, skus, giftActivities, coupons, saleTime, status}>}
 */
export async function fetchGoodsDetailForCheckout(goodsId, cookie) {
  const json = await mihoyoRequest(`${API_GOODS_DETAIL}?goods_id=${goodsId}`, {
    headers: authHeaders(cookie),
  })
  if (json.retcode !== 0) {
    throw new Error(json.message || `获取商品详情失败 (${json.retcode})`)
  }
  const detail = json.data?.goods?.detail
  if (!detail) throw new Error('商品详情为空')

  const name = detail.name || ''
  const shopCode = detail.shop_code || ''
  const price = detail.price || 0
  const point = Number(detail.point ?? detail.points ?? json.data?.goods?.point ?? 0) || 0
  const cover = detail.cover_url || ''
  const saleTime = detail.sale_time || 0
  const status = detail.status || 0
  const remainingTime = detail.remaining_time || 0

  // 从 quantity.sku_quantities 构建库存映射（售罄判断依据）
  // quantity 位于 data.goods.quantity（与 detail 平级），个别接口变体可能在 detail 下，做多位置兜底
  // sku_quantities 格式: { "款式key_发货时间key": stockNumber, ... }
  // 同时登记完整 key 与拆分的单个 contentKey，兼容 skus 的完整 key 与 sale_attrs 的 contentKey
  const goodsQuantity = json.data?.goods?.quantity ?? detail.quantity ?? json.data?.quantity ?? {}
  const skuQuantities = goodsQuantity.sku_quantities || {}
  const stockByKey = new Map()
  for (const [qKey, qStock] of Object.entries(skuQuantities)) {
    const stock = Number(qStock ?? 0)
    stockByKey.set(qKey, stock)
    for (const part of String(qKey).split('_')) {
      if (part) stockByKey.set(part, stock)
    }
  }

  // 按候选 key 顺序解析 SKU 库存：skus 对象 key（完整组合 key）优先，其次 sku.id（可能是 contentKey）
  function resolveSkuStock(sku, key) {
    for (const candidate of [key, sku?.id]) {
      if (candidate != null && stockByKey.has(String(candidate))) {
        return stockByKey.get(String(candidate))
      }
    }
    return Number(sku?.stock ?? sku?.quantity ?? sku?.sku_stock ?? -1)
  }

  // 优先从 detail.skus 构建，若为空则从 sale_attrs 提取 SKU 选项
  const skus = []
  if (detail.skus && typeof detail.skus === 'object' && Object.keys(detail.skus).length > 0) {
    for (const [key, sku] of Object.entries(detail.skus)) {
      if (!sku?.id) continue
      const stock = resolveSkuStock(sku, key)
      const rawPrice = sku.price ?? sku.sale_price ?? sku.activity_price ?? sku.actual_price
      const skuPrice = rawPrice != null && rawPrice > 0 ? rawPrice : null
      const rawPoint = sku.point ?? sku.points ?? detail.point ?? detail.points
      skus.push({
        id: sku.id,
        text: sku.attr || sku.name || `SKU ${sku.id}`,
        key,
        stock,
        soldOut: stock === 0,
        price: skuPrice,
        point: rawPoint != null ? Number(rawPoint) || 0 : point,
        cover: sku.cover_url || '',
      })
    }
  }

  // fallback: 从 sale_attrs 提取 SKU 选项（detail.skus 为空时）
  if (skus.length === 0 && Array.isArray(detail.sale_attrs)) {
    for (const attr of detail.sale_attrs) {
      if (!Array.isArray(attr.content)) continue
      for (const opt of attr.content) {
        const key = opt.key || ''
        if (!key) continue
        const stock = stockByKey.get(key) ?? -1
        skus.push({
          id: key,
          text: opt.text || key,
          key,
          stock,
          soldOut: stock === 0,
          price: null,
          point,
          cover: opt.img_url || '',
        })
      }
    }
  }

  skus.sort((a, b) => compareByPinyin(a.text, b.text))

  const giftActivities = json.data?.goods?.detail?.promotion?.gift_activities
    || json.data?.promotion?.gift_activities
    || []
  const coupons = json.data?.goods?.detail?.promotion?.coupons
    || json.data?.promotion?.coupons
    || []

  log.debug('goods:detail', { goodsId, name, shopCode, skuCount: skus.length, couponCount: coupons.length })

  return { name, shopCode, price, point, cover, skus, giftActivities, coupons, saleTime, status, remainingTime }
}

/**
 * 获取当前用户米游铺积分。
 * @param {string} cookie
 * @returns {Promise<number>}
 */
export async function fetchUserPoints(cookie) {
  const json = await mihoyoRequest(`${API_USER_POINTS}?need_detail=true`, {
    headers: authHeaders(cookie),
  })
  if (json.retcode !== 0) {
    throw new Error(json.message || `获取积分失败 (${json.retcode})`)
  }
  return Number(json.data?.point) || 0
}

/**
 * 获取积分兑换商品列表。
 * price / market_price 的单位均为分，point 为兑换所需积分。
 * @param {string} cookie
 * @param {{shopCode?: string, limit?: number, page?: number}} options
 * @returns {Promise<{count: number, list: Array}>}
 */
export async function fetchPointGoodsList(cookie, { shopCode = '', limit = 100, page = 1 } = {}) {
  const query = new URLSearchParams({
    limit: String(limit),
    page: String(page),
  })
  if (shopCode) query.set('shop_code', String(shopCode))

  const json = await mihoyoRequest(`${API_POINT_GOODS_LIST}?${query.toString()}`, {
    headers: authHeaders(cookie),
  })
  if (json.retcode !== 0) {
    throw new Error(json.message || `获取积分商品失败 (${json.retcode})`)
  }

  const list = (json.data?.list || []).map((item) => ({
    ...item,
    goods_id: String(item.goods_id || ''),
    name: item.name || '',
    cover_url: item.cover_url || '',
    price: Number(item.price) || 0,
    market_price: Number(item.market_price) || Number(item.price) || 0,
    point: Number(item.point ?? item.points) || 0,
    sale_time: Number(item.sale_time) || 0,
    remaining_time: Number(item.remaining_time) || 0,
    shop_code: String(item.shop_code || item.shopCode || shopCode || ''),
    is_sold_out: item.is_sold_out === true
      || String(item.is_sold_out || '').toLowerCase() === 'true'
      || Number(item.is_sold_out) === 1,
  })).filter((item) => item.goods_id && item.name)

  return {
    count: Number(json.data?.count) || list.length,
    list,
  }
}

/**
 * 领取优惠券
 * @param {string} couponId
 * @param {string} cookie
 * @returns {Promise<{ok: boolean, message: string}>}
 */
export async function receiveCoupon(couponId, cookie) {
  try {
    const body = { coupon_id: String(couponId) }
    log.debug('coupon:receive:start', { couponId, body })
    const json = await mihoyoRequest(API_RECEIVE_COUPON, {
      method: 'POST',
      headers: { ...authHeaders(cookie), 'Content-Type': 'application/json;charset=UTF-8' },
      data: body,
    })
    log.debug('coupon:receive:response', { retcode: json.retcode, message: json.message, data: json.data })
    if (json.retcode !== 0) {
      return { ok: false, message: json.message || `领取失败 (${json.retcode})` }
    }
    return { ok: true, message: '' }
  } catch (e) {
    log.error('coupon:receive:error', { couponId }, e)
    return { ok: false, message: e.message || '领取失败' }
  }
}

/**
 * Step 3: 获取赠品活动详情
 * @param {string} activityId
 * @param {string} cookie
 * @returns {Promise<{activityId, stages: Array<{threshold, num, gifts: Array<{goods_id, name, stock, sku_id}>}>}>}
 */
export async function fetchGiftActivityDetail(activityId, cookie) {
  const json = await mihoyoRequest(`${API_GIFT_ACTIVITY}?activity_id=${activityId}`, {
    headers: authHeaders(cookie),
  })
  if (json.retcode !== 0) {
    throw new Error(json.message || `获取赠品活动失败 (${json.retcode})`)
  }
  const data = json.data
  const stages = (data.stages || []).map((stage) => ({
    ...stage,
    gifts: (stage.gifts || []).map((gift) => {
      const stock = Number(gift.stock ?? gift.quantity ?? gift.sku_stock ?? -1)
      return {
        ...gift,
        goods_id: gift.goods_id,
        sku_id: gift.sku_id || 0,
        name: gift.name || '',
        stock,
        soldOut: stock <= 0,
        cover_url: gift.cover_url || gift.img_url || gift.image_url || gift.goods_cover_url || '',
      }
    }),
  }))
  log.debug('gift:detail', { activityId, stageCount: stages.length })
  return {
    activityId,
    stages,
    name: data.name || '',
    // 活动起止时间（Unix 秒）与服务器当前时间，用于判断活动是否可下单
    startTime: Number(data.start_time) || 0,
    endTime: Number(data.end_time) || 0,
    serverTime: Number(data.server_time) || 0,
    status: Number(data.status) || 0,
  }
}

/**
 * 拉取米游铺服务器时间。
 * 用响应头 Date 作为基准，并参考业界标准做法（RFC 7231 Date 秒级精度）：
 *   - 服务器时刻取该秒中点（+500ms），补偿秒级截断
 *   - 本地时刻取请求往返的 RTT 中点（(t0+t1)/2），补偿网络时延
 * 这样 offsetMs 即「服务器时间 − 本地时间」的无偏估计，避免系统性滞后。
 * @param {string} cookie
 * @returns {Promise<{serverTime: number, offsetMs: number}>}
 */
export async function fetchMihoyoServerTime(cookie) {
  const t0 = Date.now()
  const { response } = await mihoyoRequestWithResponse(API_ADDRESS_LIST, {
    headers: authHeaders(cookie),
  })
  const t1 = Date.now()
  const serverDate = response?.headers?.get?.('date') || response?.headers?.get?.('Date') || ''
  const parsed = serverDate ? new Date(serverDate).getTime() : NaN
  const serverTime = Number.isFinite(parsed) ? parsed + 500 : Date.now()
  const localMidpoint = (t0 + t1) / 2
  return {
    serverTime,
    offsetMs: serverTime - localMidpoint,
  }
}

/**
 * Step 4: 预创建订单
 * @param {string} cookie
 * @param {Object} payload
 * @param {string} payload.addressId
 * @param {Array} payload.items - [{goodsId, skuId, shopCode, nums}]
 * @param {Array} [payload.giftActivities] - [{activity_id, gifts: [{goods_id, sku_id, nums, shop_code}]}]
 * @param {boolean} [payload.isFromShopCar=false]
 * @returns {Promise<{code, totalFee, orderPoints, shopOrders, respGifts}>}
 */
export async function preCreateOrder(cookie, { addressId, items, giftActivities = [], isFromShopCar = false }) {
  const body = {
    address_id: String(addressId),
    list: items.map((item) => ({
      nums: item.nums || 1,
      shop_code: item.shopCode,
      sku_id: item.skuId,
      goods_id: item.goodsId,
    })),
    gift_activities: giftActivities,
    is_from_shop_car: Boolean(isFromShopCar),
  }

  const json = await mihoyoRequest(API_PRE_CREATE_ORDER, {
    method: 'POST',
    headers: { ...authHeaders(cookie), 'Content-Type': 'application/json;charset=UTF-8' },
    data: body,
  })

  if (json.retcode !== 0) {
    throw new Error(json.message || `预创建订单失败 (${json.retcode})`)
  }

  const code = json.data?.code
  if (!code) {
    log.warn('pre:create:no-code', { retcode: json.retcode, message: json.message, data: json.data })
    throw new Error('预创建订单未返回 code，请确认商品已开售、地址与商品参数正确')
  }

  const totalFee = json.data?.order_total_fee ?? 0
  const orderPoints = Number(json.data?.order_points) || 0
  const shopOrders = json.data?.shop_order || []
  const respGifts = json.data?.gift_activities || []

  log.debug('pre:create', { code, totalFee })
  return { code, totalFee, orderPoints, shopOrders, respGifts }
}

/**
 * Step 5: 创建订单
 * @param {string} cookie
 * @param {Object} payload
 * @param {string} payload.addressId
 * @param {string} payload.code - 预创建返回的 code
 * @param {string} [payload.remark]
 * @param {Array} payload.items - [{shopCode}]
 * @returns {Promise<{orderNo, amount, productName}>}
 */
export async function createOrder(cookie, { addressId, code, remark = '', items }) {
  const body = {
    inner_source: '',
    address_id: String(addressId),
    code,
    address_info: '',
    confirm_license: true,
    channel: '2',
    balance_mobile: '',
    order_extra: items.map((item) => ({
      remark,
      shop_code: item.shopCode,
    })),
  }

  const json = await mihoyoRequest(API_CREATE_ORDER, {
    method: 'POST',
    headers: { ...authHeaders(cookie), 'Content-Type': 'application/json;charset=UTF-8' },
    data: body,
  })

  if (json.retcode !== 0) {
    throw new Error(json.message || `创建订单失败 (${json.retcode})`)
  }

  const orderNo = json.data?.order_no || ''
  const amount = json.data?.prepay?.amount ?? 0
  const productName = json.data?.prepay?.productName || ''

  log.debug('order:create', { orderNo, amount })
  return { orderNo, amount, productName }
}

/**
 * 提交整单：预创建 + 创建订单。
 * @param {string} cookie
 * @param {Object} payload
 * @param {string} payload.addressId
 * @param {Array} payload.items
 * @param {Array} [payload.giftActivities]
 * @param {boolean} [payload.isFromShopCar]
 * @param {string} [payload.remark]
 * @returns {Promise<{orderNo, amount, orderPoints, productName, totalFee, shopOrders, respGifts}>}
 */
export async function submitCheckoutOrder(cookie, { addressId, items, giftActivities = [], isFromShopCar = false, remark = '' }) {
  const preCreated = await preCreateOrder(cookie, {
    addressId,
    items,
    giftActivities,
    isFromShopCar,
  })

  const result = await createOrder(cookie, {
    addressId,
    code: preCreated.code,
    remark,
    items,
  })

  return {
    ...result,
    totalFee: preCreated.totalFee,
    orderPoints: preCreated.orderPoints,
    shopOrders: preCreated.shopOrders,
    respGifts: preCreated.respGifts,
  }
}
