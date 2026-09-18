import { describe, it, expect, vi } from 'vitest'
import { ref } from 'vue'

vi.mock('@/utils/db/index', () => ({
  saveItems: vi.fn(async () => {})
}))

import { sortHomeGoodsList, normalizeHomeSortMode, isHomeSortDirectionLocked, isHomeSortReorderable } from '../homeSort'
import { nextGoodsSortOrder, reorderGoods, buildReverseGoodsSortIds } from '@/stores/goods/goodsOrder'
import { normalizeGoodsInput } from '@/stores/goods/goodsHelpers'
import { saveItems } from '@/utils/db/index'

describe('sortHomeGoodsList custom', () => {
  it('按 sortOrder 升序，忽略 sortDirection', () => {
    const list = [
      { id: 'a', sortOrder: 3, name: 'A' },
      { id: 'b', sortOrder: 1, name: 'B' },
      { id: 'c', sortOrder: 2, name: 'C' }
    ]
    expect(sortHomeGoodsList(list, 'custom', 'desc').map(i => i.id)).toEqual(['b', 'c', 'a'])
    expect(sortHomeGoodsList(list, 'custom', 'asc').map(i => i.id)).toEqual(['b', 'c', 'a'])
  })

  it('并列时按 updatedAt 降序再 id', () => {
    const list = [
      { id: 'z', sortOrder: 0, updatedAt: 1 },
      { id: 'y', sortOrder: 0, updatedAt: 2 },
      { id: 'x', sortOrder: 0, updatedAt: 2 }
    ]
    const sorted = sortHomeGoodsList(list, 'custom', 'asc').map(i => i.id)
    expect(sorted).toEqual(['x', 'y', 'z'])
  })

  it('normalize 接受 custom 且方向锁定', () => {
    expect(normalizeHomeSortMode('custom')).toBe('custom')
    expect(isHomeSortDirectionLocked('custom')).toBe(true)
    expect(isHomeSortDirectionLocked('createdAt')).toBe(false)
  })

  it('日期排序：同一天内按 sortOrder 次级排序', () => {
    const list = [
      { id: 'b', sortOrder: 2, acquiredTime: 100, createdTime: 100 },
      { id: 'a', sortOrder: 0, acquiredTime: 100, createdTime: 100 },
      { id: 'c', sortOrder: 1, acquiredTime: 100, createdTime: 100 },
      { id: 'd', sortOrder: 9, acquiredTime: 200, createdTime: 200 }
    ]
    expect(sortHomeGoodsList(list, 'acquiredAt', 'asc').map(i => i.id)).toEqual(['a', 'c', 'b', 'd'])
    expect(sortHomeGoodsList(list, 'createdAt', 'asc').map(i => i.id)).toEqual(['a', 'c', 'b', 'd'])
  })

  it('isHomeSortReorderable：custom/日期/名称/价格可重排', () => {
    expect(isHomeSortReorderable('custom')).toBe(true)
    expect(isHomeSortReorderable('createdAt')).toBe(true)
    expect(isHomeSortReorderable('acquiredAt')).toBe(true)
    expect(isHomeSortReorderable('name')).toBe(true)
    expect(isHomeSortReorderable('price')).toBe(true)
  })

  it('名称/价格：同键内按 sortOrder 次级排序', () => {
    const list = [
      { id: 'b', name: 'X', sortOrder: 2, totalValueNumber: 10, createdTime: 1 },
      { id: 'a', name: 'X', sortOrder: 0, totalValueNumber: 10, createdTime: 2 },
      { id: 'c', name: 'Y', sortOrder: 9, totalValueNumber: 30, createdTime: 3 }
    ]
    const byName = sortHomeGoodsList(list, 'name', 'asc')
    expect(byName.filter(i => i.name === 'X').map(i => i.id)).toEqual(['a', 'b'])
    const byPrice = sortHomeGoodsList(list, 'price', 'asc')
    expect(byPrice.filter(i => i.totalValueNumber === 10).map(i => i.id)).toEqual(['a', 'b'])
  })
})

describe('normalizeGoodsInput sortOrder', () => {
  it('默认 0，负值/非法值截断为 0', () => {
    expect(normalizeGoodsInput({}).sortOrder).toBe(0)
    expect(normalizeGoodsInput({ sortOrder: -3 }).sortOrder).toBe(0)
    expect(normalizeGoodsInput({ sortOrder: '12.7' }).sortOrder).toBe(12)
    expect(normalizeGoodsInput({ sortOrder: 5 }).sortOrder).toBe(5)
  })
})

describe('goodsOrder store helpers', () => {
  it('nextGoodsSortOrder 按 isWishlist 分池 append', () => {
    const items = [
      { id: '1', isWishlist: false, sortOrder: 0 },
      { id: '2', isWishlist: false, sortOrder: 4 },
      { id: '3', isWishlist: true, sortOrder: 1 }
    ]
    expect(nextGoodsSortOrder(items, false)).toBe(5)
    expect(nextGoodsSortOrder(items, true)).toBe(2)
    expect(nextGoodsSortOrder([], false)).toBe(0)
  })

  it('buildReverseGoodsSortIds 优先按展示序 reverse', () => {
    expect(buildReverseGoodsSortIds([], false, ['a', 'b', 'c'])).toEqual(['c', 'b', 'a'])
  })

  it('buildReverseGoodsSortIds 无展示序时按 sortOrder 反转', () => {
    const items = [
      { id: 'a', isWishlist: false, sortOrder: 2 },
      { id: 'b', isWishlist: false, sortOrder: 0 },
      { id: 'c', isWishlist: true, sortOrder: 1 },
      { id: 'd', isWishlist: false, sortOrder: 1 }
    ]
    expect(buildReverseGoodsSortIds(items, false)).toEqual(['a', 'd', 'b'])
    expect(buildReverseGoodsSortIds(items, true)).toEqual(['c'])
  })

  it('reorderGoods 仅写变更行的下标序并触发 onMutate', async () => {
    vi.mocked(saveItems).mockClear()
    const list = ref([
      { id: 'a', sortOrder: 0, updatedAt: 1 },
      { id: 'b', sortOrder: 1, updatedAt: 1 },
      { id: 'c', sortOrder: 2, updatedAt: 1 }
    ])
    /** @type {string[][]} */
    const mutated = []
    await reorderGoods(['c', 'a', 'b'], list, (ids) => mutated.push([...ids]))
    const orderById = Object.fromEntries(list.value.map(i => [i.id, i.sortOrder]))
    expect(orderById).toEqual({ c: 0, a: 1, b: 2 })
    expect(mutated[0].sort()).toEqual(['a', 'b', 'c'])
    expect(saveItems).toHaveBeenCalledTimes(1)
  })
})
