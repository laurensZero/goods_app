import { describe, expect, it } from 'vitest'
import { getTaggingSuggestions } from '../suggestTags'
import staticDictionaries from '@/constants/tagging-dictionaries.json'

describe('getTaggingSuggestions dynamic category matching', () => {
  it('matches a learned { keyword, value } object to the category value', () => {
    const result = getTaggingSuggestions(
      { name: '某某 胶片卡 收藏' },
      {},
      { categories: [{ keyword: '胶片卡', value: '卡片' }] }
    )
    expect(result.categorySuggestion.value).toBe('卡片')
  })

  it('produces no category suggestion when no keyword matches', () => {
    const result = getTaggingSuggestions(
      { name: '完全无关的商品' },
      {},
      { categories: [{ keyword: '胶片卡', value: '卡片' }] }
    )
    expect(result.categorySuggestion).toBeNull()
  })

  it('keeps plain string category names backward-compatible', () => {
    const result = getTaggingSuggestions(
      { name: '卡片 套装' },
      {},
      { categories: ['卡片'] }
    )
    expect(result.categorySuggestion.value).toBe('卡片')
  })

  it('consolidates a learned pair and a preset string mapping to the same category', () => {
    const result = getTaggingSuggestions(
      { name: '卡片 胶片卡 套装' },
      {},
      {
        categories: ['卡片', { keyword: '胶片卡', value: '卡片' }],
      }
    )
    expect(result.categorySuggestion.value).toBe('卡片')
    expect(result.categorySuggestion.reasons.some((r) => r.includes('胶片卡'))).toBe(true)
    expect(result.categorySuggestion.reasons.some((r) => r.includes('卡片'))).toBe(true)
  })

  it('merges the learned category with the static rule instead of suggesting a lowercase duplicate', () => {
    const result = getTaggingSuggestions(
      { name: '某乐队 现场专辑CD' },
      {
        categoryRules: [{ key: '(CD|专辑|唱片|OST)', value: 'CD/专辑', weight: 1.0 }],
      },
      { categories: [{ keyword: '现场专辑', value: 'CD/专辑' }] }
    )
    expect(result.categorySuggestion.value).toBe('CD/专辑')
    expect(result.categorySuggestion.reasons.some((r) => r.includes('现场专辑'))).toBe(true)
  })
})

describe('getTaggingSuggestions decisive product-type keywords', () => {
  // 复现：华风茶语联动餐厅系列把活动名片段学成徽章，叠分顶掉明信片
  const learnedCollabNoise = {
    categories: [
      { keyword: '华风茶语', value: '徽章' },
      { keyword: '联动餐厅', value: '徽章' },
      { keyword: '茶语联动', value: '徽章' },
      { keyword: '联动', value: '徽章' },
      { keyword: '餐厅', value: '徽章' },
    ],
  }

  it('explicit 明信片 beats stacked learned collab keywords', () => {
    const result = getTaggingSuggestions(
      { name: '华风茶语联动餐厅 Hanser明信片' },
      staticDictionaries,
      learnedCollabNoise
    )
    expect(result.categorySuggestion.value).toBe('明信片')
    expect(result.categorySuggestion.confidence).toBe('high')
  })

  it('explicit 立牌 / 镭射票 also win over learned noise', () => {
    const stand = getTaggingSuggestions(
      { name: '华风茶语联动餐厅 Hanser流沙立牌' },
      staticDictionaries,
      learnedCollabNoise
    )
    expect(stand.categorySuggestion.value).toBe('立牌')

    const ticket = getTaggingSuggestions(
      { name: '华风茶语联动餐厅 Hanser镭射票' },
      staticDictionaries,
      learnedCollabNoise
    )
    expect(ticket.categorySuggestion.value).toBe('镭射票')
    expect(ticket.categorySuggestion.confidence).toBe('high')
  })

  it('still uses learned keywords when no decisive product-type word appears', () => {
    const result = getTaggingSuggestions(
      { name: '华风茶语联动餐厅 Hanser杯垫' },
      staticDictionaries,
      learnedCollabNoise
    )
    expect(result.categorySuggestion.value).toBe('徽章')
  })

  it('prefers decisive static over non-decisive fuzzy match (亚克力)', () => {
    const result = getTaggingSuggestions(
      { name: '亚克力 明信片' },
      staticDictionaries,
      {}
    )
    expect(result.categorySuggestion.value).toBe('明信片')
  })

  it('between two decisive words, higher score wins', () => {
    // 明信片 weight 1.0 vs 挂件 weight 0.8
    const result = getTaggingSuggestions(
      { name: '挂件 明信片 套装' },
      staticDictionaries,
      {}
    )
    expect(result.categorySuggestion.value).toBe('明信片')
  })
})
