import { describe, it, expect } from 'vitest'
import {
  appendStatusTimelineEntry,
  syncUnitAcquiredTimeline
} from '../statusTimeline'

describe('appendStatusTimelineEntry', () => {
  it('appends a pure status entry with note and unitIndex', () => {
    const result = appendStatusTimelineEntry([], '已出', {
      at: '2026-07-20',
      note: '含运费',
      unitIndex: 2
    })
    expect(result).toEqual([
      { status: '已出', at: '2026-07-20', note: '含运费', unitIndex: 2 }
    ])
  })

  it('does not carry sale fields (money data lives in sell* columns)', () => {
    const [entry] = appendStatusTimelineEntry([], '已出', {
      at: '2026-07-20',
      price: '120',
      platform: '闲鱼',
      fee: '5'
    })
    expect(entry).toEqual({ status: '已出', at: '2026-07-20' })
  })
})

describe('syncUnitAcquiredTimeline', () => {
  it('keeps other-status entries of the same unit when acquired date changes', () => {
    const timeline = [
      { status: '已拥有', at: '2026-01-01', unitIndex: 0 },
      { status: '已出', at: '2026-06-01', unitIndex: 0 }
    ]
    const result = syncUnitAcquiredTimeline(timeline, ['2026-01-01'], ['2026-02-01'], ['已拥有'])
    expect(result).toContainEqual({ status: '已出', at: '2026-06-01', unitIndex: 0 })
    expect(result).toContainEqual({ status: '已拥有', at: '2026-02-01', unitIndex: 0 })
    expect(result.filter((e) => e.status === '已拥有' && e.unitIndex === 0)).toHaveLength(1)
  })

  it('replaces same-status entry of the same unit', () => {
    const timeline = [{ status: '已拥有', at: '2026-01-01', unitIndex: 1 }]
    const result = syncUnitAcquiredTimeline(
      timeline,
      ['', '2026-01-01'],
      ['', '2026-03-01'],
      ['已拥有', '已拥有']
    )
    expect(result).toEqual([{ status: '已拥有', at: '2026-03-01', unitIndex: 1 }])
  })

  it('keeps summary entry when only some units get per-unit entries', () => {
    const timeline = [{ status: '已拥有', at: '2024-01-01' }]
    const result = syncUnitAcquiredTimeline(
      timeline,
      ['2024-01-01', '2024-01-01', '2024-01-01'],
      ['2026-02-01', '2024-01-01', '2024-01-01'],
      ['已拥有', '已拥有', '已拥有']
    )
    expect(result).toContainEqual({ status: '已拥有', at: '2024-01-01' })
    expect(result).toContainEqual({ status: '已拥有', at: '2026-02-01', unitIndex: 0 })
  })

  it('removes summary entry once per-unit entries cover all units', () => {
    const timeline = [{ status: '已拥有', at: '2024-01-01' }]
    const result = syncUnitAcquiredTimeline(
      timeline,
      ['2024-01-01', '2024-01-01'],
      ['2026-02-01', '2026-03-01'],
      ['已拥有', '已拥有']
    )
    expect(result.filter((e) => e.unitIndex == null)).toHaveLength(0)
    expect(result).toHaveLength(2)
  })

  it('keeps non-unit entries of a different status', () => {
    const timeline = [{ status: '已出', at: '2026-06-01' }]
    const result = syncUnitAcquiredTimeline(timeline, ['2026-01-01'], ['2026-02-01'], ['已拥有'])
    expect(result).toContainEqual({ status: '已出', at: '2026-06-01' })
  })
})
