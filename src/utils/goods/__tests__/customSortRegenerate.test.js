import { describe, it, expect } from 'vitest'
import { buildCustomSortRegenerateIds, getCustomSortRegenerateBaseMode } from '../customSortRegenerate'

describe('customSortRegenerate', () => {
  it('custom/非法基准回退为添加时间', () => {
    expect(getCustomSortRegenerateBaseMode('custom')).toBe('createdAt')
    expect(getCustomSortRegenerateBaseMode('name')).toBe('name')
    expect(getCustomSortRegenerateBaseMode('acquiredAt')).toBe('acquiredAt')
    expect(getCustomSortRegenerateBaseMode('createdAt')).toBe('createdAt')
  })

  it('按选定的购入时间重新生成，忽略旧 sortOrder', () => {
    const items = [
      { id: 'old-first', isWishlist: false, sortOrder: 0, createdTime: 300, acquiredTime: 100, name: 'C' },
      { id: 'old-last', isWishlist: false, sortOrder: 9, createdTime: 100, acquiredTime: 300, name: 'A' },
      { id: 'old-mid', isWishlist: false, sortOrder: 5, createdTime: 200, acquiredTime: 200, name: 'B' }
    ]
    expect(buildCustomSortRegenerateIds(items, {
      isWishlist: false,
      baseMode: 'acquiredAt',
      sortDirection: 'desc'
    })).toEqual(['old-last', 'old-mid', 'old-first'])
  })

  it('store 原始行缺 acquiredTime/totalValueNumber 时从 acquiredAt/收藏价兜底', () => {
    // 模拟 store.list：没有 view 层字段
    const rawItems = [
      { id: 'b', isWishlist: false, sortOrder: 0, acquiredAt: '2024-01-01', name: 'B', actualPrice: '10', quantity: 1 },
      { id: 'a', isWishlist: false, sortOrder: 1, acquiredAt: '2025-06-01', name: 'A', actualPrice: '99', quantity: 1 }
    ]
    expect(buildCustomSortRegenerateIds(rawItems, {
      isWishlist: false,
      baseMode: 'acquiredAt',
      sortDirection: 'desc'
    })).toEqual(['a', 'b'])
    expect(buildCustomSortRegenerateIds(rawItems, {
      isWishlist: false,
      baseMode: 'price',
      sortDirection: 'desc'
    })).toEqual(['a', 'b'])
  })

  it('当前是自定义时仍按显式 baseMode 生成，不回退成添加时间', () => {
    const items = [
      { id: 'late-added', isWishlist: false, sortOrder: 0, createdTime: 300, acquiredTime: 100, totalValueNumber: 10 },
      { id: 'early-added', isWishlist: false, sortOrder: 1, createdTime: 100, acquiredTime: 300, totalValueNumber: 50 }
    ]
    expect(buildCustomSortRegenerateIds(items, {
      isWishlist: false,
      baseMode: 'acquiredAt',
      sortDirection: 'desc'
    })).toEqual(['early-added', 'late-added'])
    expect(buildCustomSortRegenerateIds(items, {
      isWishlist: false,
      baseMode: 'createdAt',
      sortDirection: 'desc'
    })).toEqual(['late-added', 'early-added'])
    expect(buildCustomSortRegenerateIds(items, {
      isWishlist: false,
      baseMode: 'price',
      sortDirection: 'desc'
    })).toEqual(['early-added', 'late-added'])
  })

  it('按选定名称序生成，且只处理对应心愿池', () => {
    const items = [
      { id: 'c1', isWishlist: false, sortOrder: 0, name: 'B', createdTime: 1, totalValueNumber: 1 },
      { id: 'c2', isWishlist: false, sortOrder: 2, name: 'A', createdTime: 2, totalValueNumber: 2 },
      { id: 'w1', isWishlist: true, sortOrder: 0, name: 'Z', createdTime: 3, totalValueNumber: 3 }
    ]
    expect(buildCustomSortRegenerateIds(items, {
      isWishlist: false,
      baseMode: 'name',
      sortDirection: 'asc'
    })).toEqual(['c2', 'c1'])
  })
})
