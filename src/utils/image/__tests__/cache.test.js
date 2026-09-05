import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// cache.js 顶层引入 Capacitor Filesystem 与平台 HTTP 桥；本测试只覆盖内存层，
// 两者都 mock 掉以保证在 happy-dom 下可导入且路径确定（isNative() 恒为 false）。
vi.mock('@capacitor/filesystem', () => ({
  Filesystem: {
    readFile: vi.fn(),
    stat: vi.fn(),
    writeFile: vi.fn(),
    readdir: vi.fn(),
    deleteFile: vi.fn(),
    mkdir: vi.fn(),
    rmdir: vi.fn(),
    getUri: vi.fn()
  },
  Directory: { Cache: 'Cache', Data: 'Data' }
}))

vi.mock('@/utils/platform/http', () => ({
  fetchWithPlatformBridge: vi.fn(async () => ({
    ok: true,
    blob: async () => new Blob(['image-bytes'], { type: 'image/jpeg' })
  }))
}))

import {
  aliasCachedImage,
  clearMemoryCache,
  getCachedImage,
  hasRecentlyDecodedImage,
  peekCachedImage
} from '@/utils/image/cache'

describe('utils/image/cache aliasCachedImage', () => {
  beforeEach(() => {
    clearMemoryCache()
    // 强制走「内存 → 网络」路径，排除 happy-dom 下 Cache API 实现差异
    vi.stubGlobal('caches', undefined)
  })

  afterEach(() => {
    clearMemoryCache()
    vi.unstubAllGlobals()
  })

  it('文件型 URI 直接返回原地址，不进缓存管线', async () => {
    const localUrl = 'http://localhost/_capacitor_file_/user-images/1000_abcd.jpg'
    await expect(getCachedImage(localUrl)).resolves.toBe(localUrl)
    const capacitorUri = 'capacitor://localhost/_capacitor_file_/data/user-images/1000_abcd.jpg'
    await expect(getCachedImage(capacitorUri)).resolves.toBe(capacitorUri)
  })

  it('把旧 URL 的内存位图过户给新 URL（共享同一 object URL）', async () => {
    const dataUrl = 'data:image/jpeg;base64,AAAA'
    const blobUrl = await getCachedImage(dataUrl)
    expect(blobUrl.startsWith('blob:')).toBe(true)

    const cloudUrl = 'https://example.supabase.co/storage/v1/object/public/goods-images/goods-image__1000__x.jpg'
    aliasCachedImage(dataUrl, cloudUrl)

    // 新 URL 同步命中内存层，拿到的是同一份位图
    expect(peekCachedImage(cloudUrl)).toBe(blobUrl)
    // 卡片用新 URL 重渲染时不再发起网络请求
    await expect(getCachedImage(cloudUrl)).resolves.toBe(blobUrl)
    // hero 侧据此跳过解码等待
    expect(hasRecentlyDecodedImage(cloudUrl)).toBe(true)
  })

  it('源 URL 没有内存位图时不产生别名', () => {
    const cloudUrl = 'https://example.com/never-loaded.jpg'
    aliasCachedImage('http://localhost/_capacitor_file_/user-images/missing.jpg', cloudUrl)
    expect(peekCachedImage(cloudUrl)).toBe('')
  })

  it('目标 URL 已有缓存时保留既有条目不覆盖', async () => {
    const urlA = 'https://example.com/a.jpg'
    const urlB = 'https://example.com/b.jpg'
    await getCachedImage(urlA)
    const blobB = await getCachedImage(urlB)

    aliasCachedImage(urlA, urlB)
    expect(peekCachedImage(urlB)).toBe(blobB)
    // 过户仍应补上解码标记，供 hero 快照复用
    expect(hasRecentlyDecodedImage(urlB)).toBe(true)
  })

  it('fromUrl 与 toUrl 相同时是无操作', async () => {
    const url = 'https://example.com/same.jpg'
    const blobUrl = await getCachedImage(url)
    expect(() => aliasCachedImage(url, url)).not.toThrow()
    expect(peekCachedImage(url)).toBe(blobUrl)
  })
})
