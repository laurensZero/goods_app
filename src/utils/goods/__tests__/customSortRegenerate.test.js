import { describe, it, expect } from 'vitest'
import { buildCustomSortRegenerateIds, getCustomSortRegenerateBaseMode } from '../customSortRegenerate'

describe('customSortRegenerate', () => {
  it('custom/非法基准回退为添加时间', () => {
    expect(getCustomSortRegenerateBaseMode('custom')).toBe('createdAt')
    expect(getCustomSortRegenerateBaseMode('name')).toBe('name')
    expect(getCustomSortRegenerateBaseMode('acquiredAt')).toBe('acquiredAt')
  })

  it('按购入时间重新生成，忽略旧 manualOrders', () => {
    const items = [
      { id: 'old-first', isWishlist: false, manualOrders: { custom: 0, acquiredAt: 9 }, createdTime: 300, acquiredTime: 100 },
      { id: 'old-last', isWishlist: false, manualOrders: { custom: 9 }, createdTime: 100, acquiredTime: 300 },
      { id: 'old-mid', isWishlist: false, manualOrders: { custom: 5 }, createdTime: 200, acquiredTime: 200 }
    ]
    expect(buildCustomSortRegenerateIds(items, {
      isWishlist: false,
      baseMode: 'acquiredAt',
      sortDirection: 'desc'
    })).toEqual(['old-last', 'old-mid', 'old-first'])
  })

  it('原始行缺 view 字段时从 acquiredAt/收藏价兜底', () => {
    const rawItems = [
      { id: 'b', isWishlist: false, acquiredAt: '2024-01-01', name: 'B', actualPrice: '10', quantity: 1 },
      { id: 'a', isWishlist: false, acquiredAt: '2025-06-01', name: 'A', actualPrice: '99', quantity: 1 }
    ]
    expect(buildCustomSortRegenerateIds(rawItems, {
      isWishlist: false,
      baseMode: 'acquiredAt',
      sortDirection: 'desc'
    })).toEqual(['a', 'b'])
  })

  it('名称序与心愿池过滤', () => {
    const items = [
      { id: 'c1', isWishlist: false, name: 'B', totalValueNumber: 1 },
      { id: 'c2', isWishlist: false, name: 'A', totalValueNumber: 2 },
      { id: 'w1', isWishlist: true, name: 'Z', totalValueNumber: 3 }
    ]
    expect(buildCustomSortRegenerateIds(items, {
      isWishlist: false,
      baseMode: 'name',
      sortDirection: 'asc'
    })).toEqual(['c2', 'c1'])
  })
})
