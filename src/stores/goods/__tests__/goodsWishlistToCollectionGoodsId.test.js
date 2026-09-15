import { describe, it, expect, vi, beforeEach } from 'vitest'
import { shallowRef } from 'vue'

vi.mock('@/utils/db/index', () => ({
  addItem: vi.fn(async () => {}),
  saveItems: vi.fn(async () => {}),
  deleteItems: vi.fn(async () => {})
}))
vi.mock('@/utils/goods/saleReminder', () => ({
  cancelSaleReminderNotifications: vi.fn(async () => {}),
  scheduleSaleReminderForItem: vi.fn(async () => {})
}))
vi.mock('@/utils/image/localImage', () => ({
  collectManagedLocalImagePathsFromGoodsItem: vi.fn(() => []),
  deleteManagedLocalImages: vi.fn(async () => {}),
  restoreLocalImageFromDataUrl: vi.fn(async () => null),
  isLocalImageUri: vi.fn(() => false)
}))
vi.mock('@/stores/presets', () => ({
  normalizeCharacterName: (name) => String(name || '').trim()
}))

import { updateGoods } from '../goodsCrud'
import { mergeGoodsRecord, normalizeGoodsInput } from '../goodsHelpers'
import { saveItems } from '@/utils/db/index'

function makeWishlistItem(overrides = {}) {
  return {
    id: '1787133976732',
    name: '无神怜爱的雪国系列周边 Genshin',
    category: '徽章',
    ip: '原神',
    goodsId: '20211489070319602763088',
    isWishlist: true,
    characters: ['沃雅妮莎'],
    variant: '徽章-沃雅妮莎',
    price: '18',
    actualPrice: '',
    acquiredAt: '',
    collectStatus: '已拥有',
    quantity: 1,
    currency: 'CNY',
    actualPriceCurrency: 'CNY',
    images: [{ id: 'img1', uri: 'https://example.com/a.jpg' }],
    statusTimeline: [{ status: '已拥有', at: '2026-08-19' }],
    updatedAt: 1755598216419,
    ...overrides
  }
}

describe('心愿单→收藏 编辑保存保留 goodsId', () => {
  beforeEach(() => {
    saveItems.mockReset()
    saveItems.mockResolvedValue(undefined)
  })

  it('updateGoods 部分更新（只改 isWishlist/入手价）不丢 goodsId', async () => {
    const list = shallowRef([makeWishlistItem()])
    await updateGoods('1787133976732', {
      isWishlist: false,
      actualPrice: '5',
      acquiredAt: '2026-09-13',
      collectStatus: '待发货'
    }, list)

    const next = list.value[0]
    expect(next.isWishlist).toBe(false)
    expect(next.actualPrice).toBe('5')
    expect(next.goodsId).toBe('20211489070319602763088')
  })

  it('编辑器提交整表单（含 goodsId）不丢 goodsId', async () => {
    const existing = normalizeGoodsInput(makeWishlistItem(), '1787133976732')
    const list = shallowRef([existing])

    // 模拟 useGoodsEditorForm 加载后提交
    const form = {
      ...existing,
      isWishlist: false,
      actualPrice: '5',
      acquiredAt: '2026-09-13',
      collectStatus: '待发货',
      statusTimeline: [
        { status: '已拥有', at: '2026-08-19' },
        { status: '待发货', at: '2026-09-13' }
      ]
    }
    await updateGoods('1787133976732', form, list)

    expect(list.value[0].goodsId).toBe('20211489070319602763088')
    expect(list.value[0].isWishlist).toBe(false)
  })

  it('表单 goodsId 误为空时，previous 的 goodsId 仍会被空串覆盖（已知行为，防回归意识）', async () => {
    const list = shallowRef([makeWishlistItem()])
    await updateGoods('1787133976732', {
      isWishlist: false,
      actualPrice: '5',
      goodsId: '' // 模拟表单未加载到 goodsId
    }, list)

    // 当前实现：spread 会用空串覆盖 —— 这是 LWW/表单路径的风险点
    expect(list.value[0].goodsId).toBe('')
  })
})

describe('mergeGoodsRecord 保留/回填 goodsId 与 tracks', () => {
  it('existing 有 goodsId、incoming 无 → 保留 existing', () => {
    const existing = normalizeGoodsInput(makeWishlistItem(), 'a')
    const incoming = normalizeGoodsInput({ ...makeWishlistItem(), goodsId: '', id: 'b' }, 'b')
    const merged = mergeGoodsRecord(existing, incoming)
    expect(merged.goodsId).toBe('20211489070319602763088')
  })

  it('existing 无 goodsId、incoming 有 → 回填 incoming（修复目标）', () => {
    const existing = normalizeGoodsInput({ ...makeWishlistItem(), goodsId: '' }, 'a')
    const incoming = normalizeGoodsInput(makeWishlistItem({ id: 'b' }), 'b')
    const merged = mergeGoodsRecord(existing, incoming)
    expect(merged.goodsId).toBe('20211489070319602763088')
  })

  it('existing 无 tracks、incoming 有 → 回填 tracks', () => {
    const tracks = [{ id: 't1', title: '夜に駆ける', artist: 'YOASOBI' }]
    const existing = normalizeGoodsInput({ ...makeWishlistItem(), tracks: [] }, 'a')
    const incoming = normalizeGoodsInput({ ...makeWishlistItem({ id: 'b' }), tracks }, 'b')
    const merged = mergeGoodsRecord(existing, incoming)
    expect(merged.tracks).toHaveLength(1)
    expect(merged.tracks[0]).toMatchObject({ id: 't1', title: '夜に駆ける', artist: 'YOASOBI' })
  })

  it('existing 有 tracks、incoming 无 → 保留 existing', () => {
    const tracks = [{ id: 't1', title: 'existing-track' }]
    const existing = normalizeGoodsInput({ ...makeWishlistItem(), tracks }, 'a')
    const incoming = normalizeGoodsInput({ ...makeWishlistItem({ id: 'b' }), tracks: [] }, 'b')
    const merged = mergeGoodsRecord(existing, incoming)
    expect(merged.tracks).toHaveLength(1)
    expect(merged.tracks[0]).toMatchObject({ id: 't1', title: 'existing-track' })
  })
})
