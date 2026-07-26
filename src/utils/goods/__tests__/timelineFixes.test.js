import { describe, it, expect } from 'vitest'
import {
  applyAcquiredAtToTimeline,
  bootstrapAcquisitionStatus,
  ensureInitialTimeline,
  computeEditedTimeline,
  timelineSnapshotDiffers,
  syncUnitAcquiredTimeline,
  getHoldingDaysFromDate
} from '../statusTimeline'

function localToday() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

describe('bootstrapAcquisitionStatus', () => {
  it('keeps acquisition statuses, falls back to owned for sale statuses', () => {
    expect(bootstrapAcquisitionStatus('待发货')).toBe('待发货')
    expect(bootstrapAcquisitionStatus('已拥有')).toBe('已拥有')
    expect(bootstrapAcquisitionStatus('已出')).toBe('已拥有')
    expect(bootstrapAcquisitionStatus('在售')).toBe('已拥有')
    expect(bootstrapAcquisitionStatus('')).toBe('已拥有')
  })
})

describe('applyAcquiredAtToTimeline', () => {
  it('never touches sale entries when acquiredAt changes (H3)', () => {
    const timeline = [
      { status: '已拥有', at: '2026-01-01' },
      { status: '已出', at: '2026-06-01', price: '150', platform: '闲鱼' }
    ]
    const result = applyAcquiredAtToTimeline(timeline, '2026-01-01', '2026-02-01')
    expect(result).toContainEqual({ status: '已出', at: '2026-06-01', price: '150', platform: '闲鱼' })
    expect(result).toContainEqual({ status: '已拥有', at: '2026-02-01' })
  })

  it('updates the acquisition entry sitting at the old acquiredAt (e.g. 待发货)', () => {
    const timeline = [{ status: '待发货', at: '2026-01-01' }]
    const result = applyAcquiredAtToTimeline(timeline, '2026-01-01', '2026-03-01')
    expect(result).toEqual([{ status: '待发货', at: '2026-03-01' }])
  })

  it('does not fall back to unit entries', () => {
    const timeline = [{ status: '已拥有', at: '2026-01-05', unitIndex: 0 }]
    const result = applyAcquiredAtToTimeline(timeline, '2026-01-01', '2026-02-01')
    expect(result).toEqual([{ status: '已拥有', at: '2026-01-05', unitIndex: 0 }])
  })

  it('is a no-op when date unchanged or timeline empty', () => {
    expect(applyAcquiredAtToTimeline([], '2026-01-01', '2026-02-01')).toEqual([])
    const timeline = [{ status: '已拥有', at: '2026-01-01' }]
    expect(applyAcquiredAtToTimeline(timeline, '2026-01-01', '2026-01-01')).toEqual(timeline)
  })
})

describe('ensureInitialTimeline', () => {
  it('bootstraps non-wishlist items without timeline', () => {
    const item = { isWishlist: false, collectStatus: '已拥有', acquiredAt: '2026-05-01', statusTimeline: [] }
    expect(ensureInitialTimeline(item).statusTimeline).toEqual([{ status: '已拥有', at: '2026-05-01' }])
  })

  it('uses acquisition-safe status for sold items', () => {
    const item = { isWishlist: false, collectStatus: '已出', acquiredAt: '2026-05-01', statusTimeline: [] }
    expect(ensureInitialTimeline(item).statusTimeline).toEqual([{ status: '已拥有', at: '2026-05-01' }])
  })

  it('falls back to today for invalid acquiredAt', () => {
    const item = { isWishlist: false, collectStatus: '已拥有', acquiredAt: '2023-05', statusTimeline: [] }
    expect(ensureInitialTimeline(item).statusTimeline).toEqual([{ status: '已拥有', at: localToday() }])
  })

  it('leaves wishlist items and existing timelines untouched', () => {
    const wish = { isWishlist: true, statusTimeline: [] }
    expect(ensureInitialTimeline(wish)).toBe(wish)
    const existing = { isWishlist: false, statusTimeline: [{ status: '已拥有', at: '2026-01-01' }] }
    expect(ensureInitialTimeline(existing)).toBe(existing)
  })
})

describe('syncUnitAcquiredTimeline summary retention (M4)', () => {
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
})

describe('timelineSnapshotDiffers', () => {
  it('detects note-only and fee-only edits (M5)', () => {
    const a = [{ status: '已拥有', at: '2026-01-01' }]
    expect(timelineSnapshotDiffers(a, [{ status: '已拥有', at: '2026-01-01', note: 'x' }])).toBe(true)
    expect(timelineSnapshotDiffers(
      [{ status: '已出', at: '2026-06-01', price: '100', fee: '5' }],
      [{ status: '已出', at: '2026-06-01', price: '100' }]
    )).toBe(true)
    expect(timelineSnapshotDiffers(a, [{ status: '已拥有', at: '2026-01-01' }])).toBe(false)
  })
})

describe('computeEditedTimeline', () => {
  const base = {
    quantity: 1,
    oldStatus: '待发货',
    newStatus: '待发货',
    oldAcquiredAt: '2026-01-01',
    newAcquiredAt: '2026-01-01',
    isWishlistToCollection: false
  }

  it('qty=1 no-op edit leaves timeline byte-identical (H1)', () => {
    const timeline = [{ status: '待发货', at: '2026-01-01', note: '首发预订' }]
    const result = computeEditedTimeline({
      ...base,
      formTimeline: timeline,
      originalTimeline: timeline
    })
    expect(result).toEqual(timeline)
  })

  it('qty>=2 unit status change writes per-unit entry without duplicate summary (H2)', () => {
    const timeline = [{ status: '已拥有', at: '2026-01-01' }]
    const result = computeEditedTimeline({
      ...base,
      quantity: 3,
      oldStatus: '已拥有',
      newStatus: '已出',
      formTimeline: timeline,
      originalTimeline: timeline,
      oldUnitDates: ['2026-01-01', '2026-01-01', '2026-01-01'],
      newUnitDates: ['2026-01-01', '2026-01-01', '2026-01-01'],
      oldUnitStatuses: ['已拥有', '已拥有', '已拥有'],
      newUnitStatuses: ['已出', '已拥有', '已拥有']
    })
    const unitEntries = result.filter((e) => e.unitIndex === 0 && e.status === '已出')
    expect(unitEntries).toHaveLength(1)
    // 逐件变更已记录,不再追加汇总「已出」条目
    expect(result.filter((e) => e.unitIndex == null && e.status === '已出')).toHaveLength(0)
  })

  it('acquiredAt edit on a sold item keeps the sale entry intact (H3)', () => {
    const timeline = [
      { status: '已拥有', at: '2026-01-01' },
      { status: '已出', at: '2026-06-01', price: '150', fee: '5' }
    ]
    const result = computeEditedTimeline({
      ...base,
      oldStatus: '已出',
      newStatus: '已出',
      newAcquiredAt: '2026-02-01',
      formTimeline: timeline,
      originalTimeline: timeline
    })
    expect(result).toContainEqual({ status: '已出', at: '2026-06-01', price: '150', fee: '5' })
    expect(result).toContainEqual({ status: '已拥有', at: '2026-02-01' })
  })

  it('wishlist-to-collection appends instead of overwriting history (M3)', () => {
    const timeline = [{ status: '已出', at: '2025-06-01', price: '99' }]
    const result = computeEditedTimeline({
      ...base,
      oldStatus: '已拥有',
      newStatus: '已拥有',
      newAcquiredAt: '2026-02-01',
      isWishlistToCollection: true,
      formTimeline: timeline,
      originalTimeline: timeline
    })
    expect(result).toContainEqual({ status: '已出', at: '2025-06-01', price: '99' })
    expect(result).toContainEqual({ status: '已拥有', at: '2026-02-01' })
  })

  it('fully respects a user-edited timeline', () => {
    const original = [{ status: '已拥有', at: '2026-01-01' }]
    const edited = [{ status: '已拥有', at: '2026-01-01', note: '用户手动补的' }]
    const result = computeEditedTimeline({
      ...base,
      oldStatus: '已拥有',
      newStatus: '已出',
      formTimeline: edited,
      originalTimeline: original
    })
    expect(result).toEqual(edited)
  })

  it('bootstraps empty timeline with acquisition-safe status', () => {
    const result = computeEditedTimeline({
      ...base,
      oldStatus: '已出',
      newStatus: '已出',
      formTimeline: [],
      originalTimeline: []
    })
    expect(result).toEqual([{ status: '已拥有', at: '2026-01-01' }])
  })
})

describe('getHoldingDaysFromDate local timezone', () => {
  it('returns 0 for today regardless of local time (was null before 08:00 UTC+8)', () => {
    expect(getHoldingDaysFromDate(localToday())).toBe(0)
  })
})
