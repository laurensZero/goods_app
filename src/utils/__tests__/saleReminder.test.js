import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import {
  buildSaleReminderNotifications,
  formatReminderOffset,
  formatSaleAtDisplay,
  getSaleReminderPendingNotificationIds,
  getSaleReminderNotificationId,
  normalizeSaleAt,
  normalizeSaleReminderOffsets
} from '../saleReminder'

describe('saleReminder', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-09T10:00:00+08:00'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('normalizes local datetime values', () => {
    expect(normalizeSaleAt('2026-06-18 20:00:59')).toBe('2026-06-18T20:00')
    expect(normalizeSaleAt('2026-06-18T20:00')).toBe('2026-06-18T20:00')
    expect(normalizeSaleAt('2026-6-18T20:00')).toBe('')
  })

  it('normalizes reminder offsets', () => {
    expect(normalizeSaleReminderOffsets([60, '10', 60, -1, 0, 50000])).toEqual([60, 10, 0])
    expect(normalizeSaleReminderOffsets('[1440,60,0]')).toEqual([1440, 60, 0])
  })

  it('builds stable 32-bit notification ids', () => {
    const id = getSaleReminderNotificationId('goods-1', 60)
    expect(id).toBe(getSaleReminderNotificationId('goods-1', 60))
    expect(id).toBeGreaterThanOrEqual(900000000)
    expect(id).toBeLessThan(1900000000)
  })

  it('finds pending reminder ids for one goods item', () => {
    expect(getSaleReminderPendingNotificationIds('goods-1', [
      { id: 1, extra: { type: 'sale-reminder', goodsId: 'goods-1' } },
      { id: 2, extra: '{"type":"sale-reminder","goodsId":"goods-1"}' },
      { id: 3, extra: { type: 'sale-reminder', goodsId: 'goods-2' } },
      { id: 4, extra: { type: 'other', goodsId: 'goods-1' } },
      { id: 2, extra: { type: 'sale-reminder', goodsId: 'goods-1' } }
    ])).toEqual([1, 2])
  })

  it('builds future notifications and filters past offsets', () => {
    const notifications = buildSaleReminderNotifications({
      id: 'goods-1',
      name: '测试谷子',
      isWishlist: true,
      saleAt: '2026-06-09T10:30',
      saleReminderEnabled: true,
      saleReminderOffsets: [60, 10, 0]
    })

    expect(notifications).toHaveLength(2)
    expect(notifications.map((item) => item.extra.offsetMinutes)).toEqual([10, 0])
    expect(notifications[0].extra.goodsId).toBe('goods-1')
  })

  it('formats display labels', () => {
    expect(formatSaleAtDisplay('2026-06-18T20:00')).toBe('2026-06-18 20:00')
    expect(formatReminderOffset(1440)).toBe('提前 1 天')
    expect(formatReminderOffset(60)).toBe('提前 1 小时')
    expect(formatReminderOffset(10)).toBe('提前 10 分钟')
    expect(formatReminderOffset(0)).toBe('开售时')
  })
})
