import { describe, it, expect, vi, afterEach } from 'vitest'

// 默认 Web 环境（isNativePlatform → false）
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => false }
}))
vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: vi.fn(async () => ({ value: null })),
    set: vi.fn(async () => {}),
    remove: vi.fn(async () => {})
  }
}))

import { readPersisted, writePersisted, readSecret, writeSecret, removeSecret } from '../storage'
import { Preferences } from '@capacitor/preferences'

// 可控的 localStorage 替身，用于模拟配额耗尽
function createFakeLocalStorage({ throwOnSet = false } = {}) {
  const map = new Map()
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => {
      if (throwOnSet) throw new Error('QuotaExceededError')
      map.set(key, String(value))
    },
    removeItem: (key) => { map.delete(key) },
    _map: map
  }
}

describe('writePersisted (web)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('写入成功时返回 true', async () => {
    const fake = createFakeLocalStorage()
    vi.stubGlobal('localStorage', fake)
    const result = await writePersisted('key', 'value')
    expect(result).toBe(true)
    expect(fake._map.get('key')).toBe('value')
  })

  it('setItem 抛错（配额耗尽）时返回 false 并记录错误', async () => {
    vi.stubGlobal('localStorage', createFakeLocalStorage({ throwOnSet: true }))
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await writePersisted('key', 'value')
    expect(result).toBe(false)
    expect(errorSpy).toHaveBeenCalled()
  })

  it('critical 为 true 且写入失败时抛出 isStorageWriteError', async () => {
    vi.stubGlobal('localStorage', createFakeLocalStorage({ throwOnSet: true }))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    let caught = null
    try {
      await writePersisted('key', 'value', { critical: true })
    } catch (e) {
      caught = e
    }
    expect(caught).toBeTruthy()
    expect(caught.isStorageWriteError).toBe(true)
    expect(caught.message).toContain('key')
    expect(caught.cause).toBeInstanceOf(Error)
  })

  it('critical 为 true 且写入成功时不抛错', async () => {
    const fake = createFakeLocalStorage()
    vi.stubGlobal('localStorage', fake)
    const result = await writePersisted('key', 'value', { critical: true })
    expect(result).toBe(true)
  })

  it('readPersisted 缺失时仍返回 fallback', async () => {
    vi.stubGlobal('localStorage', createFakeLocalStorage())
    expect(await readPersisted('missing-key', 'fallback')).toBe('fallback')
  })
})

describe('writePersisted (native)', () => {
  afterEach(() => {
    vi.doUnmock('@capacitor/core')
    vi.doUnmock('@capacitor/preferences')
    vi.resetModules()
    vi.unstubAllGlobals()
  })

  async function importNativeStorage(preferencesSet) {
    vi.resetModules()
    vi.doMock('@capacitor/core', () => ({
      Capacitor: { isNativePlatform: () => true }
    }))
    vi.doMock('@capacitor/preferences', () => ({
      Preferences: {
        get: vi.fn(async () => ({ value: null })),
        set: preferencesSet,
        remove: vi.fn(async () => {})
      }
    }))
    return import('../storage')
  }

  it('Preferences.set 失败而 localStorage 成功 → 返回 false（原生端以 Preferences 为准）', async () => {
    const fake = createFakeLocalStorage()
    vi.stubGlobal('localStorage', fake)
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const mod = await importNativeStorage(vi.fn(async () => { throw new Error('ipc error') }))
    const result = await mod.writePersisted('nk', 'nv')
    expect(result).toBe(false)
    // localStorage 镜像仍会写入
    expect(fake._map.get('nk')).toBe('nv')
  })

  it('Preferences.set 成功而 localStorage 抛错 → 返回 true', async () => {
    vi.stubGlobal('localStorage', createFakeLocalStorage({ throwOnSet: true }))
    const setSpy = vi.fn(async () => {})
    const mod = await importNativeStorage(setSpy)
    const result = await mod.writePersisted('nk2', 'nv2')
    expect(result).toBe(true)
    expect(setSpy).toHaveBeenCalledWith({ key: 'nk2', value: 'nv2' })
  })
})

describe('secret helpers (web)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('writeSecret 只写 localStorage，不触碰 Preferences', async () => {
    const fake = createFakeLocalStorage()
    vi.stubGlobal('localStorage', fake)
    Preferences.set.mockClear()
    await writeSecret('sk', 'sv')
    expect(fake._map.get('sk')).toBe('sv')
    expect(Preferences.set).not.toHaveBeenCalled()
  })

  it('readSecret 读写往返，缺失时返回 fallback', async () => {
    const fake = createFakeLocalStorage()
    vi.stubGlobal('localStorage', fake)
    await writeSecret('sk', 'sv')
    expect(await readSecret('sk')).toBe('sv')
    expect(await readSecret('missing', 'fb')).toBe('fb')
  })

  it('removeSecret 删除 localStorage 副本', async () => {
    const fake = createFakeLocalStorage()
    vi.stubGlobal('localStorage', fake)
    fake._map.set('sk', 'sv')
    await removeSecret('sk')
    expect(fake._map.has('sk')).toBe(false)
  })
})

describe('secret helpers (native)', () => {
  afterEach(() => {
    vi.doUnmock('@capacitor/core')
    vi.doUnmock('@capacitor/preferences')
    vi.resetModules()
    vi.unstubAllGlobals()
  })

  // 原生模式 + 内存 Map 模拟 Preferences，setThrows 用于模拟插件异常
  async function importNativeSecretStorage({ prefsStore = new Map(), setThrows = false } = {}) {
    vi.resetModules()
    vi.doMock('@capacitor/core', () => ({
      Capacitor: { isNativePlatform: () => true }
    }))
    vi.doMock('@capacitor/preferences', () => ({
      Preferences: {
        get: vi.fn(async ({ key }) => ({ value: prefsStore.has(key) ? prefsStore.get(key) : null })),
        set: vi.fn(async ({ key, value }) => {
          if (setThrows) throw new Error('ipc error')
          prefsStore.set(key, value)
        }),
        remove: vi.fn(async ({ key }) => { prefsStore.delete(key) })
      }
    }))
    const mod = await import('../storage')
    return { mod, prefsStore }
  }

  it('writeSecret 写入 Preferences 并清理 localStorage 旧副本', async () => {
    const fake = createFakeLocalStorage()
    fake._map.set('sk', 'stale')
    vi.stubGlobal('localStorage', fake)
    const { mod, prefsStore } = await importNativeSecretStorage()
    await mod.writeSecret('sk', 'sv')
    expect(prefsStore.get('sk')).toBe('sv')
    expect(fake._map.has('sk')).toBe(false)
  })

  it('一次性迁移：仅 localStorage 有旧值 → 返回旧值并迁移到 Preferences，删除 localStorage 副本', async () => {
    const fake = createFakeLocalStorage()
    fake._map.set('sk', 'legacy-value')
    vi.stubGlobal('localStorage', fake)
    const { mod, prefsStore } = await importNativeSecretStorage()
    expect(await mod.readSecret('sk')).toBe('legacy-value')
    expect(prefsStore.get('sk')).toBe('legacy-value')
    expect(fake._map.has('sk')).toBe(false)
  })

  it('Preferences 命中时顺手清理 localStorage 残留副本', async () => {
    const fake = createFakeLocalStorage()
    fake._map.set('sk', 'stale')
    vi.stubGlobal('localStorage', fake)
    const prefsStore = new Map([['sk', 'canonical']])
    const { mod } = await importNativeSecretStorage({ prefsStore })
    expect(await mod.readSecret('sk')).toBe('canonical')
    expect(fake._map.has('sk')).toBe(false)
  })

  it('Preferences.set 抛错 → writeSecret 退回 localStorage，值不丢失', async () => {
    const fake = createFakeLocalStorage()
    vi.stubGlobal('localStorage', fake)
    const { mod, prefsStore } = await importNativeSecretStorage({ setThrows: true })
    await mod.writeSecret('sk', 'sv')
    expect(prefsStore.has('sk')).toBe(false)
    expect(fake._map.get('sk')).toBe('sv')
  })

  it('removeSecret 同时清理 localStorage 与 Preferences', async () => {
    const fake = createFakeLocalStorage()
    fake._map.set('sk', 'sv')
    vi.stubGlobal('localStorage', fake)
    const prefsStore = new Map([['sk', 'sv']])
    const { mod } = await importNativeSecretStorage({ prefsStore })
    await mod.removeSecret('sk')
    expect(fake._map.has('sk')).toBe(false)
    expect(prefsStore.has('sk')).toBe(false)
  })
})
