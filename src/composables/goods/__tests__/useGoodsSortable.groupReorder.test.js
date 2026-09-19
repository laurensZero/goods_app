// @ts-check
import { describe, it, expect } from 'vitest'
import { mergeVisibleReorderIntoFullOrder } from '../useGoodsSortable'

describe('组内成员重排序合并（无组卡的成员序列）', () => {
  const members = (ids) => ids.map((id) => ({ id }))

  it('成员全量可见时按 DOM 序提交', () => {
    const next = mergeVisibleReorderIntoFullOrder(members(['g1', 'g2', 'g3', 'g4']), ['g3', 'g1', 'g4', 'g2'])
    expect(next).toEqual(['g3', 'g1', 'g4', 'g2'])
  })

  it('成员 id 与 goods_group_items 序列一致时写回 sortOrder', () => {
    // 模拟组详情虚拟窗只渲染部分成员
    const next = mergeVisibleReorderIntoFullOrder(members(['a', 'b', 'c', 'd', 'e', 'f']), ['c', 'a', 'b'])
    expect(next).toEqual(['c', 'a', 'b', 'd', 'e', 'f'])
  })
})
