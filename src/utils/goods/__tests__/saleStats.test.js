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
    sellPrice: '',
    sellPlatform: '',
    sellFee: '',
    sellDate: '',
    unitSaleInfoList: [],
    ...overrides
  }
}

describe('getUnitCost', () => {
  it('uses actualPrice with shipping share', () => {
    const item = makeItem({ quantity: 2, actualPrice: '50', shippingFee: '10' })
    expect(getUnitCost(item)).toBe(55)
  })

  it('prefers unitActualPriceList for a specific unit', () => {
    const item = makeItem({ quantity: 2, actualPrice: '50', unitActualPriceList: ['40', '60'] })
    expect(getUnitCost(item, 1)).toBe(60)
  })

  it('prefers converted CNY price fields when present', () => {
    const item = makeItem({ actualPrice: '1000', actualPriceCNYNumber: 48 })
    expect(getUnitCost(item)).toBe(48)
  })
})

describe('extractSaleEntries (column-driven)', () => {
  it('builds sold record from sell* columns', () => {
    const item = makeItem({
      collectStatus: '已出',
      sellPrice: '150',
      sellPlatform: '闲鱼',
      sellFee: '5',
      sellDate: '2026-06-01'
    })
    const { sold } = extractSaleEntries(item)
    expect(sold).toHaveLength(1)
    expect(sold[0]).toMatchObject({ price: 150, fee: 5, platform: '闲鱼', at: '2026-06-01' })
    expect(sold[0].profit).toBe(150 - 5 - 100)
  })

  it('builds listing record when status is 在售', () => {
    const item = makeItem({ collectStatus: '在售', sellPrice: '90', sellPlatform: '千岛' })
    const { listing, sold } = extractSaleEntries(item)
    expect(sold).toHaveLength(0)
    expect(listing[0].price).toBe(90)
  })

  it('flags missing price with hasPrice=false', () => {
    const item = makeItem({ collectStatus: '已出' })
    const { sold } = extractSaleEntries(item)
    expect(sold[0].hasPrice).toBe(false)
    expect(sold[0].profit).toBeNull()
  })

  it('handles per-unit records via unitSaleInfoList', () => {
    const item = makeItem({
      quantity: 3,
      unitActualPriceList: ['30', '40', '50'],
      unitCollectStatusList: ['已出', '已拥有', '在售'],
      unitSaleInfoList: [
        { price: '80', fee: '2', date: '2026-06-01' },
        null,
        { price: '90', platform: '千岛' }
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

  it('whole-item scope counts quantity and treats sellPrice as lot total', () => {
    const item = makeItem({
      quantity: 2,
      actualPrice: '50',
      collectStatus: '已出',
      sellPrice: '130',
      sellDate: '2026-06-01'
    })
    const { sold } = extractSaleEntries(item)
    expect(sold[0].count).toBe(2)
    expect(sold[0].cost).toBe(100)
    expect(sold[0].profit).toBe(130 - 100)
  })

  it('skips wishlist items', () => {
    const item = makeItem({ isWishlist: true, collectStatus: '已出', sellPrice: '100' })
    expect(extractSaleEntries(item).sold).toHaveLength(0)
  })

  it('short unit status list falls back to owned, not the aggregate collectStatus', () => {
    const item = makeItem({
      quantity: 3,
      collectStatus: '已出',
      unitCollectStatusList: ['已出'],
      unitSaleInfoList: [{ price: '80', date: '2026-06-01' }]
    })
    const { sold } = extractSaleEntries(item)
    expect(sold).toHaveLength(1)
    expect(sold[0].unitIndex).toBe(0)
  })

  it('sold unit without unitSaleInfo shows as unpriced record', () => {
    const item = makeItem({
      quantity: 2,
      unitCollectStatusList: ['已出', '已拥有'],
      unitSaleInfoList: []
    })
    const { sold } = extractSaleEntries(item)
    expect(sold).toHaveLength(1)
    expect(sold[0].hasPrice).toBe(false)
  })
})

describe('buildSaleLedger / buildSaleSummary', () => {
  const list = [
    makeItem({ id: 'a', collectStatus: '已出', actualPrice: '100', sellPrice: '150', sellFee: '10', sellDate: '2026-06-01' }),
    makeItem({ id: 'b', collectStatus: '在售', actualPrice: '60', sellPrice: '90', sellDate: '2026-07-01' }),
    makeItem({ id: 'c', collectStatus: '已出', sellDate: '2026-07-10' }),
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

describe('zero-price sales', () => {
  it('treats price 0 as a valid deal, not missing price', () => {
    const item = makeItem({ collectStatus: '已出', actualPrice: '30', sellPrice: '0', sellFee: '5', sellDate: '2026-06-01' })
    const { sold } = extractSaleEntries(item)
    expect(sold[0].hasPrice).toBe(true)
    expect(sold[0].price).toBe(0)
    expect(sold[0].profit).toBe(0 - 5 - 30)
  })

  it('still flags empty price as unrecorded', () => {
    const item = makeItem({ collectStatus: '已出', sellPrice: '' })
    expect(extractSaleEntries(item).sold[0].hasPrice).toBe(false)
  })

  it('per-unit zero price works', () => {
    const item = makeItem({
      quantity: 2,
      unitCollectStatusList: ['已出', '已拥有'],
      unitSaleInfoList: [{ price: '0', date: '2026-06-01' }]
    })
    const { sold } = extractSaleEntries(item)
    expect(sold[0].hasPrice).toBe(true)
    expect(sold[0].price).toBe(0)
  })
})
