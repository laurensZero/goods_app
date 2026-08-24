import { describe, it, expect } from 'vitest'
import { getItemSpendEntries } from '../statistics'

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
})
