import { describe, it, expect } from 'vitest'
import { normalizeStatusTimeline } from '../goodsHelpers'

describe('normalizeStatusTimeline sale fields', () => {
  it('preserves price, platform and fee', () => {
    const result = normalizeStatusTimeline([
      { status: '已出', at: '2026-07-20', price: '120', platform: '闲鱼', fee: '5' }
    ])
    expect(result).toEqual([
      { status: '已出', at: '2026-07-20', price: '120', platform: '闲鱼', fee: '5' }
    ])
  })

  it('drops invalid price and fee values', () => {
    const result = normalizeStatusTimeline([
      { status: '已出', at: '2026-07-20', price: 'abc', fee: '¥5' }
    ])
    expect(result).toEqual([{ status: '已出', at: '2026-07-20' }])
  })

  it('keeps same-day entries with different prices', () => {
    const result = normalizeStatusTimeline([
      { status: '已出', at: '2026-07-20', unitIndex: 0, price: '100' },
      { status: '已出', at: '2026-07-20', unitIndex: 0, price: '150' }
    ])
    expect(result).toHaveLength(2)
  })

  it('dedupes fully identical entries', () => {
    const result = normalizeStatusTimeline([
      { status: '已出', at: '2026-07-20', price: '100', platform: '闲鱼' },
      { status: '已出', at: '2026-07-20', price: '100', platform: '闲鱼' }
    ])
    expect(result).toHaveLength(1)
  })

  it('keeps entries without sale fields unchanged', () => {
    const result = normalizeStatusTimeline([
      { status: '已拥有', at: '2026-01-01', note: 'x' }
    ])
    expect(result).toEqual([{ status: '已拥有', at: '2026-01-01', note: 'x' }])
  })
})
