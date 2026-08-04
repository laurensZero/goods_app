import { describe, it, expect } from 'vitest'
import {
  normalizeHomeSortMode,
  getHomeSortOption,
  sortHomeGoodsList
} from '../homeSort'

describe('normalizeHomeSortMode', () => {
  it('returns createdAt for null', () => {
    expect(normalizeHomeSortMode(null)).toBe('createdAt')
  })

  it('returns createdAt for undefined', () => {
    expect(normalizeHomeSortMode(undefined)).toBe('createdAt')
  })

  it('returns createdAt for invalid value', () => {
    expect(normalizeHomeSortMode('invalid')).toBe('createdAt')
  })

  it('returns valid mode as-is', () => {
    expect(normalizeHomeSortMode('createdAt')).toBe('createdAt')
    expect(normalizeHomeSortMode('acquiredAt')).toBe('acquiredAt')
    expect(normalizeHomeSortMode('name')).toBe('name')
    expect(normalizeHomeSortMode('price')).toBe('price')
  })
})

describe('getHomeSortOption', () => {
  it('returns option for valid mode', () => {
    const opt = getHomeSortOption('name')
    expect(opt.value).toBe('name')
    expect(opt.label).toBeTruthy()
  })

  it('returns default option for invalid mode', () => {
    const opt = getHomeSortOption('invalid')
    expect(opt.value).toBe('createdAt')
  })

  it('returns first option for null', () => {
    const opt = getHomeSortOption(null)
    expect(opt.value).toBe('createdAt')
  })
})

describe('sortHomeGoodsList', () => {
  const items = [
    { id: '1', name: 'B商品', createdTime: 100, acquiredTime: 200, totalValueNumber: 50 },
    { id: '2', name: 'A商品', createdTime: 200, acquiredTime: 100, totalValueNumber: 100 },
    { id: '3', name: 'C商品', createdTime: 150, acquiredTime: 300, totalValueNumber: 30 },
  ]

  it('sorts by createdAt desc (default)', () => {
    const sorted = sortHomeGoodsList(items, 'createdAt', 'desc')
    expect(sorted.map(i => i.id)).toEqual(['2', '3', '1'])
  })

  it('sorts by createdAt asc', () => {
    const sorted = sortHomeGoodsList(items, 'createdAt', 'asc')
    expect(sorted.map(i => i.id)).toEqual(['1', '3', '2'])
  })

  it('sorts by acquiredAt desc', () => {
    const sorted = sortHomeGoodsList(items, 'acquiredAt', 'desc')
    expect(sorted.map(i => i.id)).toEqual(['3', '1', '2'])
  })

  it('sorts by acquiredAt asc', () => {
    const sorted = sortHomeGoodsList(items, 'acquiredAt', 'asc')
    expect(sorted.map(i => i.id)).toEqual(['2', '1', '3'])
  })

  it('sorts by name asc (A-Z)', () => {
    const sorted = sortHomeGoodsList(items, 'name', 'asc')
    expect(sorted.map(i => i.name)).toEqual(['A商品', 'B商品', 'C商品'])
  })

  it('sorts by name desc (Z-A)', () => {
    const sorted = sortHomeGoodsList(items, 'name', 'desc')
    expect(sorted.map(i => i.name)).toEqual(['C商品', 'B商品', 'A商品'])
  })

  it('sorts by price desc', () => {
    const sorted = sortHomeGoodsList(items, 'price', 'desc')
    expect(sorted.map(i => i.id)).toEqual(['2', '1', '3'])
  })

  it('sorts by price asc', () => {
    const sorted = sortHomeGoodsList(items, 'price', 'asc')
    expect(sorted.map(i => i.id)).toEqual(['3', '1', '2'])
  })

  it('does not mutate the original array', () => {
    const original = [...items]
    sortHomeGoodsList(items, 'name', 'asc')
    expect(items).toEqual(original)
  })

  it('handles empty list', () => {
    expect(sortHomeGoodsList([], 'createdAt', 'desc')).toEqual([])
  })

  it('handles single item', () => {
    const sorted = sortHomeGoodsList([items[0]], 'name', 'asc')
    expect(sorted).toHaveLength(1)
  })

  it('falls back to createdAt for invalid sort mode', () => {
    const sorted = sortHomeGoodsList(items, 'invalid', 'desc')
    expect(sorted.map(i => i.id)).toEqual(['2', '3', '1'])
  })
})
