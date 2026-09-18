import { describe, it, expect } from 'vitest'
import { monthIndexFromRailRatio, formatScrubYearMonthLabel } from '../timelineScrubber'

describe('monthIndexFromRailRatio', () => {
  it('maps rail ratio to month index within bounds', () => {
    expect(monthIndexFromRailRatio(0, 12)).toBe(0)
    expect(monthIndexFromRailRatio(0.5, 12)).toBe(6)
    expect(monthIndexFromRailRatio(0.999, 12)).toBe(11)
    expect(monthIndexFromRailRatio(1, 12)).toBe(11)
  })

  it('clamps invalid ratios and empty lists', () => {
    expect(monthIndexFromRailRatio(-1, 5)).toBe(0)
    expect(monthIndexFromRailRatio(2, 5)).toBe(4)
    expect(monthIndexFromRailRatio(Number.NaN, 5)).toBe(0)
    expect(monthIndexFromRailRatio(0.4, 0)).toBe(0)
  })
})

describe('formatScrubYearMonthLabel', () => {
  it('formats CJK and English year-month labels', () => {
    expect(formatScrubYearMonthLabel('2026', '3月', 'zh-CN')).toBe('2026年3月')
    expect(formatScrubYearMonthLabel('2026', '3月', 'ja')).toBe('2026年3月')
    expect(formatScrubYearMonthLabel('2026', '3월', 'ko')).toBe('2026년 3월')
    expect(formatScrubYearMonthLabel('2026', 'Mar', 'en')).toBe('Mar 2026')
  })
})
