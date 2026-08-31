import { describe, expect, it } from 'vitest'
import { getTaggingSuggestions } from '../suggestTags'

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
