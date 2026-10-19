import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

// 持久化：内存 Map；__store 仅用于测试之间清理状态。
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

// 预设改动触发的自动推送需要 sync store；本测试只验 store 行为，直接短路
vi.mock('@/stores/storeCore', () => ({ createAutoPush: () => () => {} }))

import * as storage from '@/utils/platform/storage'
import { usePresetsStore } from '../presets'
import { buildCharacterRowId, parseCharacterRowId } from '@/utils/presets/characterId'

const CHR_KEY = 'goods_presets_characters'
const TOMB_KEY = 'goods_presets_row_tombstones_v1'

describe('角色身份 = (ip, name) 复合键', () => {
  beforeEach(() => {
    storage.__store.clear()
    setActivePinia(createPinia())
  })

  it('buildCharacterRowId / parseCharacterRowId 互逆（含无 IP）', () => {
    expect(buildCharacterRowId('明日方舟', '能天使')).toBe('明日方舟::能天使')
    expect(buildCharacterRowId('', '能天使')).toBe('::能天使')
    expect(buildCharacterRowId('', '')).toBe('')
    expect(parseCharacterRowId('明日方舟::能天使')).toEqual({ ip: '明日方舟', name: '能天使' })
    expect(parseCharacterRowId('::能天使')).toEqual({ ip: '', name: '能天使' })
    // 旧版 id（纯名字）按无 IP 解析
    expect(parseCharacterRowId('能天使')).toEqual({ ip: '', name: '能天使' })
  })

  it('同名角色可分属不同 IP 各自新增', async () => {
    const presets = usePresetsStore()

    expect(await presets.addCharacter('小樱', 'A')).toBe(true)
    expect(await presets.addCharacter('小樱', 'B')).toBe(true)
    // 同一 (ip,name) 重复新增被拒
    expect(await presets.addCharacter('小樱', 'A')).toBe(false)

    expect(presets.characters).toEqual([
      { name: '小樱', ip: 'A' },
      { name: '小樱', ip: 'B' }
    ])
  })

  it('带 IP 新增会升级同名的「无 IP 占位」，不留重复', async () => {
    const presets = usePresetsStore()

    await presets.addCharacter('小樱', '')
    await presets.addCharacter('小樱', 'A')

    expect(presets.characters).toEqual([{ name: '小樱', ip: 'A' }])
  })

  it('无 IP 占位被带 IP 升级后，收藏 key 一起搬过去', async () => {
    const presets = usePresetsStore()
    await presets.addCharacter('小樱', '')
    await presets.toggleFavoriteCharacter(buildCharacterRowId('', '小樱'))

    await presets.addCharacter('小樱', 'A')

    expect(presets.characters).toEqual([{ name: '小樱', ip: 'A' }])
    expect(presets.favoriteCharacterSet.has('A::小樱')).toBe(true)
    expect(presets.favoriteCharacterSet.has('::小樱')).toBe(false)
  })

  it('收藏 key 是复合 id，只影响对应的那个 IP', async () => {
    const presets = usePresetsStore()
    await presets.addCharacter('小樱', 'A')
    await presets.addCharacter('小樱', 'B')

    await presets.toggleFavoriteCharacter(buildCharacterRowId('A', '小樱'))

    expect(presets.favoriteCharacterSet.has('A::小樱')).toBe(true)
    expect(presets.favoriteCharacterSet.has('B::小樱')).toBe(false)

    await presets.toggleFavoriteCharacter(buildCharacterRowId('A', '小樱'))
    expect(presets.favoriteCharacterSet.has('A::小樱')).toBe(false)
  })

  it('改名只改指定 IP 下的那条，收藏 key 跟着走，并留旧 id 墓碑', async () => {
    const presets = usePresetsStore()
    await presets.addCharacter('小樱', 'A')
    await presets.addCharacter('小樱', 'B')
    await presets.toggleFavoriteCharacter(buildCharacterRowId('A', '小樱'))

    const ok = await presets.updateCharacterName(buildCharacterRowId('A', '小樱'), '樱')
    expect(ok).toBe(true)

    expect(presets.characters).toEqual([
      { name: '樱', ip: 'A' },
      { name: '小樱', ip: 'B' }
    ])
    expect(presets.favoriteCharacterSet.has('A::樱')).toBe(true)
    expect(presets.favoriteCharacterSet.has('A::小樱')).toBe(false)

    const tombstones = JSON.parse(await storage.readPersisted(TOMB_KEY))
    expect(tombstones).toEqual([expect.objectContaining({ domain: 'character', id: 'A::小樱' })])
  })

  it('同名跨 IP 改名互不冲突；同一 IP 内撞名才被拒', async () => {
    const presets = usePresetsStore()
    await presets.addCharacter('小樱', 'A')
    await presets.addCharacter('小樱', 'B')

    // A 下改名成 B 下已有的同名角色不冲突（不同 IP）
    const ok = await presets.updateCharacterName(buildCharacterRowId('A', '小樱'), '小樱二号')
    expect(ok).toBe(true)
    expect(presets.characters).toContainEqual({ name: '小樱二号', ip: 'A' })
    expect(presets.characters).toContainEqual({ name: '小樱', ip: 'B' })

    // 同一 IP 下已有「小樱二号」时，B 下角色改名撞名会被拒
    await presets.addCharacter('小樱二号', 'B')
    const rejected = await presets.updateCharacterName(buildCharacterRowId('B', '小樱'), '小樱二号')
    expect(rejected).toBe(false)
  })

  it('改 IP 会更新复合 id 与收藏，并留旧 id 墓碑', async () => {
    const presets = usePresetsStore()
    await presets.addCharacter('小樱', 'A')
    await presets.toggleFavoriteCharacter(buildCharacterRowId('A', '小樱'))

    await presets.updateCharacterIp(buildCharacterRowId('A', '小樱'), 'B')

    expect(presets.characters).toEqual([{ name: '小樱', ip: 'B' }])
    expect(presets.favoriteCharacterSet.has('B::小樱')).toBe(true)
    expect(presets.favoriteCharacterSet.has('A::小樱')).toBe(false)

    const tombstones = JSON.parse(await storage.readPersisted(TOMB_KEY))
    expect(tombstones).toEqual([expect.objectContaining({ domain: 'character', id: 'A::小樱' })])
  })

  it('syncCharactersFromGoods 按 (ip,name) 收录同名角色', async () => {
    const presets = usePresetsStore()

    await presets.syncCharactersFromGoods([
      { ip: 'A', characters: ['小樱'] },
      { ip: 'B', characters: ['小樱'] }
    ])

    expect(presets.characters).toEqual([
      { name: '小樱', ip: 'A' },
      { name: '小樱', ip: 'B' }
    ])
  })

  it('init 从角色条目本身的 fav 恢复收藏', async () => {
    await storage.writePersisted(CHR_KEY, JSON.stringify([
      { name: '小樱', ip: 'A', fav: true },
      { name: '雪', ip: 'A', fav: false }
    ]))
    const presets = usePresetsStore()
    await presets.init()

    expect(presets.favoriteCharacters).toEqual(['A::小樱'])
    expect(presets.characterItems).toEqual([
      { name: '小樱', ip: 'A', fav: true },
      { name: '雪', ip: 'A', fav: false }
    ])
  })
})
