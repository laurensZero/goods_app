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

async function mountAndWait({ props }) {
  const wrapper = mount(MhyAvatarFrame, { props })
  await wrapper.vm.$nextTick()
  return wrapper
}

const pendantSrc = (wrapper) =>
  wrapper.find('.mhy-avatar-frame__pendant img').attributes('src')

describe('MhyAvatarFrame', () => {
  it('渲染头像并给挂件取去参原图（hoyolab 优先，不再拼 OSS 参数）', async () => {
    const wrapper = await mountAndWait({
      props: { avatar: AVATAR, frame: FRAME_WITH_PARAMS, size: 48 }
    })
    const imgs = wrapper.findAll('img')
    expect(imgs.length).toBe(2)
    expect(imgs[0].attributes('src')).toBe(AVATAR)
    expect(imgs[1].attributes('src')).toBe(FRAME)
  })

  it('上屏：原图是第一候选（hoyolab CDN 小文件最快）', async () => {
    const wrapper = await mountAndWait({
      props: { frame: FRAME, frameMirror: MIRROR, size: 128 }
    })
    expect(pendantSrc(wrapper)).toBe(FRAME)
  })

  it('上屏：原图加载失败自动切 CF 反代镜像', async () => {
    const wrapper = await mountAndWait({
      props: { frame: FRAME, frameMirror: MIRROR, size: 128 }
    })
    await wrapper.find('.mhy-avatar-frame__pendant img').trigger('error')
    expect(pendantSrc(wrapper)).toBe(MIRROR)
  })

  it('只有镜像没有原图时：候选只剩镜像', async () => {
    const wrapper = await mountAndWait({
      props: { frameMirror: MIRROR, size: 48 }
    })
    expect(pendantSrc(wrapper)).toBe(MIRROR)
  })

  it('preview 场景：原图 CDN 现场缩 w_128 webp（0.26s 级，8KB）', async () => {
    const wrapper = await mountAndWait({
      props: { frame: FRAME, frameMirror: MIRROR, size: 56, preview: true }
    })
    expect(pendantSrc(wrapper)).toBe(`${FRAME}?x-oss-process=image/resize,w_128/format,webp`)
  })

  it('preview 场景：动图压平首帧 png', async () => {
    const wrapper = await mountAndWait({
      props: { frame: FRAME, size: 56, animated: true, preview: true }
    })
    expect(pendantSrc(wrapper)).toBe(`${FRAME}?x-oss-process=image/resize,w_128/format,png`)
  })

  it('preview 场景：缩放图失败退原图', async () => {
    const wrapper = await mountAndWait({
      props: { frame: FRAME, frameMirror: MIRROR, size: 56, preview: true }
    })
    await wrapper.find('.mhy-avatar-frame__pendant img').trigger('error')
    expect(pendantSrc(wrapper)).toBe(FRAME)
  })

  it('preview 场景：原图也失败退反代镜像', async () => {
    const wrapper = await mountAndWait({
      props: { frame: FRAME, frameMirror: MIRROR, size: 56, preview: true }
    })
    const img = wrapper.find('.mhy-avatar-frame__pendant img')
    await img.trigger('error')
    await img.trigger('error')
    expect(pendantSrc(wrapper)).toBe(MIRROR)
  })

  it('动图上屏：hoyolab 动图原图直接播放', async () => {
    const wrapper = await mountAndWait({
      props: { frame: FRAME, size: 84, animated: true, playAnimation: true }
    })
    expect(pendantSrc(wrapper)).toBe(FRAME)
  })

  it('动图上屏：加载失败退反代镜像', async () => {
    const wrapper = await mountAndWait({
      props: { frame: FRAME, frameMirror: MIRROR, size: 84, animated: true, playAnimation: true }
    })
    await wrapper.find('.mhy-avatar-frame__pendant img').trigger('error')
    expect(pendantSrc(wrapper)).toBe(MIRROR)
  })

  it('候选随挂件切换重置', async () => {
    const wrapper = await mountAndWait({
      props: { frame: FRAME, frameMirror: MIRROR, size: 84 }
    })
    await wrapper.find('.mhy-avatar-frame__pendant img').trigger('error')
    expect(pendantSrc(wrapper)).toBe(MIRROR)
    await wrapper.setProps({ frame: FRAME_WITH_PARAMS })
    expect(pendantSrc(wrapper)).toBe(FRAME_WITH_PARAMS.split('?')[0])
  })

  it('没有挂件时不渲染挂件层', async () => {
    const wrapper = await mountAndWait({ props: { avatar: AVATAR } })
    expect(wrapper.find('.mhy-avatar-frame__pendant').exists()).toBe(false)
  })

  it('size 与 scale 通过 CSS 变量下发', async () => {
    const wrapper = await mountAndWait({ props: { size: 64, scale: 1.4 } })
    expect(wrapper.attributes('style')).toContain('--mhy-avatar-size: 64px')
    expect(wrapper.attributes('style')).toContain('--mhy-pendant-scale: 1.4')
  })

  it('scale 非法时回落到米游社原比例 1.285', async () => {
    const wrapper = await mountAndWait({ props: { size: 64, scale: 0 } })
    expect(wrapper.attributes('style')).toContain('--mhy-pendant-scale: 1.285')
  })
})
