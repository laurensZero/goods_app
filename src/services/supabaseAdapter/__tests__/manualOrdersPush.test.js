import { describe, it, expect, vi } from 'vitest'
import { ref } from 'vue'

// reorderGoods 会写 SQLite；happy-dom 下 sql.js 拉不到 wasm，必须 mock 掉
vi.mock('@/utils/db/index', () => ({
  saveItems: vi.fn(async () => {})
}))

import { reorderGoods } from '@/stores/goods/goodsOrder'
import { toGoodsRows } from '@/services/supabaseAdapter/helpers'
import { sanitizeGoodsItemForSync } from '@/utils/goods/images'

function makeItem(id, extra = {}) {
  return {
    id,
    name: id,
    category: '',
    ip: '',
    goodsId: '',
    isWishlist: false,
    characters: [],
    tags: [],
    storageLocation: '',
    variant: '',
    price: '',
    actualPrice: '',
    acquiredAt: '',
    images: [],
    note: '',
    quantity: 1,
    updatedAt: 1000,
    manualOrders: {},
    trashed: false,
    ...extra
  }
}

describe('拖拽 → toGoodsRows 推送行', () => {
  it('reorderGoods 写入的 manualOrders 进入 push row.manual_orders', async () => {
    const list = ref([
      makeItem('a', { manualOrders: {} }),
      makeItem('b', { manualOrders: {} }),
      makeItem('c', { manualOrders: {} })
    ])
    const mutated = []
    await reorderGoods(['b', 'c', 'a'], list, (ids) => mutated.push(...ids), 'custom')

    expect(mutated.sort()).toEqual(['a', 'b', 'c'])
    expect(list.value.map((i) => i.manualOrders.custom)).toEqual([2, 0, 1])

    const sanitized = list.value.map((item) => sanitizeGoodsItemForSync(item, []))
    const rows = toGoodsRows(sanitized, () => 'dev', false, 'user-1')
    expect(rows.map((r) => r.manual_orders)).toEqual([
      { custom: 2 },
      { custom: 0 },
      { custom: 1 }
    ])
    for (const row of rows) {
      expect(Object.prototype.hasOwnProperty.call(row, 'manual_orders')).toBe(true)
    }
  })

  it('仅脏 id 推送时仍带 manualOrders', async () => {
    const list = ref([makeItem('x'), makeItem('y')])
    await reorderGoods(['y', 'x'], list, undefined, 'custom')
    const dirty = list.value.filter((i) => i.id === 'y')
    const [row] = toGoodsRows(dirty.map((i) => sanitizeGoodsItemForSync(i, [])), () => 'dev', false, 'u')
    expect(row.manual_orders).toEqual({ custom: 0 })
    expect(row.updated_at).toBeTruthy()
  })
})
