import { describe, it, expect } from 'vitest'
import { ref } from 'vue'
import { buildCalendarDayData, useHomeCalendar } from '../useHomeCalendar'

describe('buildCalendarDayData', () => {
  it('aggregates spend and copies per day', () => {
    const goodsList = [
      {
        id: 'a',
        quantity: 3,
        acquiredAt: '2026-10-01',
        unitAcquiredAtList: ['2026-10-01', '2026-10-01', '2026-10-15'],
        actualPrice: '90',
        collectStatus: '已拥有'
      },
      {
        id: 'b',
        quantity: 1,
        acquiredAt: '2026-10-01',
        actualPrice: '30',
        collectStatus: '已拥有'
      }
    ]

    const dayData = buildCalendarDayData(goodsList)

    expect(dayData.get('2026-10-01').total).toBe(90)
    expect(dayData.get('2026-10-01').items).toHaveLength(2)
    expect(dayData.get('2026-10-15').total).toBe(30)
    expect(dayData.get('2026-10-15').items[0].qty).toBe(1)
  })

  it('grays out a day entry when all copies that day are exited', () => {
    const goodsList = [
      {
        id: 'a',
        quantity: 2,
        acquiredAt: '2026-10-01',
        unitAcquiredAtList: ['2026-10-01', '2026-10-02'],
        unitCollectStatusList: ['已出', '已拥有'],
        actualPrice: '100',
        collectStatus: '已拥有'
      }
    ]

    const dayData = buildCalendarDayData(goodsList)

    expect(dayData.get('2026-10-01').items[0].isExcluded).toBe(true)
    expect(dayData.get('2026-10-02').items[0].isExcluded).toBe(false)
  })

  it('records zero-spend days that still have goods (exited copies)', () => {
    const goodsList = [
      {
        id: 'a',
        quantity: 1,
        acquiredAt: '2026-10-01',
        actualPrice: '50',
        collectStatus: '已出'
      }
    ]

    const dayData = buildCalendarDayData(goodsList)

    expect(dayData.get('2026-10-01').total).toBe(0)
    expect(dayData.get('2026-10-01').items).toHaveLength(1)
    expect(dayData.get('2026-10-01').items[0].isExcluded).toBe(true)
  })

  it('does not gray the restock day of a gifted-then-rebought item', () => {
    const goodsList = [
      {
        id: 'a',
        quantity: 2,
        acquiredAt: '2026-08-10',
        unitAcquiredAtList: ['2026-08-10', '2026-11-01'],
        unitActualPriceList: ['60', '40'],
        unitCollectStatusList: ['已赠出', '已拥有'],
        actualPrice: '100',
        collectStatus: '已赠出'
      }
    ]

    const dayData = buildCalendarDayData(goodsList)

    // 旧的那天：已赠出 → 置灰、金额 0
    expect(dayData.get('2026-08-10').items[0].isExcluded).toBe(true)
    expect(dayData.get('2026-08-10').total).toBe(0)
    // 补货那天：新份已拥有 → 不置灰、金额计入
    expect(dayData.get('2026-11-01').items[0].isExcluded).toBe(false)
    expect(dayData.get('2026-11-01').total).toBe(40)
  })

  it('skips wishlist items and items without any acquired date', () => {
    const goodsList = [
      { id: 'wish', isWishlist: true, quantity: 1, acquiredAt: '2026-10-01', actualPrice: '10' },
      { id: 'no-date', quantity: 1, acquiredAt: '', actualPrice: '10' }
    ]

    expect(buildCalendarDayData(goodsList).size).toBe(0)
  })
})

describe('useHomeCalendar', () => {
  it('only builds data in calendar mode', async () => {
    const goodsList = [
      { id: 'a', quantity: 1, acquiredAt: '2026-10-01', actualPrice: '50', collectStatus: '已拥有' }
    ]
    const displayDensity = ref('timeline')

    const { calendarDayData } = useHomeCalendar({
      displayList: ref(goodsList),
      displayDensity
    })
    expect(calendarDayData.value.size).toBe(0)

    displayDensity.value = 'calendar'
    await Promise.resolve()
    expect(calendarDayData.value.get('2026-10-01').total).toBe(50)
  })
})
