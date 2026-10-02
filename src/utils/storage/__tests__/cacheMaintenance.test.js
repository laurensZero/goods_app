import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const filesystemMock = vi.hoisted(() => ({
  readdir: vi.fn(),
  deleteFile: vi.fn()
}))

const appCacheMock = vi.hoisted(() => ({
  getAppCacheStats: vi.fn(async () => null),
  clearWebViewCache: vi.fn(async () => true)
}))

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: vi.fn(() => true) }
}))

vi.mock('@capacitor/filesystem', () => ({
  Filesystem: filesystemMock,
  Directory: { Cache: 'Cache', Data: 'Data' }
}))

vi.mock('@/utils/storage/appCache', () => appCacheMock)

vi.mock('@/utils/image/cache', () => ({
  getNativeCacheLimitMb: vi.fn(() => 512)
}))

import { Capacitor } from '@capacitor/core'
import {
  CAPGO_DOWNLOAD_DIR,
  SHARE_POSTER_DIR,
  UPDATE_RESIDUE_DIR,
  enforceWebViewCacheBudget,
  getWebViewCacheBudgetBytes,
  pruneCapgoDownloadResidue,
  pruneSharePosters,
  pruneUpdateResidue,
  runCacheMaintenance
} from '@/utils/storage/cacheMaintenance'

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

function file(name, { ageMs = 0, size = 1024, now = Date.now(), mtime = true } = {}) {
  return {
    name,
    type: 'file',
    size,
    ...(mtime ? { mtime: now - ageMs } : {})
  }
}

function setDirectoryContents(map) {
  filesystemMock.readdir.mockImplementation(async ({ path }) => {
    if (!(path in map)) throw new Error('directory not found')
    return { files: map[path] }
  })
}

function deletedPaths() {
  return filesystemMock.deleteFile.mock.calls.map(([options]) => options.path)
}

describe('utils/storage/cacheMaintenance', () => {
  beforeEach(() => {
    localStorage.clear()
    filesystemMock.readdir.mockReset()
    filesystemMock.deleteFile.mockReset()
    filesystemMock.deleteFile.mockResolvedValue({})
    filesystemMock.readdir.mockRejectedValue(new Error('directory not found'))
    appCacheMock.getAppCacheStats.mockReset()
    appCacheMock.getAppCacheStats.mockResolvedValue(null)
    appCacheMock.clearWebViewCache.mockReset()
    appCacheMock.clearWebViewCache.mockResolvedValue(true)
    Capacitor.isNativePlatform.mockReturnValue(true)
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('分享海报只保留最近 3 张，更早的删掉', async () => {
    const now = Date.now()
    setDirectoryContents({
      [SHARE_POSTER_DIR]: [
        file('goods_share_a_3.png', { now, ageMs: HOUR }),
        file('goods_share_a_2.png', { now, ageMs: 2 * HOUR }),
        file('goods_share_a_1.png', { now, ageMs: 3 * HOUR }),
        file('goods_share_a_0.png', { now, ageMs: 4 * HOUR })
      ]
    })

    const result = await pruneSharePosters(now)

    expect(result.removed).toBe(1)
    expect(deletedPaths()).toEqual([`${SHARE_POSTER_DIR}/goods_share_a_0.png`])
  })

  it('超过 24 小时的海报即使数量很少也删掉', async () => {
    const now = Date.now()
    setDirectoryContents({
      [SHARE_POSTER_DIR]: [
        file('goods_share_a_1.png', { now, ageMs: 25 * HOUR }),
        file('goods_share_a_0.png', { now, ageMs: 26 * HOUR })
      ]
    })

    await expect(pruneSharePosters(now)).resolves.toEqual({ removed: 2, bytes: 2048 })
  })

  it('mtime 缺失时回落到文件名里的时间戳排序', async () => {
    const now = Date.now()
    setDirectoryContents({
      [SHARE_POSTER_DIR]: [
        file(`goods_share_a_${now}.png`, { mtime: false }),
        file(`goods_share_a_${now - HOUR}.png`, { mtime: false }),
        file(`goods_share_a_${now - 2 * HOUR}.png`, { mtime: false }),
        file(`goods_share_a_${now - 3 * HOUR}.png`, { mtime: false })
      ]
    })

    await pruneSharePosters(now)

    expect(deletedPaths()).toEqual([`${SHARE_POSTER_DIR}/goods_share_a_${now - 3 * HOUR}.png`])
  })

  it('更新残留只删超过 48 小时的文件，mtime 未知一律保留', async () => {
    const now = Date.now()
    setDirectoryContents({
      [UPDATE_RESIDUE_DIR]: [
        file('app-1.2.3.apk', { now, ageMs: 2 * DAY + HOUR, size: 20 * 1024 * 1024 }),
        file('app-1.2.4.apk', { now, ageMs: HOUR, size: 20 * 1024 * 1024 }),
        file('manual-bundle-1.0.0.zip', { mtime: false, size: 5 * 1024 * 1024 })
      ]
    })

    const result = await pruneUpdateResidue(now)

    expect(result.removed).toBe(1)
    expect(result.bytes).toBe(20 * 1024 * 1024)
    expect(deletedPaths()).toEqual([`${UPDATE_RESIDUE_DIR}/app-1.2.3.apk`])
  })

  it('CapGo 下载目录同样按 48 小时回收 zip 与临时分片', async () => {
    const now = Date.now()
    setDirectoryContents({
      [CAPGO_DOWNLOAD_DIR]: [
        file('temp_deadbeef_1.tmp', { now, ageMs: 3 * DAY }),
        file('1.2.4.zip', { now, ageMs: 3 * DAY }),
        file('1.2.5.zip', { now, ageMs: 10 * 60 * 1000 })
      ]
    })

    const result = await pruneCapgoDownloadResidue(now)

    expect(result.removed).toBe(2)
    expect(deletedPaths()).toEqual([
      `${CAPGO_DOWNLOAD_DIR}/temp_deadbeef_1.tmp`,
      `${CAPGO_DOWNLOAD_DIR}/1.2.4.zip`
    ])
  })

  it('目录不存在时静默跳过', async () => {
    await expect(pruneSharePosters()).resolves.toEqual({ removed: 0, bytes: 0 })
    expect(filesystemMock.deleteFile).not.toHaveBeenCalled()
  })

  it('单个文件删除失败不影响其余回收', async () => {
    const now = Date.now()
    setDirectoryContents({
      [SHARE_POSTER_DIR]: [
        file('goods_share_a_1.png', { now, ageMs: 30 * HOUR }),
        file('goods_share_a_0.png', { now, ageMs: 31 * HOUR })
      ]
    })
    filesystemMock.deleteFile.mockRejectedValueOnce(new Error('busy'))

    const result = await pruneSharePosters(now)

    expect(result.removed).toBe(1)
    expect(filesystemMock.deleteFile).toHaveBeenCalledTimes(2)
  })

  it('非原生端整体跳过', async () => {
    Capacitor.isNativePlatform.mockReturnValue(false)

    const result = await runCacheMaintenance({ force: true })

    expect(result).toEqual({ removed: 0, bytes: 0, skipped: 'not-native' })
    expect(filesystemMock.readdir).not.toHaveBeenCalled()
  })

  it('6 小时内重复调用被节流，force 可跳过节流', async () => {
    const now = Date.now()
    setDirectoryContents({
      [SHARE_POSTER_DIR]: [
        file('goods_share_a_1.png', { now, ageMs: 30 * HOUR }),
        file('goods_share_a_0.png', { now, ageMs: 31 * HOUR })
      ]
    })

    const first = await runCacheMaintenance({ now })
    expect(first.removed).toBe(2)

    const second = await runCacheMaintenance({ now })
    expect(second.skipped).toBe('throttled')

    const forced = await runCacheMaintenance({ now, force: true })
    expect(forced.skipped).toBeUndefined()
    expect(filesystemMock.readdir).toHaveBeenCalled()
  })

  it('WebView 缓存预算 = 图片上限的一半，夹在 64MB–256MB', () => {
    expect(getWebViewCacheBudgetBytes(512)).toBe(256 * 1024 * 1024)
    expect(getWebViewCacheBudgetBytes(1024)).toBe(256 * 1024 * 1024)
    expect(getWebViewCacheBudgetBytes(128)).toBe(64 * 1024 * 1024)
    expect(getWebViewCacheBudgetBytes(32)).toBe(64 * 1024 * 1024)
  })

  it('WebView 缓存在预算内不动它', async () => {
    appCacheMock.getAppCacheStats.mockResolvedValue({
      total: 700 * 1024 * 1024,
      webView: 100 * 1024 * 1024,
      dirs: {},
      path: '/data/user/0/com.goodsapp.collector/cache'
    })

    const result = await enforceWebViewCacheBudget({ limitMb: 512 })

    expect(result).toMatchObject({ available: true, cleared: false, webView: 100 * 1024 * 1024 })
    expect(appCacheMock.clearWebViewCache).not.toHaveBeenCalled()
  })

  it('WebView 缓存超预算时整块清掉', async () => {
    appCacheMock.getAppCacheStats.mockResolvedValue({
      total: 818 * 1024 * 1024,
      webView: 306 * 1024 * 1024,
      dirs: {},
      path: '/data/user/0/com.goodsapp.collector/cache'
    })

    const result = await runCacheMaintenance({ force: true })

    expect(result.webViewCleared).toBe(true)
    expect(result.cacheTotal).toBe(818 * 1024 * 1024)
    expect(appCacheMock.clearWebViewCache).toHaveBeenCalledTimes(1)
  })

  it('插件不可用（旧 APK）时静默降级', async () => {
    appCacheMock.getAppCacheStats.mockResolvedValue(null)

    const result = await enforceWebViewCacheBudget({ limitMb: 512 })

    expect(result).toMatchObject({ available: false, cleared: false })
    expect(appCacheMock.clearWebViewCache).not.toHaveBeenCalled()
  })
})
