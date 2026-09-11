import { describe, it, expect, vi } from 'vitest'

vi.mock('@/utils/pinyin', () => ({
  toPinyinSearchText: (text) => `pinyin:${String(text).toLowerCase()}`
}))

import {
  buildSearchText,
  filterGoodsList,
  normalizeGoodsFilterConditions,
  createDefaultGoodsFilters
} from '../filters'

const item = {
  id: 'g1',
  name: '茜特菈莉',
  category: '手办',
  ip: '',
  variant: '',
  note: 'SecretBox',
  storageLocation: '',
  characters: [],
  tags: [],
  priceNumber: 100,
  acquiredTime: Date.now(),
  collectStatus: '已拥有'
}

describe('buildSearchText includePinyin', () => {
  it('默认包含拼音文本', () => {
    const text = buildSearchText(item)
    expect(text).toContain('茜特菈莉')
    expect(text).toContain('pinyin:茜特菈莉')
  })

  it('includePinyin:false 时只保留原文', () => {
    const text = buildSearchText(item, { includePinyin: false })
    expect(text).toContain('茜特菈莉')
    expect(text).not.toContain('pinyin:')
  })

  it('includeNote:false 时排除备注', () => {
    const text = buildSearchText(item, { includePinyin: false, includeNote: false })
    expect(text).not.toContain('SecretBox')
    expect(text).toContain('茜特菈莉')
  })

  it('matchCase:true 时保留原文大小写', () => {
    const text = buildSearchText(item, { includePinyin: false, matchCase: true })
    expect(text).toContain('SecretBox')
    expect(text).not.toContain('secretbox')
  })
})

describe('filterGoodsList match options', () => {
  const list = [{
    ...item,
    searchText: buildSearchText(item),
    searchPlainText: buildSearchText(item, { includePinyin: false })
  }]

  it('默认开启拼音匹配，可用拼音关键词命中', () => {
    const result = filterGoodsList(list, { keyword: 'pinyin:茜特菈莉' })
    expect(result).toHaveLength(1)
  })

  it('关闭拼音后拼音关键词不命中，原文仍可命中', () => {
    const byPinyin = filterGoodsList(list, {
      keyword: 'pinyin:茜特菈莉',
      matchPinyin: false
    })
    expect(byPinyin).toHaveLength(0)

    const byPlain = filterGoodsList(list, {
      keyword: '茜特菈莉',
      matchPinyin: false
    })
    expect(byPlain).toHaveLength(1)
  })

  it('默认不区分大小写', () => {
    expect(filterGoodsList(list, { keyword: 'secret' })).toHaveLength(1)
    expect(filterGoodsList(list, { keyword: 'SECRET' })).toHaveLength(1)
  })

  it('区分大小写后仅精确大小写命中', () => {
    expect(filterGoodsList(list, { keyword: 'SecretBox', matchCase: true })).toHaveLength(1)
    expect(filterGoodsList(list, { keyword: 'secretbox', matchCase: true })).toHaveLength(0)
    expect(filterGoodsList(list, { keyword: 'SECRETBOX', matchCase: true })).toHaveLength(0)
  })

  it('关闭搜索备注后备注关键词不命中，名称仍可命中', () => {
    expect(filterGoodsList(list, { keyword: 'SecretBox', includeNote: false })).toHaveLength(0)
    expect(filterGoodsList(list, { keyword: '茜特菈莉', includeNote: false })).toHaveLength(1)
  })
})

describe('normalizeGoodsFilterConditions match options', () => {
  it('matchPinyin / includeNote 缺省 true，matchCase 缺省 false', () => {
    const defaults = createDefaultGoodsFilters()
    expect(defaults.matchPinyin).toBe(true)
    expect(defaults.matchCase).toBe(false)
    expect(defaults.includeNote).toBe(true)

    const normalized = normalizeGoodsFilterConditions({})
    expect(normalized.matchPinyin).toBe(true)
    expect(normalized.matchCase).toBe(false)
    expect(normalized.includeNote).toBe(true)
  })

  it('显式传值时保持关闭/开启', () => {
    const normalized = normalizeGoodsFilterConditions({
      matchPinyin: false,
      matchCase: true,
      includeNote: false
    })
    expect(normalized.matchPinyin).toBe(false)
    expect(normalized.matchCase).toBe(true)
    expect(normalized.includeNote).toBe(false)
  })
})
