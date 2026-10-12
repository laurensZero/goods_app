import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  isNativePlatform: vi.fn(),
  request: vi.fn(),
  getTaobaoCookie: vi.fn(),
}))

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: mocks.isNativePlatform },
  CapacitorHttp: { request: mocks.request },
}))
vi.mock('../cookie', () => ({ getTaobaoCookie: mocks.getTaobaoCookie }))
vi.mock('@/utils/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}))

import { taobaoPageGet, classifyPageResponse } from '../request'

const COOKIE = 'cna=abc; cookie2=xyz; _m_h5_tk=aaaa_1'
const MTOP_URL =
  'https://h5api.m.taobao.com/h5/mtop.demo/1.0/?jsv=2.7.4&appKey=12574478&api=mtop.demo&v=1.0&type=jsonp&data=%7B%7D'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.isNativePlatform.mockReturnValue(true)
  mocks.getTaobaoCookie.mockResolvedValue(COOKIE)
})

function capResponse(body, status = 200, headers = {}) {
  return { status, data: body, headers }
}

describe('taobaoPageGet 原生直连', () => {
  it('正常响应直接返回，不走远程代理', async () => {
    mocks.request.mockResolvedValueOnce(capResponse('mtopjsonp1({"ret":["SUCCESS"]})'))

    const result = await taobaoPageGet(MTOP_URL)

    expect(result.body).toContain('SUCCESS')
    expect(mocks.request).toHaveBeenCalledTimes(1)
    expect(mocks.request.mock.calls[0][0].url).toBe(MTOP_URL)
  })

  it('tmd 硬拦时自动经 /taobao-page 远程代理重试，代理成功则返回代理结果', async () => {
    mocks.request
      .mockResolvedValueOnce(capResponse('<html>_____tmd_____ challenge</html>'))
      .mockResolvedValueOnce(capResponse('mtopjsonp1({"ret":["SUCCESS"]})', 200, { 'x-upstream-set-cookie': '_m_h5_tk=new_2' }))

    const result = await taobaoPageGet(MTOP_URL, { cookie: COOKIE, referer: 'https://s.taobao.com/' })

    expect(result.body).toContain('SUCCESS')
    expect(result.headers['x-upstream-set-cookie']).toBe('_m_h5_tk=new_2')
    expect(mocks.request).toHaveBeenCalledTimes(2)
    const proxied = mocks.request.mock.calls[1][0]
    expect(proxied.url.startsWith('https://goodsapp.de5.net/taobao-page/h5/mtop.demo/1.0/')).toBe(true)
    // 代理协议：Cookie 转 x-cookie-forward，目标源经 x-taobao-origin 声明
    expect(proxied.headers['x-cookie-forward']).toBe(encodeURIComponent(COOKIE))
    expect(proxied.headers['x-taobao-origin']).toBe('https://h5api.m.taobao.com')
    expect(proxied.headers['x-referer-forward']).toBe(encodeURIComponent('https://s.taobao.com/'))
  })

  it('tmd 硬拦且代理也失败 → 回落直连响应（仍可被分类为 BLOCKED）', async () => {
    mocks.request
      .mockResolvedValueOnce(capResponse('<html>_____tmd_____ challenge</html>'))
      .mockResolvedValueOnce(capResponse('proxy error', 502))

    const result = await taobaoPageGet(MTOP_URL)

    expect(result.body).toContain('_____tmd_____')
    expect(classifyPageResponse(result)).toBe('BLOCKED')
  })

  it('tmd 硬拦且代理抛异常 → 回落直连响应', async () => {
    mocks.request
      .mockResolvedValueOnce(capResponse('<html>_____tmd_____ challenge</html>'))
      .mockRejectedValueOnce(new Error('network down'))

    const result = await taobaoPageGet(MTOP_URL)

    expect(result.body).toContain('_____tmd_____')
  })
})

describe('taobaoPageGet Web 代理路径', () => {
  beforeEach(() => {
    mocks.isNativePlatform.mockReturnValue(false)
  })

  it('走同源 /taobao-page 并转发 x-upstream-set-cookie', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      status: 200,
      text: async () => 'mtopjsonp1({"ret":["SUCCESS"]})',
      headers: { get: (name) => (name === 'x-upstream-set-cookie' ? '_m_h5_tk=web_1' : null) },
    })
    vi.stubGlobal('fetch', fetchMock)

    try {
      const result = await taobaoPageGet(MTOP_URL, { cookie: COOKIE })
      expect(result.body).toContain('SUCCESS')
      expect(result.headers['x-upstream-set-cookie']).toBe('_m_h5_tk=web_1')
      const [url, init] = fetchMock.mock.calls[0]
      expect(String(url).startsWith('/taobao-page/h5/mtop.demo/1.0/')).toBe(true)
      expect(init.headers['x-cookie-forward']).toBe(encodeURIComponent(COOKIE))
      expect(init.headers['x-taobao-origin']).toBe('https://h5api.m.taobao.com')
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
