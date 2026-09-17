import { beforeEach, describe, expect, it } from 'vitest'
import {
  IMAGE_SOURCE_STORAGE_KEY,
  buildImageSourceUrl,
  getImageSourceMode,
  resolveOtaStorageUrls,
  setImageSourceMode,
  isImageSourceMode
} from '@/config/mediaProxy'

describe('config/mediaProxy image source preference', () => {
  beforeEach(() => {
    localStorage.removeItem(IMAGE_SOURCE_STORAGE_KEY)
  })

  it('默认 proxy', () => {
    expect(getImageSourceMode()).toBe('proxy')
  })

  it('读写偏好并校验非法值', () => {
    expect(setImageSourceMode('direct')).toBe('direct')
    expect(getImageSourceMode()).toBe('direct')
    expect(setImageSourceMode('nope')).toBe('proxy')
    expect(isImageSourceMode('proxy')).toBe(true)
    expect(isImageSourceMode('auto')).toBe(false)
  })

  it('按源生成图片 URL', () => {
    expect(buildImageSourceUrl('goods-images/a.jpg', 'proxy')).toBe(
      'https://img.goodsapp.de5.net/goods-images/a.jpg'
    )
    expect(buildImageSourceUrl('goods-images/a.jpg', 'direct')).toBe(
      'https://zvqzicimowfqshgjsrri.supabase.co/storage/v1/object/public/goods-images/a.jpg'
    )
    expect(buildImageSourceUrl('../evil', 'proxy')).toBe('')
  })

  it('OTA 下载与图片共用同一偏好，另一源作 fallback', () => {
    setImageSourceMode('proxy')
    const viaProxy = resolveOtaStorageUrls('web/v1.2.3.zip')
    expect(viaProxy.primary).toBe('https://img.goodsapp.de5.net/ota-releases/web/v1.2.3.zip')
    expect(viaProxy.fallback).toBe(
      'https://zvqzicimowfqshgjsrri.supabase.co/storage/v1/object/public/ota-releases/web/v1.2.3.zip'
    )

    setImageSourceMode('direct')
    const viaDirect = resolveOtaStorageUrls('web/v1.2.3.zip')
    expect(viaDirect.primary).toBe(
      'https://zvqzicimowfqshgjsrri.supabase.co/storage/v1/object/public/ota-releases/web/v1.2.3.zip'
    )
    expect(viaDirect.fallback).toBe('https://img.goodsapp.de5.net/ota-releases/web/v1.2.3.zip')
  })
})
