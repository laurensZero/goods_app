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
const FRAME_WITH_PARAMS = `${FRAME}?x-oss-process=image/resize,w_96/format,webp`
const AVATAR = 'https://bbs-static.miyoushe.com/avatar/avatar10015.png'
const MIRROR = 'https://abc123.supabase.co/storage/v1/object/public/mhy-decor/pendants/abc.png'
const THUMB = 'https://abc123.supabase.co/storage/v1/object/public/mhy-decor/pendants/abc_thumb.webp'

describe('MhyAvatarFrame', () => {
  it('渲染头像并给挂件取去参原图（上屏永远是原图级，不再拼 OSS 参数）', () => {
    const wrapper = mount(MhyAvatarFrame, {
      props: { avatar: AVATAR, frame: FRAME_WITH_PARAMS, size: 48 }
    })
    const imgs = wrapper.findAll('img')
    expect(imgs.length).toBe(2)
    expect(imgs[0].attributes('src')).toBe(AVATAR)
    expect(imgs[1].attributes('src')).toBe(FRAME)
  })

  it('上屏：有镜像永远优先镜像（原图级清晰度）', () => {
    const wrapper = mount(MhyAvatarFrame, {
      props: { frame: FRAME, frameMirror: MIRROR, frameThumb: THUMB, size: 128 }
    })
    expect(wrapper.find('.mhy-avatar-frame__pendant img').attributes('src')).toBe(MIRROR)
  })

  it('只有镜像时任何尺寸都走镜像', () => {
    const wrapper = mount(MhyAvatarFrame, {
      props: { frame: FRAME, frameMirror: MIRROR, size: 48 }
    })
    expect(wrapper.find('.mhy-avatar-frame__pendant img').attributes('src')).toBe(MIRROR)
  })

  it('preview 场景：缩略图优先（选择器网格等小尺寸展示）', () => {
    const wrapper = mount(MhyAvatarFrame, {
      props: { frame: FRAME, frameMirror: MIRROR, frameThumb: THUMB, size: 56, preview: true }
    })
    expect(wrapper.find('.mhy-avatar-frame__pendant img').attributes('src')).toBe(THUMB)
  })

  it('preview 场景：动图走静态首帧缩略图', () => {
    const wrapper = mount(MhyAvatarFrame, {
      props: { frame: FRAME, frameThumb: THUMB, size: 56, animated: true, preview: true }
    })
    expect(wrapper.find('.mhy-avatar-frame__pendant img').attributes('src')).toBe(THUMB)
  })

  it('preview 场景：没有缩略图退镜像', () => {
    const wrapper = mount(MhyAvatarFrame, {
      props: { frame: FRAME, frameMirror: MIRROR, size: 56, preview: true }
    })
    expect(wrapper.find('.mhy-avatar-frame__pendant img').attributes('src')).toBe(MIRROR)
  })

  it('动图上屏：镜像的动图原图直接播放', () => {
    const wrapper = mount(MhyAvatarFrame, {
      props: { frame: FRAME, frameMirror: MIRROR, size: 84, animated: true, playAnimation: true }
    })
    expect(wrapper.find('.mhy-avatar-frame__pendant img').attributes('src')).toBe(MIRROR)
  })

  it('动图上屏：没有镜像退去参原图（不拼任何缩放参数）', () => {
    const wrapper = mount(MhyAvatarFrame, {
      props: { frame: FRAME, size: 84, animated: true, playAnimation: true }
    })
    expect(wrapper.find('.mhy-avatar-frame__pendant img').attributes('src')).toBe(FRAME)
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
