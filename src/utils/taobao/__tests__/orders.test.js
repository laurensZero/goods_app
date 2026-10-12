import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../request', () => {
  class TaobaoRequestError extends Error {
    constructor(code, message) {
      super(message || code)
      this.name = 'TaobaoRequestError'
      this.code = code
    }
  }
  return { taobaoPageGet: vi.fn(), taobaoPagePost: vi.fn(), TaobaoRequestError }
})
vi.mock('../cookie', () => ({
  getTaobaoCookie: vi.fn(),
  isTaobaoCookieReady: vi.fn(),
  setTaobaoCookie: vi.fn(async (c) => c),
}))
vi.mock('../mtop', () => ({ mtopCall: vi.fn() }))
vi.mock('../service', () => {
  class TaobaoImportError extends Error {
    constructor(code, message) {
      super(message || code)
      this.name = 'TaobaoImportError'
      this.code = code
    }
  }
  return { TaobaoImportError }
})

import { isTaobaoCookieReady, getTaobaoCookie } from '../cookie'
import { mtopCall } from '../mtop'
import {
  parseBoughtListResponse,
  orderItemToGoods,
  fetchTaobaoOrders,
  TAOBAO_ORDER_LIST_API,
} from '../orders'

/** 按真实 queryboughtlistv2 响应形状构造的最小 fixture（单店多件 + 分页） */
function makeBodyFixture() {
  return {
    api: 'mtop.taobao.order.queryboughtlistV2',
    v: '1.0',
    ret: ['SUCCESS::调用成功'],
    data: {
      data: {
        pagination: {
          tag: 'pagination',
          id: 'pagination',
          fields: { currentPage: 1, hasMore: true, pageSize: 30, totalNum: 2 },
        },
        shopInfo_4123: {
          tag: 'shopInfo',
          id: 'shopInfo_4123',
          fields: {
            createTime: '2025-11-02 20:15:00',
            createDay: '11月02日 20:15',
            orderId: '4123',
            shopName: 'miHoYo旗舰店',
            sellerName: 'miHoYo',
            tradeTitle: '交易成功',
            orderDetailUrl: '//trade.taobao.com/trade/detail.htm?id=4123',
          },
        },
        orderItemInfo_4123_501: {
          tag: 'orderItemInfo',
          id: 'orderItemInfo_4123_501',
          fields: {
            orderId: '4123',
            item: {
              itemId: '1026022602471',
              title: '【原神】可莉徽章 大版 miHoYo',
              quantity: 2,
              skuText: '大版',
              pic: 'https://img.alicdn.com/imgextra/i4/abc.png',
              itemUrl: 'https://item.taobao.com/item.htm?id=1026022602471',
              priceInfo: { actualTotalFee: '￥15.00', promotion: '¥15.00' },
              refundStatus: '',
            },
          },
        },
        orderItemInfo_4123_502: {
          tag: 'orderItemInfo',
          id: 'orderItemInfo_4123_502',
          fields: {
            orderId: '4123',
            item: {
              itemId: '1026022602472',
              title: '【原神】派蒙立牌 现货 miHoYo',
              quantity: 1,
              skuText: '单入',
              pic: 'https://img.alicdn.com/imgextra/i4/def.png',
              itemUrl: 'https://item.taobao.com/item.htm?id=1026022602472',
              priceInfo: { actualTotalFee: '￥28.00', promotion: '' },
              refundStatus: '',
            },
          },
        },
        orderPayment_4123: {
          tag: 'orderPayment',
          id: 'orderPayment_4123',
          fields: {
            actualFee: { value: '58' },
            pcPostFee: { value: '0' },
            totalFee: { value: '58' },
            discountFee: { value: '0' },
          },
        },
        recommendContainer_x: {
          tag: 'recommendContainer',
          id: 'recommendContainer_x',
          fields: { ignore: true },
        },
      },
    },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('parseBoughtListResponse', () => {
  it('按 shopInfo/orderItemInfo/orderPayment/pagination 抽取订单', () => {
    const parsed = parseBoughtListResponse(makeBodyFixture())
    expect(parsed.page).toBe(1)
    expect(parsed.hasMore).toBe(true)
    expect(parsed.totalNum).toBe(2)
    expect(parsed.pageSize).toBe(30)
    expect(parsed.orders).toHaveLength(1)
    const order = parsed.orders[0]
    expect(order.orderId).toBe('4123')
    expect(order.status).toBe('交易成功')
    expect(order.shopName).toBe('miHoYo旗舰店')
    expect(order.createTime).toBe('2025-11-02 20:15:00')
    expect(order.items).toHaveLength(2)
    expect(order.items[0].title).toContain('可莉徽章')
    expect(order.items[0].quantity).toBe(2)
    expect(order.items[0].skuText).toBe('大版')
    expect(order.items[0].priceText).toBe('￥15.00')
    expect(order.items[0].itemUrl).toContain('1026022602471')
    expect(order.actualFeeText).toBe('58')
  })

  it('缺少 data.data 时抛错', () => {
    expect(() => parseBoughtListResponse({ data: {} })).toThrow(/data\.data/)
  })
})

describe('orderItemToGoods', () => {
  it('映射为与 XLSX 导入一致的草稿字段', () => {
    const parsed = parseBoughtListResponse(makeBodyFixture())
    const order = parsed.orders[0]
    const goods = orderItemToGoods(order, order.items[0])
    expect(goods.name).toContain('可莉徽章')
    expect(goods.ip).toBe('原神')
    expect(goods.variant).toBe('大版')
    expect(goods.quantity).toBe(2)
    expect(goods.price).toBe('15')
    expect(goods.acquiredAt).toBe('2025-11-02')
    expect(goods.image).toContain('img.alicdn.com')
    expect(goods.note).toBe('淘宝订单 #4123')
    expect(goods._orderNo).toBe('4123')
    expect(goods._status).toBe('交易成功')
    expect(goods._shopName).toBe('miHoYo旗舰店')
    expect(goods._productUrl).toContain('1026022602471')
    expect(goods._itemKey).toBe('4123_1026022602471_大版')
  })

  it('店铺名推断 IP 优先于标题解析', () => {
    const parsed = parseBoughtListResponse(makeBodyFixture())
    const order = parsed.orders[0]
    const goods = orderItemToGoods(order, order.items[1])
    expect(goods.ip).toBe('原神')
    expect(goods.name).toContain('派蒙立牌')
  })
})

describe('fetchTaobaoOrders', () => {
  it('Cookie 未就绪 → NO_COOKIE', async () => {
    isTaobaoCookieReady.mockReturnValue(false)
    await expect(fetchTaobaoOrders()).rejects.toMatchObject({
      name: 'TaobaoImportError',
      code: 'NO_COOKIE',
    })
    expect(mtopCall).not.toHaveBeenCalled()
  })

  it('成功时用 form 订单 API 调用并展开 items 为草稿', async () => {
    isTaobaoCookieReady.mockReturnValue(true)
    getTaobaoCookie.mockResolvedValue('cookie2=1; _m_h5_tk=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa_1')
    mtopCall.mockResolvedValue(makeBodyFixture())

    const result = await fetchTaobaoOrders({ page: 1 })

    expect(mtopCall).toHaveBeenCalledTimes(1)
    const call = mtopCall.mock.calls[0][0]
    expect(call.api).toBe(TAOBAO_ORDER_LIST_API)
    expect(call.form).toBe(true)
    expect(call.preferProxy).toBe(true)
    expect(call.data).toMatchObject({ tabCode: 'all', page: 1, OrderType: 'OrderList' })
    expect(call.referer).toContain('buyertrade.taobao.com')

    expect(result.orders).toBe(1)
    expect(result.hasMore).toBe(true)
    expect(result.totalNum).toBe(2)
    expect(result.goods).toHaveLength(2)
    expect(result.goods[0]._itemKey).toBe('4123_1026022602471_大版')
    expect(result.goods[1]._itemKey).toBe('4123_1026022602472_单入')
  })

  it('mtop TOKEN/FAIL → LOGIN_REQUIRED；BLOCKED → BLOCKED', async () => {
    isTaobaoCookieReady.mockReturnValue(true)
    const { TaobaoRequestError } = await import('../request')

    mtopCall.mockRejectedValueOnce(new TaobaoRequestError('TOKEN', 'FAIL_SYS_TOKEN_EMPTY'))
    await expect(fetchTaobaoOrders()).rejects.toMatchObject({ code: 'LOGIN_REQUIRED' })

    mtopCall.mockRejectedValueOnce(new TaobaoRequestError('FAIL', 'FAIL_SYS_ILLEGAL_ACCESS'))
    await expect(fetchTaobaoOrders()).rejects.toMatchObject({ code: 'LOGIN_REQUIRED' })

    mtopCall.mockRejectedValueOnce(new TaobaoRequestError('BLOCKED', 'tmd'))
    await expect(fetchTaobaoOrders()).rejects.toMatchObject({ code: 'BLOCKED' })
  })
})
