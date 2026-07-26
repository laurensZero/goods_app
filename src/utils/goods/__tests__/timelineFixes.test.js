import { describe, it, expect } from 'vitest'
import {
  applyAcquiredAtToTimeline,
  bootstrapAcquisitionStatus,
  ensureInitialTimeline,
  computeEditedTimeline,
  timelineSnapshotDiffers,
  getHoldingDaysFromDate
} from '../statusTimeline'

function localToday() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

describe('bootstrapAcquisitionStatus', () => {
  it('keeps acquisition statuses, falls back to owned for sale statuses', () => {
    expect(bootstrapAcquisitionStatus('待发货')).toBe('待发货')
    expect(bootstrapAcquisitionStatus('已出')).toBe('已拥有')
    expect(bootstrapAcquisitionStatus('')).toBe('已拥有')
  })
})

describe('applyAcquiredAtToTimeline', () => {
  it('never touches sale entries when acquiredAt changes (H3)', () => {
    const timeline = [
      { status: '已拥有', at: '2026-01-01' },
      { status: '已出', at: '2026-06-01' }
    ]
    const result = applyAcquiredAtToTimeline(timeline, '2026-01-01', '2026-02-01')
    expect(result).toContainEqual({ status: '已出', at: '2026-06-01' })
    expect(result).toContainEqual({ status: '已拥有', at: '2026-02-01' })
  })

  it('updates the acquisition entry sitting at the old acquiredAt (e.g. 待发货)', () => {
    const result = applyAcquiredAtToTimeline([{ status: '待发货', at: '2026-01-01' }], '2026-01-01', '2026-03-01')
    expect(result).toEqual([{ status: '待发货', at: '2026-03-01' }])
  })

  it('does not fall back to unit entries', () => {
    const timeline = [{ status: '已拥有', at: '2026-01-05', unitIndex: 0 }]
    expect(applyAcquiredAtToTimeline(timeline, '2026-01-01', '2026-02-01')).toEqual(timeline)
  })
})

describe('ensureInitialTimeline', () => {
  it('bootstraps non-wishlist items with acquisition-safe status', () => {
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

describe('timelineSnapshotDiffers', () => {
  it('detects note-only edits', () => {
    const a = [{ status: '已拥有', at: '2026-01-01' }]
    expect(timelineSnapshotDiffers(a, [{ status: '已拥有', at: '2026-01-01', note: 'x' }])).toBe(true)
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
    const result = computeEditedTimeline({ ...base, formTimeline: timeline, originalTimeline: timeline })
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
    expect(result.filter((e) => e.unitIndex === 0 && e.status === '已出')).toHaveLength(1)
    expect(result.filter((e) => e.unitIndex == null && e.status === '已出')).toHaveLength(0)
  })

  it('acquiredAt edit on a sold item keeps the sale entry intact (H3)', () => {
    const timeline = [
      { status: '已拥有', at: '2026-01-01' },
      { status: '已出', at: '2026-06-01' }
    ]
    const result = computeEditedTimeline({
      ...base,
      oldStatus: '已出',
      newStatus: '已出',
      newAcquiredAt: '2026-02-01',
      formTimeline: timeline,
      originalTimeline: timeline
    })
    expect(result).toContainEqual({ status: '已出', at: '2026-06-01' })
    expect(result).toContainEqual({ status: '已拥有', at: '2026-02-01' })
  })

  it('wishlist-to-collection appends instead of overwriting history (M3)', () => {
    const timeline = [{ status: '已出', at: '2025-06-01' }]
    const result = computeEditedTimeline({
      ...base,
      oldStatus: '已拥有',
      newStatus: '已拥有',
      newAcquiredAt: '2026-02-01',
      isWishlistToCollection: true,
      formTimeline: timeline,
      originalTimeline: timeline
    })
    expect(result).toContainEqual({ status: '已出', at: '2025-06-01' })
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
  it('returns 0 for today regardless of local time', () => {
    expect(getHoldingDaysFromDate(localToday())).toBe(0)
  })
})

import { alignSaleTimelineDates } from '../statusTimeline'

describe('alignSaleTimelineDates', () => {
  it('updates the matching sale entry date for whole-item scope', () => {
    const timeline = [
      { status: '已拥有', at: '2026-01-01' },
      { status: '已出', at: '2026-06-01' }
    ]
    const result = alignSaleTimelineDates(timeline, { collectStatus: '已出', sellDate: '2026-06-15' })
    expect(result).toContainEqual({ status: '已出', at: '2026-06-15' })
    expect(result).toContainEqual({ status: '已拥有', at: '2026-01-01' })
  })

  it('appends an entry when none exists for the status', () => {
    const result = alignSaleTimelineDates([{ status: '已拥有', at: '2026-01-01' }], { collectStatus: '在售', sellDate: '2026-07-01' })
    expect(result).toContainEqual({ status: '在售', at: '2026-07-01' })
  })

  it('aligns per-unit entries by unitSaleInfoList dates', () => {
    const timeline = [{ status: '已出', at: '2026-06-01', unitIndex: 0 }]
    const result = alignSaleTimelineDates(timeline, {
      unitStatuses: ['已出', '已拥有'],
      unitSaleInfoList: [{ date: '2026-06-20' }, null]
    })
    expect(result).toContainEqual({ status: '已出', at: '2026-06-20', unitIndex: 0 })
  })

  it('is a no-op when dates already match or status is not sale-like', () => {
    const timeline = [{ status: '已出', at: '2026-06-01' }]
    expect(alignSaleTimelineDates(timeline, { collectStatus: '已出', sellDate: '2026-06-01' })).toBe(timeline)
    expect(alignSaleTimelineDates(timeline, { collectStatus: '已拥有', sellDate: '2026-06-15' })).toBe(timeline)
  })
})
