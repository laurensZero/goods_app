import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchWithPlatformBridge } from '../http'

describe('fetchWithPlatformBridge 超时', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('传入 timeoutMs 时会中止挂起的 fetch', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => new Promise((resolve, reject) => {
      init.signal.addEventListener('abort', () => {
        reject(new DOMException('The operation was aborted.', 'AbortError'))
      }, { once: true })
    }))

    await expect(
      fetchWithPlatformBridge('/mihoyo-account-passport/test', { timeoutMs: 30 })
    ).rejects.toThrow('请求超时')
  })

  it('没有 timeoutMs 时保持普通 fetch 行为', async () => {
    const response = { ok: true, status: 200 }
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(response)

    await expect(fetchWithPlatformBridge('/mihoyo-account-passport/test')).resolves.toBe(response)
  })
})
