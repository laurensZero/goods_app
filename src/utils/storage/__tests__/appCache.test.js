import { beforeEach, describe, expect, it, vi } from 'vitest'

const pluginMock = vi.hoisted(() => ({
  stats: vi.fn(),
  clearWebViewCache: vi.fn()
}))

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: vi.fn(() => true) },
  registerPlugin: vi.fn(() => pluginMock)
}))

import { Capacitor } from '@capacitor/core'
import {
  clearWebViewCache,
  getAppCacheStats,
  normalizeAppCacheStats
} from '@/utils/storage/appCache'

describe('utils/storage/appCache', () => {
  beforeEach(() => {
    pluginMock.stats.mockReset()
    pluginMock.clearWebViewCache.mockReset()
    pluginMock.clearWebViewCache.mockResolvedValue({})
    Capacitor.isNativePlatform.mockReturnValue(true)
  })

  it('插件返回的 total/webView 原样透传', () => {
    const stats = normalizeAppCacheStats({
      total: 818,
      webView: 306,
      dirs: { 'img-cache': 512, 'org.chromium.android_webview': 306 },
      path: '/cache'
    })

    expect(stats).toEqual({
      total: 818,
      webView: 306,
      dirs: { 'img-cache': 512, 'org.chromium.android_webview': 306 },
      path: '/cache'
    })
  })

  it('webView/total 缺失时按目录名兜底汇总', () => {
    const stats = normalizeAppCacheStats({
      dirs: {
        'img-cache': 500,
        'org.chromium.android_webview': 200,
        WebView: 100,
        'share-poster': 1
      }
    })

    expect(stats.total).toBe(801)
    expect(stats.webView).toBe(300)
  })

  it('非法输入返回 null', () => {
    expect(normalizeAppCacheStats(null)).toBeNull()
    expect(normalizeAppCacheStats('nope')).toBeNull()
  })

  it('非原生端不调用插件', async () => {
    Capacitor.isNativePlatform.mockReturnValue(false)

    await expect(getAppCacheStats()).resolves.toBeNull()
    await expect(clearWebViewCache()).resolves.toBe(false)
    expect(pluginMock.stats).not.toHaveBeenCalled()
  })

  it('插件调用异常时静默降级', async () => {
    pluginMock.stats.mockRejectedValue(new Error('no such plugin'))
    pluginMock.clearWebViewCache.mockRejectedValue(new Error('no such plugin'))

    await expect(getAppCacheStats()).resolves.toBeNull()
    await expect(clearWebViewCache()).resolves.toBe(false)
  })

  it('清理成功返回 true', async () => {
    await expect(clearWebViewCache()).resolves.toBe(true)
    expect(pluginMock.clearWebViewCache).toHaveBeenCalledTimes(1)
  })
})
