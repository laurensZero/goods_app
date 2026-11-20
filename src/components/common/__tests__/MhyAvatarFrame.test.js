// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import MhyAvatarFrame from '../MhyAvatarFrame.vue'

// LazyCachedImage 会走图片缓存管线，这里只关心它拿到的 src
vi.mock('@/components/image/LazyCachedImage.vue', () => ({
  default: {
    name: 'LazyCachedImage',
    props: ['src', 'alt', 'rootMargin'],
    template: '<img :src="src" :alt="alt" />'
  }
}))

const FRAME = 'https://bbs-static.miyoushe.com/static/2025/04/26/abc_123.png'
const AVATAR = 'https://bbs-static.miyoushe.com/avatar/avatar10015.png'
const MIRROR = 'https://abc123.supabase.co/storage/v1/object/public/mhy-decor/mirror/abc.png'
const THUMB = 'https://abc123.supabase.co/storage/v1/object/public/mhy-decor/thumb/abc.webp'

describe('MhyAvatarFrame', () => {
  it('渲染头像并给挂件加上缩放参数', () => {
    const wrapper = mount(MhyAvatarFrame, {
      props: { avatar: AVATAR, frame: FRAME, size: 48 }
    })
    const imgs = wrapper.findAll('img')
    expect(imgs.length).toBe(2)
    expect(imgs[0].attributes('src')).toBe(AVATAR)
    // size 48 → 请求 96 宽的 2 倍图，静态图不 flatten
    expect(imgs[1].attributes('src')).toBe(`${FRAME}?x-oss-process=image/resize,w_96/format,webp`)
  })

  it('小尺寸且带缩略图时优先用 thumb_url（动图压平场景）', () => {
    const wrapper = mount(MhyAvatarFrame, {
      props: { frame: FRAME, frameThumb: THUMB, size: 48, animated: true }
    })
    expect(wrapper.find('.mhy-avatar-frame__pendant img').attributes('src')).toBe(THUMB)
  })

  it('静态小图带缩略图时同样走 thumb_url', () => {
    const wrapper = mount(MhyAvatarFrame, {
      props: { frame: FRAME, frameThumb: THUMB, size: 56 }
    })
    expect(wrapper.find('.mhy-avatar-frame__pendant img').attributes('src')).toBe(THUMB)
  })

  it('大图不带缩略图命中时退 mirror_url 镜像原图', () => {
    const wrapper = mount(MhyAvatarFrame, {
      props: { frame: FRAME, frameMirror: MIRROR, frameThumb: THUMB, size: 128 }
    })
    // size 128 → 请求 256 宽，超过缩略图的 128px 适用范围
    expect(wrapper.find('.mhy-avatar-frame__pendant img').attributes('src')).toBe(MIRROR)
  })

  it('只有镜像时任何尺寸都走镜像', () => {
    const wrapper = mount(MhyAvatarFrame, {
      props: { frame: FRAME, frameMirror: MIRROR, size: 48 }
    })
    expect(wrapper.find('.mhy-avatar-frame__pendant img').attributes('src')).toBe(MIRROR)
  })

  it('动图在 playAnimation=false 时压成静态首帧', () => {
    const wrapper = mount(MhyAvatarFrame, {
      props: { frame: FRAME, size: 48, animated: true }
    })
    expect(wrapper.find('.mhy-avatar-frame__pendant img').attributes('src'))
      .toBe(`${FRAME}?x-oss-process=image/resize,w_96/format,png`)
  })

  it('playAnimation=true 时保留动图', () => {
    const wrapper = mount(MhyAvatarFrame, {
      props: { frame: FRAME, size: 48, animated: true, playAnimation: true }
    })
    expect(wrapper.find('.mhy-avatar-frame__pendant img').attributes('src'))
      .toBe(`${FRAME}?x-oss-process=image/resize,w_96/format,webp`)
  })

  it('playAnimation=true 时缩略图/镜像都不能抢走动画', () => {
    const wrapper = mount(MhyAvatarFrame, {
      props: {
        frame: FRAME,
        frameMirror: MIRROR,
        frameThumb: THUMB,
        size: 48,
        animated: true,
        playAnimation: true
      }
    })
    // t 是静态首帧、m 是未缩放原图，播动画只能走 OSS 缩放的动画 webp
    expect(wrapper.find('.mhy-avatar-frame__pendant img').attributes('src'))
      .toBe(`${FRAME}?x-oss-process=image/resize,w_96/format,webp`)
  })

  it('动图请求宽度封顶 192（size 84 → 2 倍图 168 吸附 192）', () => {
    const wrapper = mount(MhyAvatarFrame, {
      props: { frame: FRAME, size: 84, animated: true, playAnimation: true }
    })
    expect(wrapper.find('.mhy-avatar-frame__pendant img').attributes('src'))
      .toBe(`${FRAME}?x-oss-process=image/resize,w_192/format,webp`)
  })

  it('静态图不受动画宽度封顶影响', () => {
    const wrapper = mount(MhyAvatarFrame, {
      props: { frame: FRAME, size: 160 }
    })
    expect(wrapper.find('.mhy-avatar-frame__pendant img').attributes('src'))
      .toBe(`${FRAME}?x-oss-process=image/resize,w_256/format,webp`)
  })

  it('没有挂件时不渲染挂件层', () => {
    const wrapper = mount(MhyAvatarFrame, { props: { avatar: AVATAR } })
    expect(wrapper.find('.mhy-avatar-frame__pendant').exists()).toBe(false)
  })

  it('size 与 scale 通过 CSS 变量下发', () => {
    const wrapper = mount(MhyAvatarFrame, { props: { size: 64, scale: 1.4 } })
    expect(wrapper.attributes('style')).toContain('--mhy-avatar-size: 64px')
    expect(wrapper.attributes('style')).toContain('--mhy-pendant-scale: 1.4')
  })

  it('scale 非法时回落到米游社原比例 1.285', () => {
    const wrapper = mount(MhyAvatarFrame, { props: { size: 64, scale: 0 } })
    expect(wrapper.attributes('style')).toContain('--mhy-pendant-scale: 1.285')
  })
})
