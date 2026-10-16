import { describe, it, expect, vi, beforeEach } from 'vitest'

const store = vi.hoisted(() => ({ data: new Map() }))

vi.mock('@/utils/platform/storage', () => ({
  readSecret: vi.fn(async (key) => (store.data.has(key) ? store.data.get(key) : null)),
  writeSecret: vi.fn(async (key, value) => { store.data.set(key, value) }),
  removeSecret: vi.fn(async (key) => { store.data.delete(key) }),
}))

import {
  normalizeTaobaoCookie,
  isTaobaoCookieReady,
  setTaobaoCookie,
  getTaobaoCookie,
  clearTaobaoCookie,
  isAutoTaobaoAccountLabel,
  isTaobaoLoginName,
  formatTaobaoAccountLabel,
  listTaobaoAccounts,
  upsertTaobaoAccountProfile,
} from '../cookie'

describe('normalizeTaobaoCookie', () => {
  it('保留单行 Cookie 原样（仅整理分号空格）', () => {
    const raw = '_m_h5_tk=abc_123; cookie2=xxx; unb=1'
    expect(normalizeTaobaoCookie(raw)).toBe('_m_h5_tk=abc_123; cookie2=xxx; unb=1')
  })

  it('去掉 Cookie: 前缀与换行', () => {
    expect(normalizeTaobaoCookie('Cookie: a=1; b=2')).toBe('a=1; b=2')
    expect(normalizeTaobaoCookie('a=1\nb=2')).toBe('a=1; b=2')
  })

  it('解析 Netscape cookies.txt（制表符 + #HttpOnly_ 前缀）', () => {
    const txt = [
      '# Netscape HTTP Cookie File',
      '.taobao.com\tTRUE\t/\tTRUE\t1893456000\t_m_h5_tk\tabc_123',
      '#HttpOnly_.taobao.com\tTRUE\t/\tTRUE\t1893456000\tcookie2\tzzz',
    ].join('\n')
    expect(normalizeTaobaoCookie(txt)).toBe('_m_h5_tk=abc_123; cookie2=zzz')
  })

  it('空输入返回空串', () => {
    expect(normalizeTaobaoCookie('')).toBe('')
    expect(normalizeTaobaoCookie(null)).toBe('')
  })
})

describe('isTaobaoCookieReady', () => {
  it('要求长度与 _m_h5_tk', () => {
    expect(isTaobaoCookieReady('_m_h5_tk=09ae51fd5718db17e1ae759ee69bcb32_1791551668385; cookie2=1')).toBe(true)
    expect(isTaobaoCookieReady('cookie2=1; unb=2')).toBe(false)
    expect(isTaobaoCookieReady('')).toBe(false)
  })
})

describe('cookie 存取', () => {
  beforeEach(async () => {
    store.data.clear()
    await clearTaobaoCookie()
  })

  it('写入后可读回，清空后为空', async () => {
    const value = '_m_h5_tk=09ae51fd5718db17e1ae759ee69bcb32_1791551668385; cookie2=1'
    await setTaobaoCookie(`  ${value}\n`)
    expect(await getTaobaoCookie()).toBe(value)
    await clearTaobaoCookie()
    expect(await getTaobaoCookie()).toBe('')
  })

  it('空输入等价于清除', async () => {
    await setTaobaoCookie('a=1')
    await setTaobaoCookie('   ')
    expect(await getTaobaoCookie()).toBe('')
  })
})

describe('账号标签：伪昵称判定与覆盖', () => {
  const COOKIE = '_m_h5_tk=09ae51fd5718db17e1ae759ee69bcb32_1791551668385; unb=2200123456789; cookie2=x'

  beforeEach(async () => {
    store.data.clear()
    await clearTaobaoCookie()
  })

  it('isTaobaoLoginName 识别 tb+数字 登录名', () => {
    expect(isTaobaoLoginName('tb168334051115')).toBe(true)
    expect(isTaobaoLoginName('TB168334051115')).toBe(true)
    expect(isTaobaoLoginName('小明')).toBe(false)
    expect(isTaobaoLoginName('')).toBe(false)
  })

  it('占位标签 / 原始 id / 登录名 都算自动标签，真实昵称不算', () => {
    expect(isAutoTaobaoAccountLabel('', '', '')).toBe(true)
    expect(isAutoTaobaoAccountLabel('账号 2200…6789', '2200123456789', '2200123456789')).toBe(true)
    expect(isAutoTaobaoAccountLabel('ck_abc123', '', 'ck_abc123')).toBe(true)
    expect(isAutoTaobaoAccountLabel('tb168334051115', '', 'ck_abc123')).toBe(true)
    expect(isAutoTaobaoAccountLabel('小明', '2200123456789', '2200123456789')).toBe(false)
  })

  it('formatTaobaoAccountLabel 无 unb 时退化为原始 id', () => {
    expect(formatTaobaoAccountLabel('2200123456789', '2200123456789')).toBe('账号 2200…6789')
    expect(formatTaobaoAccountLabel('', 'ck_abc123')).toBe('ck_abc123')
  })

  it('登录名被当成标签保存后，真实昵称仍能覆盖', async () => {
    await setTaobaoCookie(COOKIE, { label: 'tb168334051115' })
    const [account] = await listTaobaoAccounts()
    expect(account.label).toBe('tb168334051115')

    await upsertTaobaoAccountProfile(account.id, { label: '小明' })
    expect((await listTaobaoAccounts())[0].label).toBe('小明')
  })

  it('用户自定义备注不被接口昵称覆盖', async () => {
    await setTaobaoCookie(COOKIE, { label: '我的小号' })
    const [account] = await listTaobaoAccounts()

    await upsertTaobaoAccountProfile(account.id, { label: '小明' })
    expect((await listTaobaoAccounts())[0].label).toBe('我的小号')
  })
})
