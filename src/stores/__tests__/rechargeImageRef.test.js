import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

const { saveRechargeRecords } = vi.hoisted(() => ({
  saveRechargeRecords: vi.fn(async () => {})
}))

vi.mock('@/utils/db/index', () => ({
  getRechargeRecords: vi.fn(async () => []),
  addRechargeRecord: vi.fn(async () => {}),
  saveRechargeRecords,
  deleteRechargeRecords: vi.fn(async () => {})
}))

vi.mock('@/utils/image/cache', () => ({ aliasCachedImage: vi.fn() }))

import { useRechargeStore } from '../recharge'

describe('recharge image ref 读层', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    saveRechargeRecords.mockClear()
  })

  it('remote: 还原成裸 URL', async () => {
    const store = useRechargeStore()
    await store.importBackup([
      { id: 'r1', amount: 30, chargedAt: '2026-01-01', image: 'remote:https://cdn.example.com/a.png', updatedAt: 1 }
    ])
    expect(store.records[0].image).toBe('https://cdn.example.com/a.png')
  })

  it('cloud: 还原成 cloud-image:// 交给图片缓存解析', async () => {
    const store = useRechargeStore()
    await store.importBackup([
      { id: 'r2', amount: 30, chargedAt: '2026-01-01', image: 'cloud:recharge-image__u1__x.jpg', updatedAt: 1 }
    ])
    expect(store.records[0].image).toBe('cloud-image://recharge-image__u1__x.jpg')
  })

  it('普通 URL / 本地路径原样保留', async () => {
    const store = useRechargeStore()
    await store.importBackup([
      { id: 'r3', amount: 30, chargedAt: '2026-01-01', image: 'https://cdn.example.com/b.png', updatedAt: 1 },
      { id: 'r4', amount: 30, chargedAt: '2026-01-01', image: 'data:image/png;base64,AAA', updatedAt: 1 }
    ])
    const byId = Object.fromEntries(store.records.map((r) => [r.id, r.image]))
    expect(byId.r3).toBe('https://cdn.example.com/b.png')
    expect(byId.r4).toBe('data:image/png;base64,AAA')
  })
})
