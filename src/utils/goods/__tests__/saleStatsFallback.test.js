import { describe, it, expect } from 'vitest'
import { extractSaleEntries } from '../saleStats'

function makeItem(overrides = {}) {
  return {
    id: 'g1',
    name: '吧唧',
    isWishlist: false,
    quantity: 1,
    price: '',
    actualPrice: '100',
    shippingFee: '',
    collectStatus: '已拥有',
    unitActualPriceList: [],
    unitCollectStatusList: [],
    statusTimeline: [],
    ...overrides
  }
}

describe('extractSaleEntries fallback behaviors', () => {
  it('units without per-unit entries fall back to the summary entry as one grouped record', () => {
    // 整条卖出(汇总条目带总价)后才出现逐件状态列表(如双端合并)
    const item = makeItem({
      quantity: 2,
      actualPrice: '40',
      unitCollectStatusList: ['已出', '已出'],
      statusTimeline: [{ status: '已出', at: '2026-06-01', price: '130', platform: '闲鱼' }]
    })
    const { sold } = extractSaleEntries(item)
    expect(sold).toHaveLength(1)
    expect(sold[0].count).toBe(2)
    expect(sold[0].price).toBe(130)
    expect(sold[0].platform).toBe('闲鱼')
    expect(sold[0].cost).toBe(80)
    expect(sold[0].profit).toBe(130 - 80)
  })

  it('mixes per-unit records with a grouped fallback record without double-counting the lot price', () => {
    const item = makeItem({
      quantity: 3,
      actualPrice: '30',
      unitCollectStatusList: ['已出', '已出', '已拥有'],
      statusTimeline: [
        { status: '已出', at: '2026-05-01', price: '90' },
        { status: '已出', at: '2026-06-01', unitIndex: 0, price: '50' }
      ]
    })
    const { sold } = extractSaleEntries(item)
    expect(sold).toHaveLength(2)
    const unitRecord = sold.find((r) => r.unitIndex === 0)
    expect(unitRecord.price).toBe(50)
    // 批总价 90 覆盖的件数与缺失件数(1)不符,无法可靠归属 → 不计价,只保留日期,
    // 避免第 0 件的金额同时经逐件记录和批总价重复计入回血
    const grouped = sold.find((r) => r.unitIndex == null)
    expect(grouped.count).toBe(1)
    expect(grouped.hasPrice).toBe(false)
    expect(grouped.at).toBe('2026-05-01')
  })

  it('short unit status list falls back to owned, not the aggregate collectStatus', () => {
    // 列表短于 quantity 时,聚合状态「已出」不能把未卖的件虚增进账本
    const item = makeItem({
      quantity: 3,
      collectStatus: '已出',
      unitCollectStatusList: ['已出'],
      statusTimeline: [{ status: '已出', at: '2026-06-01', unitIndex: 0, price: '80' }]
    })
    const { sold } = extractSaleEntries(item)
    expect(sold).toHaveLength(1)
    expect(sold[0].unitIndex).toBe(0)
  })
})
