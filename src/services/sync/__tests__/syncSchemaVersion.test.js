import { describe, it, expect } from 'vitest'
import { SYNC_SCHEMA_VERSION } from '@/constants/syncConstants'
import {
  GOODS_BUSINESS_KEYS,
  RECHARGE_BUSINESS_KEYS,
  GOODS_GROUP_BUSINESS_KEYS,
  GOODS_GROUP_ITEM_BUSINESS_KEYS,
  EVENT_BUSINESS_KEYS,
  EVENT_JSON_KEYS
} from '@/services/supabaseAdapter/helpers'
import { normalizeGoodsInput } from '@/stores/goods/goodsHelpers'
import { normalizeEvent } from '@/stores/events'

/**
 * 同步字段集 ↔ SYNC_SCHEMA_VERSION 配对钉子。
 *
 * 场景：改了 *BUSINESS_KEYS / normalize 白名单，却忘了 bump SYNC_SCHEMA_VERSION。
 * 旧客户端会丢弃新字段并越过水位线，升级后增量拉取不会回填。
 *
 * 机制：
 * - FINGERPRINTS 记录「每个 schema 版本定稿时的字段指纹」
 * - 当前代码算出的指纹必须等于 FINGERPRINTS[SYNC_SCHEMA_VERSION]
 * - 改字段 → 指纹变 → 当前版本条目对不上 → 红
 *   → 只能新增 FINGERPRINTS[N+1] 并把 SYNC_SCHEMA_VERSION bump 到 N+1
 * - 只 bump 版本不登记指纹 → 条目缺失 → 红
 *
 * 历史版本（1–5）字段快照未逐一保留；从 v6 起强制登记。
 */

function buildSpecFingerprint() {
  // normalize* 空对象展开的键序即白名单声明顺序；与 BUSINESS_KEYS 比对在
  // syncColumnConsistency 里已有，这里只做「指纹」用于版本配对
  const goodsNormalizeKeys = Object.keys(normalizeGoodsInput({})).filter(
    (key) => !['coverImage', 'updatedAt', 'trashed'].includes(key)
  )
  const eventNormalizeKeys = Object.keys(normalizeEvent({})).filter(
    (key) => !['createdAt', 'updatedAt'].includes(key)
  )

  return {
    goods: [...GOODS_BUSINESS_KEYS],
    recharge: [...RECHARGE_BUSINESS_KEYS],
    goodsGroup: [...GOODS_GROUP_BUSINESS_KEYS],
    goodsGroupItem: [...GOODS_GROUP_ITEM_BUSINESS_KEYS],
    events: [...EVENT_BUSINESS_KEYS],
    eventJson: [...EVENT_JSON_KEYS],
    goodsNormalize: goodsNormalizeKeys,
    eventNormalize: eventNormalizeKeys
  }
}

// ⚠️ 只允许追加新版本条目，不要改写历史条目（历史 = 该版本发版时的字段集）
const FINGERPRINTS = {
  6: {
    goods: ['id', 'name', 'category', 'ip', 'goodsId', 'isWishlist', 'characters', 'tags', 'storageLocation', 'variant', 'price', 'actualPrice', 'acquiredAt', 'saleAt', 'saleReminderEnabled', 'saleReminderOffsets', 'unitAcquiredAtList', 'unitActualPriceList', 'unitCharacterList', 'unitCollectStatusList', 'images', 'tracks', 'note', 'quantity', 'points', 'currency', 'actualPriceCurrency', 'collectStatus', 'shippingFee', 'shippingEvents', 'sellPrice', 'sellPlatform', 'sellFee', 'sellDate', 'unitSaleInfoList', 'statusTimeline'],
    recharge: ['id', 'game', 'itemName', 'amount', 'chargedAt', 'note', 'image'],
    goodsGroup: ['id', 'name', 'type', 'summaryMode', 'totalAmount', 'currency', 'coverMode', 'coverItemId', 'displayMode', 'note', 'deleted'],
    goodsGroupItem: ['id', 'groupId', 'goodsId', 'sortOrder', 'deleted'],
    events: ['id', 'name', 'type', 'startDate', 'endDate', 'location', 'city', 'latitude', 'longitude', 'description', 'coverImage', 'coverImageData', 'photos', 'ticketPrice', 'ticketType', 'seatInfo', 'dayTicketList', 'otherExpenses', 'tracks', 'linkedGoodsIds', 'tags', 'deleted'],
    eventJson: ['photos', 'dayTicketList', 'otherExpenses', 'tracks', 'linkedGoodsIds', 'tags'],
    goodsNormalize: ['id', 'name', 'category', 'ip', 'goodsId', 'isWishlist', 'characters', 'tags', 'storageLocation', 'variant', 'price', 'actualPrice', 'points', 'acquiredAt', 'saleAt', 'saleReminderEnabled', 'saleReminderOffsets', 'unitAcquiredAtList', 'unitActualPriceList', 'unitCharacterList', 'unitCollectStatusList', 'images', 'tracks', 'note', 'quantity', 'currency', 'actualPriceCurrency', 'collectStatus', 'shippingFee', 'shippingEvents', 'sellPrice', 'sellPlatform', 'sellFee', 'sellDate', 'unitSaleInfoList', 'statusTimeline'],
    eventNormalize: ['id', 'name', 'type', 'startDate', 'endDate', 'location', 'city', 'latitude', 'longitude', 'description', 'coverImage', 'coverImageData', 'photos', 'ticketPrice', 'ticketType', 'seatInfo', 'dayTicketList', 'otherExpenses', 'tracks', 'linkedGoodsIds', 'tags', 'deleted']
  }
  // v7+: 字段变更时在此追加，例如 7: { ...buildSpecFingerprint() }
}

describe('SYNC_SCHEMA_VERSION ↔ 同步字段指纹配对', () => {
  const current = buildSpecFingerprint()

  it('SYNC_SCHEMA_VERSION 已在 FINGERPRINTS 登记（bump 后必须补条目）', () => {
    expect(FINGERPRINTS).toHaveProperty(String(SYNC_SCHEMA_VERSION))
  })

  it('当前字段指纹与 FINGERPRINTS[SYNC_SCHEMA_VERSION] 完全一致', () => {
    // 失败 = 改了同步字段但未 bump 版本，或 bump 后未更新指纹条目。
    // 正确做法：SYNC_SCHEMA_VERSION +1，并 FINGERPRINTS[新版本] = buildSpecFingerprint() 的结果
    expect(current).toEqual(FINGERPRINTS[SYNC_SCHEMA_VERSION])
  })

  it('FINGERPRINTS 最高版本号等于 SYNC_SCHEMA_VERSION（禁止改写历史、只许追加）', () => {
    const maxRegistered = Math.max(...Object.keys(FINGERPRINTS).map(Number))
    expect(maxRegistered).toBe(SYNC_SCHEMA_VERSION)
  })

  it('各表 BUSINESS_KEYS 与 normalize 白名单键集合一致（顺序可不同）', () => {
    expect([...current.goodsNormalize].sort()).toEqual([...current.goods].sort())
    expect([...current.eventNormalize].sort()).toEqual([...current.events].sort())
    for (const key of current.eventJson) {
      expect(current.events).toContain(key)
    }
  })
})

describe('v6 字段语义：收藏品待补邮/待补款复用 saleAt', () => {
  // 这是 v6 bump 的动机：旧版对非心愿单清空 sale* 字段，升级后需全量回填。
  // 钉住 normalize 行为，防止静默回退到「收藏品一律清空」而不 bump 版本。

  const reminderFields = (item) => ({
    saleAt: item.saleAt,
    saleReminderEnabled: item.saleReminderEnabled,
    saleReminderOffsets: item.saleReminderOffsets
  })

  it('收藏品待补邮保留提醒字段', () => {
    const normalized = normalizeGoodsInput({
      id: 'g1',
      isWishlist: false,
      collectStatus: '待补邮',
      saleAt: '2026-10-01T08:00',
      saleReminderEnabled: true,
      saleReminderOffsets: [1440, 60, 0]
    })
    expect(reminderFields(normalized)).toEqual({
      saleAt: '2026-10-01T08:00',
      saleReminderEnabled: true,
      saleReminderOffsets: [1440, 60, 0]
    })
  })

  it('收藏品待补款保留提醒字段', () => {
    const normalized = normalizeGoodsInput({
      id: 'g2',
      isWishlist: false,
      collectStatus: '待补款',
      saleAt: '2026-10-01T08:00',
      saleReminderEnabled: true,
      saleReminderOffsets: [60]
    })
    expect(normalized.saleAt).toBe('2026-10-01T08:00')
    expect(normalized.saleReminderEnabled).toBe(true)
  })

  it('件级待补邮（主状态已拥有）也保留提醒字段', () => {
    const normalized = normalizeGoodsInput({
      id: 'g3',
      isWishlist: false,
      collectStatus: '已拥有',
      unitCollectStatusList: ['已拥有', '待补邮'],
      quantity: 2,
      saleAt: '2026-10-01T08:00',
      saleReminderEnabled: true,
      saleReminderOffsets: [10]
    })
    expect(normalized.saleAt).toBe('2026-10-01T08:00')
  })

  it('收藏品非待补邮/待补款清空提醒字段（旧版语义）', () => {
    const normalized = normalizeGoodsInput({
      id: 'g4',
      isWishlist: false,
      collectStatus: '已拥有',
      saleAt: '2026-10-01T08:00',
      saleReminderEnabled: true,
      saleReminderOffsets: [60]
    })
    expect(reminderFields(normalized)).toEqual({
      saleAt: '',
      saleReminderEnabled: false,
      saleReminderOffsets: []
    })
  })

  it('心愿单仍保留开售提醒字段', () => {
    const normalized = normalizeGoodsInput({
      id: 'g5',
      isWishlist: true,
      saleAt: '2026-10-01T08:00',
      saleReminderEnabled: true,
      saleReminderOffsets: [1440, 0]
    })
    expect(normalized.saleAt).toBe('2026-10-01T08:00')
    expect(normalized.saleReminderEnabled).toBe(true)
  })
})
