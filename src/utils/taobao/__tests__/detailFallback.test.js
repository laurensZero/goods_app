import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../mtop', () => ({ mtopCall: vi.fn() }))
vi.mock('../cookie', () => ({
  getTaobaoCookie: vi.fn(),
  isTaobaoCookieReady: vi.fn((cookie) => Boolean(cookie && String(cookie).includes('_m_h5_tk='))),
}))
vi.mock('../request', () => ({
  TaobaoRequestError: class TaobaoRequestError extends Error {
    constructor(code, message) {
      super(message || code)
      this.name = 'TaobaoRequestError'
      this.code = code
    }
  },
  classifyPageResponse: vi.fn(),
  taobaoPageGet: vi.fn(),
  isNativeTransport: vi.fn(),
}))

import { mtopCall } from '../mtop'
import { getTaobaoCookie } from '../cookie'
import { taobaoPageGet, classifyPageResponse, isNativeTransport, TaobaoRequestError } from '../request'
import { fetchTaobaoDraft, validateTaobaoCookie } from '../service'

const READY_COOKIE = 'cookie2=x; unb=1; _m_h5_tk=abc_123; sgcookie=y'

const MTOP_DETAIL = {
  item: { itemId: '111111', title: 'mtop商品', images: ['https://img.alicdn.com/main.png'] },
  seller: { shopName: '测试店' },
  apiStack: [{ value: JSON.stringify({ price: { price: { priceText: '125-155' } } }) }],
}

function makeSsrHtml() {
  const res = {
    item: { itemId: '111111', title: 'SSR商品' },
    componentsVO: { headImageVO: { images: [] } },
  }
  return `<html><script>var b = ${JSON.stringify({ loaderData: { home: { data: { res } } } })};</script></html>`
}

describe('fetchTaobaoDraft 通道策略', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getTaobaoCookie.mockResolvedValue(READY_COOKIE)
  })

  it('原生端 SSR 经 CF 代理成功时不走 mtop', async () => {
    isNativeTransport.mockReturnValue(true)
    taobaoPageGet.mockResolvedValue({ status: 200, body: makeSsrHtml(), headers: {} })
    classifyPageResponse.mockReturnValue('OK')
    mtopCall.mockResolvedValue({ data: MTOP_DETAIL })

    const draft = await fetchTaobaoDraft('111111')

    expect(draft.title).toBe('SSR商品')
    expect(taobaoPageGet).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ preferProxy: true }),
    )
    expect(mtopCall).not.toHaveBeenCalled()
  })

  it('原生端 SSR 被风控时降级 mtop', async () => {
    isNativeTransport.mockReturnValue(true)
    taobaoPageGet.mockResolvedValue({ status: 200, body: '_____tmd_____挑战页', headers: {} })
    classifyPageResponse.mockReturnValue('BLOCKED')
    mtopCall.mockResolvedValue({ data: MTOP_DETAIL })

    const draft = await fetchTaobaoDraft('111111')

    expect(draft.title).toBe('mtop商品')
    expect(draft.priceText).toBe('125-155')
    expect(mtopCall).toHaveBeenCalledWith(
      expect.objectContaining({ api: 'mtop.taobao.detail.getdetail', data: { itemNumId: '111111' } }),
    )
  })

  it('Web 端 SSR 不带 preferProxy', async () => {
    isNativeTransport.mockReturnValue(false)
    taobaoPageGet.mockResolvedValue({ status: 200, body: makeSsrHtml(), headers: {} })
    classifyPageResponse.mockReturnValue('OK')

    await fetchTaobaoDraft('111111')

    expect(taobaoPageGet).toHaveBeenCalledWith(
      expect.any(String),
      expect.not.objectContaining({ preferProxy: true }),
    )
  })

  it('Web 端 SSR 成功时不走 mtop', async () => {
    isNativeTransport.mockReturnValue(false)
    taobaoPageGet.mockResolvedValue({ status: 200, body: makeSsrHtml(), headers: {} })
    classifyPageResponse.mockReturnValue('OK')

    const draft = await fetchTaobaoDraft('111111')

    expect(draft.title).toBe('SSR商品')
    expect(mtopCall).not.toHaveBeenCalled()
  })

  it('Web 端 SSR 被风控时降级 mtop', async () => {
    isNativeTransport.mockReturnValue(false)
    taobaoPageGet.mockResolvedValue({ status: 200, body: '_____tmd_____挑战页', headers: {} })
    classifyPageResponse.mockReturnValue('BLOCKED')
    mtopCall.mockResolvedValue({ data: MTOP_DETAIL })

    const draft = await fetchTaobaoDraft('111111')

    expect(draft.title).toBe('mtop商品')
    expect(mtopCall).toHaveBeenCalledTimes(1)
  })

  it('mtop 也被风控时抛出领域错误', async () => {
    isNativeTransport.mockReturnValue(false)
    taobaoPageGet.mockResolvedValue({ status: 200, body: '_____tmd_____挑战页', headers: {} })
    classifyPageResponse.mockReturnValue('BLOCKED')
    mtopCall.mockRejectedValue(new TaobaoRequestError('BLOCKED', '风控挑战'))

    await expect(fetchTaobaoDraft('111111')).rejects.toMatchObject({ code: 'BLOCKED' })
  })
})

describe('validateTaobaoCookie 通道策略', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getTaobaoCookie.mockResolvedValue(READY_COOKIE)
  })

  it('原生端直接 mtop 探测，成功即 Cookie 有效', async () => {
    isNativeTransport.mockReturnValue(true)
    mtopCall.mockResolvedValue({ ret: ['SUCCESS'] })

    const result = await validateTaobaoCookie()

    expect(result).toEqual({ ok: true, code: 'OK' })
    expect(taobaoPageGet).not.toHaveBeenCalled()
    expect(mtopCall).toHaveBeenCalledWith(
      expect.objectContaining({ data: { itemNumId: expect.any(String) } }),
    )
  })

  it('Web 端 SSR 被拦 → mtop TOKEN 失败映射为登录失效', async () => {
    isNativeTransport.mockReturnValue(false)
    taobaoPageGet.mockResolvedValue({ status: 200, body: '_____tmd_____挑战页', headers: {} })
    classifyPageResponse.mockReturnValue('BLOCKED')
    mtopCall.mockRejectedValue(new TaobaoRequestError('TOKEN', 'FAIL_SYS_TOKEN_EXPIRED'))

    const result = await validateTaobaoCookie()

    expect(result).toEqual({ ok: false, code: 'LOGIN_REQUIRED' })
  })

  it('Web 端 SSR 成功即有效，不做 mtop 探测', async () => {
    isNativeTransport.mockReturnValue(false)
    taobaoPageGet.mockResolvedValue({ status: 200, body: makeSsrHtml(), headers: {} })
    classifyPageResponse.mockReturnValue('OK')

    const result = await validateTaobaoCookie()

    expect(result).toEqual({ ok: true, code: 'OK' })
    expect(mtopCall).not.toHaveBeenCalled()
  })
})
