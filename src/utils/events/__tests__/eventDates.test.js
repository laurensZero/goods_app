import { describe, it, expect } from 'vitest'
import {
  normalizeEventDates,
  resolveEventDates,
  getFirstEventDate,
  isFullContinuousRange,
  selectionToEventDates,
  formatEventDateDisplay
} from '../eventDates'
import {
  parseDayCount,
  getDayDate,
  normalizeDayTicketList,
  resolveCompleteDayTicketTotal
} from '../dayTickets'

describe('eventDates', () => {
  it('normalizeEventDates validates, dedupes, sorts', () => {
    expect(normalizeEventDates(['2026-05-03', 'bad', '2026-05-01', '2026-05-03'])).toEqual([
      '2026-05-01',
      '2026-05-03'
    ])
  })

  it('normalizeEventDates accepts JSON string', () => {
    expect(normalizeEventDates('["2026-08-02","2026-09-26"]')).toEqual([
      '2026-08-02',
      '2026-09-26'
    ])
    expect(normalizeEventDates('not-json')).toEqual([])
  })

  it('resolveEventDates reads dates and falls back to legacy columns', () => {
    expect(resolveEventDates({ dates: ['2026-08-02', '2026-09-26'] })).toEqual([
      '2026-08-02',
      '2026-09-26'
    ])
    expect(resolveEventDates({
      dates: [],
      selectedDates: ['2026-08-02', '2026-09-26']
    })).toEqual(['2026-08-02', '2026-09-26'])
    expect(resolveEventDates({
      startDate: '2026-05-01',
      endDate: '2026-05-03'
    })).toEqual(['2026-05-01', '2026-05-02', '2026-05-03'])
    expect(resolveEventDates({})).toEqual([])
  })

  it('formatEventDateDisplay lists intermittent days instead of a continuous range', () => {
    expect(formatEventDateDisplay(['2026-08-02', '2026-09-26'])).toBe('08-02、09-26')
    expect(formatEventDateDisplay(['2026-05-01', '2026-05-02', '2026-05-03'])).toBe('2026-05-01 - 2026-05-03')
  })

  it('legacy intermittent selectedDates survive resolveEventDates', () => {
    expect(resolveEventDates({
      startDate: '2026-08-02',
      endDate: '2026-09-26',
      selectedDates: ['2026-09-26', '2026-08-02']
    })).toEqual(['2026-08-02', '2026-09-26'])
  })

  it('getFirstEventDate returns first day', () => {
    expect(getFirstEventDate({ dates: ['2026-05-03', '2026-05-01'] })).toBe('2026-05-01')
  })

  it('selectionToEventDates returns normalized array', () => {
    expect(selectionToEventDates(['2026-05-02', '2026-05-01', '2026-05-03'])).toEqual([
      '2026-05-01',
      '2026-05-02',
      '2026-05-03'
    ])
  })

  it('isFullContinuousRange detects gaps', () => {
    expect(isFullContinuousRange(['2026-05-01', '2026-05-03'])).toBe(false)
    expect(isFullContinuousRange(['2026-05-01', '2026-05-02', '2026-05-03'])).toBe(true)
  })
})

describe('dayTickets', () => {
  it('parseDayCount uses dates length', () => {
    expect(parseDayCount(['2026-08-02', '2026-09-26'])).toBe(2)
    expect(parseDayCount([])).toBe(0)
  })

  it('getDayDate indexes dates', () => {
    expect(getDayDate(['2026-08-02', '2026-09-26'], 1)).toBe('2026-09-26')
    expect(getDayDate(['2026-08-02'], 5)).toBe('')
  })

  it('normalizeDayTicketList truncates to dates length', () => {
    expect(normalizeDayTicketList([
      { price: '10', ticketType: 'A' },
      { price: '20', ticketType: 'B' },
      { price: '30', ticketType: 'C' }
    ], ['2026-08-02', '2026-09-26'])).toEqual([
      { price: '10', ticketType: 'A' },
      { price: '20', ticketType: 'B' }
    ])
  })

  it('resolveCompleteDayTicketTotal sums only when every day filled', () => {
    expect(resolveCompleteDayTicketTotal(
      [{ price: '10' }, { price: '20' }],
      ['2026-08-02', '2026-09-26']
    )).toBe('30')
    expect(resolveCompleteDayTicketTotal(
      [{ price: '10' }],
      ['2026-08-02', '2026-09-26']
    )).toBe('')
  })
})
