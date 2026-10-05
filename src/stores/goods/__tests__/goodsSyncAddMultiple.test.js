import { describe, it, expect, vi, beforeEach } from 'vitest'
import { shallowRef } from 'vue'

vi.mock('@/utils/db/index', () => ({
  getItems: vi.fn(async () => []),
  saveItems: vi.fn(async () => {})
}))
vi.mock('@/utils/image/localImage', () => ({
  deleteManagedLocalImages: vi.fn(async () => {}),
  extractManagedLocalImagePath: vi.fn(() => null),
  isLocalImageUri: vi.fn(() => false)
}))
vi.mock('@/utils/goods/saleReminder', () => ({
  cancelSaleReminderNotifications: vi.fn(async () => {})
}))
// goodsHelpers 经由 presets 间接引入整个 sync store 依赖图
vi.mock('@/stores/presets', () => ({
  normalizeCharacterName: (name) => String(name || '').trim()
}))

import { addMultipleGoods } from '../goodsSync'
import { saveItems } from '@/utils/db/index'

beforeEach(() => {
  saveItems.mockReset()
  saveItems.mockResolvedValue(undefined)
})

function rawItem(name, overrides = {}) {
  return { name, quantity: 1, isWishlist: false, characters: [], ...overrides }
}

describe('addMultipleGoods 同步入口（标脏 + 时间戳）', () => {
  it('调用方没写 updatedAt 时自动补上，避免同步侧判定恒为「无新改动」', async () => {
    const list = shallowRef([])
    const onMutate = vi.fn()

    await addMultipleGoods([rawItem('角色A'), rawItem('角色B')], list, onMutate)

    for (const item of list.value) {
      expect(Number(item.updatedAt)).toBeGreaterThan(0)
    }
    expect(saveItems).toHaveBeenCalledTimes(1)
  })

  it('落库成功后回调 onMutate 携带全部新 id（缺它这批记录既不标脏也不触发推送）', async () => {
    const list = shallowRef([])
    const onMutate = vi.fn()

    await addMultipleGoods([rawItem('角色A'), rawItem('角色B')], list, onMutate)

    expect(onMutate).toHaveBeenCalledTimes(1)
    const ids = onMutate.mock.calls[0][0]
    expect(ids).toHaveLength(2)
    expect(new Set(ids).size).toBe(2)
    expect(ids).toEqual(list.value.map((item) => item.id))
  })

  it('同毫秒批量新增：id 互不相同（否则后一条会覆盖前一条）', async () => {
    const list = shallowRef([])

    await addMultipleGoods(
      [rawItem('角色A'), rawItem('角色B'), rawItem('角色C')],
      list,
      vi.fn()
    )

    expect(new Set(list.value.map((item) => item.id)).size).toBe(3)
  })

  it('合并进已有商品时，回调携带的是已有条目的 id', async () => {
    const list = shallowRef([rawItem('角色A', { id: 'existing-1', updatedAt: 1 })])
    const onMutate = vi.fn()

    await addMultipleGoods([rawItem('角色A')], list, onMutate)

    expect(onMutate).toHaveBeenCalledTimes(1)
    expect(onMutate.mock.calls[0][0]).toEqual(['existing-1'])
    expect(list.value).toHaveLength(1)
  })
})
