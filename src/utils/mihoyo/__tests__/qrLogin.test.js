import { describe, expect, it } from 'vitest'
import {
  assembleCookieFromSetCookieList,
  buildMihoyoCookieFromHeaders,
  extractMihoyoCookieFromQrPayload,
  parseSetCookiePairs,
  validateQrCookie,
} from '@/utils/mihoyo/qrLoginCookie'

const SAMPLE_SET_COOKIE = [
  'aliyungf_tc=wafonly; Path=/; HttpOnly',
  'uni_web_token=; Path=/; Domain=mihoyogift.com; Max-Age=0; HttpOnly; Secure',
  'cookie_token_v2=v2_tokenA; Path=/; Domain=mihoyogift.com; Max-Age=31536000; HttpOnly; Secure',
  'account_id_v2=282272731; Path=/; Domain=mihoyogift.com; Max-Age=31536000; Secure',
  'ltoken_v2=v2_tokenB; Path=/; Domain=mihoyogift.com; Max-Age=31536000; HttpOnly; Secure',
  'ltuid_v2=282272731; Path=/; Domain=mihoyogift.com; Max-Age=31536000; Secure',
  'account_mid_v2=0mvv342b0n_mhy; Path=/; Domain=mihoyogift.com; Max-Age=31536000; Secure',
]

describe('mihoyo qr login cookie assembly', () => {
  it('parses proxy-forwarded cookie string', () => {
    const raw = encodeURIComponent(
      'cookie_token_v2=tokenA; account_id_v2=123; ltoken_v2=tokenB; ltuid_v2=123; aliyungf_tc=waf',
    )
    const pairs = parseSetCookiePairs(raw)
    expect(pairs.find((p) => p.name === 'cookie_token_v2')?.value).toBe('tokenA')
    expect(pairs.find((p) => p.name === 'account_id_v2')?.value).toBe('123')
  })

  it('keeps auth fields and drops empty/waf cookies', () => {
    const cookie = assembleCookieFromSetCookieList(SAMPLE_SET_COOKIE)
    expect(cookie).toContain('cookie_token_v2=v2_tokenA')
    expect(cookie).toContain('ltoken_v2=v2_tokenB')
    expect(cookie).toContain('account_id_v2=282272731')
    expect(cookie).not.toContain('aliyungf_tc')
    expect(cookie).not.toContain('uni_web_token')
  })

  it('validateQrCookie accepts confirmed set-cookie payload', () => {
    const cookie = validateQrCookie(
      'account_id_v2=282272731; cookie_token_v2=v2_x; ltoken_v2=v2_y; ltuid_v2=282272731',
    )
    expect(cookie).toContain('cookie_token_v2=v2_x')
    expect(validateQrCookie('account_id_v2=1')).toBe('')
  })

  it('reads fetch Headers via .get() not Object.entries', () => {
    const headers = new Headers({
      'x-mihoyo-set-cookie': encodeURIComponent(
        'cookie_token_v2=v2_h; account_id_v2=9; ltoken_v2=v2_h2',
      ),
    })
    expect(buildMihoyoCookieFromHeaders(headers)).toContain('cookie_token_v2=v2_h')
  })

  it('prefers body-injected cookie from proxy JSON', () => {
    const json = {
      retcode: 0,
      data: {
        status: 'Confirmed',
        mihoyo_set_cookie: 'cookie_token_v2=v2_b; account_id_v2=1; ltoken_v2=v2_b2',
      },
    }
    const cookie = extractMihoyoCookieFromQrPayload(json, new Headers())
    expect(validateQrCookie(cookie)).toContain('cookie_token_v2=v2_b')
  })
})
