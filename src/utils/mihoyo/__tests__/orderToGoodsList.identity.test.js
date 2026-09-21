import { describe, expect, it } from 'vitest'
import { orderToGoodsList } from '../index'
import { buildOrderImportIdentity } from '@/utils/goods/identity'

function makeOrder(overrides = {}) {
  return {
    order_no: 'ORD1',
    payment_info: { pay_time: 1780228938, pay_amount: 2000 },
    goods_list: [],
    ...overrides,
  }
}

function makeWrapper(meta = {}) {
  return {
    meta_info: {
      goods_id: 'g100',
      goods_name: '「崩坏：星穹铁道」测试徽章',
      quantity: 1,
      price: 2000,
      sku_id: 17903,
      sku_sales: [{ attr_name: '款式', attr_key: 'k', attr_value: '银狼' }],
      ...meta,
    },
  }
}

describe('orderToGoodsList 导入身份字段', () => {
  it('输出 goodsId / acquiredAt / 清洗后 variant，不再把 sku_id 兜底进 goodsId', () => {
    const list = orderToGoodsList(makeOrder({
      goods_list: [makeWrapper({ sku_id: 999, sku_name: '徽章-银狼' })],
    }))

    expect(list).toHaveLength(1)
    expect(list[0].goodsId).toBe('g100')
    expect(list[0].skuId).toBeUndefined()
    expect(list[0].acquiredAt).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(list[0].variant).toBe('银狼')
  })

  it('无 goods_id 时 goodsId 为空，不落入 sku_id', () => {
    const list = orderToGoodsList(makeOrder({
      goods_list: [makeWrapper({ goods_id: '', goodsId: undefined, sku_id: 17903 })],
    }))
    expect(list[0].goodsId).toBe('')
  })

  it('同商品不同款式可生成不同精确身份', () => {
    const list = orderToGoodsList(makeOrder({
      goods_list: [
        makeWrapper({ goods_id: 'g100', sku_sales: [{ attr_name: '款式', attr_value: '银狼' }] }),
        makeWrapper({ goods_id: 'g100', sku_sales: [{ attr_name: '款式', attr_value: '刃' }] }),
      ],
    }))
    const a = buildOrderImportIdentity(list[0])
    const b = buildOrderImportIdentity(list[1])
    expect(a).toBeTruthy()
    expect(b).toBeTruthy()
    expect(a).not.toBe(b)
  })
})
