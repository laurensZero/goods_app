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

import { taobaoPageGet, taobaoPagePost, classifyPageResponse, responseBodyToText } from '../request'

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

  it('preferProxy：原生端优先走远程代理，跳过直连首发', async () => {
    mocks.request.mockResolvedValueOnce(capResponse('mtopjsonp1({"ret":["SUCCESS"]})', 200, { 'x-upstream-set-cookie': '_m_h5_tk=p1' }))

    const result = await taobaoPageGet(MTOP_URL, { cookie: COOKIE, preferProxy: true })

    expect(result.body).toContain('SUCCESS')
    expect(mocks.request).toHaveBeenCalledTimes(1)
    expect(mocks.request.mock.calls[0][0].url.startsWith('https://goodsapp.de5.net/taobao-page/')).toBe(true)
  })

  it('preferProxy 但代理失败 → 回落直连，不直接失败', async () => {
    mocks.request
      .mockResolvedValueOnce(capResponse('proxy error', 502))
      .mockResolvedValueOnce(capResponse('mtopjsonp1({"ret":["SUCCESS"]})'))

    const result = await taobaoPageGet(MTOP_URL, { cookie: COOKIE, preferProxy: true })

    expect(result.body).toContain('SUCCESS')
    expect(mocks.request).toHaveBeenCalledTimes(2)
    expect(mocks.request.mock.calls[1][0].url).toBe(MTOP_URL)
  })

  it('直连网络失败（超时/连接失败）→ 也经远程代理兜底', async () => {
    mocks.request
      .mockRejectedValueOnce(new Error('connection reset'))
      .mockResolvedValueOnce(capResponse('mtopjsonp1({"ret":["SUCCESS"]})', 200, { 'x-upstream-set-cookie': '_m_h5_tk=net1' }))

    const result = await taobaoPageGet(MTOP_URL, { cookie: COOKIE })

    expect(result.body).toContain('SUCCESS')
    expect(mocks.request).toHaveBeenCalledTimes(2)
    expect(mocks.request.mock.calls[1][0].url.startsWith('https://goodsapp.de5.net/taobao-page/')).toBe(true)
  })

  it('直连网络失败且代理也失败 → 抛 NETWORK', async () => {
    mocks.request
      .mockRejectedValueOnce(new Error('connection reset'))
      .mockRejectedValueOnce(new Error('proxy down'))

    await expect(taobaoPageGet(MTOP_URL, { cookie: COOKIE })).rejects.toMatchObject({ code: 'NETWORK' })
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

  it('CapacitorHttp 把 JSON 解析成对象时还原为文本（Android 必踩）', async () => {
    const json = { ret: ['SUCCESS::调用成功'], data: { ok: true } }
    mocks.request.mockResolvedValueOnce(capResponse(json))

    const result = await taobaoPageGet(MTOP_URL)

    expect(result.body).toBe(JSON.stringify(json))
  })

  it('taobaoPagePost：原生代理返回 JSON 对象同样还原', async () => {
    const json = { ret: ['SUCCESS::调用成功'] }
    mocks.request.mockResolvedValueOnce(capResponse(json))

    const result = await taobaoPagePost('https://h5api.m.taobao.com/h5/mtop.demo/1.0/', {
      cookie: COOKIE,
      preferProxy: true,
      body: 'data=%7B%7D',
      contentType: 'application/x-www-form-urlencoded',
    })

    expect(result.body).toBe(JSON.stringify(json))
    expect(mocks.request.mock.calls[0][0].method).toBe('POST')
    expect(mocks.request.mock.calls[0][0].data).toBe('data=%7B%7D')
  })
})

describe('responseBodyToText', () => {
  it('string 原样返回', () => {
    expect(responseBodyToText('a')).toBe('a')
    expect(responseBodyToText('')).toBe('')
  })
  it('object JSON.stringify 还原', () => {
    expect(responseBodyToText({ a: 1 })).toBe('{"a":1}')
  })
  it('null/undefined → 空串', () => {
    expect(responseBodyToText(null)).toBe('')
    expect(responseBodyToText(undefined)).toBe('')
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
