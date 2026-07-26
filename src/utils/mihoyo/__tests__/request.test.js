import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  isNativePlatform: vi.fn(),
  request: vi.fn(),
  fetchWithPlatformBridge: vi.fn(),
}))

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: mocks.isNativePlatform },
  CapacitorHttp: { request: mocks.request },
}))

vi.mock('@/utils/platform/http', () => ({
  fetchWithPlatformBridge: mocks.fetchWithPlatformBridge,
}))

import {
  mihoyoRequest,
  MIHOYO_API_BASE,
  MIHOYO_TIMEOUT_MESSAGE,
  DEFAULT_CONNECT_TIMEOUT_MS,
  DEFAULT_READ_TIMEOUT_MS,
} from '../request'
import { isMihoyoCookieExpiredError } from '../index'

// restoreMocks 不会重置 vi.fn() 的调用记录，需要手动清理
beforeEach(() => {
  mocks.isNativePlatform.mockReset()
  mocks.request.mockReset()
  mocks.fetchWithPlatformBridge.mockReset()
})

function mockNative() {
  mocks.isNativePlatform.mockReturnValue(true)
}

function mockWeb() {
  mocks.isNativePlatform.mockReturnValue(false)
}

function webResponse({ ok = true, status = 200, json = {} } = {}) {
  return { ok, status, json: async () => json }
}

describe('mihoyoRequest 原生分支', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('GET 请求：拼接域名、透传 headers（保留 Cookie）、默认超时、无 data 键', async () => {
    mockNative()
    mocks.request.mockResolvedValue({ data: { retcode: 0, data: { ok: 1 } } })

    const headers = { 'Cookie': 'a=b', 'Referer': 'https://www.mihoyogift.com/' }
    const json = await mihoyoRequest('/common/test?x=1', { headers })

    expect(json).toEqual({ retcode: 0, data: { ok: 1 } })
    expect(mocks.request).toHaveBeenCalledTimes(1)
    const options = mocks.request.mock.calls[0][0]
    expect(options.url).toBe(`${MIHOYO_API_BASE}/common/test?x=1`)
    expect(options.method).toBe('GET')
    expect(options.headers).toEqual(headers)
    expect(options.connectTimeout).toBe(DEFAULT_CONNECT_TIMEOUT_MS)
    expect(options.readTimeout).toBe(DEFAULT_READ_TIMEOUT_MS)
    expect('data' in options).toBe(false)
  })

  it('res.data 为字符串时 JSON.parse，为对象时原样返回', async () => {
    mockNative()
    mocks.request.mockResolvedValue({ data: '{"retcode":0,"message":"ok"}' })
    await expect(mihoyoRequest('/p')).resolves.toEqual({ retcode: 0, message: 'ok' })

    const payload = { retcode: 0, data: { list: [] } }
    mocks.request.mockResolvedValue({ data: payload })
    await expect(mihoyoRequest('/p')).resolves.toBe(payload)
  })

  it('支持按调用覆盖 connectTimeoutMs / readTimeoutMs', async () => {
    mockNative()
    mocks.request.mockResolvedValue({ data: { retcode: 0 } })

    await mihoyoRequest('/p', { connectTimeoutMs: 1000, readTimeoutMs: 2000 })

    const options = mocks.request.mock.calls[0][0]
    expect(options.connectTimeout).toBe(1000)
    expect(options.readTimeout).toBe(2000)
  })

  it('看门狗：请求永不返回时，总超时后以超时文案拒绝', async () => {
    vi.useFakeTimers()
    mockNative()
    mocks.request.mockReturnValue(new Promise(() => {}))

    const promise = mihoyoRequest('/p')
    const assertion = expect(promise).rejects.toThrow(MIHOYO_TIMEOUT_MESSAGE)
    await vi.advanceTimersByTimeAsync(DEFAULT_CONNECT_TIMEOUT_MS + DEFAULT_READ_TIMEOUT_MS)
    await assertion
  })

  it('原生超时类错误归一化为超时文案，其它错误原样抛出', async () => {
    mockNative()
    mocks.request.mockRejectedValue(new Error('java.net.SocketTimeoutException: timeout'))
    await expect(mihoyoRequest('/p')).rejects.toThrow(MIHOYO_TIMEOUT_MESSAGE)

    const other = new Error('Cleartext HTTP traffic not permitted')
    mocks.request.mockRejectedValue(other)
    await expect(mihoyoRequest('/p')).rejects.toBe(other)
  })
})

describe('mihoyoRequest Web 分支', () => {
  it('GET 请求：走 /mihoyo-api 代理并返回 JSON', async () => {
    mockWeb()
    mocks.fetchWithPlatformBridge.mockResolvedValue(webResponse({ json: { retcode: 0, data: { list: [] } } }))

    const json = await mihoyoRequest('/common/test?x=1', { headers: { 'x-rpc-language': 'zh-cn' } })

    expect(json).toEqual({ retcode: 0, data: { list: [] } })
    const [url, init] = mocks.fetchWithPlatformBridge.mock.calls[0]
    expect(url).toBe('/mihoyo-api/common/test?x=1')
    expect(init.method).toBe('GET')
    expect(init.headers).toEqual({ 'x-rpc-language': 'zh-cn' })
    expect(init.headers['x-cookie-forward']).toBeUndefined()
    expect('body' in init).toBe(false)
    expect(init.timeoutMs).toBe(DEFAULT_CONNECT_TIMEOUT_MS + DEFAULT_READ_TIMEOUT_MS)
    expect(init.signal).toBeInstanceOf(AbortSignal)
  })

  it('HTTP 状态非 2xx 时抛出「请求失败（N）」', async () => {
    mockWeb()
    mocks.fetchWithPlatformBridge.mockResolvedValue(webResponse({ ok: false, status: 500 }))

    await expect(mihoyoRequest('/p')).rejects.toThrow('请求失败（500）')
  })

  it('Cookie 头转换为 x-cookie-forward，无 Cookie 时不添加', async () => {
    mockWeb()
    mocks.fetchWithPlatformBridge.mockResolvedValue(webResponse({ json: { retcode: 0 } }))

    const cookie = 'a=b; c=d'
    await mihoyoRequest('/p', { headers: { 'Cookie': cookie, 'Referer': 'https://mihoyogift.com/' } })

    const headersWithCookie = mocks.fetchWithPlatformBridge.mock.calls[0][1].headers
    expect(headersWithCookie['x-cookie-forward']).toBe(encodeURIComponent(cookie))
    expect(headersWithCookie['Cookie']).toBeUndefined()
    expect(headersWithCookie['cookie']).toBeUndefined()
    expect(headersWithCookie['Referer']).toBe('https://mihoyogift.com/')

    await mihoyoRequest('/p', { headers: { 'Referer': 'https://mihoyogift.com/' } })
    const headersWithoutCookie = mocks.fetchWithPlatformBridge.mock.calls[1][1].headers
    expect(headersWithoutCookie['x-cookie-forward']).toBeUndefined()
  })

  it('POST 请求：method 为 POST 且 body 为 JSON 字符串', async () => {
    mockWeb()
    mocks.fetchWithPlatformBridge.mockResolvedValue(webResponse({ json: { retcode: 0 } }))

    const data = { goods_id: '1', sku_id: 2 }
    await mihoyoRequest('/p', { method: 'POST', data })

    const init = mocks.fetchWithPlatformBridge.mock.calls[0][1]
    expect(init.method).toBe('POST')
    expect(init.body).toBe(JSON.stringify(data))
  })

  it('AbortError 归一化为超时文案', async () => {
    mockWeb()
    const abortError = new Error('The operation was aborted.')
    abortError.name = 'AbortError'
    mocks.fetchWithPlatformBridge.mockRejectedValue(abortError)

    await expect(mihoyoRequest('/p')).rejects.toThrow(MIHOYO_TIMEOUT_MESSAGE)
  })
})

describe('超时文案与 Cookie 失效判定的兼容锁', () => {
  it('超时文案绝不能命中 isMihoyoCookieExpiredError，401/403 保持命中', () => {
    // 若此断言失败，说明超时文案被改成了会误判 Cookie 失效的内容
    expect(isMihoyoCookieExpiredError(new Error(MIHOYO_TIMEOUT_MESSAGE))).toBe(false)
    expect(isMihoyoCookieExpiredError(new Error('请求失败（401）'))).toBe(true)
    expect(isMihoyoCookieExpiredError(new Error('请求失败（403）'))).toBe(true)
  })
})
