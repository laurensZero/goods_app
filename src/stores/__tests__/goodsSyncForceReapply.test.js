import { describe, it, expect, vi, beforeEach } from 'vitest'
import { shallowRef } from 'vue'

vi.mock('@/utils/db/index', () => ({
  getItems: vi.fn(async () => []),
  saveItems: vi.fn(async () => {}),
  softDeleteItems: vi.fn(async () => {})
}))
vi.mock('@/utils/image/localImage', () => ({
  deleteManagedLocalImages: vi.fn(async () => {}),
  isLocalImageUri: vi.fn(() => false),
  collectManagedLocalImagePathsFromGoodsItem: vi.fn(() => new Set())
}))
vi.mock('@/stores/goodsPersistence', () => ({
  writePersistedTrash: vi.fn(async () => {})
}))
vi.mock('@/utils/saleReminder', () => ({
  cancelSaleReminderNotifications: vi.fn(async () => {})
}))

import { updateGoodsBackup, updateTrashBackup } from '../goodsSync'
import { saveItems } from '@/utils/db/index'
import { writePersistedTrash } from '@/stores/goodsPersistence'

function makeItem(id, updatedAt, overrides = {}) {
  return { id, name: `item-${id}`, quantity: 1, updatedAt, isWishlist: false, ...overrides }
}

describe('updateGoodsBackup forceReapply（同步格式版本升级回填）', () => {
  beforeEach(() => {
    saveItems.mockReset()
    saveItems.mockResolvedValue(undefined)
    writePersistedTrash.mockReset()
    writePersistedTrash.mockResolvedValue(undefined)
  })

  it('时间戳相等时不应用远端行（默认行为不变）', async () => {
    const list = shallowRef([makeItem('a', 100, { name: 'local' })])
    const remote = [makeItem('a', 100, { name: 'remote' })]

    const updated = await updateGoodsBackup(remote, list)

    expect(updated).toBe(0)
    expect(list.value[0].name).toBe('local')
    expect(saveItems).not.toHaveBeenCalled()
  })

  it('forceReapply=true 时重放时间戳相等的远端行，覆盖旧版本丢弃新字段的本地副本', async () => {
    const list = shallowRef([makeItem('a', 100, { name: 'local' })])
    const remote = [makeItem('a', 100, { name: 'remote' })]

    const updated = await updateGoodsBackup(remote, list, { forceReapply: true })

    expect(updated).toBe(1)
    expect(list.value[0].name).toBe('remote')
    expect(saveItems).toHaveBeenCalledTimes(1)
  })

  it('forceReapply=true 时本地更新的行（时间戳更大）仍不被覆盖', async () => {
    const list = shallowRef([makeItem('a', 200, { name: 'local-newer' })])
    const remote = [makeItem('a', 100, { name: 'remote-older' })]

    const updated = await updateGoodsBackup(remote, list, { forceReapply: true })

    expect(updated).toBe(0)
    expect(list.value[0].name).toBe('local-newer')
    expect(saveItems).not.toHaveBeenCalled()
  })

  it('forceReapply=true 时回收站条目同样重放时间戳相等的远端行', async () => {
    const trashList = shallowRef([makeItem('t1', 100, { name: 'local', trashed: true })])
    const remote = [makeItem('t1', 100, { name: 'remote', trashed: true })]

    const updated = await updateTrashBackup(remote, trashList, null, { forceReapply: true })

    expect(updated).toBe(1)
    expect(trashList.value[0].name).toBe('remote')
    expect(writePersistedTrash).toHaveBeenCalledTimes(1)
  })
})
