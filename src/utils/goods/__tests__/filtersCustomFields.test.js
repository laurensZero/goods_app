import { describe, it, expect } from 'vitest'

import {
  applyGoodsFilters,
  areGoodsFilterConditionsEqual,
  countActiveGoodsFilters,
  createDefaultGoodsFilters,
  filterGoodsList,
  normalizeCustomFieldFilters,
  normalizeGoodsFilterConditions
} from '../filters'

const base = {
  category: '',
  ip: '',
  variant: '',
  note: '',
  storageLocation: '',
  characters: [],
  tags: [],
  priceNumber: 0,
  acquiredTime: 0,
  collectStatus: '已拥有',
  images: []
}

const list = [
  { ...base, id: 'g1', name: 'A', customFields: { cf_rarity: '限定', cf_box: '有盒' } },
  { ...base, id: 'g2', name: 'B', customFields: { cf_rarity: '通贩', cf_box: '有盒' } },
  { ...base, id: 'g3', name: 'C', customFields: {} },
  { ...base, id: 'g4', name: 'D' },
  { ...base, id: 'g5', name: 'E', customFields: { cf_rarity: '  限定  ' } }
]

const idsOf = (items) => items.map((item) => item.id)

describe('normalizeCustomFieldFilters', () => {
  it('非对象/数组/空值统一回落为空对象', () => {
    expect(normalizeCustomFieldFilters(null)).toEqual({})
    expect(normalizeCustomFieldFilters(undefined)).toEqual({})
    expect(normalizeCustomFieldFilters('cf_a')).toEqual({})
    expect(normalizeCustomFieldFilters(['cf_a'])).toEqual({})
  })

  it('trim + 去重 + 丢弃空值，空数组的字段不保留', () => {
    expect(normalizeCustomFieldFilters({
      cf_a: [' 限定 ', '限定', '', '   ', null, '通贩'],
      cf_b: [],
      cf_c: 'not-array'
    })).toEqual({ cf_a: ['限定', '通贩'] })
  })

  it('按 defId 字典序建对象，保证条件比较稳定', () => {
    const one = normalizeCustomFieldFilters({ cf_z: ['1'], cf_a: ['2'] })
    const two = normalizeCustomFieldFilters({ cf_a: ['2'], cf_z: ['1'] })
    expect(Object.keys(one)).toEqual(['cf_a', 'cf_z'])
    expect(JSON.stringify(one)).toBe(JSON.stringify(two))
  })
})

describe('customFields in normalized conditions', () => {
  it('默认值里 customFields 是独立空对象', () => {
    const a = createDefaultGoodsFilters()
    const b = createDefaultGoodsFilters()
    a.customFields.cf_a = ['x']
    expect(b.customFields).toEqual({})
  })

  it('normalizeGoodsFilterConditions 归一化 customFields', () => {
    const filters = normalizeGoodsFilterConditions({ customFields: { cf_a: [' 限定 ', ''] } })
    expect(filters.customFields).toEqual({ cf_a: ['限定'] })
  })

  it('键序不同视为同一组条件（预设去重要用）', () => {
    const a = normalizeGoodsFilterConditions({ customFields: { cf_z: ['1'], cf_a: ['2'] } })
    const b = normalizeGoodsFilterConditions({ customFields: { cf_a: ['2'], cf_z: ['1'] } })
    expect(areGoodsFilterConditionsEqual(a, b)).toBe(true)
  })

  it('每个有值的字段各计 1 个筛选条件', () => {
    expect(countActiveGoodsFilters({ customFields: { cf_a: ['1'], cf_b: ['2'] } })).toBe(2)
    expect(countActiveGoodsFilters({ customFields: { cf_a: [] } })).toBe(0)
  })
})

describe('filterGoodsList custom field matching', () => {
  it('无筛选时不丢条目', () => {
    expect(idsOf(filterGoodsList(list, {}))).toEqual(['g1', 'g2', 'g3', 'g4', 'g5'])
  })

  it('单字段精确匹配，值两侧空白被忽略', () => {
    expect(idsOf(filterGoodsList(list, { customFields: { cf_rarity: ['限定'] } }))).toEqual(['g1', 'g5'])
  })

  it('同字段多值为 OR', () => {
    expect(idsOf(filterGoodsList(list, { customFields: { cf_rarity: ['限定', '通贩'] } }))).toEqual(['g1', 'g2', 'g5'])
  })

  it('不同字段为 AND', () => {
    expect(idsOf(filterGoodsList(list, {
      customFields: { cf_rarity: ['限定'], cf_box: ['有盒'] }
    }))).toEqual(['g1'])
  })

  it('未填该字段（无键或空对象）不匹配任何值', () => {
    expect(idsOf(filterGoodsList(list, { customFields: { cf_box: ['有盒'] } }))).toEqual(['g1', 'g2'])
  })

  it('孤儿 defId（没有任何条目带该值）筛不出结果', () => {
    expect(filterGoodsList(list, { customFields: { cf_missing: ['x'] } })).toEqual([])
  })

  it('条目 customFields 形状异常时不抛错', () => {
    const broken = [{ ...base, id: 'x', name: 'X', customFields: 'oops' }]
    expect(filterGoodsList(broken, { customFields: { cf_a: ['1'] } })).toEqual([])
    expect(filterGoodsList(broken, {})).toEqual(broken)
  })

  it('applyGoodsFilters 同样应用自定义字段筛选', () => {
    expect(idsOf(applyGoodsFilters(list, { customFields: { cf_rarity: ['通贩'] } }))).toEqual(['g2'])
  })
})
