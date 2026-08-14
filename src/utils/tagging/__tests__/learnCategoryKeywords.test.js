import { describe, expect, it } from 'vitest'
import { learnCategoryKeywords } from '../learnCategoryKeywords'

describe('learnCategoryKeywords', () => {
  it('learns a keyword shared by >= 2 items with the same category', () => {
    const result = learnCategoryKeywords([
      { name: '胶片卡', category: '卡片' },
      { name: '胶片卡 随机', category: '卡片' },
    ])
    expect(result).toContainEqual({ keyword: '胶片卡', value: '卡片' })
  })

  it('does not learn a keyword appearing in only one item', () => {
    const result = learnCategoryKeywords([{ name: '胶片卡', category: '卡片' }])
    expect(result).toEqual([])
  })

  it('recommends the majority category when a keyword maps to several', () => {
    const result = learnCategoryKeywords([
      { name: '胶片卡', category: '满赠' },
      { name: '胶片卡', category: '满赠' },
      { name: '胶片卡', category: '满赠' },
      { name: '胶片卡', category: '满赠' },
      { name: '胶片卡', category: '卡片' },
      { name: '胶片卡', category: '卡片' },
    ])
    expect(result).toContainEqual({ keyword: '胶片卡', value: '满赠' })
  })

  it('skips a keyword when categories are tied', () => {
    const result = learnCategoryKeywords([
      { name: '胶片卡', category: '卡片' },
      { name: '胶片卡', category: '徽章' },
    ])
    expect(result).toEqual([])
  })

  it('ignores items with empty or catch-all category', () => {
    const result = learnCategoryKeywords([
      { name: '胶片卡', category: '' },
      { name: '胶片卡', category: '其他' },
    ])
    expect(result).toEqual([])
  })

  it('excludes character name fragments', () => {
    const result = learnCategoryKeywords(
      [
        { name: '芙宁娜 徽章', category: '徽章' },
        { name: '芙宁娜 徽章2', category: '徽章' },
      ],
      { characters: [{ name: '芙宁娜', ip: '原神' }] }
    )
    expect(result.some((r) => r.keyword.includes('芙宁娜'))).toBe(false)
    expect(result).toContainEqual({ keyword: '徽章', value: '徽章' })
  })

  it('excludes grams equal to a preset category name', () => {
    const result = learnCategoryKeywords(
      [
        { name: '卡片', category: '卡片' },
        { name: '卡片', category: '卡片' },
      ],
      { categories: ['卡片'] }
    )
    expect(result).toEqual([])
  })

  it('skips names without any Chinese character', () => {
    const result = learnCategoryKeywords([
      { name: 'SKU-12345', category: '卡片' },
      { name: 'A3 poster', category: '卡片' },
    ])
    expect(result).toEqual([])
  })

  it('respects window bounds', () => {
    const result = learnCategoryKeywords(
      [
        { name: '胶片卡', category: '卡片' },
        { name: '胶片卡', category: '卡片' },
      ],
      { windowMin: 3, windowMax: 3 }
    )
    expect(result).toEqual([{ keyword: '胶片卡', value: '卡片' }])
  })

  it('learns the majority category for a 4:3 split (e.g. 卡片 4 vs 满赠 3)', () => {
    const result = learnCategoryKeywords(
      [
        { name: '满赠 胶片卡', category: '满赠' },
        { name: '满赠 胶片卡', category: '满赠' },
        { name: '满赠 胶片卡', category: '满赠' },
        { name: '芙宁娜 胶片卡', category: '卡片' },
        { name: '芙宁娜 胶片卡', category: '卡片' },
        { name: '芙宁娜 胶片卡', category: '卡片' },
        { name: '芙宁娜 胶片卡', category: '卡片' },
        { name: '散装 胶片卡', category: '' },
      ],
      { characters: [{ name: '芙宁娜', ip: '原神' }] }
    )
    expect(result).toContainEqual({ keyword: '胶片卡', value: '卡片' })
  })

  it('stops learning a gram once it was saved as a known character', () => {
    // 若「胶片卡」曾被误存成角色，它进入角色预设，学习会把它当角色名排除（自毁循环）
    const result = learnCategoryKeywords(
      [
        { name: '满赠 胶片卡', category: '满赠' },
        { name: '满赠 胶片卡', category: '满赠' },
        { name: '满赠 胶片卡', category: '满赠' },
        { name: '芙宁娜 胶片卡', category: '卡片' },
        { name: '芙宁娜 胶片卡', category: '卡片' },
        { name: '芙宁娜 胶片卡', category: '卡片' },
        { name: '芙宁娜 胶片卡', category: '卡片' },
        { name: '散装 胶片卡', category: '' },
      ],
      {
        categories: ['卡片', '满赠'],
        characters: [{ name: '胶片卡' }, { name: '芙宁娜' }],
      }
    )
    expect(result.some((r) => r.keyword.includes('胶片卡'))).toBe(false)
  })

  it('returns deterministic, length-descending order', () => {
    const list = [
      { name: '随机胶片卡', category: '卡片' },
      { name: '随机胶片卡', category: '卡片' },
    ]
    const result = learnCategoryKeywords(list)
    const lengths = result.map((r) => Array.from(r.keyword).length)
    for (let i = 1; i < lengths.length; i += 1) {
      expect(lengths[i - 1]).toBeGreaterThanOrEqual(lengths[i])
    }
    expect(learnCategoryKeywords(list)).toEqual(result)
  })

  it('combines collected and wishlist items by default', () => {
    const list = [
      { name: '胶片卡', category: '卡片', isWishlist: true },
      { name: '胶片卡', category: '卡片' },
    ]
    expect(learnCategoryKeywords(list)).toContainEqual({ keyword: '胶片卡', value: '卡片' })
    expect(learnCategoryKeywords(list, { includeWishlist: false })).toEqual([])
  })
})
