import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/utils/platform/storage', () => ({
  readSecret: vi.fn(async () => null),
  writeSecret: vi.fn(async () => {}),
  removeSecret: vi.fn(async () => {}),
}))

import { normalizeTaobaoCookie, isTaobaoCookieReady, setTaobaoCookie, getTaobaoCookie, clearTaobaoCookie } from '../cookie'

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
