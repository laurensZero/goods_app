import { describe, it, expect } from 'vitest'
import { toSnakeCase, toCamelCase, mapRowsToCamelCase } from '../columnMapping'

describe('toSnakeCase', () => {
  it('converts known camelCase keys to snake_case', () => {
    expect(toSnakeCase({ goodsId: '1' })).toEqual({ goods_id: '1' })
    expect(toSnakeCase({ isWishlist: true })).toEqual({ is_wishlist: true })
    expect(toSnakeCase({ storageLocation: 'A' })).toEqual({ storage_location: 'A' })
    expect(toSnakeCase({ actualPrice: 100 })).toEqual({ actual_price: 100 })
    expect(toSnakeCase({ acquiredAt: '2024-01-01' })).toEqual({ acquired_at: '2024-01-01' })
    expect(toSnakeCase({ saleAt: '2026-06-18T20:00' })).toEqual({ sale_at: '2026-06-18T20:00' })
    expect(toSnakeCase({ saleReminderEnabled: true })).toEqual({ sale_reminder_enabled: true })
    expect(toSnakeCase({ saleReminderOffsets: [60, 0] })).toEqual({ sale_reminder_offsets: [60, 0] })
    expect(toSnakeCase({ coverImage: 'url' })).toEqual({ cover_image: 'url' })
    expect(toSnakeCase({ updatedAt: 123 })).toEqual({ updated_at: 123 })
    expect(toSnakeCase({ createdAt: 456 })).toEqual({ created_at: 456 })
    expect(toSnakeCase({ syncedBy: 'device' })).toEqual({ synced_by: 'device' })
  })

  it('passes through unknown keys unchanged', () => {
    expect(toSnakeCase({ name: 'test', id: '1' })).toEqual({ name: 'test', id: '1' })
  })

  it('handles empty object', () => {
    expect(toSnakeCase({})).toEqual({})
  })

  it('preserves values', () => {
    const obj = { goodsId: '123', name: 'test', isWishlist: false }
    const result = toSnakeCase(obj)
    expect(result.goods_id).toBe('123')
    expect(result.name).toBe('test')
    expect(result.is_wishlist).toBe(false)
  })
})

describe('toCamelCase', () => {
  it('converts known snake_case keys to camelCase', () => {
    expect(toCamelCase({ goods_id: '1' })).toEqual({ goodsId: '1' })
    expect(toCamelCase({ is_wishlist: true })).toEqual({ isWishlist: true })
    expect(toCamelCase({ storage_location: 'A' })).toEqual({ storageLocation: 'A' })
    expect(toCamelCase({ actual_price: 100 })).toEqual({ actualPrice: 100 })
    expect(toCamelCase({ sale_at: '2026-06-18T20:00' })).toEqual({ saleAt: '2026-06-18T20:00' })
    expect(toCamelCase({ sale_reminder_enabled: true })).toEqual({ saleReminderEnabled: true })
    expect(toCamelCase({ sale_reminder_offsets: [60, 0] })).toEqual({ saleReminderOffsets: [60, 0] })
  })

  it('passes through unknown keys unchanged', () => {
    expect(toCamelCase({ name: 'test', id: '1' })).toEqual({ name: 'test', id: '1' })
  })

  it('handles empty object', () => {
    expect(toCamelCase({})).toEqual({})
  })
})

describe('mapRowsToCamelCase', () => {
  it('converts array of objects', () => {
    const rows = [
      { goods_id: '1', name: 'A' },
      { goods_id: '2', name: 'B' }
    ]
    const result = mapRowsToCamelCase(rows)
    expect(result).toEqual([
      { goodsId: '1', name: 'A' },
      { goodsId: '2', name: 'B' }
    ])
  })

  it('handles empty array', () => {
    expect(mapRowsToCamelCase([])).toEqual([])
  })
})

describe('round-trip conversion', () => {
  it('preserves known keys through camelCase -> snake_case -> camelCase', () => {
    const original = {
      goodsId: '1',
      isWishlist: true,
      storageLocation: 'A / B',
      actualPrice: 99.5,
      acquiredAt: '2024-01-01',
      saleAt: '2026-06-18T20:00',
      saleReminderEnabled: true,
      saleReminderOffsets: [60, 0],
      coverImage: 'url',
      updatedAt: 123,
      createdAt: 456,
      syncedBy: 'device',
      name: 'test'
    }
    const result = toCamelCase(toSnakeCase(original))
    expect(result).toEqual(original)
  })

  it('goods_group_items 字段转换无丢失（防止映射表键冲突导致字段合并）', () => {
    const groupItem = { goodsId: '1', groupId: 'g', sortOrder: 0 }
    const snake = toSnakeCase(groupItem)
    // 三个键必须各自独立映射，不能因重复键被吞掉
    expect(Object.keys(snake).sort()).toEqual(['goods_id', 'group_id', 'sort_order'])
    expect(snake).toEqual({ goods_id: '1', group_id: 'g', sort_order: 0 })
    expect(toCamelCase(snake)).toEqual(groupItem)
  })
})
