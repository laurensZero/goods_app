import { describe, it, expect } from 'vitest'
import {
  appendStatusTimelineEntry,
  syncUnitAcquiredTimeline,
  syncUnitStatusTimeline,
  groupTimelineEntriesByUnit,
  buildTimelineUnitSections,
  makeUnitScopeFields,
  getEntryUnitIndexes,
  getTimelineStartDate,
  buildAcquisitionTimelineEntries,
  ensureInitialTimeline,
  maintainTimelineOnGoodsUpdate,
  alignSaleTimelineDates
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

describe('groupTimelineEntriesByUnit', () => {
  it('returns flat signal when no unit-scoped entries exist', () => {
    const result = groupTimelineEntriesByUnit([
      { status: '已拥有', at: '2026-01-01' },
      { status: '在售', at: '2026-06-01' }
    ])
    expect(result.hasUnitEntries).toBe(false)
    expect(result.unitGroups).toEqual([])
    expect(result.globalEntries).toHaveLength(2)
  })

  it('groups unit entries by unitIndex and keeps global entries separate', () => {
    const result = groupTimelineEntriesByUnit([
      { status: '已拥有', at: '2026-01-01' },
      { status: '已拥有', at: '2026-01-02', unitIndex: 1 },
      { status: '已出', at: '2026-06-01', unitIndex: 0 },
      { status: '已拥有', at: '2026-01-03', unitIndex: 0 }
    ])
    expect(result.hasUnitEntries).toBe(true)
    expect(result.globalEntries).toEqual([{ status: '已拥有', at: '2026-01-01' }])
    expect(result.unitGroups).toEqual([
      {
        unitIndex: 0,
        entries: [
          { status: '已出', at: '2026-06-01', unitIndex: 0 },
          { status: '已拥有', at: '2026-01-03', unitIndex: 0 }
        ]
      },
      {
        unitIndex: 1,
        entries: [{ status: '已拥有', at: '2026-01-02', unitIndex: 1 }]
      }
    ])
  })

  it('sorts unit groups by unitIndex ascending even when input order differs', () => {
    const result = groupTimelineEntriesByUnit([
      { status: '已拥有', at: '2026-01-01', unitIndex: 2 },
      { status: '已拥有', at: '2026-01-02', unitIndex: 0 }
    ])
    expect(result.unitGroups.map((g) => g.unitIndex)).toEqual([0, 2])
  })

  it('ignores invalid entries', () => {
    const result = groupTimelineEntriesByUnit([
      null,
      'bad',
      { status: '已拥有', at: '2026-01-01', unitIndex: 0 }
    ])
    expect(result.unitGroups).toHaveLength(1)
    expect(result.unitGroups[0].entries).toHaveLength(1)
    expect(result.globalEntries).toHaveLength(0)
  })

  it('expands multi-unit entries into every covered unit group', () => {
    const batch = { status: '已拥有', at: '2026-01-01', unitIndexes: [0, 1, 2] }
    const result = groupTimelineEntriesByUnit([batch])
    expect(result.unitGroups.map((g) => g.unitIndex)).toEqual([0, 1, 2])
    for (const group of result.unitGroups) {
      expect(group.entries).toEqual([batch])
    }
  })
})

describe('makeUnitScopeFields / getEntryUnitIndexes', () => {
  it('canonicalizes 0 / 1 / N units', () => {
    expect(makeUnitScopeFields([])).toEqual({})
    expect(makeUnitScopeFields([3])).toEqual({ unitIndex: 3 })
    expect(makeUnitScopeFields([2, 0, 1, 1])).toEqual({ unitIndexes: [0, 1, 2] })
  })

  it('reads legacy unitIndex and multi unitIndexes the same way', () => {
    expect(getEntryUnitIndexes({ unitIndex: 2 })).toEqual([2])
    expect(getEntryUnitIndexes({ unitIndexes: [2, 0] })).toEqual([0, 2])
    expect(getEntryUnitIndexes({ status: '已拥有', at: '2026-01-01' })).toBeNull()
  })
})

describe('buildTimelineUnitSections (相邻同轨迹自动合并为区间)', () => {
  it('returns null when no unit-scoped entries exist', () => {
    expect(buildTimelineUnitSections([{ status: '已拥有', at: '2026-01-01' }])).toBeNull()
  })

  it('merges consecutive units sharing the same batch entry into one range section', () => {
    const batch = { status: '已拥有', at: '2026-01-01', unitIndexes: [0, 1, 2, 3] }
    const sold = { status: '已出', at: '2026-06-01', unitIndex: 0 }
    const sections = buildTimelineUnitSections([batch, sold])

    // 第0件有额外「已出」→ 单独一节;1-3 轨迹相同且连续 → 合并为 1-3
    expect(sections).toHaveLength(2)
    expect(sections[0]).toMatchObject({ unitStart: 0, unitEnd: 0 })
    expect(sections[0].entries).toEqual([sold, batch])
    expect(sections[1]).toMatchObject({ unitStart: 1, unitEnd: 3 })
    expect(sections[1].entries).toEqual([batch])
  })

  it('does not merge across a diverged unit even when outer units match', () => {
    const batch = { status: '已拥有', at: '2026-01-01', unitIndexes: [0, 1, 2] }
    const lost = { status: '丢失', at: '2026-03-01', unitIndex: 1 }
    const sections = buildTimelineUnitSections([batch, lost])
    expect(sections.map((s) => [s.unitStart, s.unitEnd])).toEqual([[0, 0], [1, 1], [2, 2]])
  })

  it('puts global entries in a leading whole-lot section', () => {
    const global = { status: '在售', at: '2026-07-01' }
    const batch = { status: '已拥有', at: '2026-01-01', unitIndexes: [0, 1] }
    const sections = buildTimelineUnitSections([batch, global])
    expect(sections[0]).toMatchObject({ unitStart: null, unitEnd: null })
    expect(sections[1]).toMatchObject({ unitStart: 0, unitEnd: 1 })
  })
})

describe('同日归批写入', () => {
  it('syncUnitAcquiredTimeline merges same-day units into one multi-unit entry', () => {
    const result = syncUnitAcquiredTimeline(
      [],
      ['', '', ''],
      ['2026-01-01', '2026-01-01', '2026-02-01'],
      ['已拥有', '已拥有', '已拥有']
    )
    expect(result).toContainEqual({ status: '已拥有', at: '2026-01-01', unitIndexes: [0, 1] })
    expect(result).toContainEqual({ status: '已拥有', at: '2026-02-01', unitIndex: 2 })
  })

  it('syncUnitStatusTimeline merges units changed to the same status', () => {
    const result = syncUnitStatusTimeline(
      [],
      ['已拥有', '已拥有', '已拥有'],
      ['已出', '已出', '已拥有'],
      '2026-06-01'
    )
    expect(result).toEqual([{ status: '已出', at: '2026-06-01', unitIndexes: [0, 1] }])
  })

  it('syncUnitAcquiredTimeline shrinks a multi-unit old entry when one covered unit is updated', () => {
    const oldBatch = { status: '已拥有', at: '2026-01-01', unitIndexes: [0, 1, 2] }
    const result = syncUnitAcquiredTimeline(
      [oldBatch],
      ['2026-01-01', '2026-01-01', '2026-01-01'],
      ['2026-01-01', '2026-03-01', '2026-01-01'],
      ['已拥有', '已拥有', '已拥有']
    )
    expect(result).not.toContain(oldBatch)
    expect(result).toContainEqual({ status: '已拥有', at: '2026-03-01', unitIndex: 1 })
    // 未变更的 0/2 保留原日期
    expect(result).toContainEqual({ status: '已拥有', at: '2026-01-01', unitIndexes: [0, 2] })
  })
})

describe('getTimelineStartDate multi-unit scope', () => {
  it('matches a multi-unit entry for any covered unit', () => {
    const item = {
      statusTimeline: [{ status: '已拥有', at: '2026-01-05', unitIndexes: [0, 1, 2] }]
    }
    expect(getTimelineStartDate(item, '已拥有', 1)).toBe('2026-01-05')
    expect(getTimelineStartDate(item, '已拥有', 5)).toBe('')
  })
})

describe('buildAcquisitionTimelineEntries (同日归批生成购入史)', () => {
  it('one global entry when all units share the same date', () => {
    expect(buildAcquisitionTimelineEntries({
      status: '已拥有',
      unitDates: ['2026-01-01', '2026-01-01', '2026-01-01']
    })).toEqual([{ status: '已拥有', at: '2026-01-01' }])
  })

  it('batches units by same-day orders and pads leftovers to fallback', () => {
    const result = buildAcquisitionTimelineEntries({
      status: '已拥有',
      unitDates: ['2026-01-01', '2026-01-01', '2026-02-03', ''],
      fallbackDate: '2026-03-01'
    })
    expect(result).toEqual([
      { status: '已拥有', at: '2026-01-01', unitIndexes: [0, 1] },
      { status: '已拥有', at: '2026-02-03', unitIndex: 2 },
      { status: '已拥有', at: '2026-03-01' }
    ])
  })

  it('falls back to a single summary entry without valid unit dates', () => {
    expect(buildAcquisitionTimelineEntries({
      status: '已出',
      unitDates: ['', '2023-05'],
      fallbackDate: '2026-01-01'
    })).toEqual([{ status: '已拥有', at: '2026-01-01' }])
  })
})

describe('ensureInitialTimeline multi-unit', () => {
  it('builds same-day batches from unitAcquiredAtList', () => {
    const item = {
      isWishlist: false,
      collectStatus: '已拥有',
      quantity: 3,
      acquiredAt: '2026-01-01',
      unitAcquiredAtList: ['2026-01-01', '2026-01-01', '2026-02-01'],
      statusTimeline: []
    }
    expect(ensureInitialTimeline(item).statusTimeline).toEqual([
      { status: '已拥有', at: '2026-01-01', unitIndexes: [0, 1] },
      { status: '已拥有', at: '2026-02-01', unitIndex: 2 }
    ])
  })
})

describe('alignSaleTimelineDates 同日同状态追加归批', () => {
  it('appends one multi-unit entry for units sold on the same day', () => {
    const result = alignSaleTimelineDates([{ status: '已拥有', at: '2026-01-01' }], {
      unitStatuses: ['已出', '已出', '已拥有'],
      unitSaleInfoList: [{ date: '2026-06-01' }, { date: '2026-06-01' }, null]
    })
    expect(result).toContainEqual({ status: '已出', at: '2026-06-01', unitIndexes: [0, 1] })
    expect(result.filter((e) => e.status === '已出')).toHaveLength(1)
  })
})

describe('maintainTimelineOnGoodsUpdate (store 层自动维护)', () => {
  it('is a no-op when caller already provides statusTimeline', () => {
    const previous = { isWishlist: false, collectStatus: '已拥有', statusTimeline: [] }
    const data = { collectStatus: '已出', statusTimeline: [{ status: '已出', at: '2026-06-01' }] }
    expect(maintainTimelineOnGoodsUpdate(previous, data)).toBe(data)
  })

  it('appends a sale entry when MCP updates whole-item collectStatus + sellDate', () => {
    const previous = {
      isWishlist: false,
      collectStatus: '已拥有',
      acquiredAt: '2026-01-01',
      quantity: 1,
      statusTimeline: [{ status: '已拥有', at: '2026-01-01' }]
    }
    const result = maintainTimelineOnGoodsUpdate(previous, { collectStatus: '已出', sellDate: '2026-06-01' })
    expect(result.statusTimeline).toContainEqual({ status: '已出', at: '2026-06-01' })
  })

  it('batches multi-unit status changes into one entry', () => {
    const previous = {
      isWishlist: false,
      collectStatus: '已拥有',
      acquiredAt: '2026-01-01',
      quantity: 3,
      unitCollectStatusList: ['已拥有', '已拥有', '已拥有'],
      statusTimeline: [{ status: '已拥有', at: '2026-01-01' }]
    }
    const result = maintainTimelineOnGoodsUpdate(previous, {
      unitCollectStatusList: ['已出', '已出', '已拥有']
    })
    expect(result.statusTimeline).toContainEqual({ status: '已出', at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), unitIndexes: [0, 1] })
  })

  it('leaves unrelated field updates alone', () => {
    const previous = { isWishlist: false, collectStatus: '已拥有', statusTimeline: [{ status: '已拥有', at: '2026-01-01' }] }
    const data = { note: '换个备注' }
    expect(maintainTimelineOnGoodsUpdate(previous, data)).toBe(data)
  })
})
