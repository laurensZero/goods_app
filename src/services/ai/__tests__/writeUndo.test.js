import { describe, it, expect, vi } from 'vitest'
import {
  UNDOABLE_WRITE_TOOLS,
  isUndoableWriteTool,
  captureUndoBefore,
  buildUndoEntry,
  applyUndoEntry,
  applyUndoEntries,
  createUndoTrackingExecutor,
  sanitizeUndoJournal
} from '../writeUndo'

function createStores() {
  const goodsStore = {
    list: { value: [{ id: 'g1', name: '吧唧', collectStatus: '已拥有', sellPrice: '', statusTimeline: [] }] },
    trashList: { value: [] },
    removeGoods: vi.fn(async () => {}),
    restoreTrashItem: vi.fn(async () => {}),
    updateGoods: vi.fn(async () => {})
  }
  const rechargeStore = {
    list: { value: [{ id: 'r1', game: '原神', amount: 648, deleted: false }] },
    deleteRecord: vi.fn(async () => true),
    updateRecord: vi.fn(async () => true)
  }
  const eventsStore = {
    list: {
      value: [
        { id: 'e1', name: 'CP 展', deleted: false, startDate: '2026-08-01' },
        { id: 'e2', name: '已删', deleted: true }
      ]
    },
    removeEventRecord: vi.fn(async () => {}),
    updateEventRecord: vi.fn(async () => true)
  }
  return { goodsStore, rechargeStore, eventsStore }
}

describe('writeUndo', () => {
  it('可撤回工具集合覆盖谷子/充值/活动', () => {
    expect(isUndoableWriteTool('goods_add')).toBe(true)
    expect(isUndoableWriteTool('recharge_update')).toBe(true)
    expect(isUndoableWriteTool('recharge_delete')).toBe(true)
    expect(isUndoableWriteTool('events_add')).toBe(true)
    expect(isUndoableWriteTool('events_update')).toBe(true)
    expect(isUndoableWriteTool('events_delete')).toBe(true)
    expect(isUndoableWriteTool('navigate')).toBe(false)
    expect(isUndoableWriteTool('goods_search')).toBe(false)
    expect(UNDOABLE_WRITE_TOOLS.has('events_delete')).toBe(true)
  })

  it('goods_update 捕获改动字段并可撤回写回', async () => {
    const deps = createStores()
    const before = await captureUndoBefore('goods_update', { id: 'g1', collectStatus: '已出' }, deps)
    expect(before.fields.collectStatus).toBe('已拥有')
    // collectStatus 变更时应带上 statusTimeline 快照
    expect(before.fields.statusTimeline).toEqual([])

    const entry = buildUndoEntry('goods_update', { id: 'g1' }, before, { ok: true })
    expect(entry.tool).toBe('goods_update')
    expect(entry.id).toBe('g1')

    await applyUndoEntry(entry, deps)
    expect(deps.goodsStore.updateGoods).toHaveBeenCalledWith('g1', expect.objectContaining({
      collectStatus: '已拥有'
    }))
  })

  it('goods_add 撤回 = 移入回收站；goods_delete 撤回 = 恢复', async () => {
    const deps = createStores()
    const addBefore = await captureUndoBefore('goods_add', { name: '新吧唧' }, deps)
    const addEntry = buildUndoEntry('goods_add', { name: '新吧唧' }, addBefore, { ok: true, id: 'new-1' })
    expect(addEntry.id).toBe('new-1')
    await applyUndoEntry(addEntry, deps)
    expect(deps.goodsStore.removeGoods).toHaveBeenCalledWith('new-1')

    const delBefore = await captureUndoBefore('goods_delete', { id: 'g1' }, deps)
    const delEntry = buildUndoEntry('goods_delete', { id: 'g1' }, delBefore, { ok: true })
    await applyUndoEntry(delEntry, deps)
    expect(deps.goodsStore.restoreTrashItem).toHaveBeenCalledWith('g1')
  })

  it('recharge_update 捕获改动字段并可撤回写回', async () => {
    const deps = createStores()
    const before = await captureUndoBefore('recharge_update', { id: 'r1', amount: 328 }, deps)
    expect(before.fields.amount).toBe(648)
    const entry = buildUndoEntry('recharge_update', { id: 'r1' }, before, { ok: true })
    expect(entry.tool).toBe('recharge_update')
    await applyUndoEntry(entry, deps)
    expect(deps.rechargeStore.updateRecord).toHaveBeenCalledWith('r1', expect.objectContaining({
      amount: 648,
      game: '原神'
    }))
  })

  it('recharge_delete 撤回时把 deleted 翻回 false', async () => {
    const deps = createStores()
    const before = await captureUndoBefore('recharge_delete', { id: 'r1' }, deps)
    const entry = buildUndoEntry('recharge_delete', { id: 'r1' }, before, { ok: true })
    await applyUndoEntry(entry, deps)
    expect(deps.rechargeStore.updateRecord).toHaveBeenCalledWith('r1', expect.objectContaining({
      deleted: false,
      game: '原神'
    }))
  })

  it('events_update / events_delete 可撤回；events_add 撤回软删', async () => {
    const deps = createStores()

    const upBefore = await captureUndoBefore('events_update', { id: 'e1', name: 'CP 改名' }, deps)
    expect(upBefore.fields.name).toBe('CP 展')
    const upEntry = buildUndoEntry('events_update', { id: 'e1' }, upBefore, { ok: true })
    await applyUndoEntry(upEntry, deps)
    expect(deps.eventsStore.updateEventRecord).toHaveBeenCalledWith('e1', expect.objectContaining({
      name: 'CP 展'
    }))

    const delBefore = await captureUndoBefore('events_delete', { id: 'e1' }, deps)
    const delEntry = buildUndoEntry('events_delete', { id: 'e1' }, delBefore, { ok: true })
    await applyUndoEntry(delEntry, deps)
    expect(deps.eventsStore.updateEventRecord).toHaveBeenCalledWith('e1', expect.objectContaining({
      deleted: false,
      name: 'CP 展'
    }))

    const addBefore = await captureUndoBefore('events_add', { name: '新活动' }, deps)
    const addEntry = buildUndoEntry('events_add', { name: '新活动' }, addBefore, { ok: true, id: 'e-new' })
    await applyUndoEntry(addEntry, deps)
    expect(deps.eventsStore.removeEventRecord).toHaveBeenCalledWith('e-new')
  })

  it('tracking executor 在成功写入后累积 entry，非写工具不记录', async () => {
    const deps = createStores()
    const turnEntries = []
    const run = vi.fn(async (name) => {
      if (name === 'goods_add') return { ok: true, id: 'n1', item: { name: 'x' } }
      return { ok: true }
    })
    const executor = createUndoTrackingExecutor(run, deps, turnEntries)

    await executor('goods_search', { query: 'a' })
    await executor('goods_add', { name: 'x' })
    await executor('events_delete', { id: 'e1' })

    expect(turnEntries.map((e) => e.tool)).toEqual(['goods_add', 'events_delete'])
  })

  it('applyUndoEntries 逆序执行并标记 undone', async () => {
    const deps = createStores()
    const entries = [
      { tool: 'goods_add', id: 'n1', label: '新增', undone: false },
      { tool: 'goods_delete', id: 'g1', label: '删除', undone: false }
    ]
    const result = await applyUndoEntries(entries, deps)
    expect(result.ok).toBe(true)
    expect(result.undone).toBe(2)
    // 逆序：先撤删除（restore），再撤新增（remove）
    expect(deps.goodsStore.restoreTrashItem).toHaveBeenCalledWith('g1')
    expect(deps.goodsStore.removeGoods).toHaveBeenCalledWith('n1')
    expect(entries.every((e) => e.undone)).toBe(true)
  })

  it('sanitizeUndoJournal 过滤坏数据', () => {
    expect(sanitizeUndoJournal(null)).toBeNull()
    expect(sanitizeUndoJournal({ entries: [] })).toBeNull()
    expect(sanitizeUndoJournal({ entries: [{ tool: 'goods_add', id: 'x', label: 'a' }] })).toEqual({
      entries: [{ tool: 'goods_add', id: 'x', label: 'a' }],
      undone: false
    })
  })
})
