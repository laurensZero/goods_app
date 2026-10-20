import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

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

vi.mock('@/stores/storeCore', () => ({ createAutoPush: () => () => {} }))

import * as storage from '@/utils/platform/storage'
import { usePresetsStore } from '../presets'

describe('预设拖动重排', () => {
  beforeEach(() => {
    storage.__store.clear()
    setActivePinia(createPinia())
  })

  it('分类按传入顺序保存，未列出的条目保留原相对顺序并追加', async () => {
    await storage.writePersisted('goods_presets_categories', JSON.stringify([
      { name: 'A' },
      { name: 'B' },
      { name: 'C' }
    ]))
    const presets = usePresetsStore()
    await presets.init()

    await presets.reorderCategories(['C', 'A'])

    expect(presets.categories).toEqual(['C', 'A', 'B'])
  })

  it('IP 按传入顺序保存，未知名称被忽略', async () => {
    await storage.writePersisted('goods_presets_ips', JSON.stringify([
      { name: 'A' },
      { name: 'B' },
      { name: 'C' }
    ]))
    const presets = usePresetsStore()
    await presets.init()

    await presets.reorderIps(['B', 'C', '不存在'])

    expect(presets.ips).toEqual(['B', 'C', 'A'])
  })

  it('角色按 (ip,name) 复合 id 重排，同名不同 IP 不会串位', async () => {
    await storage.writePersisted('goods_presets_characters', JSON.stringify([
      { name: '小樱', ip: 'A' },
      { name: '小樱', ip: 'B' },
      { name: '雪', ip: 'A' }
    ]))
    const presets = usePresetsStore()
    await presets.init()

    await presets.reorderCharacters(['B::小樱', 'A::雪', 'A::小樱'])

    expect(presets.characters).toEqual([
      { name: '小樱', ip: 'B' },
      { name: '雪', ip: 'A' },
      { name: '小樱', ip: 'A' }
    ])
  })
})
