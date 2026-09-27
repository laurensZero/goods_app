import { describe, it, expect } from 'vitest'
import {
  MAX_DAY_TICKETS,
  parseDayCount,
  getDayDate,
  normalizeDayTicketPrice,
  normalizeDayTicketList,
  resolveCompleteDayTicketTotal
} from '../dayTickets'

describe('parseDayCount', () => {
  it('returns 0 for empty or invalid dates', () => {
    expect(parseDayCount([])).toBe(0)
    expect(parseDayCount(['bad'])).toBe(0)
  })

  it('counts dates list length', () => {
    expect(parseDayCount(['2026-05-01'])).toBe(1)
    expect(parseDayCount(['2026-05-01', '2026-09-26'])).toBe(2)
  })

  it('caps at MAX_DAY_TICKETS', () => {
    const many = Array.from({ length: 40 }, (_, i) => `2026-01-${String(i + 1).padStart(2, '0')}`)
    expect(parseDayCount(many)).toBe(MAX_DAY_TICKETS)
  })
})

describe('getDayDate', () => {
  it('returns the date at the given zero-based index', () => {
    expect(getDayDate(['2026-05-01', '2026-09-26'], 0)).toBe('2026-05-01')
    expect(getDayDate(['2026-05-01', '2026-09-26'], 1)).toBe('2026-09-26')
    expect(getDayDate(['2026-05-01'], 2)).toBe('')
  })
})

describe('normalizeDayTicketPrice', () => {
  it('rounds to 2 decimals', () => {
    expect(normalizeDayTicketPrice('12.345')).toBe('12.35')
    expect(normalizeDayTicketPrice('80')).toBe('80')
  })

  it('rejects negative or non-numeric values', () => {
    expect(normalizeDayTicketPrice('-1')).toBe('')
    expect(normalizeDayTicketPrice('abc')).toBe('')
  })

  it('keeps empty values empty', () => {
    expect(normalizeDayTicketPrice('')).toBe('')
    expect(normalizeDayTicketPrice(null)).toBe('')
  })
})

describe('normalizeDayTicketList', () => {
  it('returns empty list for single-day events', () => {
    expect(normalizeDayTicketList([{ price: '80', ticketType: '' }], ['2026-05-01'])).toEqual([])
    expect(normalizeDayTicketList([], [])).toEqual([])
  })

  it('keeps price and ticketType, trims strings', () => {
    const list = normalizeDayTicketList(
      [{ price: ' 80 ', ticketType: ' 早鸟票 ' }, { price: '', ticketType: 'VIP' }],
      ['2026-05-01', '2026-05-02']
    )
    expect(list).toEqual([
      { price: '80', ticketType: '早鸟票' },
      { price: '', ticketType: 'VIP' }
    ])
  })

  it('truncates to day count and prunes trailing empty entries', () => {
    const list = normalizeDayTicketList(
      [{ price: '80', ticketType: '' }, { price: '120', ticketType: '' }, { price: '', ticketType: '' }],
      ['2026-05-01', '2026-05-02']
    )
    expect(list).toEqual([{ price: '80', ticketType: '' }, { price: '120', ticketType: '' }])
  })

  it('drops invalid rows and keeps index alignment', () => {
    const list = normalizeDayTicketList(
      [null, { price: '-5', ticketType: '' }, { price: '60', ticketType: '' }],
      ['2026-05-01', '2026-05-02', '2026-05-03']
    )
    expect(list).toEqual([null, null, { price: '60', ticketType: '' }])
  })
})

describe('resolveCompleteDayTicketTotal', () => {
  it('sums all days only when every price is filled', () => {
    expect(resolveCompleteDayTicketTotal(
      [{ price: '80', ticketType: '' }, { price: '120.5', ticketType: 'VIP' }],
      ['2026-05-01', '2026-05-02']
    )).toBe('200.5')
  })

  it('returns empty when a day lacks a price', () => {
    expect(resolveCompleteDayTicketTotal(
      [{ price: '80', ticketType: '' }, { price: '', ticketType: 'VIP' }],
      ['2026-05-01', '2026-05-02']
    )).toBe('')
  })

  it('returns empty for single-day events', () => {
    expect(resolveCompleteDayTicketTotal([{ price: '80', ticketType: '' }], ['2026-05-01'])).toBe('')
  })
})
