import { describe, it, expect, vi, beforeEach } from 'vitest'

const state = vi.hoisted(() => ({
  secrets: new Map(),
  http: vi.fn(),
  probe: vi.fn(),
}))

vi.mock('@/utils/platform/storage', () => ({
  readSecret: vi.fn(async (key, fallback = null) => (
    state.secrets.has(key) ? state.secrets.get(key) : fallback
  )),
  writeSecret: vi.fn(async (key, value) => { state.secrets.set(key, value) }),
  removeSecret: vi.fn(async (key) => { state.secrets.delete(key) }),
}))

vi.mock('@/utils/platform/http', () => ({
  fetchWithPlatformBridge: (...args) => state.http(...args),
}))

vi.mock('@/utils/mihoyo/accountProfile', () => ({
  probeMihoyoUserInfo: (...args) => state.probe(...args),
}))

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => false },
  CapacitorHttp: { request: vi.fn() },
}))

import {
  buildRefreshedMihoyoCookie,
  exchangeStokenForTokens,
  getMihoyoDeviceProfile,
  makeMihoyoDsX4,
  parseStokenInput,
  refreshMihoyoCookieWithStoken,
} from '../stokenRefresh'

function okJson(payload) {
  return {
    ok: true,
    status: 200,
    headers: { get: () => 'application/json' },
    text: async () => JSON.stringify(payload),
  }
}

function htmlResponse() {
  return {
    ok: true,
    status: 200,
    headers: { get: () => 'text/html' },
    text: async () => '<!doctype html><html><body>app</body></html>',
  }
}

beforeEach(() => {
  state.secrets.clear()
  state.http.mockReset()
  state.probe.mockReset()
})

describe('makeMihoyoDsX4', () => {
  it('匹配 Node 脚本的 X4 测试向量', () => {
    expect(makeMihoyoDsX4({ body: '{}' }, { t: '1700000000', r: '123456' }))
      .toBe('1700000000,123456,6d46b7d413f5dee40f241fdc5053701a')
    expect(makeMihoyoDsX4({ body: '{"ticket":"abc"}' }, { t: '1700000000', r: '123456' }))
      .toBe('1700000000,123456,e04267a3f6dd002d456bca00657ce838')
    expect(makeMihoyoDsX4({ query: 'stoken=v2_test' }, { t: '1700000000', r: '123456' }))
      .toBe('1700000000,123456,76f946c4ab732c09a54d3278347ade1f')
  })
})

describe('parseStokenInput', () => {
  it('支持只粘贴 stoken', () => {
    expect(parseStokenInput('v2_abcDEF123=')).toEqual({
      stoken: 'v2_abcDEF123=',
      mid: '',
      stuid: '',
    })
  })

  it('支持 stoken.txt 的 key=value 格式', () => {
    expect(parseStokenInput('stoken=v2_abc; mid=0ppobignrz_mhy; stuid=301532617')).toEqual({
      stoken: 'v2_abc',
      mid: '0ppobignrz_mhy',
      stuid: '301532617',
    })
  })

  it('支持带 . 和 = 填充的原始 stoken', () => {
    const stoken = 'v2_TESTONLYabcdefghijklmnopqrstuvwxyz0123456789ABCDEF=.CAE='
    expect(parseStokenInput(stoken)).toEqual({
      stoken,
      mid: '',
      stuid: '',
    })
  })

  it('兼容复制时被换行折断的 stoken', () => {
    const input = [
      'stoken=v2_TESTONLYabcdefghijklmnopqrstuvwxyz0123456789',
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnop',
      'qrstuvwxyz0123456789ABCDEF=.CAE=; mid=0ppobignrz_mhy;',
      'stuid=301532617',
    ].join('\n')

    expect(parseStokenInput(input)).toEqual({
      stoken: 'v2_TESTONLYabcdefghijklmnopqrstuvwxyz0123456789'
        + 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnop'
        + 'qrstuvwxyz0123456789ABCDEF=.CAE=',
      mid: '0ppobignrz_mhy',
      stuid: '301532617',
    })
  })

  it('兼容 stoken / mid / stuid 各占一行的格式', () => {
    const input = ['stoken=v2_abc', 'mid=0ppobignrz_mhy', 'stuid=301532617'].join('\n')
    expect(parseStokenInput(input)).toEqual({
      stoken: 'v2_abc',
      mid: '0ppobignrz_mhy',
      stuid: '301532617',
    })
  })

  it('支持完整 Cookie 并回退到 account_mid_v2 / account_id_v2', () => {
    const cookie = 'account_id_v2=301532617; account_mid_v2=0ppobignrz_mhy; stoken=v2_abc; ltoken=lt'
    expect(parseStokenInput(cookie)).toEqual({
      stoken: 'v2_abc',
      mid: '0ppobignrz_mhy',
      stuid: '301532617',
    })
  })

  it('空输入返回空字段', () => {
    expect(parseStokenInput('')).toEqual({ stoken: '', mid: '', stuid: '' })
  })
})

describe('buildRefreshedMihoyoCookie', () => {
  it('组装米游铺可用的 v1 Cookie', () => {
    expect(buildRefreshedMihoyoCookie({
      stuid: '301532617',
      mid: '0ppobignrz_mhy',
      ltoken: 'lt',
      cookieToken: 'ct',
    })).toBe(
      'account_id=301532617; account_id_v2=301532617; account_mid_v2=0ppobignrz_mhy; '
      + 'cookie_token=ct; ltmid_v2=0ppobignrz_mhy; ltoken=lt; '
      + 'ltuid=301532617; ltuid_v2=301532617; login_uid=301532617',
    )
  })

  it('缺字段返回空字符串', () => {
    expect(buildRefreshedMihoyoCookie({ stuid: '1', mid: 'm', ltoken: 'lt' })).toBe('')
  })
})

describe('getMihoyoDeviceProfile', () => {
  it('同一安装内复用设备指纹', async () => {
    const first = await getMihoyoDeviceProfile()
    const second = await getMihoyoDeviceProfile()
    expect(first.deviceId).toBeTruthy()
    expect(first.deviceFp).toHaveLength(13)
    expect(second).toEqual(first)
  })
})

describe('exchangeStokenForTokens', () => {
  it('依次换取 cookie_token / ltoken', async () => {
    state.http
      .mockResolvedValueOnce(okJson({ retcode: 0, data: { uid: '301', cookie_token: 'ct' } }))
      .mockResolvedValueOnce(okJson({ retcode: 0, data: { ltoken: 'lt' } }))

    const result = await exchangeStokenForTokens({
      stoken: 'v2_abc=',
      mid: 'mid',
      deviceId: 'device-id',
      deviceFp: 'device-fp',
    })

    expect(result).toEqual({ ok: true, ltoken: 'lt', cookieToken: 'ct', uid: '301' })
    expect(state.http).toHaveBeenCalledTimes(2)
    const [url, init] = state.http.mock.calls[0]
    expect(url).toContain('/mihoyo-account-passport/account/auth/api/getCookieAccountInfoBySToken')
    expect(url).toContain('stoken=v2_abc%3D')
    expect(init.headers.DS).toMatch(/^\d+,\d+,[0-9a-f]{32}$/)
    expect(init.headers['x-cookie-forward']).toBe(encodeURIComponent('mid=mid;stoken=v2_abc='))
  })

  it('stoken 失效返回 auth', async () => {
    state.http.mockResolvedValueOnce(okJson({ retcode: -100, message: '登录失效' }))

    const result = await exchangeStokenForTokens({
      stoken: 'v2_bad',
      mid: 'mid',
      deviceId: 'device-id',
      deviceFp: 'device-fp',
    })

    expect(result).toMatchObject({ ok: false, kind: 'auth', retcode: -100 })
  })

  it('代理缺失（HTML 回退）返回 proxy', async () => {
    state.http.mockResolvedValueOnce(htmlResponse())

    const result = await exchangeStokenForTokens({
      stoken: 'v2_abc',
      mid: 'mid',
      deviceId: 'device-id',
      deviceFp: 'device-fp',
    })

    expect(result).toMatchObject({ ok: false, kind: 'proxy' })
    expect(result.message).toContain('代理')
  })

  it('网络异常返回 transient', async () => {
    state.http.mockRejectedValueOnce(new Error('network down'))

    const result = await exchangeStokenForTokens({
      stoken: 'v2_abc',
      mid: 'mid',
      deviceId: 'device-id',
      deviceFp: 'device-fp',
    })

    expect(result).toMatchObject({ ok: false, kind: 'transient' })
  })
})

describe('refreshMihoyoCookieWithStoken', () => {
  it('换票 + user/info 校验成功后返回新 Cookie', async () => {
    state.http
      .mockResolvedValueOnce(okJson({ retcode: 0, data: { uid: '301', cookie_token: 'ct' } }))
      .mockResolvedValueOnce(okJson({ retcode: 0, data: { ltoken: 'lt' } }))
    state.probe.mockResolvedValueOnce({
      ok: true,
      kind: 'ok',
      retcode: 0,
      message: '',
      profile: { uid: '301', nickname: 'laurensZero' },
    })

    const result = await refreshMihoyoCookieWithStoken({
      stoken: 'v2_abc',
      mid: 'mid',
      stuid: '301',
    })

    expect(result.ok).toBe(true)
    expect(result.cookie).toContain('cookie_token=ct')
    expect(result.cookie).toContain('ltoken=lt')
    expect(result.profile.nickname).toBe('laurensZero')
  })

  it('user/info UID 不一致返回 mismatch', async () => {
    state.http
      .mockResolvedValueOnce(okJson({ retcode: 0, data: { uid: '301', cookie_token: 'ct' } }))
      .mockResolvedValueOnce(okJson({ retcode: 0, data: { ltoken: 'lt' } }))
    state.probe.mockResolvedValueOnce({
      ok: true,
      kind: 'ok',
      retcode: 0,
      message: '',
      profile: { uid: '999', nickname: 'other' },
    })

    const result = await refreshMihoyoCookieWithStoken({
      stoken: 'v2_abc',
      mid: 'mid',
      stuid: '301',
    })

    expect(result).toMatchObject({ ok: false, kind: 'mismatch' })
  })

  it('user/info 鉴权失败返回 auth，不返回 Cookie', async () => {
    state.http
      .mockResolvedValueOnce(okJson({ retcode: 0, data: { uid: '301', cookie_token: 'ct' } }))
      .mockResolvedValueOnce(okJson({ retcode: 0, data: { ltoken: 'lt' } }))
    state.probe.mockResolvedValueOnce({
      ok: false,
      kind: 'auth',
      retcode: -100,
      message: '登录失效',
      profile: null,
    })

    const result = await refreshMihoyoCookieWithStoken({
      stoken: 'v2_abc',
      mid: 'mid',
      stuid: '301',
    })

    expect(result).toMatchObject({ ok: false, kind: 'auth', retcode: -100 })
    expect(result.cookie).toBeUndefined()
  })
})
