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
import { buildCharacterRowId } from '@/utils/presets/characterId'

const BIND_KEY = 'goods_presets_character_bindings'
const TOMB_KEY = 'goods_presets_row_tombstones_v1'

function readTombstones() {
  const raw = storage.__store.get(TOMB_KEY)
  return raw ? JSON.parse(raw) : []
}

describe('角色名绑定组（变体级联）', () => {
  beforeEach(() => {
    storage.__store.clear()
    setActivePinia(createPinia())
  })

  it('setCharacterBinding：建组 / 更新 / 少于 2 个名字被拒', async () => {
    const presets = usePresetsStore()
    await presets.init()
    await presets.addCharacter('初音未来', 'VOCALOID')
    await presets.addCharacter('初音ミク', 'VOCALOID')
    await presets.addCharacter('芙宁娜', '原神')

    expect(await presets.setCharacterBinding(['初音未来', '初音未来', '初音ミク'])).toBe(true)
    expect(presets.characterBindings.length).toBe(1)
    expect(presets.characterBindings[0].names).toEqual(['初音未来', '初音ミク'])
    // 持久化
    expect(JSON.parse(storage.__store.get(BIND_KEY))).toEqual(presets.characterBindings)
    // cascade map
    expect(presets.characterCascadeMap.get('初音ミク').has('初音未来')).toBe(true)
    expect(presets.characterCascadeMap.has('芙宁娜')).toBe(false)

    const groupId = presets.characterBindings[0].id
    // 更新：名单即全部成员
    expect(await presets.setCharacterBinding(['初音未来', '初音ミク', '芙宁娜'], groupId)).toBe(true)
    expect(presets.characterBindings.length).toBe(1)
    expect(presets.characterBindings[0].id).toBe(groupId)
    expect(presets.characterBindings[0].names).toEqual(['初音未来', '初音ミク', '芙宁娜'])

    // 少于 2 个名字不构成绑定
    expect(await presets.setCharacterBinding(['初音未来'])).toBe(false)
    expect(await presets.setCharacterBinding([])).toBe(false)
  })

  it('成员在其它组里时改投新组，消散的旧组推墓碑', async () => {
    const presets = usePresetsStore()
    await presets.init()

    expect(await presets.setCharacterBinding(['A', 'B'])).toBe(true)
    const g1 = presets.characterBindings[0].id
    expect(await presets.setCharacterBinding(['C', 'D'])).toBe(true)
    const g2 = presets.characterBindings[1].id

    // 把 B、C 绑成一组：g1 只剩 A（消散）、g2 只剩 D（消散）
    expect(await presets.setCharacterBinding(['B', 'C'])).toBe(true)
    expect(presets.characterBindings.length).toBe(1)
    expect(presets.characterBindings[0].names).toEqual(['B', 'C'])
    const tombs = readTombstones().filter((row) => row.domain === 'character_binding')
    expect(new Set(tombs.map((row) => row.id))).toEqual(new Set([g1, g2]))
  })

  it('removeCharacterBinding 删除组并推墓碑', async () => {
    const presets = usePresetsStore()
    await presets.init()
    await presets.setCharacterBinding(['A', 'B'])
    const groupId = presets.characterBindings[0].id

    await presets.removeCharacterBinding(groupId)
    expect(presets.characterBindings).toEqual([])
    expect(readTombstones().some((row) => row.domain === 'character_binding' && row.id === groupId)).toBe(true)
    expect(presets.characterCascadeMap.size).toBe(0)
  })

  it('updateCharacterName 联动组内改名', async () => {
    const presets = usePresetsStore()
    await presets.init()
    await presets.addCharacter('旧名', 'A')
    await presets.addCharacter('搭档', 'A')
    await presets.setCharacterBinding(['旧名', '搭档'])

    const renamed = await presets.updateCharacterName(buildCharacterRowId('A', '旧名'), '新名')
    expect(renamed).toBe(true)
    expect(presets.characterBindings[0].names).toEqual(['新名', '搭档'])
  })

  it('removeCharacter 把名字从组剔除；组不足 2 人时消散并推墓碑', async () => {
    const presets = usePresetsStore()
    await presets.init()
    await presets.addCharacter('A', '')
    await presets.addCharacter('B', '')
    await presets.addCharacter('C', '')
    await presets.setCharacterBinding(['A', 'B', 'C'])
    const groupId = presets.characterBindings[0].id

    // 删 A：剩 B、C 仍成组
    await presets.removeCharacter(buildCharacterRowId('', 'A'))
    expect(presets.characterBindings).toEqual([{ id: groupId, names: ['B', 'C'] }])

    // 删 B：只剩 C → 组消散 + 墓碑
    await presets.removeCharacter(buildCharacterRowId('', 'B'))
    expect(presets.characterBindings).toEqual([])
    expect(readTombstones().some((row) => row.domain === 'character_binding' && row.id === groupId)).toBe(true)
  })

  it('replacePresetsSnapshot 应用远端绑定组', async () => {
    const presets = usePresetsStore()
    await presets.init()

    await presets.replacePresetsSnapshot({
      characters: [{ name: '初音未来', ip: '' }],
      characterBindings: [{ id: 'g1', names: ['初音未来', '初音ミク'] }]
    })

    expect(presets.characterBindings).toEqual([{ id: 'g1', names: ['初音未来', '初音ミク'] }])
    expect(JSON.parse(storage.__store.get(BIND_KEY))).toEqual([{ id: 'g1', names: ['初音未来', '初音ミク'] }])
  })
})
