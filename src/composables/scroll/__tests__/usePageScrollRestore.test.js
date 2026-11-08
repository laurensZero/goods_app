// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ref } from 'vue'
import { usePageScrollRestore, resetPageScrollToTop } from '../usePageScrollRestore'

// isGoodsHeroAnimating 等平台工具在测试环境下直接放行
vi.mock('@/utils/platform/nativeGoodsHeroTransition', () => ({
  isGoodsHeroAnimating: () => false,
}))
vi.mock('@/utils/logger', () => ({
  createLogger: () => ({ debug: () => {}, warn: () => {}, error: () => {} }),
}))

/**
 * 回归背景：.page 只有 min-height:100dvh 且随内容长高，.page-body 在默认布局下
 * 不是真实滚动容器（scrollHeight === clientHeight），实际滚动发生在 window 上。
 * 恢复/保存若把位置记在不滚动的 element 名下并提前返回，窗口会停在上一个
 * 页面滚到的位置 —— 表现为路由返回后页面位移、回不到顶部。
 */
describe('usePageScrollRestore 文档级滚动布局（元素不可滚）', () => {
  let pageBodyRef
  let restore

  beforeEach(() => {
    sessionStorage.clear()
    document.body.innerHTML = '<div class="test-page"><main class="page-body"></main></div>'
    pageBodyRef = ref(document.querySelector('.page-body'))
    restore = usePageScrollRestore(pageBodyRef, {
      storageKey: 't-scroll',
      pendingKey: 't-scroll-restore-pending',
      selector: '.test-page .page-body',
    })
  })

  function setWindowTop(top) {
    window.scrollTo(0, top)
    document.documentElement.scrollTop = top
    document.body.scrollTop = top
  }

  it('保存时把位置记在 window 名下（source=window），不落在不可滚的元素上', () => {
    setWindowTop(500)
    restore.saveScrollPosition(false, 'test')

    const state = JSON.parse(sessionStorage.getItem('t-scroll'))
    expect(state.source).toBe('window')
    expect(state.top).toBeGreaterThan(0)
  })

  it('恢复存量 source=element 状态时同步重置 window（回归：返回后页面位移）', async () => {
    setWindowTop(1200)
    // 旧版本写入的状态：top=0 但 source=element
    sessionStorage.setItem('t-scroll', JSON.stringify({ top: 0, source: 'element' }))
    sessionStorage.setItem('t-scroll-restore-pending', '1')

    await restore.restoreActivatedScrollPosition(() => {}, () => {})

    expect(window.scrollY).toBe(0)
    expect(sessionStorage.getItem('t-scroll-restore-pending')).toBe(null)
  })

  it('resetPageScrollToTop 写入 window 源的归零状态并带 pending', async () => {
    setWindowTop(800)
    resetPageScrollToTop('t')
    expect(sessionStorage.getItem('t-scroll-restore-pending')).toBe('1')

    const state = JSON.parse(sessionStorage.getItem('t-scroll'))
    expect(state.top).toBe(0)
    expect(state.source).toBe('window')

    // 目标页重新激活时按恢复流程落到顶部
    await restore.restoreActivatedScrollPosition(() => {}, () => {})
    expect(window.scrollY).toBe(0)
    expect(sessionStorage.getItem('t-scroll-restore-pending')).toBe(null)
  })

  it('外部重置后内存缓存的旧位置不再生效（导入保存后仍停在旧距离的回归）', async () => {
    setWindowTop(300)
    // 先正常保存一次：内存缓存与 sessionStorage 都记下 300
    restore.saveScrollPosition(false, 'test')

    // 完成型导航外部归零：只写 sessionStorage，不经过实例的 writeScrollState
    resetPageScrollToTop('t')

    await restore.restoreActivatedScrollPosition(() => {}, () => {})

    // 内存缓存里的 300 不能盖过外部写入的归零状态
    expect(window.scrollY).toBe(0)
  })
})
