import { describe, it, expect } from 'vitest'
import {
  appendStatusTimelineEntry,
  syncUnitAcquiredTimeline
} from '../statusTimeline'

describe('appendStatusTimelineEntry', () => {
  it('appends entry with sale fields', () => {
    const result = appendStatusTimelineEntry([], '已出', {
      at: '2026-07-20',
      price: '120',
      platform: '闲鱼',
      fee: '5',
      note: '含运费'
    })
    expect(result).toEqual([
      { status: '已出', at: '2026-07-20', note: '含运费', price: '120', platform: '闲鱼', fee: '5' }
    ])
  })

  it('omits empty sale fields', () => {
    const result = appendStatusTimelineEntry([], '想出', { at: '2026-07-20', price: '', platform: '', fee: '' })
    expect(result).toEqual([{ status: '想出', at: '2026-07-20' }])
  })

  it('trims sale field values', () => {
    const [entry] = appendStatusTimelineEntry([], '在售', { at: '2026-07-20', price: ' 88 ', platform: ' 千岛 ' })
    expect(entry.price).toBe('88')
    expect(entry.platform).toBe('千岛')
  })

  it('supports unitIndex together with sale fields', () => {
    const [entry] = appendStatusTimelineEntry([], '已出', { at: '2026-07-20', unitIndex: 2, price: '60' })
    expect(entry.unitIndex).toBe(2)
    expect(entry.price).toBe('60')
  })
})

describe('syncUnitAcquiredTimeline', () => {
  it('keeps other-status entries of the same unit when acquired date changes', () => {
    const timeline = [
      { status: '已拥有', at: '2026-01-01', unitIndex: 0 },
      { status: '已出', at: '2026-06-01', unitIndex: 0, price: '120', platform: '闲鱼' }
    ]
    const result = syncUnitAcquiredTimeline(
      timeline,
      ['2026-01-01'],
      ['2026-02-01'],
      ['已拥有']
    )
    expect(result).toContainEqual({ status: '已出', at: '2026-06-01', unitIndex: 0, price: '120', platform: '闲鱼' })
    expect(result).toContainEqual({ status: '已拥有', at: '2026-02-01', unitIndex: 0 })
    expect(result.filter((e) => e.status === '已拥有' && e.unitIndex === 0)).toHaveLength(1)
  })

  it('still replaces same-status entry of the same unit', () => {
    const timeline = [{ status: '已拥有', at: '2026-01-01', unitIndex: 1 }]
    const result = syncUnitAcquiredTimeline(
      timeline,
      ['', '2026-01-01'],
      ['', '2026-03-01'],
      ['已拥有', '已拥有']
    )
    expect(result).toEqual([{ status: '已拥有', at: '2026-03-01', unitIndex: 1 }])
  })

  it('still removes non-unit summary entries with same status', () => {
    const timeline = [{ status: '已拥有', at: '2026-01-01' }]
    const result = syncUnitAcquiredTimeline(
      timeline,
      ['2026-01-01'],
      ['2026-02-15'],
      ['已拥有']
    )
    expect(result).toEqual([{ status: '已拥有', at: '2026-02-15', unitIndex: 0 }])
  })

  it('keeps non-unit entries of a different status', () => {
    const timeline = [
      { status: '已出', at: '2026-06-01', price: '200' }
    ]
    const result = syncUnitAcquiredTimeline(
      timeline,
      ['2026-01-01'],
      ['2026-02-01'],
      ['已拥有']
    )
    expect(result).toContainEqual({ status: '已出', at: '2026-06-01', price: '200' })
  })
})
