import { describe, expect, it } from 'vitest'
import {
  DECOR_WIDTH_STEPS,
  buildDecorDetailUrl,
  buildDecorUrl,
  isMhyDecorUrl,
  pendantContentKey,
  resolveAvatarPendantSrc,
  resolveBubbleSrc,
  resolvePendantSrc,
  snapDecorWidth,
  stripDecorParams
} from '../cdn'

const MS_URL = 'https://bbs-static.miyoushe.com/static/2025/04/26/abc_123.png'
const HY_URL = 'https://upload-os-bbs.hoyolab.com/upload/2025/10/10/def_456.webp'

describe('stripDecorParams', () => {
  it('去掉 x-oss-process 参数', () => {
    expect(stripDecorParams(`${MS_URL}?x-oss-process=image/resize,w_96`)).toBe(MS_URL)
    expect(stripDecorParams(MS_URL)).toBe(MS_URL)
    expect(stripDecorParams('')).toBe('')
  })
})

describe('isMhyDecorUrl', () => {
  it('识别米哈游系图床', () => {
    expect(isMhyDecorUrl(MS_URL)).toBe(true)
    expect(isMhyDecorUrl(HY_URL)).toBe(true)
    expect(isMhyDecorUrl('https://fastcdn.hoyoverse.com/a/b.webp')).toBe(true)
    expect(isMhyDecorUrl('https://example.com/a.png')).toBe(false)
    expect(isMhyDecorUrl('not a url')).toBe(false)
  })
})

describe('snapDecorWidth', () => {
  it('吸附到最近的档位，避免生成一次性 URL', () => {
    expect(snapDecorWidth(0)).toBe(0)
    expect(snapDecorWidth(50)).toBe(DECOR_WIDTH_STEPS[0])
    expect(snapDecorWidth(97)).toBe(96)
    expect(snapDecorWidth(200)).toBe(192)
    expect(snapDecorWidth(9999)).toBe(DECOR_WIDTH_STEPS[DECOR_WIDTH_STEPS.length - 1])
  })
})

describe('buildDecorUrl', () => {
  it('默认走 webp 并带上缩放参数', () => {
    expect(buildDecorUrl(MS_URL, { width: 88 })).toBe(`${MS_URL}?x-oss-process=image/resize,w_96/format,webp`)
  })

  it('flatten 时压成静态首帧', () => {
    expect(buildDecorUrl(HY_URL, { width: 128, flatten: true }))
      .toBe(`${HY_URL}?x-oss-process=image/resize,w_128/format,png`)
  })

  it('先清掉旧参数再拼新参数', () => {
    expect(buildDecorUrl(`${HY_URL}?x-oss-process=image/resize,m_fixed,h_318,w_318`, { width: 64 }))
      .toBe(`${HY_URL}?x-oss-process=image/resize,w_64/format,webp`)
  })

  it('不传宽度或非米哈游域名时返回原图', () => {
    expect(buildDecorUrl(MS_URL)).toBe(MS_URL)
    expect(buildDecorUrl('https://example.com/a.png', { width: 96 })).toBe('https://example.com/a.png')
    expect(buildDecorUrl('')).toBe('')
  })
})

describe('buildDecorDetailUrl', () => {
  it('详情图不 flatten，动图仍是动图', () => {
    expect(buildDecorDetailUrl(HY_URL, { width: 256 }))
      .toBe(`${HY_URL}?x-oss-process=image/resize,w_256/format,webp`)
  })
})

describe('resolvePendantSrc', () => {
  // 模拟 HoYoLAB 条目：云端回填了镜像 + 预压缩缩略图
  const ITEM = {
    u: HY_URL,
    m: 'https://abc123.supabase.co/storage/v1/object/public/mhy-decor/mirror/def.webp',
    t: 'https://abc123.supabase.co/storage/v1/object/public/mhy-decor/thumb/def.webp'
  }

  it('flatten 时优先用预压缩缩略图（本身就是静态首帧）', () => {
    expect(resolvePendantSrc(ITEM, { width: 400, flatten: true })).toBe(ITEM.t)
  })

  it('展示尺寸 snap 后 ≤128 直接用缩略图，不再让 OSS 现场缩', () => {
    expect(resolvePendantSrc(ITEM, { width: 112 })).toBe(ITEM.t)
    expect(resolvePendantSrc(ITEM, { width: 160 })).toBe(ITEM.t)
  })

  it('大图退镜像原图（国内直连快，但无缩放）', () => {
    expect(resolvePendantSrc(ITEM, { width: 256 })).toBe(ITEM.m)
  })

  it('没有镜像才走 OSS 实时缩放', () => {
    expect(resolvePendantSrc({ u: MS_URL, m: '', t: '' }, { width: 256 }))
      .toBe(`${MS_URL}?x-oss-process=image/resize,w_256/format,webp`)
  })

  it('米游社条目（m/t 均空）始终走 OSS 缩放', () => {
    expect(resolvePendantSrc({ u: MS_URL, m: '', t: '' }, { width: 96, flatten: true }))
      .toBe(`${MS_URL}?x-oss-process=image/resize,w_96/format,png`)
  })

  it('width=0 是「要原图」的语义，不套用缩略图规则', () => {
    expect(resolvePendantSrc(ITEM, {})).toBe(ITEM.m)
    expect(resolvePendantSrc({ u: MS_URL, t: ITEM.t }, {})).toBe(MS_URL)
  })

  it('入参异常时返回空串', () => {
    expect(resolvePendantSrc(null, {})).toBe('')
    expect(resolvePendantSrc({}, { width: 96 })).toBe('')
  })

  // 动图必须绕开 t（静态首帧）和 m（未缩放原图），否则动画永远不播
  it('animate 时忽略缩略图，改让 OSS 缩动画 webp', () => {
    expect(resolvePendantSrc(ITEM, { width: 96, animate: true }))
      .toBe(`${HY_URL}?x-oss-process=image/resize,w_96/format,webp`)
  })

  it('animate 时缩略图规则失效，即使尺寸 ≤128 也不回退 t', () => {
    expect(resolvePendantSrc(ITEM, { width: 96, flatten: true, animate: true }))
      .toBe(`${HY_URL}?x-oss-process=image/resize,w_96/format,webp`)
  })

  it('animate 的宽度封顶 192，避免动图体积继续膨胀', () => {
    expect(resolvePendantSrc(ITEM, { width: 256, animate: true }))
      .toBe(`${HY_URL}?x-oss-process=image/resize,w_192/format,webp`)
    expect(resolvePendantSrc(ITEM, { animate: true }))
      .toBe(`${HY_URL}?x-oss-process=image/resize,w_192/format,webp`)
  })

  it('animate 但条目没有原图时才退镜像', () => {
    expect(resolvePendantSrc({ u: '', m: ITEM.m, t: ITEM.t }, { animate: true })).toBe(ITEM.m)
  })
})

describe('pendantContentKey', () => {
  it('取文件名里的上传内容 hash，忽略查询参数', () => {
    const url = 'https://bbs-static.miyoushe.com/static/2024/03/07/aa45e13c57e6342d5ea099404d9dfa98_4542939529123678087.png'
    expect(pendantContentKey(`${url}?x-oss-process=image/resize,w_96`))
      .toBe('aa45e13c57e6342d5ea099404d9dfa98')
    expect(pendantContentKey('https://upload-os-bbs.hoyolab.com/upload/2024/07/05/e3e7851669f6a32f1de74aa83e49018d_2319976981667326517.png'))
      .toBe('e3e7851669f6a32f1de74aa83e49018d')
  })

  it('同一张图换文件名仍然同键', () => {
    const a = 'https://upload-os-bbs.hoyolab.com/upload/2024/06/14/e3e7851669f6a32f1de74aa83e49018d_7168729605534675181.png'
    const b = 'https://upload-os-bbs.hoyolab.com/upload/2024/07/05/e3e7851669f6a32f1de74aa83e49018d_2319976981667326517.png'
    expect(pendantContentKey(a)).toBe(pendantContentKey(b))
  })

  it('取不到 hash 时退回完整地址，只在完全相同时判重', () => {
    expect(pendantContentKey('https://example.com/a/b.png')).toBe('https://example.com/a/b.png')
    expect(pendantContentKey('https://example.com/a/b.png?x=1')).toBe('https://example.com/a/b.png')
    expect(pendantContentKey('')).toBe('')
  })
})

describe('resolveAvatarPendantSrc', () => {
  const ITEM = { u: HY_URL, m: 'https://cdn/mirror.webp', t: 'https://cdn/thumb.webp', a: true }

  it('动图 + playAnimation 时走动画 webp（与组件取图保持一致）', () => {
    expect(resolveAvatarPendantSrc(ITEM, { size: 84, playAnimation: true }))
      .toBe(`${HY_URL}?x-oss-process=image/resize,w_192/format,webp`)
  })

  it('动图未开播时压平走缩略图', () => {
    expect(resolveAvatarPendantSrc(ITEM, { size: 84 })).toBe('https://cdn/thumb.webp')
  })

  it('静态图走镜像/OSS 缩放，不受动画逻辑影响', () => {
    expect(resolveAvatarPendantSrc({ ...ITEM, a: false }, { size: 84 })).toBe('https://cdn/mirror.webp')
    expect(resolveAvatarPendantSrc({ u: HY_URL }, { size: 84 }))
      .toBe(`${HY_URL}?x-oss-process=image/resize,w_192/format,webp`)
  })

  it('入参为空时返回空串', () => {
    expect(resolveAvatarPendantSrc(null)).toBe('')
  })
})

describe('resolveBubbleSrc', () => {
  // 模拟云端回填过 m/t 的气泡条目
  const BUBBLE = {
    u: MS_URL,
    gif: 'https://bbs-static.miyoushe.com/static/2025/08/01/anim.gif',
    m: 'https://abc123.supabase.co/storage/v1/object/public/mhy-decor/mirror/abc.png',
    t: 'https://abc123.supabase.co/storage/v1/object/public/mhy-decor/thumb/abc.webp'
  }

  it('playAnimation 且 gif 有值 → 直接返回 gif 原地址（不拼 x-oss-process）', () => {
    expect(resolveBubbleSrc(BUBBLE, { playAnimation: true })).toBe(BUBBLE.gif)
    // gif 带查询参数也原样保留（直接播放，不拼缩放参数）
    expect(resolveBubbleSrc({ ...BUBBLE, gif: `${BUBBLE.gif}?v=2` }, { playAnimation: true }))
      .toBe(`${BUBBLE.gif}?v=2`)
  })

  it('不播动画时走静态链：≤128 命中缩略图 t', () => {
    expect(resolveBubbleSrc(BUBBLE, { width: 96 })).toBe(BUBBLE.t)
    expect(resolveBubbleSrc(BUBBLE, { width: 112 })).toBe(BUBBLE.t)
  })

  it('不播动画且大图退镜像 m，最后 OSS 缩放 u', () => {
    expect(resolveBubbleSrc(BUBBLE, { width: 192 })).toBe(BUBBLE.m)
    expect(resolveBubbleSrc({ u: MS_URL, gif: BUBBLE.gif, m: '', t: '' }, { width: 192 }))
      .toBe(`${MS_URL}?x-oss-process=image/resize,w_192/format,webp`)
  })

  it('gif 为空或 playAnimation 关闭时不返回 gif，退静态链', () => {
    expect(resolveBubbleSrc({ u: MS_URL, gif: '', m: '', t: '' }, { playAnimation: true, width: 96 }))
      .toBe(`${MS_URL}?x-oss-process=image/resize,w_96/format,webp`)
    expect(resolveBubbleSrc(BUBBLE, { width: 96 })).toBe(BUBBLE.t)
  })

  it('兼容原始行字段（gif_url）入参', () => {
    expect(resolveBubbleSrc({ u: MS_URL, gif_url: BUBBLE.gif }, { playAnimation: true }))
      .toBe(BUBBLE.gif)
  })

  it('入参异常时返回空串', () => {
    expect(resolveBubbleSrc(null, { playAnimation: true })).toBe('')
    expect(resolveBubbleSrc({}, { width: 96 })).toBe('')
  })
})
