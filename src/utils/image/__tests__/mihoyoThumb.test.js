import { describe, expect, it } from 'vitest'
import {
  isMihoyoImageUrl,
  toDisplayImageUrl,
  withMihoyoImageSize
} from '@/utils/image/mihoyoThumb'

const SAMPLE =
  'https://act-webstatic.mihoyo.com/upload/mall/2026/09/16/eb8e6fc5187186462478da3023b5ed74_3077419255214011741.jpg?x-oss-process=image/resize,m_lfit,w_972,h_972,limit_1/format,webp'

describe('utils/image/mihoyoThumb', () => {
  it('识别米游铺静态 CDN，不误伤接口域与外链', () => {
    expect(isMihoyoImageUrl(SAMPLE)).toBe(true)
    expect(isMihoyoImageUrl('https://sdk-webstatic.mihoyo.com/sdk-payment-upload/a.png')).toBe(true)
    expect(isMihoyoImageUrl('https://api-mall.mihoyogift.com/common/homeishop/v1/goods')).toBe(false)
    expect(isMihoyoImageUrl('https://example.supabase.co/storage/v1/object/public/x.jpg')).toBe(false)
    expect(isMihoyoImageUrl('capacitor://localhost/_capacitor_file_/a.jpg')).toBe(false)
  })

  it('展示 URL 与入库原地址一致（列表/详情/放大同一张）', () => {
    expect(toDisplayImageUrl(SAMPLE)).toBe(SAMPLE)
    expect(toDisplayImageUrl('https://example.supabase.co/storage/v1/object/public/a.jpg'))
      .toBe('https://example.supabase.co/storage/v1/object/public/a.jpg')
    expect(toDisplayImageUrl('')).toBe('')
  })

  it('withMihoyoImageSize 仍可显式改写（仅供未来缩略图链路）', () => {
    const sized = withMihoyoImageSize(SAMPLE, { width: 480 })
    expect(sized).toContain('w_480')
    expect(sized).not.toContain('w_972')
  })
})
