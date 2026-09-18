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
  it('按 manualOrders.custom 升序，忽略 sortDirection', () => {
    const list = [
      { id: 'a', manualOrders: { custom: 3 }, name: 'A' },
      { id: 'b', manualOrders: { custom: 1 }, name: 'B' },
      { id: 'c', manualOrders: { custom: 2 }, name: 'C' }
    ]
    expect(sortHomeGoodsList(list, 'custom', 'desc').map(i => i.id)).toEqual(['b', 'c', 'a'])
    expect(sortHomeGoodsList(list, 'custom', 'asc').map(i => i.id)).toEqual(['b', 'c', 'a'])
  })

  it('并列时按 updatedAt 降序再 id', () => {
    const list = [
      { id: 'z', manualOrders: {}, updatedAt: 1 },
      { id: 'y', manualOrders: {}, updatedAt: 2 },
      { id: 'x', manualOrders: {}, updatedAt: 2 }
    ]
    const sorted = sortHomeGoodsList(list, 'custom', 'asc').map(i => i.id)
    expect(sorted).toEqual(['x', 'y', 'z'])
  })

  it('normalize 接受 custom 且方向锁定', () => {
    expect(normalizeHomeSortMode('custom')).toBe('custom')
    expect(isHomeSortDirectionLocked('custom')).toBe(true)
    expect(isHomeSortDirectionLocked('createdAt')).toBe(false)
  })

  it('日期排序：同一天内按对应模式的 manualOrders 次级排序', () => {
    const list = [
      { id: 'b', manualOrders: { acquiredAt: 2, createdAt: 2 }, acquiredTime: 100, createdTime: 100 },
      { id: 'a', manualOrders: { acquiredAt: 0, createdAt: 0 }, acquiredTime: 100, createdTime: 100 },
      { id: 'c', manualOrders: { acquiredAt: 1, createdAt: 1 }, acquiredTime: 100, createdTime: 100 },
      { id: 'd', manualOrders: { acquiredAt: 9 }, acquiredTime: 200, createdTime: 200 }
    ]
    expect(sortHomeGoodsList(list, 'acquiredAt', 'asc').map(i => i.id)).toEqual(['a', 'c', 'b', 'd'])
    expect(sortHomeGoodsList(list, 'createdAt', 'asc').map(i => i.id)).toEqual(['a', 'c', 'b', 'd'])
  })

  it('名称/价格：同键内按各模式 manualOrders 次级，互不影响', () => {
    const list = [
      { id: 'b', name: 'X', manualOrders: { name: 2, price: 0 }, totalValueNumber: 10, createdTime: 1 },
      { id: 'a', name: 'X', manualOrders: { name: 0, price: 2 }, totalValueNumber: 10, createdTime: 2 },
      { id: 'c', name: 'Y', manualOrders: { name: 9 }, totalValueNumber: 30, createdTime: 3 }
    ]
    expect(sortHomeGoodsList(list, 'name', 'asc').filter(i => i.name === 'X').map(i => i.id)).toEqual(['a', 'b'])
    expect(sortHomeGoodsList(list, 'price', 'asc').filter(i => i.totalValueNumber === 10).map(i => i.id)).toEqual(['b', 'a'])
  })

  it('isHomeSortReorderable：custom/日期/名称/价格可重排', () => {
    expect(isHomeSortReorderable('custom')).toBe(true)
    expect(isHomeSortReorderable('createdAt')).toBe(true)
    expect(isHomeSortReorderable('acquiredAt')).toBe(true)
    expect(isHomeSortReorderable('name')).toBe(true)
    expect(isHomeSortReorderable('price')).toBe(true)
  })
})

describe('normalizeGoodsInput manualOrders', () => {
  it('默认空对象，非法值丢弃', () => {
    expect(normalizeGoodsInput({}).manualOrders).toEqual({})
    expect(normalizeGoodsInput({ manualOrders: { custom: -3 } }).manualOrders).toEqual({})
    expect(normalizeGoodsInput({ manualOrders: { custom: '12.7', name: 3 } }).manualOrders).toEqual({ custom: 12, name: 3 })
  })
})

describe('goodsOrder store helpers', () => {
  it('nextGoodsSortOrder 按 isWishlist 与模式分池 append', () => {
    const items = [
      { id: '1', isWishlist: false, manualOrders: { custom: 2, acquiredAt: 0 } },
      { id: '2', isWishlist: false, manualOrders: { custom: 0, acquiredAt: 4 } },
      { id: '3', isWishlist: true, manualOrders: { custom: 1 } }
    ]
    expect(nextGoodsSortOrder(items, false, '', 'acquiredAt')).toBe(5)
    expect(nextGoodsSortOrder(items, false, '', 'custom')).toBe(3)
    expect(nextGoodsSortOrder(items, true, '', 'custom')).toBe(2)
    expect(nextGoodsSortOrder([], false)).toBe(0)
  })

  it('buildReverseGoodsSortIds 按模式反转', () => {
    expect(buildReverseGoodsSortIds([], false, ['a', 'b', 'c'])).toEqual(['c', 'b', 'a'])
    const items = [
      { id: 'a', isWishlist: false, manualOrders: { custom: 2, name: 0 } },
      { id: 'b', isWishlist: false, manualOrders: { custom: 0, name: 1 } },
      { id: 'c', isWishlist: true, manualOrders: { custom: 1 } },
      { id: 'd', isWishlist: false, manualOrders: { custom: 1, name: 2 } }
    ]
    expect(buildReverseGoodsSortIds(items, false, undefined, 'custom')).toEqual(['a', 'd', 'b'])
    expect(buildReverseGoodsSortIds(items, false, undefined, 'name')).toEqual(['d', 'b', 'a'])
  })

  it('reorderGoods 只写对应模式的 manualOrders 键', async () => {
    vi.mocked(saveItems).mockClear()
    const list = ref([
      { id: 'a', manualOrders: { custom: 0, name: 9 }, updatedAt: 1 },
      { id: 'b', manualOrders: { custom: 1, name: 9 }, updatedAt: 1 },
      { id: 'c', manualOrders: { custom: 2, name: 9 }, updatedAt: 1 }
    ])
    await reorderGoods(['c', 'a', 'b'], list, undefined, 'custom')
    expect(list.value.map(i => i.manualOrders.custom)).toEqual([1, 2, 0])
    expect(list.value.every(i => i.manualOrders.name === 9)).toBe(true)
    expect(saveItems).toHaveBeenCalledTimes(1)
  })
})
