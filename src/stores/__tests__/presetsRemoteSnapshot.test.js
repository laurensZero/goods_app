import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

// 持久化：内存 Map（含远端块时间戳键）。__store 仅用于测试之间清理状态。
vi.mock('@/utils/platform/storage', () => {
  const store = new Map()
  return {
    __store: store,
    readPersisted: vi.fn(async (key, fallback = null) => (store.has(key) ? store.get(key) : fallback)),
    writePersisted: vi.fn(async (key, value) => {
      store.set(key, value)
      return true
    }),
    removePersisted: vi.fn(async (key) => {
      store.delete(key)
    })
  }
})

// 预设改动触发的自动推送需要 sync store；本测试只验快照合并，直接短路
vi.mock('@/stores/storeCore', () => ({ createAutoPush: () => () => {} }))

import * as storage from '@/utils/platform/storage'
import { usePresetsStore } from '../presets'

const REMOTE_AT_KEY = 'goods_presets_remote_updated_at'

function snapshot(categoryName, customFieldDefs = []) {
  // 真实快照由 reader 构造，各键齐全
  return {
    categories: [{ name: categoryName }],
    ips: [],
    characters: [],
    storageLocations: [],
    customFieldDefs
  }
}

describe('replacePresetsSnapshot 块级时钟（服务器时间域）', () => {
  beforeEach(() => {
    storage.__store.clear()
    setActivePinia(createPinia())
  })

  it('应用新块并记录时间戳；更旧的响应被忽略（避免预设回退）', async () => {
    const presets = usePresetsStore()

    await presets.replacePresetsSnapshot(snapshot('A'), { updatedAt: 2000 })
    expect(presets.categories).toEqual(['A'])
    expect(await storage.readPersisted(REMOTE_AT_KEY)).toBe('2000')

    // 过期响应（pull 在本地推送之前发出）—— 应用它会把本地预设回退到旧块
    await presets.replacePresetsSnapshot(snapshot('B'), { updatedAt: 1000 })
    expect(presets.categories).toEqual(['A'])
    expect(await storage.readPersisted(REMOTE_AT_KEY)).toBe('2000')

    // 更新的块正常应用
    await presets.replacePresetsSnapshot(snapshot('C'), { updatedAt: 3000 })
    expect(presets.categories).toEqual(['C'])
    expect(await storage.readPersisted(REMOTE_AT_KEY)).toBe('3000')
  })

  it('缺时间戳（旧实例无该列）时不做过期判断，仍按原有语义应用', async () => {
    const presets = usePresetsStore()

    await presets.replacePresetsSnapshot(snapshot('A'), { updatedAt: 2000 })
    await presets.replacePresetsSnapshot(snapshot('B'))
    expect(presets.categories).toEqual(['B'])
  })

  it('相等时间戳（同一块的重复拉取）幂等应用', async () => {
    const presets = usePresetsStore()

    await presets.replacePresetsSnapshot(snapshot('A'), { updatedAt: 2000 })
    await presets.replacePresetsSnapshot(snapshot('A'), { updatedAt: 2000 })
    expect(presets.categories).toEqual(['A'])
  })

  it('自定义字段定义随块一起应用', async () => {
    const presets = usePresetsStore()
    const defs = [{ id: 'cf_1', name: '联动限定', type: 'text', options: [] }]

    await presets.replacePresetsSnapshot(snapshot('A', defs), { updatedAt: 5000 })

    expect(presets.customFieldDefs).toEqual(defs)
  })
})
