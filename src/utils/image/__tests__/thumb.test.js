import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/utils/image/cache', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    getCachedImage: vi.fn(async (url) => url),
    readDerivedImageCache: vi.fn(async () => null),
    writeDerivedImageCache: vi.fn(async () => {})
  }
})

import { getCachedImage, readDerivedImageCache } from '@/utils/image/cache'
import { getCachedImageThumb, peekImageThumb, refreshCachedImageThumb } from '@/utils/image/thumb'

// happy-dom 无法真正解码图片：禁用 createImageBitmap，并用假 Image 让解码立即失败，
// 使生成流程稳定走「失败 → 回退原图」的确定性路径
class BrokenImageStub {
  set src(value) {
    this._src = value
    setTimeout(() => this.onerror?.(new Event('error')), 0)
  }

  get src() {
    return this._src
  }
}

describe('utils/image/thumb', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    readDerivedImageCache.mockResolvedValue(null)
    getCachedImage.mockImplementation(async (url) => url)
    vi.stubGlobal('createImageBitmap', undefined)
    vi.stubGlobal('Image', BrokenImageStub)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('url 为空时返回空字符串', async () => {
    expect(await getCachedImageThumb('')).toBe('')
    expect(peekImageThumb('', 480)).toBe('')
    expect(await refreshCachedImageThumb('')).toBe('')
  })

  it('生成失败时回退原图 URL 并做会话级负缓存', async () => {
    const url = 'https://example.com/photos/a.jpg'
    expect(await getCachedImageThumb(url)).toBe(url)
    expect(peekImageThumb(url)).toBe(url)

    // 第二次直接命中内存负缓存，不再触发持久层读取
    expect(await getCachedImageThumb(url)).toBe(url)
    expect(readDerivedImageCache).toHaveBeenCalledTimes(1)
  }, 15000)

  it('持久层命中时返回缩略图并写入内存', async () => {
    const url = 'https://example.com/photos/b.jpg'
    readDerivedImageCache.mockResolvedValue('blob:thumb-b')
    expect(await getCachedImageThumb(url)).toBe('blob:thumb-b')

    readDerivedImageCache.mockClear()
    expect(await getCachedImageThumb(url)).toBe('blob:thumb-b')
    expect(readDerivedImageCache).not.toHaveBeenCalled()
  })

  it('不同 maxSize 使用不同缓存条目', async () => {
    const url = 'https://example.com/photos/c.jpg'
    expect(await getCachedImageThumb(url, { maxSize: 480 })).toBe(url)
    expect(peekImageThumb(url, 480)).toBe(url)
    expect(peekImageThumb(url, 240)).toBe('')

    expect(await getCachedImageThumb(url, { maxSize: 240 })).toBe(url)
    expect(peekImageThumb(url, 240)).toBe(url)
  }, 15000)

  it('refreshCachedImageThumb 丢弃内存条目后重新解析', async () => {
    const url = 'https://example.com/photos/d.jpg'
    expect(await getCachedImageThumb(url)).toBe(url)

    // 持久层出现缩略图后，refresh 应绕过负缓存拿到新条目
    readDerivedImageCache.mockResolvedValue('blob:thumb-d')
    expect(await refreshCachedImageThumb(url)).toBe('blob:thumb-d')
  }, 15000)
})
