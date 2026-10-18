import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// cache.js 顶层引入 Capacitor Filesystem 与平台 HTTP 桥；这里只验证下载入址策略，
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
  fetchWithPlatformBridge: vi.fn()
}))

const PRIMARY = 'https://api.goodsapp.de5.net'
const CF = 'https://cf.goodsapp.de5.net'
const IMAGE_PATH = '/storage/v1/object/public/goods-images/uid/goods-image__g1__img1__1.jpg'
const PRIMARY_URL = `${PRIMARY}${IMAGE_PATH}`
const CF_URL = `${CF}${IMAGE_PATH}`
const THIRD_PARTY_URL = 'https://i1.hdslb.com/bfs/archive/abc.jpg'

// 只替掉候选计算，cache.js 的其余依赖走真实实现。
// 行里的 uri 指向 CF、当前偏好端点是主站 —— 正是「切了端点但存量行没被回写」的形态。
vi.mock('@/utils/sync/supabaseClient', () => ({
  getPublicImageDisplayCandidates: vi.fn((url) => {
    const raw = String(url || '').trim()
    if (!raw.includes('/storage/v1/object/public/')) return [raw]
    return raw === CF_URL ? [PRIMARY_URL, CF_URL] : [PRIMARY_URL, CF_URL]
  })
}))

import { clearMemoryCache, getCachedImage, peekCachedImage } from '@/utils/image/cache'

function okResponse(bytes = 'image-bytes') {
  return {
    ok: true,
    status: 200,
    blob: async () => new Blob([bytes], { type: 'image/jpeg' })
  }
}

describe('utils/image/cache 内置存储域名按当前端点 rebase', () => {
  let fetchWithPlatformBridge

  beforeEach(async () => {
    clearMemoryCache()
    // 强制走「内存 → 网络」路径，排除 happy-dom 下 Cache API 实现差异
    vi.stubGlobal('caches', undefined)
    ;({ fetchWithPlatformBridge } = await import('@/utils/platform/http'))
    fetchWithPlatformBridge.mockReset()
    fetchWithPlatformBridge.mockResolvedValue(okResponse())
  })

  afterEach(() => {
    clearMemoryCache()
    vi.unstubAllGlobals()
  })

  it('行里存的是旧端点，下载打到当前端点；缓存 key 仍是行里的原始地址', async () => {
    const cached = await getCachedImage(CF_URL)

    expect(cached.startsWith('blob:')).toBe(true)
    expect(fetchWithPlatformBridge).toHaveBeenCalledTimes(1)
    expect(String(fetchWithPlatformBridge.mock.calls[0][0])).toBe(PRIMARY_URL)
    // 命中路径（peek/LRU/Cache API key）必须保持行里的地址，端点切换不该让缓存整体失效
    expect(peekCachedImage(CF_URL)).toBe(cached)
  })

  it('当前端点不可达时回落到候选里的旧端点，仍按原始地址缓存', async () => {
    fetchWithPlatformBridge.mockImplementation(async (target) => {
      if (String(target) === PRIMARY_URL) throw new Error('primary down')
      return okResponse()
    })

    const cached = await getCachedImage(CF_URL)

    expect(cached.startsWith('blob:')).toBe(true)
    expect(fetchWithPlatformBridge).toHaveBeenCalledTimes(2)
    expect(String(fetchWithPlatformBridge.mock.calls[0][0])).toBe(PRIMARY_URL)
    expect(String(fetchWithPlatformBridge.mock.calls[1][0])).toBe(CF_URL)
    expect(peekCachedImage(CF_URL)).toBe(cached)
  })

  it('全部候选失败时返回原始地址且不写内存（保持可重试）', async () => {
    fetchWithPlatformBridge.mockRejectedValue(new Error('all endpoints down'))

    const returned = await getCachedImage(CF_URL)

    expect(returned).toBe(CF_URL)
    expect(fetchWithPlatformBridge).toHaveBeenCalledTimes(2)
    expect(peekCachedImage(CF_URL)).toBe('')
  })

  it('第三方 CDN 不是内置存储地址：只试一次、不做 rebase', async () => {
    const cached = await getCachedImage(THIRD_PARTY_URL)

    expect(cached.startsWith('blob:')).toBe(true)
    expect(fetchWithPlatformBridge).toHaveBeenCalledTimes(1)
    expect(String(fetchWithPlatformBridge.mock.calls[0][0])).toBe(THIRD_PARTY_URL)
  })

  it('候选地址各自带自己的 referrer 策略（沿用 buildImageFetchInit 的 host 判定）', async () => {
    fetchWithPlatformBridge.mockImplementation(async (target) => {
      if (String(target) === PRIMARY_URL) throw new Error('primary down')
      return okResponse()
    })

    await getCachedImage(CF_URL)

    expect(fetchWithPlatformBridge.mock.calls[1][1]).toBeUndefined()
  })
})
