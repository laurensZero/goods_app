import { describe, it, expect } from 'vitest'
import {
  getUnitCost,
  extractSaleEntries,
  buildSaleLedger,
  buildSaleSummary
} from '../saleStats'

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

describe('getUnitCost', () => {
  it('uses actualPrice with shipping share', () => {
    const item = makeItem({ quantity: 2, actualPrice: '50', shippingFee: '10' })
    expect(getUnitCost(item)).toBe(55)
  })

  it('prefers unitActualPriceList for a specific unit', () => {
    const item = makeItem({ quantity: 2, actualPrice: '50', unitActualPriceList: ['40', '60'], shippingFee: '' })
    expect(getUnitCost(item, 1)).toBe(60)
  })

  it('prefers converted CNY price fields when present', () => {
    const item = makeItem({ actualPrice: '1000', actualPriceCNYNumber: 48 })
    expect(getUnitCost(item)).toBe(48)
  })

  it('falls back to official price when actual missing', () => {
    const item = makeItem({ actualPrice: '', price: '80' })
    expect(getUnitCost(item)).toBe(80)
  })
})

describe('extractSaleEntries', () => {
  it('returns sold record with price from latest sold entry', () => {
    const item = makeItem({
      collectStatus: '已出',
      statusTimeline: [
        { status: '已拥有', at: '2026-01-01' },
        { status: '已出', at: '2026-06-01', price: '150', platform: '闲鱼', fee: '5' }
      ]
    })
    const { sold } = extractSaleEntries(item)
    expect(sold).toHaveLength(1)
    expect(sold[0].price).toBe(150)
    expect(sold[0].fee).toBe(5)
    expect(sold[0].platform).toBe('闲鱼')
    expect(sold[0].profit).toBe(150 - 5 - 100)
  })

  it('flags missing price with hasPrice=false', () => {
    const item = makeItem({
      collectStatus: '已出',
      statusTimeline: [{ status: '已出', at: '2026-06-01' }]
    })
    const { sold } = extractSaleEntries(item)
    expect(sold[0].hasPrice).toBe(false)
    expect(sold[0].profit).toBeNull()
  })

  it('ignores stale listing entries after status was reverted', () => {
    const item = makeItem({
      collectStatus: '已拥有',
      statusTimeline: [{ status: '在售', at: '2026-05-01', price: '200' }]
    })
    const { listing, sold } = extractSaleEntries(item)
    expect(listing).toHaveLength(0)
    expect(sold).toHaveLength(0)
  })

  it('handles per-unit sold and listing records', () => {
    const item = makeItem({
      quantity: 3,
      unitActualPriceList: ['30', '40', '50'],
      unitCollectStatusList: ['已出', '已拥有', '在售'],
      statusTimeline: [
        { status: '已出', at: '2026-06-01', unitIndex: 0, price: '80', fee: '2' },
        { status: '在售', at: '2026-06-10', unitIndex: 2, price: '90', platform: '千岛' }
      ]
    })
    const { sold, listing } = extractSaleEntries(item)
    expect(sold).toHaveLength(1)
    expect(sold[0].unitIndex).toBe(0)
    expect(sold[0].profit).toBe(80 - 2 - 30)
    expect(listing).toHaveLength(1)
    expect(listing[0].unitIndex).toBe(2)
    expect(listing[0].price).toBe(90)
  })

  it('whole-item scope counts quantity and treats price as lot total', () => {
    const item = makeItem({
      quantity: 2,
      actualPrice: '50',
      collectStatus: '已出',
      statusTimeline: [{ status: '已出', at: '2026-06-01', price: '130' }]
    })
    const { sold } = extractSaleEntries(item)
    expect(sold[0].count).toBe(2)
    expect(sold[0].cost).toBe(100)
    expect(sold[0].profit).toBe(130 - 100)
  })

  it('skips wishlist items', () => {
    const item = makeItem({ isWishlist: true, collectStatus: '已出' })
    expect(extractSaleEntries(item).sold).toHaveLength(0)
  })

  it('uses latest sold entry when multiple exist', () => {
    const item = makeItem({
      collectStatus: '已出',
      statusTimeline: [
        { status: '已出', at: '2026-05-01', price: '100' },
        { status: '已出', at: '2026-06-01', price: '120' }
      ]
    })
    expect(extractSaleEntries(item).sold[0].price).toBe(120)
  })
})

describe('buildSaleLedger / buildSaleSummary', () => {
  const list = [
    makeItem({
      id: 'a',
      collectStatus: '已出',
      actualPrice: '100',
      statusTimeline: [{ status: '已出', at: '2026-06-01', price: '150', fee: '10' }]
    }),
    makeItem({
      id: 'b',
      collectStatus: '在售',
      actualPrice: '60',
      statusTimeline: [{ status: '在售', at: '2026-07-01', price: '90' }]
    }),
    makeItem({
      id: 'c',
      collectStatus: '已出',
      statusTimeline: [{ status: '已出', at: '2026-07-10' }]
    }),
    makeItem({ id: 'd', collectStatus: '已拥有' })
  ]

  it('builds sorted ledger rows', () => {
    const { soldRows, listingRows } = buildSaleLedger(list)
    expect(soldRows.map((r) => r.item.id)).toEqual(['c', 'a'])
    expect(listingRows.map((r) => r.item.id)).toEqual(['b'])
  })

  it('summarizes recovered, listing and profit totals', () => {
    const summary = buildSaleSummary(list)
    expect(summary.recoveredTotal).toBe(140)
    expect(summary.listingTotal).toBe(90)
    expect(summary.profitTotal).toBe(40)
    expect(summary.soldCount).toBe(2)
    expect(summary.listingCount).toBe(1)
    expect(summary.hasAny).toBe(true)
  })

  it('reports hasAny=false for list without sale records', () => {
    expect(buildSaleSummary([makeItem()]).hasAny).toBe(false)
  })
})
