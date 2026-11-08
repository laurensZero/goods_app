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
    delete globalThis['__goods_scroll_reload_reset__:t-scroll']
  })

  function setWindowTop(top) {
    window.scrollTo(0, top)
    document.documentElement.scrollTop = top
    document.body.scrollTop = top
  }

  function setElementScrollable(el, { scrollHeight = 3000, clientHeight = 912 } = {}) {
    Object.defineProperty(el, 'scrollHeight', { configurable: true, get: () => scrollHeight })
    Object.defineProperty(el, 'clientHeight', { configurable: true, get: () => clientHeight })
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

  it('saveScrollPosition(markPending=true) 置 pending，false 不动 pending', () => {
    setWindowTop(200)
    restore.saveScrollPosition(false, 'leave')
    expect(sessionStorage.getItem('t-scroll-restore-pending')).toBe(null)

    setWindowTop(400)
    restore.saveScrollPosition(true, 'openDetail')
    expect(sessionStorage.getItem('t-scroll-restore-pending')).toBe('1')
  })

  it('activate 恢复：存储的 top>0 恢复到 window 并清 pending', async () => {
    setWindowTop(0)
    sessionStorage.setItem('t-scroll', JSON.stringify({ top: 650, source: 'window' }))
    sessionStorage.setItem('t-scroll-restore-pending', '1')

    let synced = null
    await restore.restoreActivatedScrollPosition(
      (top) => { synced = top },
      () => {}
    )

    expect(synced).toBe(650)
    expect(window.scrollY).toBe(650)
    expect(sessionStorage.getItem('t-scroll-restore-pending')).toBe(null)
  })

  it('activate 恢复：无存储状态时按当前 DOM 位置同步可视区', async () => {
    setWindowTop(240)
    let synced = null
    await restore.restoreActivatedScrollPosition(
      (top) => { synced = top },
      () => {}
    )
    expect(synced).toBe(240)
  })

  it('rememberCurrentScrollPosition：只写 storage 不置 pending、不扫锚点', () => {
    setWindowTop(333)
    restore.rememberCurrentScrollPosition('scroll')

    const state = JSON.parse(sessionStorage.getItem('t-scroll'))
    expect(state.top).toBe(333)
    expect(state.source).toBe('window')
    expect(state.anchorId).toBe('')
    expect(sessionStorage.getItem('t-scroll-restore-pending')).toBe(null)
  })

  it('clearStoredScrollState 同时清掉 storage 与 pending', () => {
    setWindowTop(100)
    restore.saveScrollPosition(true, 'test')
    expect(sessionStorage.getItem('t-scroll')).not.toBe(null)
    expect(sessionStorage.getItem('t-scroll-restore-pending')).toBe('1')

    restore.clearStoredScrollState()
    expect(sessionStorage.getItem('t-scroll')).toBe(null)
    expect(sessionStorage.getItem('t-scroll-restore-pending')).toBe(null)
    expect(restore.getStoredScrollState()).toBe(null)
  })

  it('resetStoredScrollOnReload：普通导航不动状态，reload 清空且只清一次', () => {
    setWindowTop(150)
    restore.saveScrollPosition(false, 'test')

    // 非 reload 导航：返回 false，状态原样
    expect(restore.resetStoredScrollOnReload()).toBe(false)
    expect(sessionStorage.getItem('t-scroll')).not.toBe(null)

    // 模拟 reload 导航
    const navEntry = { type: 'reload' }
    vi.spyOn(performance, 'getEntriesByType').mockReturnValue([navEntry])
    expect(restore.resetStoredScrollOnReload()).toBe(true)
    expect(sessionStorage.getItem('t-scroll')).toBe(null)
    expect(sessionStorage.getItem('t-scroll-restore-pending')).toBe(null)

    // 同一会话只清一次
    setWindowTop(180)
    restore.saveScrollPosition(false, 'again')
    expect(restore.resetStoredScrollOnReload()).toBe(false)
    expect(sessionStorage.getItem('t-scroll')).not.toBe(null)
  })

  it('getStoredScrollState 兼容旧版纯数字格式（source 归 element）', () => {
    sessionStorage.setItem('t-scroll', '460')
    expect(restore.getStoredScrollState()).toEqual({
      top: 460,
      source: 'element',
      anchorId: '',
      anchorIndex: -1,
      anchorOffset: 0,
    })
  })

  it('锚点：保存时扫描 data-scroll-anchor 读取 anchorId/anchorIndex，includeAnchor=false 跳过', () => {
    const el = pageBodyRef.value
    el.innerHTML = `
      <div data-scroll-anchor data-goods-id="g1" data-scroll-index="0"></div>
      <div data-scroll-anchor data-goods-id="g2" data-scroll-index="1"></div>
      <div data-scroll-anchor data-goods-id="g3" data-scroll-index="2"></div>
    `
    setWindowTop(420)
    restore.saveScrollPosition(false, 'with-anchor')

    const state = JSON.parse(sessionStorage.getItem('t-scroll'))
    // happy-dom 无布局：所有 offsetTop/offsetHeight 为 0，全部不满足
    // (offsetTop+offsetHeight)>top → 回退到最后一个锚点
    expect(state.anchorId).toBe('g3')
    expect(state.anchorIndex).toBe(2)

    setWindowTop(430)
    restore.saveScrollPosition(false, 'no-anchor', { includeAnchor: false })
    const state2 = JSON.parse(sessionStorage.getItem('t-scroll'))
    expect(state2.anchorId).toBe('')
    expect(state2.anchorIndex).toBe(-1)
  })

  it('getDomScrollSnapshot 返回 element/window 两源快照', () => {
    setWindowTop(90)
    const snap = restore.getDomScrollSnapshot()
    expect(snap).toMatchObject({ elementTop: 0, windowTop: 90, maxTop: 90 })
  })
})

describe('usePageScrollRestore 元素可滚布局（detail 类页面形态）', () => {
  let pageBodyRef
  let restore

  beforeEach(() => {
    sessionStorage.clear()
    document.body.innerHTML = '<div class="test-page"><main class="page-body"></main></div>'
    pageBodyRef = ref(document.querySelector('.page-body'))
    restore = usePageScrollRestore(pageBodyRef, {
      storageKey: 't2-scroll',
      pendingKey: 't2-scroll-restore-pending',
      selector: '.test-page .page-body',
    })
    // 伪造「元素是真实滚动容器」的布局（detail/add 路由的 height:100dvh 形态）
    setElementScrollable(pageBodyRef.value)
  })

  function setElementScrollable(el, { scrollHeight = 3000, clientHeight = 912 } = {}) {
    Object.defineProperty(el, 'scrollHeight', { configurable: true, get: () => scrollHeight })
    Object.defineProperty(el, 'clientHeight', { configurable: true, get: () => clientHeight })
  }

  it('保存记在 element 名下（sticky 源 element 优先于 window）', () => {
    pageBodyRef.value.scrollTop = 300
    window.scrollTo(0, 50)

    restore.saveScrollPosition(false, 'test')

    const state = JSON.parse(sessionStorage.getItem('t2-scroll'))
    expect(state.source).toBe('element')
    expect(state.top).toBe(300)
  })

  it('恢复 element 源状态：写元素、不写 window', async () => {
    sessionStorage.setItem('t2-scroll', JSON.stringify({ top: 420, source: 'element' }))
    window.scrollTo(0, 99)

    await restore.restoreActivatedScrollPosition(() => {}, () => {})

    expect(pageBodyRef.value.scrollTop).toBe(420)
    expect(window.scrollY).toBe(99)
    expect(sessionStorage.getItem('t2-scroll-restore-pending')).toBe(null)
  })

  it('clearDisplayedScrollPosition：element 与 window 一并归零', () => {
    pageBodyRef.value.scrollTop = 200
    window.scrollTo(0, 88)

    restore.clearDisplayedScrollPosition()

    expect(pageBodyRef.value.scrollTop).toBe(0)
    expect(window.scrollY).toBe(0)
  })
})
