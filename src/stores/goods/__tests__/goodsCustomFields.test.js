import { describe, it, expect } from 'vitest'
import { mergeGoodsRecord, normalizeGoodsInput } from '../goodsHelpers'

function makeItem(overrides = {}) {
  return {
    id: 'a',
    name: '吧唧',
    isWishlist: false,
    quantity: 1,
    ...overrides
  }
}

describe('normalizeGoodsInput customFields', () => {
  it('缺失/脏输入回 {}', () => {
    expect(normalizeGoodsInput(makeItem(), 'a').customFields).toEqual({})
    expect(normalizeGoodsInput(makeItem({ customFields: null }), 'a').customFields).toEqual({})
    expect(normalizeGoodsInput(makeItem({ customFields: ['cf_1'] }), 'a').customFields).toEqual({})
    expect(normalizeGoodsInput(makeItem({ customFields: '{}' }), 'a').customFields).toEqual({})
  })

  it('清洗键值并排序（空值保留 = 已添加未填）', () => {
    const item = normalizeGoodsInput(makeItem({
      customFields: { cf_b: ' 2 ', cf_a: '限定', cf_empty: '', cf_obj: { x: 1 } }
    }), 'a')
    expect(item.customFields).toEqual({ cf_a: '限定', cf_b: '2', cf_empty: '' })
    expect(Object.keys(item.customFields)).toEqual(['cf_a', 'cf_b', 'cf_empty'])
  })

  it('孤儿键（定义已删）保留，不在归一化层清理', () => {
    const item = normalizeGoodsInput(makeItem({ customFields: { cf_removed: '旧值' } }), 'a')
    expect(item.customFields).toEqual({ cf_removed: '旧值' })
  })

  it('空串值保留：键存在 = 这件谷子添加了该字段（编辑页据此只渲染已添加的字段）', () => {
    const item = normalizeGoodsInput(makeItem({ customFields: { cf_added: '' } }), 'a')
    expect(Object.prototype.hasOwnProperty.call(item.customFields, 'cf_added')).toBe(true)
    expect(item.customFields.cf_added).toBe('')
  })
})

describe('mergeGoodsRecord customFields', () => {
  it('incoming 独有的键回填（不因 ...existing 打底而丢失）', () => {
    const existing = normalizeGoodsInput(makeItem({ customFields: { cf_a: 'A' } }), 'a')
    const incoming = normalizeGoodsInput(makeItem({ id: 'b', customFields: { cf_b: 'B' } }), 'b')
    const merged = mergeGoodsRecord(existing, incoming)
    expect(merged.customFields).toEqual({ cf_a: 'A', cf_b: 'B' })
  })

  it('同键冲突时 existing 优先', () => {
    const existing = normalizeGoodsInput(makeItem({ customFields: { cf_a: '本地' } }), 'a')
    const incoming = normalizeGoodsInput(makeItem({ id: 'b', customFields: { cf_a: '远端' } }), 'b')
    const merged = mergeGoodsRecord(existing, incoming)
    expect(merged.customFields.cf_a).toBe('本地')
  })

  it('existing 为空时整块采用 incoming', () => {
    const existing = normalizeGoodsInput(makeItem(), 'a')
    const incoming = normalizeGoodsInput(makeItem({ id: 'b', customFields: { cf_a: 'A', cf_b: 'B' } }), 'b')
    const merged = mergeGoodsRecord(existing, incoming)
    expect(merged.customFields).toEqual({ cf_a: 'A', cf_b: 'B' })
  })

  it('合并结果仍然清洗且键序稳定', () => {
    const existing = normalizeGoodsInput(makeItem({ customFields: { cf_z: 'Z' } }), 'a')
    const incoming = normalizeGoodsInput(makeItem({ id: 'b', customFields: { cf_a: 'A', cf_blank: '  ' } }), 'b')
    const merged = mergeGoodsRecord(existing, incoming)
    expect(Object.keys(merged.customFields)).toEqual(['cf_a', 'cf_blank', 'cf_z'])
  })
})
