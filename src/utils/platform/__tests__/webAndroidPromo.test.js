import { describe, it, expect } from 'vitest'
import {
  WEB_APK_PROMO_DISMISS_KEY,
  dismissWebApkPromo,
  isWebAndroidPromoTarget,
  isWebApkPromoDismissed
} from '../webAndroidPromo'

const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
const IOS_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
const DESKTOP_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
const TAURI_ANDROID_UA = `${ANDROID_UA} Tauri`

describe('isWebAndroidPromoTarget', () => {
  it('Web + Android UA 命中', () => {
    expect(isWebAndroidPromoTarget(ANDROID_UA, { isNative: false })).toBe(true)
  })

  it('原生 Capacitor 环境不展示', () => {
    expect(isWebAndroidPromoTarget(ANDROID_UA, { isNative: true })).toBe(false)
  })

  it('iOS / 桌面 UA 不展示', () => {
    expect(isWebAndroidPromoTarget(IOS_UA, { isNative: false })).toBe(false)
    expect(isWebAndroidPromoTarget(DESKTOP_UA, { isNative: false })).toBe(false)
  })

  it('Tauri 壳即使带 Android 字样也不展示', () => {
    expect(isWebAndroidPromoTarget(TAURI_ANDROID_UA, { isNative: false })).toBe(false)
  })

  it('空 UA 不展示', () => {
    expect(isWebAndroidPromoTarget('', { isNative: false })).toBe(false)
    expect(isWebAndroidPromoTarget(null, { isNative: false })).toBe(false)
  })
})

describe('web apk promo dismiss storage', () => {
  function createStorage(initial = {}) {
    const map = new Map(Object.entries(initial))
    return {
      getItem: (key) => (map.has(key) ? map.get(key) : null),
      setItem: (key, value) => { map.set(key, String(value)) },
      _map: map
    }
  }

  it('默认未关闭', () => {
    expect(isWebApkPromoDismissed(createStorage())).toBe(false)
  })

  it('写入关闭标记后可读出', () => {
    const storage = createStorage()
    expect(dismissWebApkPromo(storage)).toBe(true)
    expect(storage._map.get(WEB_APK_PROMO_DISMISS_KEY)).toBe('1')
    expect(isWebApkPromoDismissed(storage)).toBe(true)
  })

  it('storage 异常时不抛错', () => {
    const storage = {
      getItem: () => { throw new Error('blocked') },
      setItem: () => { throw new Error('blocked') }
    }
    expect(isWebApkPromoDismissed(storage)).toBe(false)
    expect(dismissWebApkPromo(storage)).toBe(false)
  })
})
