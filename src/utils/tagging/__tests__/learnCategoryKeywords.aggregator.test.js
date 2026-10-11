import { describe, expect, it } from 'vitest'
import { createCategoryKeywordAggregator, learnCategoryKeywords } from '../learnCategoryKeywords'

describe('createCategoryKeywordAggregator (incremental)', () => {
  const goodsKeyOf = (item) => item.id
  const options = {
    categories: ['卡片'],
    characters: [{ name: '芙宁娜', ip: '原神' }],
  }

  it('rebuild + finalize matches learnCategoryKeywords', () => {
    const list = [
      { id: 1, name: '胶片卡', category: '卡片' },
      { id: 2, name: '胶片卡 随机', category: '卡片' },
      { id: 3, name: '芙宁娜 徽章', category: '徽章' },
      { id: 4, name: '芙宁娜 徽章2', category: '徽章' },
    ]
    const agg = createCategoryKeywordAggregator(options)
    agg.rebuild(list, goodsKeyOf)
    expect(agg.finalize()).toEqual(learnCategoryKeywords(list, options))
    expect(agg.finalize()).toContainEqual({ keyword: '胶片卡', value: '卡片' })
    expect(agg.finalize().some((r) => r.keyword.includes('芙宁娜'))).toBe(false)
  })

  it('syncList after adds/removes/category edits matches a full learn', () => {
    const list1 = [
      { id: 1, name: '胶片卡', category: '卡片' },
      { id: 2, name: '胶片卡 随机', category: '卡片' },
      { id: 3, name: '芙宁娜 徽章', category: '徽章' },
    ]
    const agg = createCategoryKeywordAggregator(options)
    agg.rebuild(list1, goodsKeyOf)

    // 增量新增：新学关键词「烫金卡」
    const list2 = [
      ...list1,
      { id: 4, name: '烫金卡', category: '卡片' },
      { id: 5, name: '烫金卡 限定', category: '卡片' },
    ]
    agg.syncList(list2, goodsKeyOf)
    expect(agg.finalize()).toEqual(learnCategoryKeywords(list2, options))
    expect(agg.finalize()).toContainEqual({ keyword: '烫金卡', value: '卡片' })

    // 增量删除 + 改分类：「胶片卡」只剩 1 件不再学；「烫金卡」出现分类平局也不学
    const list3 = [
      { id: 2, name: '胶片卡 随机', category: '卡片' },
      { id: 4, name: '烫金卡', category: '卡片' },
      { id: 5, name: '烫金卡 限定', category: '徽章' },
    ]
    agg.syncList(list3, goodsKeyOf)
    expect(agg.finalize()).toEqual(learnCategoryKeywords(list3, options))
    expect(agg.finalize()).toEqual([])
  })

  it('does not recompute unchanged items (fingerprint skip keeps identical output)', () => {
    const list = [
      { id: 1, name: '胶片卡', category: '卡片' },
      { id: 2, name: '胶片卡 随机', category: '卡片' },
    ]
    const agg = createCategoryKeywordAggregator(options)
    agg.rebuild(list, goodsKeyOf)
    const first = agg.finalize()

    // 同 id 同内容、新对象引用（模拟同步重拉）→ 增量应跳过且结果不变
    const repulled = [
      { id: 1, name: '胶片卡', category: '卡片' },
      { id: 2, name: '胶片卡 随机', category: '卡片' },
    ]
    agg.syncList(repulled, goodsKeyOf)
    expect(agg.finalize()).toEqual(first)
  })
})
