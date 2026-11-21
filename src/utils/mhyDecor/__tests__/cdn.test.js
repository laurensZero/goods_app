import { describe, expect, it } from 'vitest'
import {
  pendantContentKey,
  resolveAvatarPendantSrc,
  resolveBubbleSrc,
  resolvePendantSrc,
  stripDecorParams
} from '../cdn'

const MS_URL = 'https://bbs-static.miyoushe.com/static/2025/04/26/abc_123.png'
const HY_URL = 'https://upload-os-bbs.hoyolab.com/upload/2025/10/10/def_456.webp'
const MIRROR = 'https://abc123.supabase.co/storage/v1/object/public/mhy-decor/pendants/def.webp'
const THUMB = 'https://abc123.supabase.co/storage/v1/object/public/mhy-decor/pendants/def_thumb.webp'

describe('stripDecorParams', () => {
  it('去掉 x-oss-process 等历史参数', () => {
    expect(stripDecorParams(`${MS_URL}?x-oss-process=image/resize,w_96`)).toBe(MS_URL)
    expect(stripDecorParams(MS_URL)).toBe(MS_URL)
    expect(stripDecorParams('')).toBe('')
  })
})

describe('pendantContentKey', () => {
  it('取 CDN 文件名的内容 hash 前缀', () => {
    expect(pendantContentKey('https://x.com/a/e3e7851669f6a32f1de74aa83e49018d_123.png'))
      .toBe('e3e7851669f6a32f1de74aa83e49018d')
  })

  it('取不到 hash 时退化为去参完整地址', () => {
    expect(pendantContentKey(`${MS_URL}?x=1`)).toBe(MS_URL)
    expect(pendantContentKey('')).toBe('')
  })
})

describe('resolvePendantSrc（上屏 vs 预览）', () => {
  it('上屏：镜像优先（原图级，无任何缩放参数）', () => {
    expect(resolvePendantSrc({ u: HY_URL, m: MIRROR, t: THUMB })).toBe(MIRROR)
  })

  it('上屏：没有镜像退去参原图（不再拼 x-oss-process）', () => {
    expect(resolvePendantSrc({ u: `${HY_URL}?x-oss-process=image/resize,w_96` })).toBe(HY_URL)
    expect(resolvePendantSrc({ u: MS_URL })).toBe(MS_URL)
  })

  it('预览：128px 缩略图优先（动图自带首帧压平）', () => {
    expect(resolvePendantSrc({ u: HY_URL, m: MIRROR, t: THUMB }, { preview: true })).toBe(THUMB)
  })

  it('预览：没有缩略图退镜像', () => {
    expect(resolvePendantSrc({ u: HY_URL, m: MIRROR }, { preview: true })).toBe(MIRROR)
  })

  it('预览：都没有退去参原图', () => {
    expect(resolvePendantSrc({ u: `${MS_URL}?x-oss-process=image/resize,w_96` }, { preview: true })).toBe(MS_URL)
  })

  it('空入参返回空串', () => {
    expect(resolvePendantSrc(null)).toBe('')
    expect(resolvePendantSrc({})).toBe('')
  })
})

describe('resolveAvatarPendantSrc', () => {
  it('头像上屏（默认）：镜像优先，原图级清晰度', () => {
    expect(resolveAvatarPendantSrc({ u: HY_URL, m: MIRROR, t: THUMB, a: true }, { playAnimation: true }))
      .toBe(MIRROR)
  })

  it('头像上屏：动图原图直接播（去参，无缩放）', () => {
    expect(resolveAvatarPendantSrc({ u: HY_URL, a: true }, { playAnimation: true })).toBe(HY_URL)
  })

  it('预览：动图也走静态首帧缩略图', () => {
    expect(resolveAvatarPendantSrc({ u: HY_URL, m: MIRROR, t: THUMB, a: true }, { preview: true }))
      .toBe(THUMB)
  })

  it('静态条目预览：缩略图优先', () => {
    expect(resolveAvatarPendantSrc({ u: MS_URL, m: MIRROR, t: THUMB }, { preview: true })).toBe(THUMB)
  })
})

describe('resolveBubbleSrc', () => {
  it('playAnimation 且有 gif → 直接 gif 原地址', () => {
    expect(resolveBubbleSrc({ u: MS_URL, gif: THUMB, m: MIRROR, t: THUMB }, { playAnimation: true }))
      .toBe(THUMB)
  })

  it('上屏（贴角）：镜像优先', () => {
    expect(resolveBubbleSrc({ u: MS_URL, gif: THUMB, m: MIRROR, t: THUMB })).toBe(MIRROR)
  })

  it('预览：缩略图优先', () => {
    expect(resolveBubbleSrc({ u: MS_URL, m: MIRROR, t: THUMB }, { preview: true })).toBe(THUMB)
  })

  it('gif 字段兼容原始行的 gif_url', () => {
    expect(resolveBubbleSrc({ u: MS_URL, gif_url: MIRROR }, { playAnimation: true })).toBe(MIRROR)
  })
})
