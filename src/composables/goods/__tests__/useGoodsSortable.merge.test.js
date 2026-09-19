import { describe, it, expect } from 'vitest'
import { mergeVisibleReorderIntoFullOrder } from '../useGoodsSortable'

describe('mergeVisibleReorderIntoFullOrder（虚拟列表重排）', () => {
  const items = (ids) => ids.map((id) => ({ id }))

  it('只重排可见槽位，屏外顺序保持不变', () => {
    const display = items(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'])
    // 可见窗为 c,d,e,f，拖后 DOM 变成 f,c,e,d
    const next = mergeVisibleReorderIntoFullOrder(display, ['f', 'c', 'e', 'd'])
    expect(next).toEqual(['a', 'b', 'f', 'c', 'e', 'd', 'g', 'h'])
  })

  it('忽略组卡 id 与不在全量里的 id', () => {
    const display = [
      { id: 'grp1', _type: 'group' },
      { id: 'a' },
      { id: 'b' },
      { id: 'c' }
    ]
    const next = mergeVisibleReorderIntoFullOrder(display, ['grp1', 'c', 'ghost', 'a', 'b'])
    expect(next).toEqual(['c', 'a', 'b'])
  })

  it('可见项极少时也不会把屏外甩到末尾', () => {
    const display = items(['a', 'b', 'c', 'd', 'e'])
    expect(mergeVisibleReorderIntoFullOrder(display, ['b', 'a'])).toEqual(['b', 'a', 'c', 'd', 'e'])
  })
})
