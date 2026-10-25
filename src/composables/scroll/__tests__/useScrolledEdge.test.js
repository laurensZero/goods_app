// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { ref, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { useScrolledEdge } from '../useScrolledEdge'

function fireScroll(el) {
  el.dispatchEvent(new Event('scroll'))
}

describe('useScrolledEdge', () => {
  it('scrollTop 越过阈值后 isScrolled 翻转，回顶复位', async () => {
    const el = document.createElement('div')
    const elRef = ref(el)
    let rafQueue = []
    const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      rafQueue.push(cb)
      return rafQueue.length
    })
    const wrapper = mount({
      setup() {
        return { isScrolled: useScrolledEdge(elRef) }
      },
      template: '<div>{{ isScrolled }}</div>',
    })

    // 初始未滚动
    expect(wrapper.text()).toBe('false')

    // 滚过阈值（rAF 回调手动 flush）
    Object.defineProperty(el, 'scrollTop', { value: 40, configurable: true })
    fireScroll(el)
    rafQueue.forEach((cb) => cb())
    rafQueue = []
    await nextTick()
    expect(wrapper.text()).toBe('true')

    // 回顶复位
    Object.defineProperty(el, 'scrollTop', { value: 0, configurable: true })
    fireScroll(el)
    rafQueue.forEach((cb) => cb())
    await nextTick()
    expect(wrapper.text()).toBe('false')

    rafSpy.mockRestore()
    wrapper.unmount()
  })

  it('元素存在但滚动发生在 window 上时（.page 未约束高度）也能翻转', async () => {
    const el = document.createElement('div')
    Object.defineProperty(el, 'scrollTop', { value: 0, configurable: true })
    const elRef = ref(el)
    const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      cb()
      return 1
    })
    const wrapper = mount({
      setup() {
        return { isScrolled: useScrolledEdge(elRef) }
      },
      template: '<div>{{ isScrolled }}</div>',
    })
    Object.defineProperty(window, 'scrollY', { value: 26, configurable: true })
    window.dispatchEvent(new Event('scroll'))
    await nextTick()
    expect(wrapper.text()).toBe('true')
    rafSpy.mockRestore()
    wrapper.unmount()
  })

  it('window scroll 兜底（元素缺失时读 window.scrollY）', async () => {
    const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      cb()
      return 1
    })
    const wrapper = mount({
      setup() {
        return { isScrolled: useScrolledEdge(() => null) }
      },
      template: '<div>{{ isScrolled }}</div>',
    })
    Object.defineProperty(window, 'scrollY', { value: 99, configurable: true })
    window.dispatchEvent(new Event('scroll'))
    await nextTick()
    expect(wrapper.text()).toBe('true')
    rafSpy.mockRestore()
    wrapper.unmount()
  })
})
