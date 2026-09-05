import { beforeAll, describe, it, expect } from 'vitest'
import i18n from '@/locales'
import {
  formatPendingStatusSummary,
  formatCollectStatusSummary,
  resolvePrimaryCollectStatus
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
