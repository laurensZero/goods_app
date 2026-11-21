import { describe, expect, it } from 'vitest'
import {
  pendantContentKey,
  resolveAvatarPendantSrc,
  resolveBubbleSrc,
  resolvePendantSrc,
  resolvePendantSrcCandidates,
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

describe('resolvePendantSrc（上屏 vs 预览，首候选）', () => {
  it('上屏：去参原图直出（hoyolab CDN 小文件最快，不再拼缩放参数）', () => {
    expect(resolvePendantSrc({ u: `${HY_URL}?x-oss-process=image/resize,w_96`, m: MIRROR, t: THUMB })).toBe(HY_URL)
    expect(resolvePendantSrc({ u: MS_URL })).toBe(MS_URL)
  })

  it('预览：原图 CDN 现场缩 w_128 webp（不再走反代缩略图）', () => {
    expect(resolvePendantSrc({ u: HY_URL, m: MIRROR, t: THUMB }, { preview: true }))
      .toBe(`${HY_URL}?x-oss-process=image/resize,w_128/format,webp`)
  })

  it('预览：米游社源同样现场缩放', () => {
    expect(resolvePendantSrc({ u: MS_URL }, { preview: true }))
      .toBe(`${MS_URL}?x-oss-process=image/resize,w_128/format,webp`)
  })

  it('空入参返回空串', () => {
    expect(resolvePendantSrc(null)).toBe('')
    expect(resolvePendantSrc({})).toBe('')
  })
})

describe('resolvePendantSrcCandidates（完整降级链）', () => {
  it('上屏候选：原图 → 镜像（官方删文件时兜底）', () => {
    expect(resolvePendantSrcCandidates({ u: HY_URL, m: MIRROR, t: THUMB }))
      .toEqual([HY_URL, MIRROR])
  })

  it('上屏候选：u 自带历史参数时先去参再入链', () => {
    expect(resolvePendantSrcCandidates({ u: `${HY_URL}?x-oss-process=image/resize,w_96`, m: MIRROR }))
      .toEqual([HY_URL, MIRROR])
  })

  it('预览候选：w_128 缩放图 → 原图 → 镜像', () => {
    expect(resolvePendantSrcCandidates({ u: HY_URL, m: MIRROR, t: THUMB }, { preview: true }))
      .toEqual([`${HY_URL}?x-oss-process=image/resize,w_128/format,webp`, HY_URL, MIRROR])
  })

  it('候选经过 rebase：内置 Supabase 公链 host 跟随同步层端点', () => {
    const cands = resolvePendantSrcCandidates(
      { u: HY_URL, m: 'https://api.goodsapp.de5.net/storage/v1/object/public/x.png' }
    )
    // 首候选 = hoyolab 原图（rebase 不动米哈游公链）；次候选 = 镜像
    //（Storage 公链 host 改写到同步层当前端点，这里缺省主站）
    expect(cands[0]).toBe(HY_URL)
    expect(cands[1]).toBe('https://zvqzicimowfqshgjsrri.supabase.co/storage/v1/object/public/x.png')
  })

  it('没有 mirror 时候选只有原图', () => {
    expect(resolvePendantSrcCandidates({ u: MS_URL })).toEqual([MS_URL])
  })
})

describe('resolveAvatarPendantSrc（上屏 vs 预览，首候选）', () => {
  it('头像上屏（默认）：hoyolab 原图直出（动图原图直接播）', () => {
    expect(resolveAvatarPendantSrc({ u: HY_URL, m: MIRROR, t: THUMB, a: true }, { playAnimation: true }))
      .toBe(HY_URL)
  })

  it('头像上屏：静态条目同样原图直出', () => {
    expect(resolveAvatarPendantSrc({ u: MS_URL, m: MIRROR, t: THUMB })).toBe(MS_URL)
  })

  it('预览：动图压平首帧 png（w_128）', () => {
    expect(resolveAvatarPendantSrc({ u: HY_URL, m: MIRROR, t: THUMB, a: true }, { preview: true }))
      .toBe(`${HY_URL}?x-oss-process=image/resize,w_128/format,png`)
  })

  it('预览：静态条目 w_128 webp', () => {
    expect(resolveAvatarPendantSrc({ u: MS_URL, m: MIRROR, t: THUMB }, { preview: true }))
      .toBe(`${MS_URL}?x-oss-process=image/resize,w_128/format,webp`)
  })
})

describe('resolveBubbleSrc（上屏 vs 预览，首候选）', () => {
  it('playAnimation 且有 gif → 直接 gif 原地址', () => {
    expect(resolveBubbleSrc({ u: MS_URL, gif: THUMB, m: MIRROR, t: THUMB }, { playAnimation: true }))
      .toBe(THUMB)
  })

  it('gif 字段兼容原始行的 gif_url', () => {
    expect(resolveBubbleSrc({ u: MS_URL, gif_url: MIRROR }, { playAnimation: true })).toBe(MIRROR)
  })

  it('上屏（贴角）：去参原图直出', () => {
    expect(resolveBubbleSrc({ u: MS_URL, gif: THUMB, m: MIRROR, t: THUMB })).toBe(MS_URL)
  })

  it('预览：w_128 现场缩放', () => {
    expect(resolveBubbleSrc({ u: MS_URL, m: MIRROR, t: THUMB }, { preview: true }))
      .toBe(`${MS_URL}?x-oss-process=image/resize,w_128/format,webp`)
  })
})
