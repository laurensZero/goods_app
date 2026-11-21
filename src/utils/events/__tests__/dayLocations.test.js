import { describe, it, expect } from 'vitest'
import {
  normalizeDayLocationEntry,
  hasDayLocationOverride,
  getDayLocationList,
  normalizeDayLocationList
} from '../dayLocations'

const TWO_DAYS = ['2026-05-01', '2026-05-02']
const THREE_DAYS = ['2026-05-01', '2026-05-02', '2026-05-03']

describe('normalizeDayLocationEntry', () => {
  it('trims fields and keeps entries with location or city', () => {
    expect(normalizeDayLocationEntry({ location: ' 场馆A ', city: ' 上海市 ', latitude: ' 31.2 ', longitude: ' 121.4 ' })).toEqual({
      location: '场馆A',
      city: '上海市',
      latitude: '31.2',
      longitude: '121.4'
    })
    expect(normalizeDayLocationEntry({ city: '上海市' })).toEqual({
      location: '',
      city: '上海市',
      latitude: '',
      longitude: ''
    })
  })

  it('returns null for empty, coords-only or invalid rows', () => {
    expect(normalizeDayLocationEntry(null)).toBeNull()
    expect(normalizeDayLocationEntry({})).toBeNull()
    expect(normalizeDayLocationEntry({ location: '', city: '' })).toBeNull()
    // 只有坐标没有地点文本的条目不参与回落判定，直接丢弃
    expect(normalizeDayLocationEntry({ latitude: '31.2', longitude: '121.4' })).toBeNull()
    expect(normalizeDayLocationEntry('text')).toBeNull()
  })
})

describe('hasDayLocationOverride', () => {
  it('detects location or city presence', () => {
    expect(hasDayLocationOverride({ location: '场馆A', city: '' })).toBe(true)
    expect(hasDayLocationOverride({ location: '', city: '上海市' })).toBe(true)
    expect(hasDayLocationOverride({ location: '', city: '', latitude: '31', longitude: '121' })).toBe(false)
    expect(hasDayLocationOverride(null)).toBe(false)
  })
})

describe('getDayLocationList', () => {
  it('reads the dayLocations array off an event object', () => {
    const evt = { dayLocations: [{ location: 'A' }, null] }
    expect(getDayLocationList(evt)).toEqual([{ location: 'A' }, null])
    expect(getDayLocationList({})).toEqual([])
    expect(getDayLocationList(null)).toEqual([])
  })

  it('parses a JSON string column and rejects dirty data', () => {
    expect(getDayLocationList({ dayLocations: JSON.stringify([{ location: 'A' }]) })).toEqual([{ location: 'A' }])
    expect(getDayLocationList({ dayLocations: 'not-json' })).toEqual([])
    expect(getDayLocationList({ dayLocations: '  ' })).toEqual([])
    expect(getDayLocationList([{ location: 'A' }])).toEqual([{ location: 'A' }])
  })
})

describe('normalizeDayLocationList', () => {
  it('returns [] for single-day or undated events', () => {
    expect(normalizeDayLocationList([{ location: 'A' }], ['2026-05-01'])).toEqual([])
    expect(normalizeDayLocationList([{ location: 'A' }], [])).toEqual([])
    expect(normalizeDayLocationList('not-array', TWO_DAYS)).toEqual([])
  })

  it('aligns entries to dates index and trims fields', () => {
    const list = normalizeDayLocationList([
      { location: ' 场馆A ' },
      { city: '上海市', latitude: '31.2', longitude: '121.4' }
    ], TWO_DAYS)
    expect(list).toEqual([
      { location: '场馆A', city: '', latitude: '', longitude: '' },
      { location: '', city: '上海市', latitude: '31.2', longitude: '121.4' }
    ])
  })

  it('keeps mid-list empty slots as null but trims trailing ones', () => {
    const list = normalizeDayLocationList([
      { location: '场馆A' },
      null,
      { location: '场馆C' },
      null,
      {}
    ], THREE_DAYS)
    expect(list).toEqual([
      { location: '场馆A', city: '', latitude: '', longitude: '' },
      null,
      { location: '场馆C', city: '', latitude: '', longitude: '' }
    ])
  })

  it('truncates to the day count', () => {
    const list = normalizeDayLocationList([
      { location: 'A' },
      { location: 'B' },
      { location: 'C' }
    ], TWO_DAYS)
    expect(list).toHaveLength(2)
    expect(list[1].location).toBe('B')
  })

  it('accepts a JSON string of dates', () => {
    expect(normalizeDayLocationList([{ location: 'A' }, { location: 'B' }], JSON.stringify(TWO_DAYS))).toHaveLength(2)
    expect(normalizeDayLocationList([{ location: 'A' }], 'not-json')).toEqual([])
  })

  it('drops the whole list when no entry carries a venue', () => {
    expect(normalizeDayLocationList([{}, null], TWO_DAYS)).toEqual([])
  })
})
