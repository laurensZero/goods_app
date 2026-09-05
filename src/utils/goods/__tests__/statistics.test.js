import { describe, it, expect } from 'vitest'
import { getItemSpendEntries, calcPeriodSpend } from '../statistics'

function makeItem(overrides = {}) {
  return {
    id: 'g1',
    name: '吧唧',
    isWishlist: false,
    quantity: 1,
    price: '',
    actualPrice: '100',
    acquiredAt: '2026-08-10',
    shippingFee: '',
    collectStatus: '已拥有',
    unitAcquiredAtList: [],
    unitActualPriceList: [],
    unitCollectStatusList: [],
    ...overrides
  }
}

describe('getItemSpendEntries', () => {
  it('returns empty for wishlist items', () => {
    expect(getItemSpendEntries(makeItem({ isWishlist: true }))).toEqual([])
  })

  it('excludes 已出/已赠出/丢失 statuses', () => {
    for (const status of ['已出', '已赠出', '丢失']) {
      expect(getItemSpendEntries(makeItem({ collectStatus: status }))).toEqual([])
    }
  })

  it('uses item-level fallback with shipping added', () => {
    const entries = getItemSpendEntries(makeItem({ actualPrice: '100', shippingFee: '10' }))
    expect(entries).toHaveLength(1)
    expect(entries[0].price).toBe(110)
    expect(entries[0].date.getFullYear()).toBe(2026)
  })

  it('splits multi-unit items into per-unit entries on their own dates', () => {
    const entries = getItemSpendEntries(makeItem({
      quantity: 2,
      actualPrice: '90',
      shippingFee: '10',
      unitAcquiredAtList: ['2026-07-05', '2026-08-20'],
      unitActualPriceList: ['40', '50']
    }))
    expect(entries).toHaveLength(2)
    expect(entries.map((e) => e.price)).toEqual([45, 55])
    expect(entries[0].date.getMonth()).toBe(6)
    expect(entries[1].date.getMonth()).toBe(7)
  })

  it('prefers CNY-converted unit prices when present', () => {
    const entries = getItemSpendEntries(makeItem({
      unitAcquiredAtList: ['2026-08-01'],
      unitActualPriceList: ['1000'],
      unitActualPriceCNYList: [48]
    }))
    expect(entries[0].price).toBe(48)
  })

  it('distributes total spend across unit dates when unit prices are absent', () => {
    // 8-22 买 11 份、9-5 补 3 份，未填逐件价：各月按份数均摊计入
    const entries = getItemSpendEntries(makeItem({
      quantity: 14,
      actualPrice: '140',
      shippingFee: '14',
      acquiredAt: '2026-08-22',
      unitAcquiredAtList: [
        ...Array.from({ length: 11 }, () => '2026-08-22'),
        ...Array.from({ length: 3 }, () => '2026-09-05')
      ],
      unitActualPriceList: []
    }))
    expect(entries).toHaveLength(14)
    const august = entries.filter((e) => e.date.getMonth() === 7)
    const september = entries.filter((e) => e.date.getMonth() === 8)
    expect(august).toHaveLength(11)
    expect(september).toHaveLength(3)
    // 每份均摊 140/14 = 10 + 运费 14/14 = 1
    for (const entry of entries) {
      expect(entry.price).toBe(11)
    }
  })

  it('falls back to item acquiredAt for missing unit dates', () => {
    const entries = getItemSpendEntries(makeItem({
      quantity: 3,
      actualPrice: '30',
      acquiredAt: '2026-08-22',
      unitAcquiredAtList: ['2026-08-22', '2026-09-05'],
      unitActualPriceList: []
    }))
    expect(entries).toHaveLength(3)
    expect(entries.filter((e) => e.date.getMonth() === 7)).toHaveLength(2)
    expect(entries.filter((e) => e.date.getMonth() === 8)).toHaveLength(1)
  })

  it('treats empty unit prices as per-unit share instead of free', () => {
    const entries = getItemSpendEntries(makeItem({
      quantity: 4,
      actualPrice: '100',
      acquiredAt: '2026-08-01',
      unitAcquiredAtList: ['2026-08-01', '2026-08-02', '2026-08-03', '2026-08-04'],
      unitActualPriceList: ['40']
    }))
    expect(entries.map((e) => e.price)).toEqual([40, 20, 20, 20])
  })

  it('keeps explicit zero unit prices as zero', () => {
    const entries = getItemSpendEntries(makeItem({
      quantity: 2,
      actualPrice: '50',
      acquiredAt: '2026-08-01',
      unitAcquiredAtList: ['2026-08-01', '2026-08-02'],
      unitActualPriceList: ['0', '']
    }))
    expect(entries[0].price).toBe(0)
    // 总价 50、一份显式免费 → 另一份按余额承担 50,商品总花费不变
    expect(entries[1].price).toBe(50)
  })
})

describe('calcPeriodSpend', () => {
  const restockedGoods = {
    id: 'g1',
    name: '补货谷子',
    isWishlist: false,
    quantity: 14,
    price: '',
    actualPrice: '140',
    acquiredAt: '2026-08-22',
    shippingFee: '',
    collectStatus: '已拥有',
    unitAcquiredAtList: [
      ...Array.from({ length: 11 }, () => '2026-08-22'),
      ...Array.from({ length: 3 }, () => '2026-09-05')
    ],
    unitActualPriceList: [],
    unitCollectStatusList: []
  }

  it('counts restocked units in the month they were bought', () => {
    const august = calcPeriodSpend([restockedGoods], (d) => d.getFullYear() === 2026 && d.getMonth() === 7)
    const september = calcPeriodSpend([restockedGoods], (d) => d.getFullYear() === 2026 && d.getMonth() === 8)
    expect(august).toBeCloseTo(110)
    expect(september).toBeCloseTo(30)
  })
})
