import { describe, it, expect, vi, beforeEach } from 'vitest'
import { shallowRef } from 'vue'

vi.mock('@/utils/db/index', () => ({
  addItem: vi.fn(async () => {}),
  saveItems: vi.fn(async () => {}),
  deleteItems: vi.fn(async () => {})
}))
vi.mock('@/utils/saleReminder', () => ({
  cancelSaleReminderNotifications: vi.fn(async () => {}),
  scheduleSaleReminderForItem: vi.fn(async () => {})
}))
vi.mock('@/utils/image/localImage', () => ({
  collectManagedLocalImagePathsFromGoodsItem: vi.fn(() => []),
  deleteManagedLocalImages: vi.fn(async () => {}),
  restoreLocalImageFromDataUrl: vi.fn(async () => null)
}))
// goodsHelpers 经由 presets 间接引入整个 sync store 依赖图，这里仅需 normalizeCharacterName
vi.mock('@/stores/presets', () => ({
  normalizeCharacterName: (name) => String(name || '').trim()
}))

import { removeGoods, removeMultipleGoods, restoreTrashItem, emptyTrash } from '../goodsCrud'
import { addItem, deleteItems, saveItems } from '@/utils/db/index'
import { deleteManagedLocalImages } from '@/utils/image/localImage'
import { scheduleSaleReminderForItem } from '@/utils/saleReminder'

function makeItem(id) {
  return {
    id,
    name: `item-${id}`,
    quantity: 1,
    updatedAt: 1,
    isWishlist: false
  }
}

describe('removeGoods', () => {
  beforeEach(() => {
    saveItems.mockReset()
    saveItems.mockResolvedValue(undefined)
    deleteManagedLocalImages.mockReset()
    deleteManagedLocalImages.mockResolvedValue(undefined)
  })

  it('正常路径：条目以 trashed=1 完整行移入回收站', async () => {
    const list = shallowRef([makeItem('a'), makeItem('b')])
    const trashList = shallowRef([])
    await removeGoods('a', list, trashList)

    expect(list.value.map((e) => e.id)).toEqual(['b'])
    expect(trashList.value.map((e) => e.id)).toEqual(['a'])
    expect(trashList.value[0].deletedAt).toBeTruthy()
    // 回收站条目恒 trashed=true：任何 saveItems/addItem 写回 SQLite 时保持软删除
    expect(trashList.value[0].trashed).toBe(true)
    expect(saveItems).toHaveBeenCalledWith([trashList.value[0]])
    expect(deleteItems).not.toHaveBeenCalled()
  })

  it('goods 表写入失败：内存状态回滚', async () => {
    const originalList = [makeItem('a'), makeItem('b')]
    const originalTrash = [makeItem('old-trash')]
    const list = shallowRef(originalList)
    const trashList = shallowRef(originalTrash)
    const persistError = new Error('database write failed')
    saveItems.mockRejectedValue(persistError)
    vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(removeGoods('a', list, trashList)).rejects.toBe(persistError)

    // 回滚到调用前的快照（同一数组引用）
    expect(list.value).toBe(originalList)
    expect(trashList.value).toBe(originalTrash)
  })
})

describe('removeMultipleGoods', () => {
  beforeEach(() => {
    saveItems.mockReset()
    saveItems.mockResolvedValue(undefined)
  })

  it('正常路径：批量写入 trashed=1 完整行', async () => {
    const list = shallowRef([makeItem('a'), makeItem('b'), makeItem('c')])
    const trashList = shallowRef([])
    await removeMultipleGoods(new Set(['a', 'b']), list, trashList)

    expect(list.value.map((e) => e.id)).toEqual(['c'])
    expect(trashList.value.map((e) => e.id)).toEqual(['a', 'b'])
    expect(saveItems).toHaveBeenCalledWith(trashList.value)
    expect(deleteItems).not.toHaveBeenCalled()
  })

  it('goods 表写入失败：批量删除完整回滚', async () => {
    const originalList = [makeItem('a'), makeItem('b'), makeItem('c')]
    const originalTrash = []
    const list = shallowRef(originalList)
    const trashList = shallowRef(originalTrash)
    const persistError = new Error('database write failed')
    saveItems.mockRejectedValue(persistError)
    vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(
      removeMultipleGoods(new Set(['a', 'b']), list, trashList)
    ).rejects.toBe(persistError)

    expect(list.value).toBe(originalList)
    expect(trashList.value).toBe(originalTrash)
  })
})

describe('restoreTrashItem', () => {
  beforeEach(() => {
    addItem.mockReset()
    addItem.mockResolvedValue(undefined)
    scheduleSaleReminderForItem.mockReset()
    scheduleSaleReminderForItem.mockResolvedValue(undefined)
  })

  it('恢复条目 trashed 重置为 false（addItem 写回 trashed=0，不再软删除）', async () => {
    const list = shallowRef([])
    const trashList = shallowRef([{ ...makeItem('a'), trashed: true, deletedAt: '2026-08-01T00:00:00.000Z' }])
    const restored = await restoreTrashItem('a', list, trashList)

    expect(restored).not.toBeNull()
    expect(restored.trashed).toBe(false)
    expect(list.value.map((e) => e.id)).toEqual(['a'])
    expect(trashList.value).toEqual([])
    expect(addItem).toHaveBeenCalledTimes(1)
    expect(addItem.mock.calls[0][0].trashed).toBe(false)
  })
})

describe('emptyTrash', () => {
  beforeEach(() => {
    deleteItems.mockReset()
    deleteItems.mockResolvedValue(undefined)
    deleteManagedLocalImages.mockReset()
    deleteManagedLocalImages.mockResolvedValue(undefined)
  })

  it('墓碑写入失败：回收站状态恢复', async () => {
    const originalTrash = [makeItem('a'), makeItem('b')]
    const trashList = shallowRef(originalTrash)
    const persistError = new Error('tombstone write failed')
    const onPermanentlyDeleted = vi.fn(async () => { throw persistError })
    vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(emptyTrash(trashList, undefined, onPermanentlyDeleted)).rejects.toBe(persistError)

    expect(deleteManagedLocalImages).not.toHaveBeenCalled()
    expect(deleteItems).not.toHaveBeenCalled()
    expect(trashList.value).toEqual(originalTrash)
  })

  it('正常路径：清空回收站后物理删除软删除行与本地图片', async () => {
    const trashList = shallowRef([makeItem('a')])
    await emptyTrash(trashList)

    expect(trashList.value).toEqual([])
    // 回收站清空 = 把 trashed=1 的软删除行物理 DELETE 出 goods 表
    expect(deleteItems).toHaveBeenCalledWith(['a'])
    expect(deleteManagedLocalImages).toHaveBeenCalledTimes(1)
  })
})
