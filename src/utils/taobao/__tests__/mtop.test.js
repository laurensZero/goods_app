import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../request', () => {
  class TaobaoRequestError extends Error {
    constructor(code, message) {
      super(message || code)
      this.name = 'TaobaoRequestError'
      this.code = code
    }
  }
  return { taobaoPageGet: vi.fn(), taobaoPagePost: vi.fn(), TaobaoRequestError }
})
vi.mock('../cookie', () => ({
  getTaobaoCookie: vi.fn(),
  setTaobaoCookie: vi.fn(async (cookie) => cookie),
}))

import { taobaoPageGet, taobaoPagePost } from '../request'
import { setTaobaoCookie } from '../cookie'
import {
  buildMtopFormUrl,
  buildMtopUrl,
  mergeMtopTokenCookie,
  mtopCall,
  tokenFromCookie,
  unwrapMtopJsonp,
} from '../mtop'
import { md5 } from '@/utils/md5'

const BASE_COOKIE = 'cookie2=xyz; unb=1; _m_h5_tk=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa_1700000000; _m_h5_tk_enc=encval'

function jsonResponse(ret, data = {}) {
  return {
    status: 200,
    body: `mtopjsonp1(${JSON.stringify({ ret: [ret], data })})`,
    headers: {},
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('tokenFromCookie', () => {
  it('取最后一个 _m_h5_tk（重复出现时最新的在后）', () => {
    expect(tokenFromCookie('_m_h5_tk=old_1; a=1; _m_h5_tk=new_2')).toBe('new_2')
    expect(tokenFromCookie(BASE_COOKIE)).toBe('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa_1700000000')
  })

  it('缺失时返回空串', () => {
    expect(tokenFromCookie('cookie2=xyz')).toBe('')
    expect(tokenFromCookie('')).toBe('')
  })
})

describe('buildMtopUrl', () => {
  it('拼出 /h5/{api}/{v}/ 路径与完整参数，data 可原样解码', () => {
    const payload = '{"appId":"34385","params":"{\\"q\\":\\"测试\\"}"}'
    const url = buildMtopUrl('mtop.demo.api', '1.0', payload, '1700000000000', 'deadbeef')
    const parsed = new URL(url)
    expect(parsed.origin).toBe('https://h5api.m.taobao.com')
    expect(parsed.pathname).toBe('/h5/mtop.demo.api/1.0/')
    expect(parsed.searchParams.get('appKey')).toBe('12574478')
    expect(parsed.searchParams.get('t')).toBe('1700000000000')
    expect(parsed.searchParams.get('sign')).toBe('deadbeef')
    expect(parsed.searchParams.get('api')).toBe('mtop.demo.api')
    expect(parsed.searchParams.get('v')).toBe('1.0')
    expect(parsed.searchParams.get('type')).toBe('jsonp')
    expect(parsed.searchParams.get('callback')).toBe('mtopjsonp1')
    expect(parsed.searchParams.get('data')).toBe(payload)
  })

  it('无 sign（领 token）时省略 sign 参数', () => {
    const url = buildMtopUrl('mtop.demo.api', '1.0', '{}', '1', '')
    expect(new URL(url).searchParams.has('sign')).toBe(false)
  })

  it('默认（非 lean）带 AntiFlood/AntiCreep/ttid/_bx-login', () => {
    const url = buildMtopUrl('mtop.demo.api', '1.0', '{}', '1', 'sig')
    const parsed = new URL(url)
    expect(parsed.searchParams.get('AntiFlood')).toBe('true')
    expect(parsed.searchParams.get('AntiCreep')).toBe('true')
    expect(parsed.searchParams.get('ttid')).toBe('2022@tmall_litepc_9.17.0')
    expect(parsed.searchParams.get('_bx-login')).toBe('new')
    expect(parsed.searchParams.get('jsv')).toBe('2.7.5')
  })

  it('lean 模式去掉 AntiFlood/AntiCreep/ttid/_bx-login，可附带 extraQuery（bx-ua）', () => {
    const url = buildMtopUrl('mtop.demo.api', '1.0', '{}', '1', 'sig', {
      lean: true,
      extraQuery: { 'bx-ua': 'fast-load' },
    })
    const parsed = new URL(url)
    expect(parsed.searchParams.has('AntiFlood')).toBe(false)
    expect(parsed.searchParams.has('AntiCreep')).toBe(false)
    expect(parsed.searchParams.has('ttid')).toBe(false)
    expect(parsed.searchParams.has('_bx-login')).toBe(false)
    expect(parsed.searchParams.get('bx-ua')).toBe('fast-load')
    expect(parsed.searchParams.get('jsv')).toBe('2.7.4')
    expect(parsed.searchParams.get('type')).toBe('jsonp')
  })
})

describe('unwrapMtopJsonp', () => {
  it('剥掉 JSONP 包装', () => {
    expect(unwrapMtopJsonp('mtopjsonp1({"ret":["SUCCESS"]});')).toEqual({ ret: ['SUCCESS'] })
    expect(unwrapMtopJsonp('mtopjsonp1({"a":1})')).toEqual({ a: 1 })
  })

  it('裸 JSON 也可解析；非法输入抛错', () => {
    expect(unwrapMtopJsonp('{"ret":["SUCCESS"]}')).toEqual({ ret: ['SUCCESS'] })
    expect(() => unwrapMtopJsonp('<html>bad</html>')).toThrow()
  })
})

describe('mergeMtopTokenCookie', () => {
  it('替换旧 _m_h5_tk/_m_h5_tk_enc，保留其余键', () => {
    const merged = mergeMtopTokenCookie(
      'a=1; _m_h5_tk=old_1; b=2; _m_h5_tk_enc=oldenc',
      '_m_h5_tk=new_2; Path=/; _m_h5_tk_enc=newenc; Domain=.taobao.com',
    )
    expect(merged).toBe('a=1; b=2; _m_h5_tk=new_2; _m_h5_tk_enc=newenc')
  })

  it('多条 set-cookie 拼接（含 Expires 逗号）也能提取', () => {
    const merged = mergeMtopTokenCookie(
      'a=1; _m_h5_tk=old_1',
      '_m_h5_tk=new_9; Path=/; Expires=Wed, 21 Oct 2026 07:28:00 GMT, other=1; _m_h5_tk_enc=e9',
    )
    expect(merged).toBe('a=1; _m_h5_tk=new_9; _m_h5_tk_enc=e9')
  })

  it('没拿到新 token 时返回空串', () => {
    expect(mergeMtopTokenCookie('a=1', 'other=x; Path=/')).toBe('')
  })
})

describe('mtopCall', () => {
  it('带签名请求成功返回，并核对 sign = md5(token&t&appKey&payload)', async () => {
    const data = { appId: '34385', params: '{"q":"测试"}' }
    taobaoPageGet.mockResolvedValue(jsonResponse('SUCCESS', { itemsArray: [] }))

    const body = await mtopCall({ api: 'mtop.demo.api', v: '1.0', data, referer: 'https://s.taobao.com/', cookie: BASE_COOKIE })

    expect(body.ret).toEqual(['SUCCESS'])
    expect(taobaoPageGet).toHaveBeenCalledTimes(1)
    const [url, options] = taobaoPageGet.mock.calls[0]
    expect(options.cookie).toBe(BASE_COOKIE)
    expect(options.referer).toBe('https://s.taobao.com/')
    const parsed = new URL(url)
    const payload = JSON.stringify(data)
    const expected = md5('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa&' + parsed.searchParams.get('t') + '&12574478&' + payload)
    expect(parsed.searchParams.get('sign')).toBe(expected)
    expect(parsed.searchParams.get('data')).toBe(payload)
  })

  it('FAIL_SYS_TOKEN* → 免签换 token 合并 Cookie 后重签重试', async () => {
    const data = { appId: '34385', params: '{"q":"x"}' }
    taobaoPageGet
      .mockResolvedValueOnce(jsonResponse('FAIL_SYS_TOKEN_EXPIRED'))
      .mockResolvedValueOnce({
        status: 200,
        body: 'mtopjsonp1({"ret":["FAIL_SYS_TOKEN_EXPIRED"]})',
        headers: { 'x-upstream-set-cookie': '_m_h5_tk=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb_777; _m_h5_tk_enc=enc777; Path=/' },
      })
      .mockResolvedValueOnce(jsonResponse('SUCCESS', { itemsArray: [] }))

    const body = await mtopCall({ api: 'mtop.demo.api', v: '1.0', data, cookie: BASE_COOKIE })

    expect(body.ret).toEqual(['SUCCESS'])
    expect(taobaoPageGet).toHaveBeenCalledTimes(3)
    // 第 2 次为免签领 token，第 3 次用新 token 重签
    const secondUrl = new URL(taobaoPageGet.mock.calls[1][0])
    expect(secondUrl.searchParams.has('sign')).toBe(false)
    const thirdUrl = new URL(taobaoPageGet.mock.calls[2][0])
    expect(taobaoPageGet.mock.calls[2][1].cookie).toBe('cookie2=xyz; unb=1; _m_h5_tk=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb_777; _m_h5_tk_enc=enc777')
    expect(thirdUrl.searchParams.get('sign')).toBe(
      md5('bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb&' + thirdUrl.searchParams.get('t') + '&12574478&' + JSON.stringify(data)),
    )
    expect(setTaobaoCookie).toHaveBeenCalledWith(
      'cookie2=xyz; unb=1; _m_h5_tk=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb_777; _m_h5_tk_enc=enc777',
    )
  })

  it('_____tmd_____ 风控挑战 → BLOCKED', async () => {
    taobaoPageGet.mockResolvedValue({ status: 200, body: '<html>_____tmd_____challenge</html>', headers: {} })
    await expect(mtopCall({ api: 'a', v: '1', data: {}, cookie: BASE_COOKIE })).rejects.toMatchObject({ name: 'TaobaoRequestError', code: 'BLOCKED' })
  })

  it('lean（搜索）透传 preferProxy：原生端优先代理，详情直连', async () => {
    taobaoPageGet.mockResolvedValue(jsonResponse('SUCCESS', { itemsArray: [] }))

    await mtopCall({ api: 'a', v: '1', data: {}, cookie: BASE_COOKIE, lean: true, extraQuery: { 'bx-ua': 'fast-load' } })
    expect(taobaoPageGet.mock.calls[0][1].preferProxy).toBe(true)

    await mtopCall({ api: 'a', v: '1', data: {}, cookie: BASE_COOKIE })
    expect(taobaoPageGet.mock.calls[1][1].preferProxy).toBeUndefined()
  })

  it('非 token 业务失败 → FAIL 并携带 ret', async () => {
    taobaoPageGet.mockResolvedValue(jsonResponse('FAIL_SYS_ILLEGAL_ACCESS:禁止访问'))
    await expect(mtopCall({ api: 'a', v: '1', data: {}, cookie: BASE_COOKIE })).rejects.toMatchObject({ code: 'FAIL', message: 'FAIL_SYS_ILLEGAL_ACCESS:禁止访问' })
  })
})

describe('buildMtopFormUrl', () => {
  it('data 只在 body，query 带 originaljson/eocode=1/needLogin，不含 data', () => {
    const payload = '{"tabCode":"all","page":1}'
    const url = buildMtopFormUrl('mtop.taobao.order.queryboughtlistV2', '1.0', payload, '1700000000000', 'sig')
    const parsed = new URL(url)
    expect(parsed.pathname).toBe('/h5/mtop.taobao.order.queryboughtlistV2/1.0/')
    expect(parsed.searchParams.get('type')).toBe('originaljson')
    expect(parsed.searchParams.get('ecode')).toBe('1')
    expect(parsed.searchParams.get('needLogin')).toBe('true')
    expect(parsed.searchParams.get('ttid')).toBe('1@tbwang_windows_1.0.0#pc')
    expect(parsed.searchParams.has('data')).toBe(false)
    expect(parsed.searchParams.has('callback')).toBe(false)
    expect(parsed.searchParams.get('sign')).toBe('sig')
    expect(parsed.searchParams.get('appKey')).toBe('12574478')
  })

  it('无 sign 时省略 sign 参数', () => {
    const url = buildMtopFormUrl('a', '1', '{}', '1', '')
    expect(new URL(url).searchParams.has('sign')).toBe(false)
  })
})

describe('mtopCall form 通道', () => {
  function originalJsonResponse(ret, data = {}) {
    return {
      status: 200,
      body: JSON.stringify({ ret: [ret], data }),
      headers: {},
    }
  }

  it('form:true 走 taobaoPagePost，body 为 data=urlencode，preferProxy 默认 true', async () => {
    taobaoPagePost.mockResolvedValue(originalJsonResponse('SUCCESS', { data: { pagination: { fields: { hasMore: false } } } }))

    const body = await mtopCall({
      api: 'mtop.taobao.order.queryboughtlistV2',
      v: '1.0',
      data: { tabCode: 'all', page: 1 },
      referer: 'https://buyertrade.taobao.com/trade/itemlist/list_bought_items.htm',
      cookie: BASE_COOKIE,
      form: true,
    })

    expect(body.ret).toEqual(['SUCCESS'])
    expect(taobaoPageGet).not.toHaveBeenCalled()
    expect(taobaoPagePost).toHaveBeenCalledTimes(1)
    const [url, options] = taobaoPagePost.mock.calls[0]
    const payload = JSON.stringify({ tabCode: 'all', page: 1 })
    expect(options.body).toBe(`data=${encodeURIComponent(payload)}`)
    expect(options.contentType).toBe('application/x-www-form-urlencoded')
    expect(options.preferProxy).toBe(true)
    expect(options.referer).toBe('https://buyertrade.taobao.com/trade/itemlist/list_bought_items.htm')
    const parsed = new URL(url)
    expect(parsed.searchParams.get('type')).toBe('originaljson')
    expect(parsed.searchParams.get('sign')).toBe(
      md5('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa&' + parsed.searchParams.get('t') + '&12574478&' + payload),
    )
  })

  it('form 通道 originaljson 纯 JSON 响应可解析', async () => {
    taobaoPagePost.mockResolvedValue(originalJsonResponse('SUCCESS', { data: {} }))
    const body = await mtopCall({ api: 'a', v: '1', data: { x: 1 }, cookie: BASE_COOKIE, form: true })
    expect(body).toMatchObject({ ret: ['SUCCESS'] })
  })

  it('form FAIL_SYS_TOKEN* → 走 POST 免签重领并重试', async () => {
    taobaoPagePost
      .mockResolvedValueOnce(originalJsonResponse('FAIL_SYS_TOKEN_EXPIRED'))
      .mockResolvedValueOnce({
        status: 200,
        body: JSON.stringify({ ret: ['FAIL_SYS_TOKEN_EXPIRED'] }),
        headers: { 'x-upstream-set-cookie': '_m_h5_tk=cccccccccccccccccccccccccccccccc_888; _m_h5_tk_enc=enc888; Path=/' },
      })
      .mockResolvedValueOnce(originalJsonResponse('SUCCESS', { data: {} }))

    const body = await mtopCall({ api: 'a', v: '1', data: { page: 1 }, cookie: BASE_COOKIE, form: true })
    expect(body.ret).toEqual(['SUCCESS'])
    expect(taobaoPagePost).toHaveBeenCalledTimes(3)
    expect(new URL(taobaoPagePost.mock.calls[1][0]).searchParams.has('sign')).toBe(false)
    expect(setTaobaoCookie).toHaveBeenCalledWith(
      'cookie2=xyz; unb=1; _m_h5_tk=cccccccccccccccccccccccccccccccc_888; _m_h5_tk_enc=enc888',
    )
  })
})
