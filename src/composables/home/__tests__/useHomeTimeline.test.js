import { describe, it, expect } from 'vitest'
import { ref } from 'vue'
import { getTimelineDisplayTotal, useHomeTimeline } from '../useHomeTimeline'

function setupTimeline(displayList, { sortDirection = 'desc' } = {}) {
  return useHomeTimeline({
    displayList: ref(displayList),
    displayDensity: ref('timeline'),
    sortDirection: ref(sortDirection),
    visibleTimelineMonthStart: ref(0),
    visibleTimelineMonthCount: ref(99),
    getInitialVisibleTimelineMonths: () => 99,
    offsetOfMonth: () => 0
  })
}

// 8-22 首购 11 份，9-5 补货 3 份；商品级 acquiredAt 仍是首购日期 8-22
const restockedGoods = {
  id: 'a',
  name: '补货谷子',
  quantity: 14,
  acquiredAt: '2026-08-22',
  unitAcquiredAtList: [
    ...Array.from({ length: 11 }, () => '2026-08-22'),
    ...Array.from({ length: 3 }, () => '2026-09-05')
  ],
  totalValueNumber: 140,
  collectStatus: '已拥有'
}

const normalGoods = {
  id: 'b',
  name: '普通谷子',
  quantity: 1,
  acquiredAt: '2026-09-03',
  totalValueNumber: 50,
  collectStatus: '已拥有'
}

describe('useHomeTimeline', () => {
  it('uses the month-allocated total so shipping is not repeated across months', () => {
    const item = {
      id: 'shipping-later-month',
      quantity: 14,
      acquiredAt: '2026-08-22',
      unitAcquiredAtList: [
        ...Array.from({ length: 11 }, () => '2026-08-22'),
        ...Array.from({ length: 3 }, () => '2026-09-05')
      ],
      totalValueNumber: 150,
      shippingFee: 10,
      collectStatus: '已拥有'
    }
    const timeline = setupTimeline([item])
    const months = timeline.allTimelineMonthList.value
    const august = months.find((month) => month.yearMonth === '2026-08').items[0]
    const september = months.find((month) => month.yearMonth === '2026-09').items[0]

    expect(august.totalValueNumber).toBe(110)
    expect(september.totalValueNumber).toBe(40)
    expect(getTimelineDisplayTotal(august) + getTimelineDisplayTotal(september)).toBe(150)
  })

  it('orders a split-month restock entry by its own date within the month (desc)', () => {
    // displayList 按商品级 acquiredAt desc：9-3 的商品在前，8-22 首购的商品在后
    const timeline = setupTimeline([normalGoods, restockedGoods], { sortDirection: 'desc' })

    const months = timeline.allTimelineMonthList.value
    expect(months.map((m) => m.yearMonth)).toEqual(['2026-09', '2026-08'])

    const september = months[0]
    expect(september.items.map((item) => item.id)).toEqual(['a::2026-09', 'b'])
    expect(september.items[0].acquiredAt).toBe('2026-09-05')
    expect(september.items[0].quantity).toBe(3)

    const august = months[1]
    expect(august.items.map((item) => item.id)).toEqual(['a::2026-08'])
    expect(august.items[0].quantity).toBe(11)
  })

  it('keeps month counts and spend intact after re-ordering', () => {
    const timeline = setupTimeline([normalGoods, restockedGoods])

    const months = timeline.allTimelineMonthList.value
    const september = months.find((m) => m.yearMonth === '2026-09')
    const august = months.find((m) => m.yearMonth === '2026-08')
    expect(september.count).toBe(4)
    expect(august.count).toBe(11)
    // 逐件均摊 140 / 14 = 10：9 月 = 3 × 10 + 50 = 80，8 月 = 11 × 10 = 110
    expect(september.totalSpend).toBeCloseTo(80)
    expect(august.totalSpend).toBeCloseTo(110)
  })

  it('sorts within-month entries ascending when sortDirection is asc', () => {
    const early = { id: 'c', name: '月初谷子', quantity: 1, acquiredAt: '2026-09-01', totalValueNumber: 10, collectStatus: '已拥有' }
    const late = { id: 'd', name: '月末谷子', quantity: 1, acquiredAt: '2026-09-28', totalValueNumber: 10, collectStatus: '已拥有' }

    const timeline = setupTimeline([early, late], { sortDirection: 'asc' })

    const september = timeline.allTimelineMonthList.value.find((m) => m.yearMonth === '2026-09')
    expect(september.items.map((item) => item.id)).toEqual(['c', 'd'])
  })

  it('re-orders within-month entries even when list order comes from a non-date sort', () => {
    const early = { id: 'c', name: 'A谷子', quantity: 1, acquiredAt: '2026-09-01', totalValueNumber: 10, collectStatus: '已拥有' }
    const late = { id: 'd', name: 'Z谷子', quantity: 1, acquiredAt: '2026-09-28', totalValueNumber: 10, collectStatus: '已拥有' }

    // 列表按名称排序时 d 在前，但时间线月内应按条目日期 desc
    const timeline = setupTimeline([late, early], { sortDirection: 'desc' })

    const september = timeline.allTimelineMonthList.value.find((m) => m.yearMonth === '2026-09')
    expect(september.items.map((item) => item.id)).toEqual(['d', 'c'])
  })

  it('keeps item-index mapping unique and complete for rendered entries', () => {
    const timeline = setupTimeline([normalGoods, restockedGoods])

    const indexMap = timeline.timelineItemIndexById.value
    const renderedIds = timeline.allTimelineMonthList.value.flatMap((m) => m.items.map((item) => item.id))
    const renderedIndexes = renderedIds.map((id) => indexMap.get(id))

    expect(renderedIndexes.every((index) => Number.isInteger(index))).toBe(true)
    expect(new Set(renderedIndexes).size).toBe(renderedIds.length)
  })

  it('orders month blocks chronologically even when displayList order is inverted (desc)', () => {
    // 同一商品跨 1/2 月拆分：unit 日期从 1 月写到 2 月，构建时 1 月槽位先出现；
    // 再叠加更早添加的 1 月整件。若沿用 displayList 首次出现顺序，2 月会沉到 1 月下面。
    const janOnly = {
      id: 'j',
      name: '一月谷子',
      quantity: 1,
      acquiredAt: '2025-01-10',
      totalValueNumber: 10,
      collectStatus: '已拥有'
    }
    const splitAcrossMonths = {
      id: 's',
      name: '跨月谷子',
      quantity: 3,
      acquiredAt: '2025-01-20',
      unitAcquiredAtList: ['2025-01-20', '2025-01-21', '2025-02-10'],
      totalValueNumber: 30,
      collectStatus: '已拥有'
    }
    // createdAt desc 下先列表跨月商品、后列表一月整件（模拟较早添加的 1 月商品）
    const timeline = setupTimeline([splitAcrossMonths, janOnly], { sortDirection: 'desc' })

    expect(timeline.allTimelineMonthList.value.map((m) => m.yearMonth)).toEqual(['2025-02', '2025-01'])
    expect(timeline.timelineYearGroups.value[0].months.map((m) => m.yearMonth)).toEqual(['2025-02', '2025-01'])
  })

  it('orders month blocks with asc direction (older first)', () => {
    const janOnly = {
      id: 'j',
      name: '一月谷子',
      quantity: 1,
      acquiredAt: '2025-01-10',
      totalValueNumber: 10,
      collectStatus: '已拥有'
    }
    const splitAcrossMonths = {
      id: 's',
      name: '跨月谷子',
      quantity: 3,
      acquiredAt: '2025-01-20',
      unitAcquiredAtList: ['2025-01-20', '2025-01-21', '2025-02-10'],
      totalValueNumber: 30,
      collectStatus: '已拥有'
    }
    const timeline = setupTimeline([splitAcrossMonths, janOnly], { sortDirection: 'asc' })

    expect(timeline.allTimelineMonthList.value.map((m) => m.yearMonth)).toEqual(['2025-01', '2025-02'])
  })

  it('orders months across year boundaries (desc: newer year first)', () => {
    const dec = { id: 'd', name: '12月', quantity: 1, acquiredAt: '2025-12-05', totalValueNumber: 1, collectStatus: '已拥有' }
    const jan = { id: 'n', name: '1月', quantity: 1, acquiredAt: '2026-01-05', totalValueNumber: 1, collectStatus: '已拥有' }
    const timeline = setupTimeline([dec, jan], { sortDirection: 'desc' })

    expect(timeline.allTimelineMonthList.value.map((m) => m.yearMonth)).toEqual(['2026-01', '2025-12'])
    expect(timeline.timelineYearGroups.value.map((g) => g.year)).toEqual(['2026', '2025'])
  })
})
