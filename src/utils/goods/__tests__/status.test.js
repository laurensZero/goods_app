import { beforeAll, describe, it, expect } from 'vitest'
import i18n from '@/locales'
import {
  formatPendingStatusSummary,
  formatCollectStatusSummary,
  resolvePrimaryCollectStatus,
  countCollectStatusCopies,
  resolveQtyBadgeText
} from '../status'

beforeAll(() => {
  i18n.global.locale.value = 'zh-CN'
})

describe('formatPendingStatusSummary', () => {
  it('shows pending unit counts when only part of the copies are pending', () => {
    const item = {
      quantity: 14,
      unitCollectStatusList: [...Array(11).fill('已拥有'), ...Array(3).fill('待发货')]
    }
    expect(formatPendingStatusSummary(item)).toBe('待发货×3')
  })

  it('keeps the plain status label when every unit shares one pending status', () => {
    const item = {
      quantity: 14,
      unitCollectStatusList: Array(14).fill('待发货')
    }
    expect(formatPendingStatusSummary(item)).toBe('待发货')
  })

  it('uses short labels when several pending statuses are mixed in', () => {
    const item = {
      unitCollectStatusList: ['已拥有', '待发货', '待发货', '待补款']
    }
    expect(formatPendingStatusSummary(item)).toBe('待发×2 / 补款')
  })

  it('returns empty when nothing is pending', () => {
    expect(formatPendingStatusSummary({ collectStatus: '已拥有' })).toBe('')
  })

  it('falls back to collectStatus when no unit list exists', () => {
    expect(formatPendingStatusSummary({ collectStatus: '待发货' })).toBe('待发货')
  })
})

describe('partial pending vs primary status', () => {
  it('primary status stays 已拥有 while the pending summary exposes the units in transit', () => {
    const item = {
      quantity: 14,
      unitCollectStatusList: [...Array(11).fill('已拥有'), ...Array(3).fill('待发货')]
    }
    expect(resolvePrimaryCollectStatus(item)).toBe('已拥有')
    expect(formatCollectStatusSummary(item)).toBe('已拥有×11 / 待发货×3')
    expect(formatPendingStatusSummary(item)).toBe('待发货×3')
  })
})

describe('countCollectStatusCopies', () => {
  it('counts only the units matching the selected statuses', () => {
    const item = { quantity: 2, unitCollectStatusList: ['已拥有', '待发货'] }
    expect(countCollectStatusCopies(item, ['待发货'])).toBe(1)
    expect(countCollectStatusCopies(item, ['已拥有'])).toBe(1)
    expect(countCollectStatusCopies(item, ['待补款'])).toBe(0)
    expect(countCollectStatusCopies(item, ['待发货', '已拥有'])).toBe(2)
  })

  it('counts every copy when the item relies on its item-level status', () => {
    expect(countCollectStatusCopies({ quantity: 3, collectStatus: '待发货' }, ['待发货'])).toBe(3)
    expect(countCollectStatusCopies({ quantity: 3, collectStatus: '已拥有' }, ['待发货'])).toBe(0)
  })

  it('never exceeds the item quantity even with a stale unit list', () => {
    expect(countCollectStatusCopies({ quantity: 2, unitCollectStatusList: ['待发货', '待发货', '待发货'] }, ['待发货'])).toBe(2)
  })

  it('returns 0 for an empty status selection', () => {
    expect(countCollectStatusCopies({ quantity: 2, unitCollectStatusList: ['待发货', '待发货'] }, [])).toBe(0)
  })
})

describe('resolveQtyBadgeText', () => {
  const item = { quantity: 2, collectStatus: '已拥有', unitCollectStatusList: ['已拥有', '待发货'] }

  it('shows total quantity when no status filter is active', () => {
    expect(resolveQtyBadgeText(item, [])).toBe('×2')
    expect(resolveQtyBadgeText(item, null)).toBe('×2')
  })

  it('shows the matched copy count under a status filter', () => {
    const busy = { quantity: 3, collectStatus: '待发货', unitCollectStatusList: ['待发货', '待发货', '已拥有'] }
    expect(resolveQtyBadgeText(busy, ['待发货'])).toBe('×2')
  })

  it('hides the badge when only one copy matches the filter', () => {
    expect(resolveQtyBadgeText(item, ['待发货'])).toBe('')
    expect(resolveQtyBadgeText(item, ['已拥有'])).toBe('')
  })

  it('hides the badge for single-copy items', () => {
    expect(resolveQtyBadgeText({ quantity: 1, collectStatus: '待发货' }, ['待发货'])).toBe('')
    expect(resolveQtyBadgeText({ quantity: 1, collectStatus: '待发货' }, [])).toBe('')
  })

  it('hides the badge when no copy matches the filter', () => {
    expect(resolveQtyBadgeText(item, ['待补款'])).toBe('')
  })
})
