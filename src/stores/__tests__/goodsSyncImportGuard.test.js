import { describe, it, expect, vi, beforeEach } from 'vitest'
import { shallowRef } from 'vue'

vi.mock('@/utils/db/index', () => ({
  getItems: vi.fn(async () => []),
  saveItems: vi.fn(async () => {})
}))
vi.mock('@/utils/image/localImage', () => ({
  deleteManagedLocalImages: vi.fn(async () => {}),
  isLocalImageUri: vi.fn(() => false)
}))
vi.mock('@/stores/goodsPersistence', () => ({
  writePersistedTrash: vi.fn(async () => {})
}))

import { importGoodsBackup } from '../goodsSync'
import { saveItems } from '@/utils/db/index'
import { writePersistedTrash } from '@/stores/goodsPersistence'

function makeItem(id, updatedAt, overrides = {}) {
  return { id, name: `item-${id}`, quantity: 1, updatedAt, isWishlist: false, ...overrides }
}

describe('importGoodsBackup 回收站守卫（本地已删除条目不被远端拉回）', () => {
  beforeEach(() => {
    saveItems.mockReset()
    saveItems.mockResolvedValue(undefined)
    writePersistedTrash.mockReset()
    writePersistedTrash.mockResolvedValue(undefined)
  })

  it('本地在回收站且删除时间 >= 远端更新时间：跳过导入，条目保持已删除', async () => {
    const list = shallowRef([])
    const trashList = shallowRef([makeItem('a', 200)]) // 本地删除时刻（updatedAt=200）

    // 远端仍是 trashed=0 的旧快照（updatedAt=100），比删除时刻更旧
    const imported = await importGoodsBackup([makeItem('a', 100)], list, trashList)

    expect(imported).toBe(0)
    expect(list.value).toEqual([])
    expect(trashList.value.map((e) => e.id)).toEqual(['a']) // 未被移除回收站
    expect(saveItems).not.toHaveBeenCalled()
  })

  it('远端更新时间 > 本地删除时间（另一台设备重新添加）：导入并移出回收站', async () => {
    const list = shallowRef([])
    const trashList = shallowRef([makeItem('a', 100, { deletedAt: '2026-08-01T00:00:00.000Z' })])

    const imported = await importGoodsBackup([makeItem('a', 200)], list, trashList)

    expect(imported).toBe(1)
    expect(list.value.map((e) => e.id)).toEqual(['a'])
    expect(list.value[0].updatedAt).toBe(200)
    expect(trashList.value).toEqual([]) // 从回收站移除
    expect(writePersistedTrash).toHaveBeenCalledTimes(1)
    expect(saveItems).toHaveBeenCalledTimes(1)
  })

  it('不在 list 也不在回收站的全新远端条目：正常导入', async () => {
    const list = shallowRef([])
    const trashList = shallowRef([])

    const imported = await importGoodsBackup([makeItem('x', 300)], list, trashList)

    expect(imported).toBe(1)
    expect(list.value.map((e) => e.id)).toEqual(['x'])
    expect(trashList.value).toEqual([])
    expect(writePersistedTrash).not.toHaveBeenCalled()
  })

  it('已存在于 list 的条目：跳过（现有去重行为不变）', async () => {
    const list = shallowRef([makeItem('a', 100)])
    const trashList = shallowRef([])

    const imported = await importGoodsBackup([makeItem('a', 200)], list, trashList)

    expect(imported).toBe(0)
    expect(list.value).toHaveLength(1)
    expect(list.value[0].updatedAt).toBe(100) // 不被远端旧行覆盖
  })
})
