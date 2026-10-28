import { describe, expect, it } from 'vitest'
import {
  buildNeighborCategorySuggestion,
  createCategoryNeighborIndex,
  normalizeNeighborName,
} from '../categoryNeighbors'

const GOODS = [
  { id: 'a', name: '花绪之约系列亚克力票根', category: '装饰品' },
  { id: 'b', name: '花绪之约系列亚克力立牌', category: '立牌' },
  { id: 'c', name: '花绪之约系列亚克力挂件', category: '挂件' },
  { id: 'd', name: '角色印象系列丝巾', category: '服饰' },
  { id: 'e', name: '角色印象系列毛绒玩偶', category: '毛绒' },
  { id: 'f', name: '未分类商品', category: '' },
  { id: 'g', name: '其他分类商品', category: '其他' },
]

describe('categoryNeighbors', () => {
  it('normalizes brackets and punctuation', () => {
    expect(normalizeNeighborName('【预售】花绪之约·亚克力票根')).toBe('花绪之约亚克力票根')
  })

  it('returns the category of a similar labeled item (one example is enough)', () => {
    const index = createCategoryNeighborIndex(GOODS)
    const result = index.query('花绪之约系列亚克力票根 第二弹')
    expect(result?.category).toBe('装饰品')
  })

  it('distinguishes items that only differ by type suffix', () => {
    const index = createCategoryNeighborIndex(GOODS)
    expect(index.query('花绪之约系列亚克力立牌 第二弹')?.category).toBe('立牌')
    expect(index.query('花绪之约系列亚克力挂件')?.category).toBe('挂件')
  })

  it('matches across different series when the type suffix is the same', () => {
    const index = createCategoryNeighborIndex(GOODS)
    expect(index.query('星辉之约系列亚克力票根')?.category).toBe('装饰品')
  })

  it('ignores batch suffixes such as 异色版 / 预售', () => {
    const index = createCategoryNeighborIndex(GOODS)
    expect(index.query('花绪之约系列亚克力票根 异色版 预售')?.category).toBe('装饰品')
  })

  it('returns null when nothing is similar enough', () => {
    const index = createCategoryNeighborIndex(GOODS)
    expect(index.query('完全无关的商品名称')).toBeNull()
  })

  it('ignores items with empty or catch-all category', () => {
    const index = createCategoryNeighborIndex(GOODS)
    expect(index.query('未分类商品')).toBeNull()
    expect(index.query('其他分类商品')).toBeNull()
  })

  it('can exclude the item being edited', () => {
    const index = createCategoryNeighborIndex([
      { id: 'only', name: '花绪之约系列亚克力票根', category: '装饰品' },
    ])
    expect(index.query('花绪之约系列亚克力票根', { excludeKeys: ['id:only'] })).toBeNull()
  })

  it('abstains when two equally similar items disagree', () => {
    const index = createCategoryNeighborIndex([
      { id: 'x', name: '花绪之约系列亚克力票根', category: '装饰品' },
      { id: 'y', name: '花绪之约系列亚克力票根', category: '立牌' },
    ])
    expect(index.query('花绪之约系列亚克力票根')).toBeNull()
  })

  it('reports the neighbors used for the decision', () => {
    const index = createCategoryNeighborIndex(GOODS)
    const result = index.query('花绪之约系列亚克力票根 第二弹')
    expect(result.neighbors[0]).toMatchObject({ category: '装饰品' })
    expect(result.neighbors.length).toBeGreaterThan(0)
  })

  it('builds a suggestion object compatible with the tagging panel', () => {
    const index = createCategoryNeighborIndex(GOODS)
    expect(buildNeighborCategorySuggestion(index, '花绪之约系列亚克力票根 第二弹')).toMatchObject({
      value: '装饰品',
      decisive: false,
      source: 'neighbor',
    })
    expect(buildNeighborCategorySuggestion(index, '完全无关的商品名称')).toBeNull()
  })
})
