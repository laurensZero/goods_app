import { describe, expect, it, vi } from 'vitest'
import {
  applyHiddenCollectStatuses,
  hideUnitsByCollectStatus,
  normalizeHiddenCollectStatuses
} from '@/utils/goods/hiddenStatus'

function makeItem(overrides = {}) {
  return {
    id: 'g1',
    name: '测试谷子',
    quantity: 1,
    collectStatus: '已拥有',
    unitCollectStatusList: [],
    unitAcquiredAtList: [],
    unitActualPriceList: [],
    unitCharacterList: [],
    unitSaleInfoList: [],
    statusTimeline: [],
    ...overrides
  }
}

describe('normalizeHiddenCollectStatuses', () => {
  it('只保留支持的三个状态并按固定顺序返回', () => {
    expect(normalizeHiddenCollectStatuses(['已赠出', '未知', '已出', '已出']))
      .toEqual(['已出', '已赠出'])
    expect(normalizeHiddenCollectStatuses(null)).toEqual([])
  })
})

describe('hideUnitsByCollectStatus', () => {
  it('无隐藏状态时原样返回', () => {
    const item = makeItem({ collectStatus: '已出' })
    expect(hideUnitsByCollectStatus(item, new Set())).toBe(item)
  })

  it('整条隐藏状态命中时返回 null', () => {
    expect(hideUnitsByCollectStatus(makeItem({ collectStatus: '已出' }), new Set(['已出']))).toBeNull()
  })

  it('心愿单不参与隐藏', () => {
    const item = makeItem({ collectStatus: '已出', isWishlist: true })
    expect(hideUnitsByCollectStatus(item, new Set(['已出']))).toBe(item)
  })

  it('多件只隐藏命中份数，并同步裁剪逐件字段与时间线下标', () => {
    const item = makeItem({
      quantity: 3,
      collectStatus: '已拥有',
      unitCollectStatusList: ['已出', '已拥有', '已拥有'],
      unitAcquiredAtList: ['2026-01-01', '2026-01-02', '2026-01-03'],
      unitActualPriceList: ['100', '200', '300'],
      unitCharacterList: ['A', 'B', 'C'],
      unitSaleInfoList: [{ price: '100' }, null, null],
      statusTimeline: [
        { status: '已拥有', at: '2026-01-01', unitIndex: 0 },
        { status: '已拥有', at: '2026-01-02', unitIndex: 1 },
        { status: '已拥有', at: '2026-01-03', unitIndex: 2 },
        { status: '已出', at: '2026-06-01', unitIndex: 0 }
      ]
    })

    const result = hideUnitsByCollectStatus(item, new Set(['已出']))

    expect(result).not.toBe(item)
    expect(result.quantity).toBe(2)
    expect(result.unitCollectStatusList).toEqual(['已拥有', '已拥有'])
    expect(result.unitAcquiredAtList).toEqual(['2026-01-02', '2026-01-03'])
    expect(result.unitActualPriceList).toEqual(['200', '300'])
    expect(result.unitCharacterList).toEqual(['B', 'C'])
    expect(result.unitSaleInfoList).toEqual([null, null])
    expect(result.statusTimeline).toEqual([
      { status: '已拥有', at: '2026-01-02', unitIndex: 0 },
      { status: '已拥有', at: '2026-01-03', unitIndex: 1 }
    ])
  })

  it('保留部分份数的合并时间线条目会重映射为新的 unitIndexes', () => {
    const item = makeItem({
      quantity: 3,
      unitCollectStatusList: ['已出', '已拥有', '已拥有'],
      statusTimeline: [
        { status: '已拥有', at: '2026-01-02', unitIndexes: [1, 2] }
      ]
    })

    const result = hideUnitsByCollectStatus(item, new Set(['已出']))

    expect(result.statusTimeline).toEqual([
      { status: '已拥有', at: '2026-01-02', unitIndexes: [0, 1] }
    ])
  })

  it('所有份数都命中时整条隐藏', () => {
    const item = makeItem({
      quantity: 2,
      unitCollectStatusList: ['丢失', '丢失']
    })
    expect(hideUnitsByCollectStatus(item, new Set(['丢失']))).toBeNull()
  })
})

describe('applyHiddenCollectStatuses', () => {
  it('无隐藏状态时保持原数组引用', () => {
    const items = [makeItem({ collectStatus: '已出' })]
    expect(applyHiddenCollectStatuses(items, [])).toBe(items)
  })

  it('按状态过滤条目，并对裁剪后的条目调用 refresh', () => {
    const hiddenSold = makeItem({ id: 'sold', collectStatus: '已出' })
    const mixed = makeItem({
      id: 'mixed',
      quantity: 2,
      unitCollectStatusList: ['已出', '已拥有']
    })
    const kept = makeItem({ id: 'kept' })
    const refresh = vi.fn((item) => ({ ...item, refreshed: true }))

    const result = applyHiddenCollectStatuses([hiddenSold, mixed, kept], ['已出'], { refresh })

    expect(result.map((item) => item.id)).toEqual(['mixed', 'kept'])
    expect(result[0]).toMatchObject({ quantity: 1, refreshed: true })
    expect(result[1]).toBe(kept)
    expect(refresh).toHaveBeenCalledTimes(1)
  })
})
