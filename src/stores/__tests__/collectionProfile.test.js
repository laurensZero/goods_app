import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { COLLECTION_PROFILE_STORAGE_KEY, useCollectionProfileStore } from '@/stores/collectionProfile'
import { deleteManagedLocalImages } from '@/utils/image/localImage'

vi.mock('@/utils/image/localImage', () => ({
  deleteManagedLocalImages: vi.fn(async () => 0)
}))

function imageItem(id, localPath = '') {
  return { id, kind: 'image', uri: `local://${id}`, localPath }
}

function imageSet(ids, rotation = {}) {
  return {
    items: ids.map((id) => imageItem(id)),
    rotation: { mode: 'visit', intervalSec: 8, order: 'seq', transition: 'fade', ...rotation }
  }
}

function readStored() {
  return JSON.parse(localStorage.getItem(COLLECTION_PROFILE_STORAGE_KEY))
}

let store

beforeEach(() => {
  localStorage.clear()
  setActivePinia(createPinia())
  store = useCollectionProfileStore()
  deleteManagedLocalImages.mockReset()
  deleteManagedLocalImages.mockResolvedValue(0)
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('collectionProfile store — 初始化', () => {
  it('is not ready until init() resolves', async () => {
    expect(store.isReady).toBe(false)
    await store.init()
    expect(store.isReady).toBe(true)
  })

  it('loads, normalizes and drops empty/corrupt entries', async () => {
    localStorage.setItem(COLLECTION_PROFILE_STORAGE_KEY, JSON.stringify({
      version: 1,
      ipProfiles: {
        ' 明日方舟 ': { items: [imageItem('a'), { kind: 'image', uri: '' }], rotation: { mode: 'interval', intervalSec: 0 } },
        '空集': { items: [] }
      },
      characterProfiles: { '明日方舟::能天使': { items: [] } }
    }))

    await store.init()

    expect(Object.keys(store.ipProfiles)).toEqual(['明日方舟'])
    expect(store.ipProfiles['明日方舟'].items).toHaveLength(1)
    expect(store.ipProfiles['明日方舟'].rotation.mode).toBe('interval')
    expect(store.ipProfiles['明日方舟'].rotation.intervalSec).toBe(8)
    expect(store.characterProfiles).toEqual({})
  })

  it('starts from an empty state when the payload is corrupt', async () => {
    localStorage.setItem(COLLECTION_PROFILE_STORAGE_KEY, '{not json')
    await store.init()
    expect(store.ipProfiles).toEqual({})
    expect(store.characterProfiles).toEqual({})
    expect(store.isReady).toBe(true)
  })

  it('only loads once', async () => {
    await store.init()
    store.writeIpProfile('明日方舟', imageSet(['a']))
    await store.init()
    expect(store.ipProfiles['明日方舟'].items).toHaveLength(1)
  })
})

describe('collectionProfile store — 写入与持久化', () => {
  it('persists IP profiles after the debounce window', async () => {
    await store.init()
    store.writeIpProfile('明日方舟', imageSet(['a', 'b']))

    expect(localStorage.getItem(COLLECTION_PROFILE_STORAGE_KEY)).toBeNull()

    vi.advanceTimersByTime(200)
    const stored = readStored()
    expect(stored.version).toBe(3)
    expect(stored.ipProfiles['明日方舟'].items.map((item) => item.id)).toEqual(['a', 'b'])
  })

  it('清空背景写成删除墓碑（deleted），不再直接丢 key，保证删除能同步', async () => {
    await store.init()
    store.writeIpProfile('明日方舟', imageSet(['a']))
    store.writeIpProfile('明日方舟', { items: [], rotation: {} })

    expect(store.ipProfiles['明日方舟'].items).toEqual([])
    expect(store.ipProfiles['明日方舟'].deleted).toBe(true)
    expect(store.resolve({ ip: '明日方舟' }).owner).toBe('none')

    vi.advanceTimersByTime(200)
    const stored = readStored()
    expect(stored.ipProfiles['明日方舟'].deleted).toBe(true)
    expect(stored.ipProfiles['明日方舟'].items).toEqual([])
  })

  it('keeps character profiles keyed by ip::name', async () => {
    await store.init()
    store.writeCharacterProfile('明日方舟', '能天使', imageSet(['c']))

    expect(Object.keys(store.characterProfiles)).toEqual(['明日方舟::能天使'])
    expect(store.hasCharacterProfile('明日方舟', '能天使')).toBe(true)
    expect(store.hasCharacterProfile('明日方舟', '银灰')).toBe(false)
  })

  it('ignores writes without an IP', async () => {
    await store.init()
    store.writeIpProfile('   ', imageSet(['a']))
    expect(store.ipProfiles).toEqual({})
  })
})

describe('collectionProfile store — 解析与继承', () => {
  beforeEach(async () => {
    await store.init()
    store.writeIpProfile('明日方舟', imageSet(['ip-1', 'ip-2']))
    store.writeCharacterProfile('明日方舟', '能天使', imageSet(['char-1']))
  })

  it('prefers a character own set', () => {
    const resolved = store.resolve({ ip: '明日方舟', character: '能天使' })
    expect(resolved.owner).toBe('character')
    expect(resolved.set.items[0].id).toBe('char-1')
  })

  it('inherits the IP set for characters without their own', () => {
    const resolved = store.resolve({ ip: '明日方舟', character: '银灰' })
    expect(resolved.owner).toBe('ip')
    expect(resolved.key).toBe('明日方舟')
  })

  it('reports none for an unknown IP', () => {
    expect(store.resolve({ ip: '不存在' }).owner).toBe('none')
  })
})

describe('collectionProfile store — 角色跟随所属 IP', () => {
  it('drops the override and deletes its managed image files', async () => {
    await store.init()
    store.writeIpProfile('明日方舟', imageSet(['ip-1']))
    store.writeCharacterProfile('明日方舟', '能天使', {
      items: [imageItem('char-1', 'user-images/char-1.jpg')],
      rotation: {}
    })

    await store.clearCharacterProfile('明日方舟', '能天使')

    expect(store.hasCharacterProfile('明日方舟', '能天使')).toBe(false)
    expect(store.resolve({ ip: '明日方舟', character: '能天使' }).owner).toBe('ip')
    expect(deleteManagedLocalImages).toHaveBeenCalledWith(['user-images/char-1.jpg'])
  })

  it('does nothing when the character has no override', async () => {
    await store.init()
    await store.clearCharacterProfile('明日方舟', '银灰')
    expect(deleteManagedLocalImages).not.toHaveBeenCalled()
  })
})

describe('collectionProfile store — deleteFiles', () => {
  it('filters blank paths and forwards the rest once', async () => {
    await store.init()
    await store.deleteFiles(['a.jpg', '', null, '  ', 'b.jpg'])
    expect(deleteManagedLocalImages).toHaveBeenCalledTimes(1)
    expect(deleteManagedLocalImages).toHaveBeenCalledWith(['a.jpg', 'b.jpg'])
  })

  it('skips the call entirely when nothing is left', async () => {
    await store.init()
    await store.deleteFiles([])
    await store.deleteFiles('')
    expect(deleteManagedLocalImages).not.toHaveBeenCalled()
  })

  it('swallows local-file deletion failures', async () => {
    await store.init()
    deleteManagedLocalImages.mockRejectedValueOnce(new Error('boom'))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await expect(store.deleteFiles(['a.jpg'])).resolves.toBeUndefined()
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})

describe('collectionProfile store — 云同步', () => {
  function cloudItem(id, cloudFileName = '') {
    return {
      id,
      kind: 'image',
      uri: `file:///${id}.jpg`,
      localPath: `user-images/${id}.jpg`,
      cloudFileName,
      width: 1600,
      height: 1200,
      mimeType: 'image/jpeg',
      fileSize: 100
    }
  }

  it('getProfilesForSync 不包含本机 uri / localPath', async () => {
    await store.init()
    store.writeIpProfile('明日方舟', { items: [cloudItem('bg_1')], rotation: {} })
    const snapshot = store.getProfilesForSync()
    const item = snapshot.ipProfiles['明日方舟'].items[0]
    expect(item.cloudFileName).toBe('')
    expect(item.uri).toBeUndefined()
    expect(item.localPath).toBeUndefined()
    expect(item.width).toBe(1600)
  })

  it('markProfileImagesAsRemote 回填 cloudFileName，同时保留本机文件路径', async () => {
    await store.init()
    store.writeIpProfile('明日方舟', { items: [cloudItem('bg_1')], rotation: {} })
    const synced = store.getProfilesForSync()
    synced.ipProfiles['明日方舟'].items[0].cloudFileName = 'profile-bg__bg_1__main.jpg'

    await store.markProfileImagesAsRemote(synced, (name) => `https://cdn/${name}`)

    const item = store.ipProfiles['明日方舟'].items[0]
    expect(item.cloudFileName).toBe('profile-bg__bg_1__main.jpg')
    expect(item.uri).toBe('file:///bg_1.jpg')
    expect(item.localPath).toBe('user-images/bg_1.jpg')
  })

  it('markProfileImagesAsRemote 跳过上传失败的文件', async () => {
    await store.init()
    store.writeIpProfile('明日方舟', { items: [cloudItem('bg_1')], rotation: {} })
    const synced = store.getProfilesForSync()
    synced.ipProfiles['明日方舟'].items[0].cloudFileName = 'profile-bg__bg_1__main.jpg'

    await store.markProfileImagesAsRemote(synced, (name) => `https://cdn/${name}`, new Set(['profile-bg__bg_1__main.jpg']))
    expect(store.ipProfiles['明日方舟'].items[0].cloudFileName).toBe('')
  })

  it('主题色随背景集持久化并进入同步快照', async () => {
    await store.init()
    store.writeIpProfile('明日方舟', {
      items: [cloudItem('bg_1')],
      rotation: {},
      theme: { source: 'custom', customColor: '#123456' }
    })
    expect(store.ipProfiles['明日方舟'].theme).toEqual({ source: 'custom', customColor: '#123456' })
    expect(store.getProfilesForSync().ipProfiles['明日方舟'].theme).toEqual({ source: 'custom', customColor: '#123456' })
  })

  it('applyRemoteProfiles 用公开 URL 回填远端图片，并与同步快照保持一致', async () => {
    await store.init()
    const remote = {
      ipProfiles: {
        '明日方舟': {
          items: [cloudItem('bg_1', 'profile-bg__bg_1__main.jpg')],
          rotation: {}
        }
      },
      characterProfiles: {}
    }
    const syncedRemote = JSON.parse(JSON.stringify(remote))
    // 模拟云端 jsonb：序列化快照只带 cloudFileName
    const { serializeProfileMapForSync } = await import('@/utils/profile/collectionProfile')
    syncedRemote.ipProfiles = serializeProfileMapForSync(remote.ipProfiles)

    await store.applyRemoteProfiles(syncedRemote, { resolveImageUrl: (name) => `https://cdn/${name}` })

    const item = store.ipProfiles['明日方舟'].items[0]
    expect(item.cloudFileName).toBe('profile-bg__bg_1__main.jpg')
    expect(item.uri).toBe('https://cdn/profile-bg__bg_1__main.jpg')
    expect(store.getProfilesForSync()).toEqual(syncedRemote)
  })
})