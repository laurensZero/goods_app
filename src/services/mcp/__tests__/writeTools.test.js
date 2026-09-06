import { describe, it, expect, vi } from 'vitest'
import { createMcpWriteToolHandlers } from '../writeTools'

function createFakeStore() {
  return {
    list: { value: [{ id: 'g1', name: '已有条目' }] },
    trashList: { value: [{ id: 't1', name: '回收站条目' }] },
    addGoods: vi.fn(async (data) => ({ id: 'new-1', name: data.name, isWishlist: Boolean(data.isWishlist), quantity: data.quantity ?? 1 })),
    updateGoods: vi.fn(async (id, data) => id + ':' + JSON.stringify(data)),
    removeGoods: vi.fn(async () => {}),
    restoreTrashItem: vi.fn(async () => {})
  }
}

describe('mcp write tool handlers', () => {
  it('goods_add 只透传白名单字段并返回新条目 id', async () => {
    const store = createFakeStore()
    const handlers = createMcpWriteToolHandlers({ goodsStore: store })

    const result = await handlers.goods_add({
      name: '初音 吧唧',
      category: '吧唧',
      characters: ['初音未来'],
      quantity: 2,
      acquiredAt: '2026-01-01',
      isWishlist: false,
      // 白名单外字段应被剥离
      images: ['x.png'],
      trashed: true,
      id: 'hack'
    })

    expect(result.ok).toBe(true)
    expect(result.id).toBe('new-1')
    expect(store.addGoods).toHaveBeenCalledWith({
      name: '初音 吧唧',
      category: '吧唧',
      characters: ['初音未来'],
      quantity: 2,
      acquiredAt: '2026-01-01',
      isWishlist: false
    })
  })

  it('goods_add 缺少 name 时报错', async () => {
    const handlers = createMcpWriteToolHandlers({ goodsStore: createFakeStore() })
    await expect(handlers.goods_add({ category: '吧唧' })).rejects.toThrow('name 必填')
  })

  it('goods_add 校验 quantity 与 acquiredAt 格式', async () => {
    const handlers = createMcpWriteToolHandlers({ goodsStore: createFakeStore() })
    await expect(handlers.goods_add({ name: 'x', quantity: 0 })).rejects.toThrow('quantity')
    await expect(handlers.goods_add({ name: 'x', acquiredAt: '2026/01/01' })).rejects.toThrow('acquiredAt')
  })

  it('goods_update 部分更新：校验 id 存在、拒绝空更新', async () => {
    const store = createFakeStore()
    const handlers = createMcpWriteToolHandlers({ goodsStore: store })

    const result = await handlers.goods_update({ id: 'g1', note: '补个备注', storageLocation: 'A 柜' })
    expect(result).toEqual({ ok: true, id: 'g1' })
    expect(store.updateGoods).toHaveBeenCalledWith('g1', { note: '补个备注', storageLocation: 'A 柜' })

    await expect(handlers.goods_update({ id: 'nope', note: 'x' })).rejects.toThrow('未找到')
    await expect(handlers.goods_update({ id: 'g1' })).rejects.toThrow('没有可更新的字段')
    await expect(handlers.goods_update({ note: 'x' })).rejects.toThrow('id 必填')
  })

  it('goods_delete 移入回收站并提示可恢复', async () => {
    const store = createFakeStore()
    const handlers = createMcpWriteToolHandlers({ goodsStore: store })

    const result = await handlers.goods_delete({ id: 'g1' })
    expect(result).toEqual({ ok: true, id: 'g1', note: '已移入回收站，可用 goods_restore 恢复' })
    expect(store.removeGoods).toHaveBeenCalledWith('g1')

    await expect(handlers.goods_delete({ id: 'nope' })).rejects.toThrow('未找到')
  })

  it('goods_restore 只允许恢复回收站条目', async () => {
    const store = createFakeStore()
    const handlers = createMcpWriteToolHandlers({ goodsStore: store })

    expect((await handlers.goods_restore({ id: 't1' })).ok).toBe(true)
    await expect(handlers.goods_restore({ id: 'g1' })).rejects.toThrow('回收站中未找到')
  })
})
