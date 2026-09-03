import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/utils/platform/storage', () => ({
  readPersisted: vi.fn(async () => null),
  removePersisted: vi.fn(async () => {})
}))

import { readPersistedTrash, removeTrashStorage } from '../goodsPersistence'
import { readPersisted, removePersisted } from '@/utils/platform/storage'

const TRASH_KEY = 'goods_trash_items'

describe('legacy trash migration storage', () => {
  beforeEach(() => {
    readPersisted.mockReset()
    readPersisted.mockResolvedValue(null)
    removePersisted.mockReset()
    removePersisted.mockResolvedValue(undefined)
    localStorage.removeItem(TRASH_KEY)
  })

  it('优先读取 Preferences 中的旧回收站', async () => {
    readPersisted.mockResolvedValue(JSON.stringify([{ id: 'a' }]))

    await expect(readPersistedTrash()).resolves.toEqual([{ id: 'a' }])
    expect(readPersisted).toHaveBeenCalledWith(TRASH_KEY)
  })

  it('Preferences 缺失时回退读取 localStorage', async () => {
    localStorage.setItem(TRASH_KEY, JSON.stringify([{ id: 'legacy' }]))

    await expect(readPersistedTrash()).resolves.toEqual([{ id: 'legacy' }])
  })

  it('迁移完成后删除旧回收站存储', async () => {
    await removeTrashStorage()

    expect(removePersisted).toHaveBeenCalledWith(TRASH_KEY)
  })
})
