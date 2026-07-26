import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/utils/platform/storage', () => ({
  readPersisted: vi.fn(async () => null),
  writePersisted: vi.fn(async () => true),
  removePersisted: vi.fn(async () => {})
}))

import { writePersistedTrash } from '../goodsPersistence'
import { writePersisted } from '@/utils/platform/storage'

const TRASH_KEY = 'goods_trash_items'

describe('writePersistedTrash', () => {
  beforeEach(() => {
    writePersisted.mockReset()
    writePersisted.mockResolvedValue(true)
  })

  it('首次写入成功时只调用一次 writePersisted', async () => {
    const list = [{ id: 'a' }]
    await writePersistedTrash(list)
    expect(writePersisted).toHaveBeenCalledTimes(1)
    expect(writePersisted).toHaveBeenCalledWith(TRASH_KEY, JSON.stringify(list))
  })

  it('首次失败后重试一次，第二次带 critical 标志', async () => {
    writePersisted
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true)
    const list = [{ id: 'a' }]
    await expect(writePersistedTrash(list)).resolves.toBeUndefined()
    expect(writePersisted).toHaveBeenCalledTimes(2)
    const payload = JSON.stringify(list)
    expect(writePersisted).toHaveBeenNthCalledWith(1, TRASH_KEY, payload)
    expect(writePersisted).toHaveBeenNthCalledWith(2, TRASH_KEY, payload, { critical: true })
  })

  it('重试仍失败（critical 抛错）时向外抛出', async () => {
    const storageError = new Error('storage write failed: goods_trash_items')
    storageError.isStorageWriteError = true
    writePersisted
      .mockResolvedValueOnce(false)
      .mockRejectedValueOnce(storageError)
    await expect(writePersistedTrash([{ id: 'a' }])).rejects.toBe(storageError)
    expect(writePersisted).toHaveBeenCalledTimes(2)
  })
})
