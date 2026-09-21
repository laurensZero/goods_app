import { describe, expect, it } from 'vitest'
import { orderToGoodsList } from '../index'

function makeOrder(overrides = {}) {
  return {
    order_no: 'ORD1',
    order_time: 1780228926,
    payment_info: { pay_time: 1780228938, pay_amount: 11000, paied: true },
    discounts: {
      total_discount: 0,
      goods_discount: 0,
      coupon_discount: 0,
      shop_discount: 0,
      shipping_coupon_discount: 0
    },
    goods_amount: 0,
    order_amount: 0,
    shop: { shop_code: 'xqtd', shop_name: '货全杂货铺' },
    goods_list: [],
    ...overrides
  }
}

function makeWrapper(meta, extra = {}) {
  return {
    meta_info: {
      goods_id: 'g1',
      goods_name: '「崩坏：星穹铁道」测试徽章',
      goods_type: 1,
      quantity: 1,
      price: 2000,
      market_price: 2000,
      coupon_discount: 0,
      total_price: undefined,
      sku_id: 1,
      sku_sales: [{ attr_name: '款式', attr_key: 'k', attr_value: '银狼' }],
      ...meta
    },
    ...extra
  }
}

describe('mihoyo orderToGoodsList 入手价', () => {
  it('明细带 total_price 时直接写入 actualPrice（分→元）', () => {
    const list = orderToGoodsList(makeOrder({
      discounts: { total_discount: 1500, shop_discount: 1500, coupon_discount: 1500, goods_discount: 0, shipping_coupon_discount: 0 },
      goods_list: [
        makeWrapper({ price: 2000, total_price: 1760, quantity: 1 }),
        makeWrapper({ goods_id: 'g2', goods_name: '其他立牌', price: 4900, total_price: 3596, quantity: 1, sku_sales: [] })
      ]
    }))

    expect(list).toHaveLength(2)
    expect(list[0].price).toBe('20')
    expect(list[0].actualPrice).toBe('17.6')
    expect(list[1].actualPrice).toBe('35.96')
  })

  it('无行实付但有订单优惠时，按标价比例分摊入手价', () => {
    const list = orderToGoodsList(makeOrder({
      discounts: { total_discount: 1000, shop_discount: 1000, coupon_discount: 0, goods_discount: 0, shipping_coupon_discount: 0 },
      goods_list: [
        makeWrapper({ price: 3000, total_price: undefined, quantity: 1 }),
        makeWrapper({ goods_id: 'g2', goods_name: '挂件', price: 1000, total_price: undefined, quantity: 1, sku_sales: [] })
      ]
    }))

    // 标价 30+10=40，优惠 10 → 22.5 + 7.5
    expect(list[0].actualPrice).toBe('22.5')
    expect(list[1].actualPrice).toBe('7.5')
  })

  it('无优惠且无行实付时 actualPrice 为空', () => {
    const list = orderToGoodsList(makeOrder({
      goods_list: [makeWrapper({ price: 2000, total_price: undefined })]
    }))
    expect(list[0].actualPrice).toBe('')
  })

  it('qty≥2 时按份数均摊 unitActualPriceList', () => {
    const list = orderToGoodsList(makeOrder({
      discounts: { total_discount: 600, shop_discount: 600, coupon_discount: 0, goods_discount: 0, shipping_coupon_discount: 0 },
      goods_list: [
        makeWrapper({ price: 2000, quantity: 2, total_price: undefined, sku_sales: [] })
      ]
    }))
    // 标价合计 40，优惠 6 → 实付 34，两份 17
    expect(list[0].quantity).toBe(2)
    expect(list[0].actualPrice).toBe('34')
    expect(list[0].unitActualPriceList).toEqual(['17', '17'])
  })
})
