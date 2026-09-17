import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/utils/platform/http', () => ({
  fetchWithPlatformBridge: vi.fn()
}))

import { fetchWithPlatformBridge } from '@/utils/platform/http'
import {
  extractSupabasePublicStoragePath,
  measureImageSourceOnce,
  runImageSourceSpeedTest,
  testImageSource
} from '@/utils/image/imageSourceSpeedTest'

describe('extractSupabasePublicStoragePath', () => {
  it('从公开 Storage URL 提取 path', () => {
    expect(
      extractSupabasePublicStoragePath(
        'https://zvqzicimowfqshgjsrri.supabase.co/storage/v1/object/public/goods-images/uid/a.jpg'
      )
    ).toBe('goods-images/uid/a.jpg')
  })

  it('非本项目 host / 非公开 Storage 返回空', () => {
    expect(extractSupabasePublicStoragePath('https://example.com/a.jpg')).toBe('')
    expect(
      extractSupabasePublicStoragePath(
        'https://zvqzicimowfqshgjsrri.supabase.co/storage/v1/object/sign/goods-images/a.jpg'
      )
    ).toBe('')
    expect(extractSupabasePublicStoragePath('')).toBe('')
  })
})

describe('measureImageSourceOnce', () => {
  beforeEach(() => {
    fetchWithPlatformBridge.mockReset()
  })

  it('成功响应返回延迟与体积', async () => {
    fetchWithPlatformBridge.mockResolvedValue({
      ok: true,
      status: 200,
      blob: async () => new Blob(['x'], { type: 'image/jpeg' })
    })

    const result = await measureImageSourceOnce('https://img.goodsapp.de5.net/goods-images/a.jpg')
    expect(result.ok).toBe(true)
    expect(result.status).toBe(200)
    expect(result.bytes).toBe(1)
    expect(Number.isFinite(result.ms)).toBe(true)
  })

  it('失败响应标记 not ok', async () => {
    fetchWithPlatformBridge.mockResolvedValue({
      ok: false,
      status: 404,
      blob: async () => new Blob([])
    })

    const result = await measureImageSourceOnce('https://img.goodsapp.de5.net/missing.jpg')
    expect(result.ok).toBe(false)
    expect(result.status).toBe(404)
  })
})

describe('testImageSource / runImageSourceSpeedTest', () => {
  beforeEach(() => {
    fetchWithPlatformBridge.mockReset()
  })

  afterEach(() => {
    fetchWithPlatformBridge.mockReset()
  })

  it('无样本路径时不发请求', async () => {
    const result = await testImageSource({ sourceId: 'proxy', storagePath: '' })
    expect(result.ok).toBe(false)
    expect(result.error).toBe('no-sample')
    expect(fetchWithPlatformBridge).not.toHaveBeenCalled()
  })

  it('对 proxy/direct 分别请求并取中位延迟', async () => {
    // 用可控 fake timer 保证中位数稳定且不拖慢测试
    vi.useFakeTimers()
    fetchWithPlatformBridge.mockImplementation(async (url) => {
      const isProxy = String(url).includes('img.goodsapp.de5.net')
      // proxy: 120/100/140 → median 120；direct: 300/280/320 → median 300
      const delays = isProxy ? [120, 100, 140] : [300, 280, 320]
      const ms = delays.shift()
      await new Promise((resolve) => setTimeout(resolve, ms))
      return {
        ok: true,
        status: 200,
        blob: async () => new Blob(['img'], { type: 'image/jpeg' })
      }
    })

    const payloadPromise = runImageSourceSpeedTest({
      storagePath: 'goods-images/uid/a.jpg',
      rounds: 3
    })
    // 推进足够长的时间让两侧 3 轮顺序测速完成
    await vi.runAllTimersAsync()
    const payload = await payloadPromise
    vi.useRealTimers()

    expect(payload.fastestSourceId).toBe('proxy')
    const proxyResult = payload.results.find((item) => item.sourceId === 'proxy')
    const directResult = payload.results.find((item) => item.sourceId === 'direct')
    expect(proxyResult?.ok).toBe(true)
    expect(directResult?.ok).toBe(true)
    expect(proxyResult?.ms).toBeLessThan(directResult?.ms)
  })

  it('全部失败时 fastest 为空', async () => {
    fetchWithPlatformBridge.mockRejectedValue(new Error('network down'))
    const payload = await runImageSourceSpeedTest({
      storagePath: 'goods-images/uid/a.jpg',
      rounds: 1
    })
    expect(payload.fastestSourceId).toBeNull()
    expect(payload.results.every((item) => item.ok === false)).toBe(true)
  })
})
