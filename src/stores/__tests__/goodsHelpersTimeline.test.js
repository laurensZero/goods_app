import { describe, it, expect } from 'vitest'
import { normalizeStatusTimeline, normalizeGoodsInput } from '../goodsHelpers'

describe('normalizeStatusTimeline (pure status history)', () => {
  it('strips legacy sale fields from entries', () => {
    const result = normalizeStatusTimeline([
      { status: '已出', at: '2026-06-01', price: '120', platform: '闲鱼', fee: '5', note: 'x' }
    ])
    expect(result).toEqual([{ status: '已出', at: '2026-06-01', note: 'x' }])
  })

  it('dedupes by status + at + unitIndex + note', () => {
    const result = normalizeStatusTimeline([
      { status: '已出', at: '2026-06-01', unitIndex: 0 },
      { status: '已出', at: '2026-06-01', unitIndex: 0 },
      { status: '已出', at: '2026-06-01', unitIndex: 1 }
    ])
    expect(result).toHaveLength(2)
  })
})

describe('normalizeGoodsInput sell* columns', () => {
  const base = {
    id: 'g1',
    name: '吧唧',
    isWishlist: false,
    quantity: 1,
    collectStatus: '已出'
  }

  it('normalizes sell fields', () => {
    const item = normalizeGoodsInput({
      ...base,
      sellPrice: '120.5',
      sellPlatform: ' 闲鱼 ',
      sellFee: '5',
      sellDate: '2026-06-01'
    }, 'g1')
    expect(item.sellPrice).toBe('120.5')
    expect(item.sellPlatform).toBe('闲鱼')
    expect(item.sellFee).toBe('5')
    expect(item.sellDate).toBe('2026-06-01')
  })

  it('drops invalid money and date values', () => {
    const item = normalizeGoodsInput({ ...base, sellPrice: 'abc', sellFee: '-3', sellDate: '2026-06' }, 'g1')
    expect(item.sellPrice).toBe('')
    expect(item.sellFee).toBe('')
    expect(item.sellDate).toBe('')
  })

  it('clears sale info for wishlist items', () => {
    const item = normalizeGoodsInput({ ...base, isWishlist: true, sellPrice: '99', unitSaleInfoList: [{ price: '1' }] }, 'g1')
    expect(item.sellPrice).toBe('')
    expect(item.unitSaleInfoList).toEqual([])
  })

  it('normalizes unitSaleInfoList with key whitelist and trailing-null trim', () => {
    const item = normalizeGoodsInput({
      ...base,
      quantity: 3,
      unitSaleInfoList: [
        { price: '80', platform: '闲鱼', fee: '2', date: '2026-06-01', extra: 'x' },
        {},
        null
      ]
    }, 'g1')
    expect(item.unitSaleInfoList).toEqual([
      { price: '80', platform: '闲鱼', fee: '2', date: '2026-06-01' }
    ])
  })

  it('returns empty unitSaleInfoList for quantity < 2', () => {
    const item = normalizeGoodsInput({ ...base, quantity: 1, unitSaleInfoList: [{ price: '80' }] }, 'g1')
    expect(item.unitSaleInfoList).toEqual([])
  })
})
