import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/utils/platform/http', () => ({
  fetchWithPlatformBridge: vi.fn()
}))

import { fetchWithPlatformBridge } from '@/utils/platform/http'
import {
  extractSupabasePublicStoragePath,
  formatThroughputBps,
  measureImageSourceOnce,
  measureThroughputOnce,
  runImageSourceSpeedTest,
  testImageSource
} from '@/utils/image/imageSourceSpeedTest'

function makeStreamResponse({ ok = true, status = 200, chunks = [new Uint8Array(3)] } = {}) {
  let index = 0
  return {
    ok,
    status,
    body: {
      getReader() {
        return {
          read: async () => {
            if (index >= chunks.length) return { done: true, value: undefined }
            const value = chunks[index]
            index += 1
            return { done: false, value }
          },
          cancel: async () => {}
        }
      }
    },
    blob: async () => new Blob(chunks, { type: 'image/jpeg' })
  }
}

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

describe('formatThroughputBps', () => {
  it('按 Mbps / Kbps 格式化', () => {
    expect(formatThroughputBps(2_500_000)).toBe('20.0 Mbps')
    expect(formatThroughputBps(125_000)).toBe('1.0 Mbps')
    expect(formatThroughputBps(50_000)).toBe('400 Kbps')
    expect(formatThroughputBps(0)).toBe('')
    expect(formatThroughputBps(null)).toBe('')
  })
})

describe('measureImageSourceOnce / measureThroughputOnce', () => {
  beforeEach(() => {
    fetchWithPlatformBridge.mockReset()
  })

  it('延迟测量只读有限字节', async () => {
    fetchWithPlatformBridge.mockResolvedValue(
      makeStreamResponse({ chunks: [new Uint8Array([1, 2, 3])] })
    )

    const result = await measureImageSourceOnce('https://img.goodsapp.de5.net/goods-images/a.jpg')
    expect(result.ok).toBe(true)
    expect(result.status).toBe(200)
    expect(result.bytes).toBe(3)
    expect(Number.isFinite(result.ms)).toBe(true)
  })

  it('吞吐测量返回 bps', async () => {
    fetchWithPlatformBridge.mockResolvedValue(
      makeStreamResponse({ chunks: [new Uint8Array(1024)] })
    )

    const result = await measureThroughputOnce('https://img.goodsapp.de5.net/goods-images/a.jpg')
    expect(result.ok).toBe(true)
    expect(result.bytes).toBe(1024)
    expect(Number.isFinite(result.bps)).toBe(true)
    expect(result.bps).toBeGreaterThan(0)
  })

  it('失败响应标记 not ok', async () => {
    fetchWithPlatformBridge.mockResolvedValue({
      ok: false,
      status: 404,
      body: null,
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
    vi.useRealTimers()
  })

  it('无样本路径时不发请求', async () => {
    const result = await testImageSource({ sourceId: 'proxy', storagePath: '' })
    expect(result.ok).toBe(false)
    expect(result.error).toBe('no-sample')
    expect(fetchWithPlatformBridge).not.toHaveBeenCalled()
  })

  it('对 proxy/direct 分别请求并取中位延迟', async () => {
    vi.useFakeTimers()
    fetchWithPlatformBridge.mockImplementation(async (url) => {
      const isProxy = String(url).includes('img.goodsapp.de5.net')
      // proxy: 120/100/140 → median 120；direct: 300/280/320 → median 300
      const delays = isProxy ? [120, 100, 140] : [300, 280, 320]
      const ms = delays.shift()
      // 吞吐轮用额外固定延迟
      if (delays.length === 0 && ms != null) {
        await new Promise((resolve) => setTimeout(resolve, ms + 50))
      } else {
        await new Promise((resolve) => setTimeout(resolve, ms ?? 80))
      }
      return makeStreamResponse({ chunks: [new Uint8Array(8)] })
    })

    const payloadPromise = runImageSourceSpeedTest({
      storagePath: 'goods-images/uid/a.jpg',
      rounds: 3
    })
    await vi.runAllTimersAsync()
    const payload = await payloadPromise
    vi.useRealTimers()

    expect(payload.fastestSourceId).toBe('proxy')
    const proxyResult = payload.results.find((item) => item.sourceId === 'proxy')
    const directResult = payload.results.find((item) => item.sourceId === 'direct')
    expect(proxyResult?.ok).toBe(true)
    expect(directResult?.ok).toBe(true)
    expect(proxyResult?.ms).toBeLessThan(directResult?.ms)
    expect(proxyResult?.bps).not.toBeNull()
    expect(directResult?.bps).not.toBeNull()
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
