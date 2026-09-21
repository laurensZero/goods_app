import { describe, expect, it } from 'vitest'
import {
  buildAuthCallbackDeepLink,
  buildAuthWebFallbackUrl,
  parseAuthCallbackDeepLink,
  parseAuthLandingParams
} from '../authDeepLink'

describe('authDeepLink', () => {
  it('builds and parses app callback deep link', () => {
    const url = buildAuthCallbackDeepLink({
      accessToken: 'at',
      refreshToken: 'rt',
      expiresIn: 7200,
      tokenType: 'bearer'
    })
    expect(url.startsWith('goodsapp://auth/callback?')).toBe(true)
    expect(parseAuthCallbackDeepLink(url)).toEqual({
      accessToken: 'at',
      refreshToken: 'rt',
      expiresIn: '7200',
      tokenType: 'bearer'
    })
  })

  it('rejects non-auth deep links', () => {
    expect(parseAuthCallbackDeepLink('goodsapp://share/abc')).toBeNull()
    expect(parseAuthCallbackDeepLink('goodsapp://auth/callback')).toBeNull()
  })

  it('builds web fallback hash url', () => {
    const url = buildAuthWebFallbackUrl(
      { accessToken: 'at', refreshToken: 'rt', type: 'signup' },
      'https://goodsapp.de5.net/'
    )
    expect(url.startsWith('https://goodsapp.de5.net/#access_token=at')).toBe(true)
  })

  it('parses landing params from search src + hash tokens', () => {
    const parsed = parseAuthLandingParams(
      'https://goodsapp.de5.net/auth.html?src=app#access_token=at&refresh_token=rt&type=signup'
    )
    expect(parsed).toMatchObject({
      accessToken: 'at',
      refreshToken: 'rt',
      src: 'app',
      type: 'signup'
    })
  })

  it('parses landing params without tokens', () => {
    const parsed = parseAuthLandingParams('https://goodsapp.de5.net/auth.html?src=app')
    expect(parsed?.accessToken).toBe('')
    expect(parsed?.src).toBe('app')
  })
})
