import { describe, it, expect } from 'vitest'
import {
  isSelectableGroup,
  buildPickerLevels,
  buildItemLevelIndex,
  variantItemKeys,
  selectionFromVariantKeys,
  hasAnySelection,
  hasFullSelection,
  resolveSelectedVariants,
  resolveSelectedVariantsFromEntries,
  isLevelValueAvailable,
  toggleSelection,
  toggleLevelSelection,
  sameKeySet,
  buildVariantEntries,
  buildAvailabilityMap,
  entryMatchesSelection,
} from '../skuSelection'

const TWO_LEVEL_GROUPS = [
  {
    name: '地区',
    key: 'g1',
    content: [
      { key: 'a1', text: '蒙德' },
      { key: 'a2', text: '璃月' },
    ],
  },
  {
    name: '元素',
    key: 'g2',
    content: [
      { key: 'b1', text: '火元素款' },
      { key: 'b2', text: '水元素款' },
    ],
  },
]

// 单选项维度（如发货时间）：不展示，但 key 仍在 variant.key 里
const NOISE_GROUP = {
  name: '发货时间',
  key: 'g3',
  content: [{ key: 'c1', text: '一周内' }],
}

const TWO_LEVEL_GROUPS_WITH_NOISE = [...TWO_LEVEL_GROUPS, NOISE_GROUP]

function sku(key, text, extra = {}) {
  return { key, text, cover_url: '', price: null, ...extra }
}

const TWO_LEVEL_VARIANTS = [
  sku('a1_b1_c1', '蒙德 / 火元素款'),
  sku('a1_b2_c1', '蒙德 / 水元素款'),
  sku('a2_b1_c1', '璃月 / 火元素款'),
  sku('a2_b2_c1', '璃月 / 水元素款'),
]

describe('mihoyo skuSelection', () => {
  it('isSelectableGroup 只认 >1 选项的维度', () => {
    expect(isSelectableGroup(TWO_LEVEL_GROUPS[0])).toBe(true)
    expect(isSelectableGroup(NOISE_GROUP)).toBe(false)
    expect(isSelectableGroup(null)).toBe(false)
  })

  it('buildPickerLevels 过滤掉单选项维度并保留原始下标', () => {
    const levels = buildPickerLevels(TWO_LEVEL_GROUPS_WITH_NOISE)
    expect(levels.map((l) => l.index)).toEqual([0, 1])
    expect(levels.map((l) => l.name)).toEqual(['地区', '元素'])
  })

  it('buildItemLevelIndex 把固定维度的 key 映射为 -1', () => {
    const map = buildItemLevelIndex(TWO_LEVEL_GROUPS_WITH_NOISE)
    expect(map.get('a1')).toBe(0)
    expect(map.get('b2')).toBe(1)
    expect(map.get('c1')).toBe(-1)
  })

  it('variantItemKeys 拆出维度项 key', () => {
    expect(variantItemKeys({ key: 'a1_b2_c1' })).toEqual(['a1', 'b2', 'c1'])
    expect(variantItemKeys({ key: '' })).toEqual([])
  })

  it('selectionFromVariantKeys 可由选中组合反推各维度选择', () => {
    const levels = buildPickerLevels(TWO_LEVEL_GROUPS)
    const itemLevelIndex = buildItemLevelIndex(TWO_LEVEL_GROUPS)
    const selection = selectionFromVariantKeys(['a1_b2_c1'], levels, itemLevelIndex)
    expect(selection[0]).toEqual(['a1'])
    expect(selection[1]).toEqual(['b2'])
  })

  it('单选：必须每个层级都选满才返回组合', () => {
    const levels = buildPickerLevels(TWO_LEVEL_GROUPS)
    expect(resolveSelectedVariants(TWO_LEVEL_VARIANTS, levels, { 0: ['a1'] }, false)).toEqual([])
    const picked = resolveSelectedVariants(
      TWO_LEVEL_VARIANTS,
      levels,
      { 0: ['a1'], 1: ['b2'] },
      false,
    )
    expect(picked.map((v) => v.key)).toEqual(['a1_b2_c1'])
  })

  it('多选：各层级都选满时按所选值展开为全部有效组合', () => {
    const levels = buildPickerLevels(TWO_LEVEL_GROUPS)
    const both = resolveSelectedVariants(
      TWO_LEVEL_VARIANTS,
      levels,
      { 0: ['a1', 'a2'], 1: ['b1'] },
      true,
    )
    expect(both.map((v) => v.key).sort()).toEqual(['a1_b1_c1', 'a2_b1_c1'])

    const expanded = resolveSelectedVariants(
      TWO_LEVEL_VARIANTS,
      levels,
      { 0: ['a1'], 1: ['b1', 'b2'] },
      true,
    )
    expect(expanded.map((v) => v.key).sort()).toEqual(['a1_b1_c1', 'a1_b2_c1'])
  })

  it('多选：层级未选满 = 还没选完，不自动展开为该层全部值（层级间不联动）', () => {
    const levels = buildPickerLevels(TWO_LEVEL_GROUPS)
    // 只选了第二层：不解析
    expect(resolveSelectedVariants(TWO_LEVEL_VARIANTS, levels, { 1: ['b1'] }, true)).toEqual([])
    // 选了第一层但第二层被清空：不解析
    expect(resolveSelectedVariants(TWO_LEVEL_VARIANTS, levels, { 0: ['a2'], 1: [] }, true)).toEqual([])
  })

  it('toggleLevelSelection：切换上级时清空更深层级的已选', () => {
    const levels = buildPickerLevels(TWO_LEVEL_GROUPS)
    // 单选：第二层已选，第一层从 a1 切到 a2 → 第二层清空
    const next = toggleLevelSelection(levels, { 0: ['a1'], 1: ['b1', 'b2'] }, 0, 'a2', false)
    expect(next[0]).toEqual(['a2'])
    expect(next[1]).toEqual([])

    // 多选（仅单层级场景使用）：末层内追加不影响自己
    const added = toggleLevelSelection(levels, { 0: ['a1'], 1: ['b1'] }, 1, 'b2', true)
    expect(added[0]).toEqual(['a1'])
    expect(added[1]).toEqual(['b1', 'b2'])

    // 下级选择不影响上级
    const step3 = toggleLevelSelection(levels, { 0: ['a1'], 1: ['b1'] }, 1, 'b2', false)
    expect(step3[0]).toEqual(['a1'])
    expect(step3[1]).toEqual(['b2'])
  })

  it('hasAnySelection / hasFullSelection', () => {
    const levels = buildPickerLevels(TWO_LEVEL_GROUPS)
    expect(hasAnySelection(levels, {})).toBe(false)
    expect(hasAnySelection(levels, { 0: ['a1'] })).toBe(true)
    expect(hasFullSelection(levels, { 0: ['a1'] })).toBe(false)
    expect(hasFullSelection(levels, { 0: ['a1'], 1: ['b1'] })).toBe(true)
  })

  it('isLevelValueAvailable 仅在存在有效组合时为真', () => {
    const levels = buildPickerLevels(TWO_LEVEL_GROUPS)
    // 已选蒙德 → 火/水都还有组合；选蒙德/火后，水也还有（蒙德/水）
    expect(isLevelValueAvailable(TWO_LEVEL_VARIANTS, levels, { 0: ['a1'] }, 1, 'b2')).toBe(true)
    // 不存在的维度项始终不可选
    expect(isLevelValueAvailable(TWO_LEVEL_VARIANTS, levels, {}, 1, 'zzz')).toBe(false)
  })

  it('toggleSelection：多选增删，单选互斥可取消', () => {
    expect(toggleSelection({ 0: [] }, 0, 'a1', true)).toEqual({ 0: ['a1'] })
    expect(toggleSelection({ 0: ['a1'] }, 0, 'a1', true)).toEqual({ 0: [] })
    expect(toggleSelection({ 0: ['a1'] }, 0, 'a2', false)).toEqual({ 0: ['a2'] })
    expect(toggleSelection({ 0: ['a1'] }, 0, 'a1', false)).toEqual({ 0: [] })
  })

  it('sameKeySet 顺序无关', () => {
    expect(sameKeySet(['a', 'b'], ['b', 'a'])).toBe(true)
    expect(sameKeySet(['a'], ['a', 'b'])).toBe(false)
    expect(sameKeySet([], [])).toBe(true)
  })

  it('buildVariantEntries + entryMatchesSelection 复用预计算集合', () => {
    const levels = buildPickerLevels(TWO_LEVEL_GROUPS)
    const entries = buildVariantEntries(TWO_LEVEL_VARIANTS)
    expect(entries).toHaveLength(4)
    const matched = entries
      .filter((e) => entryMatchesSelection(e, levels, { 0: ['a2'] }))
      .map((e) => e.variant.key)
    expect(matched.sort()).toEqual(['a2_b1_c1', 'a2_b2_c1'])
  })

  it('buildAvailabilityMap 一次算出可选的维度项', () => {
    const levels = buildPickerLevels(TWO_LEVEL_GROUPS)
    const itemLevelIndex = buildItemLevelIndex(TWO_LEVEL_GROUPS)
    const entries = buildVariantEntries(TWO_LEVEL_VARIANTS)
    const map = buildAvailabilityMap(entries, itemLevelIndex, levels, { 0: ['a1'] })
    expect(map.has('0|a1')).toBe(true)
    expect(map.has('1|b1')).toBe(true)
    expect(map.has('1|b2')).toBe(true)
    // 固定维度（c1）不入表
    expect(map.has('0|c1')).toBe(false)
  })

  it('无维度信息时，用完整 variant.key 兜底成扁平选择', () => {
    const flatGroup = {
      name: '',
      content: TWO_LEVEL_VARIANTS.map((v) => ({ key: v.key, text: v.text })),
    }
    const levels = buildPickerLevels([flatGroup])
    expect(levels).toHaveLength(1)
    const entries = buildVariantEntries(TWO_LEVEL_VARIANTS)
    const picked = resolveSelectedVariantsFromEntries(
      entries,
      levels,
      { 0: ['a2_b2_c1'] },
      false,
    )
    expect(picked.map((v) => v.key)).toEqual(['a2_b2_c1'])
  })
})
