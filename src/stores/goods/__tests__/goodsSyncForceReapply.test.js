import { describe, it, expect, vi, beforeEach } from 'vitest'
import { shallowRef } from 'vue'

vi.mock('@/utils/db/index', () => ({
  getItems: vi.fn(async () => []),
  saveItems: vi.fn(async () => {}),
}))
vi.mock('@/utils/image/localImage', () => ({
  deleteManagedLocalImages: vi.fn(async () => {}),
  isLocalImageUri: vi.fn(() => false),
  collectManagedLocalImagePathsFromGoodsItem: vi.fn(() => new Set())
}))
vi.mock('@/utils/goods/saleReminder', () => ({
  cancelSaleReminderNotifications: vi.fn(async () => {})
}))

import { updateGoodsBackup, updateTrashBackup } from '../goodsSync'
import { saveItems } from '@/utils/db/index'

function makeItem(id, updatedAt, overrides = {}) {
  return { id, name: `item-${id}`, quantity: 1, updatedAt, isWishlist: false, ...overrides }
}

describe('updateGoodsBackup forceReapply（同步格式版本升级回填）', () => {
  beforeEach(() => {
    saveItems.mockReset()
    saveItems.mockResolvedValue(undefined)
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
    expect(saveItems).toHaveBeenCalledWith([trashList.value[0]])
  })
})

describe('updateGoodsBackup 保护稀疏字段 goodsId（LWW 空串不覆盖非空）', () => {
  beforeEach(() => {
    saveItems.mockReset()
    saveItems.mockResolvedValue(undefined)
  })

  it('远端更新但 goodsId 为空串 → 保留本地 goodsId 并 bump updatedAt', async () => {
    const list = shallowRef([makeItem('a', 100, {
      goodsId: '20211489070319602763088',
      name: 'local-with-goods-id'
    })])
    const remote = [makeItem('a', 200, {
      goodsId: '',
      name: 'remote-newer-empty-goods-id'
    })]

    const updated = await updateGoodsBackup(remote, list)

    expect(updated).toBe(1)
    expect(list.value[0].name).toBe('remote-newer-empty-goods-id')
    expect(list.value[0].goodsId).toBe('20211489070319602763088')
    // 保留本地 goodsId 时 bump，确保下次推送把正确值写回云端
    expect(list.value[0].updatedAt).toBeGreaterThan(200)
  })

  it('远端有 goodsId → 正常 LWW 用远端覆盖', async () => {
    const list = shallowRef([makeItem('a', 100, { goodsId: 'old-id' })])
    const remote = [makeItem('a', 200, { goodsId: 'new-id' })]

    await updateGoodsBackup(remote, list)

    expect(list.value[0].goodsId).toBe('new-id')
  })

  it('回收站条目同样保护本地 goodsId', async () => {
    const trashList = shallowRef([makeItem('t1', 100, {
      goodsId: '20211489070319602763088',
      trashed: true
    })])
    const remote = [makeItem('t1', 200, { goodsId: '', trashed: true })]

    const updated = await updateTrashBackup(remote, trashList)

    expect(updated).toBe(1)
    expect(trashList.value[0].goodsId).toBe('20211489070319602763088')
  })
})

describe('updateGoodsBackup 以远端 manualOrders 收敛各设备顺序', () => {
  beforeEach(() => {
    saveItems.mockReset()
    saveItems.mockResolvedValue(undefined)
  })

  it('远端明确为空对象 → 保留本地其它排序模式，避免稀疏远端行导致顺序回退', async () => {
    const list = shallowRef([makeItem('w1', 100, {
      isWishlist: true,
      manualOrders: { custom: 2, acquiredAt: 1 },
      name: 'wish-local'
    })])
    const remote = [makeItem('w1', 200, {
      isWishlist: true,
      manualOrders: {},
      name: 'wish-remote'
    })]

    const updated = await updateGoodsBackup(remote, list)

    expect(updated).toBe(1)
    expect(list.value[0].name).toBe('wish-remote')
    expect(list.value[0].manualOrders).toEqual({ custom: 2, acquiredAt: 1 })
    expect(list.value[0].updatedAt).toBe(200)
  })

  it('远端只带一个模式 → 覆盖该模式并保留本地其它模式', async () => {
    const list = shallowRef([makeItem('w2', 100, {
      isWishlist: true,
      manualOrders: { custom: 5, name: 3 }
    })])
    const remote = [makeItem('w2', 200, {
      isWishlist: true,
      manualOrders: { custom: 1 }
    })]

    await updateGoodsBackup(remote, list)

    expect(list.value[0].manualOrders.custom).toBe(1)
    expect(list.value[0].manualOrders.name).toBe(3)
  })
})
