// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createApp, defineComponent, h, ref, KeepAlive } from 'vue'
import { createRouter, createMemoryHistory, RouterView } from 'vue-router'
import { usePageScroll, resetPageScrollToTop } from '../usePageScroll'

vi.mock('@/utils/platform/nativeGoodsHeroTransition', () => ({
  isGoodsHeroAnimating: () => false,
}))
vi.mock('@/utils/logger', () => ({
  createLogger: () => ({ debug: () => {}, warn: () => {}, error: () => {} }),
}))

const OPTS = {
  storageKey: 't-scroll',
  pendingKey: 't-scroll-restore-pending',
  selector: '.test-page .page-body',
}

function freshDom() {
  document.body.innerHTML = '<div class="test-page"><main class="page-body"></main></div>'
}

function setWindowTop(top) {
  window.scrollTo(0, top)
  document.documentElement.scrollTop = top
  document.body.scrollTop = top
}

function setElementScrollable(el, { scrollHeight = 3000, clientHeight = 912 } = {}) {
  Object.defineProperty(el, 'scrollHeight', { configurable: true, get: () => scrollHeight })
  Object.defineProperty(el, 'clientHeight', { configurable: true, get: () => clientHeight })
}

describe('usePageScroll 状态语义（与旧版特征化一致）', () => {
  let pageBodyRef
  let page

  beforeEach(() => {
    sessionStorage.clear()
    freshDom()
    pageBodyRef = ref(document.querySelector('.page-body'))
    page = usePageScroll('t', pageBodyRef, OPTS)
    delete globalThis['__goods_scroll_reload_reset__:t-scroll']
  })

  it('文档级滚动布局：保存记 window 源；markPending 控制 pending', () => {
    setWindowTop(500)
    page.saveScrollPosition(false, 'leave')
    let state = JSON.parse(sessionStorage.getItem('t-scroll'))
    expect(state.source).toBe('window')
    expect(state.top).toBeGreaterThan(0)
    expect(sessionStorage.getItem('t-scroll-restore-pending')).toBe(null)

    setWindowTop(600)
    page.saveScrollPosition(true, 'openDetail')
    expect(sessionStorage.getItem('t-scroll-restore-pending')).toBe('1')
  })

  it('restore（activate 语义）：top>0 恢复到 window 并清 pending，syncViewport 收到阶段', async () => {
    sessionStorage.setItem('t-scroll', JSON.stringify({ top: 650, source: 'window' }))
    sessionStorage.setItem('t-scroll-restore-pending', '1')

    const calls = []
    await page.restore({}, {
      syncViewport: (top, meta) => calls.push(['sync', top, meta.phase]),
    })

    expect(calls).toEqual([['sync', 650, 'activated']])
    expect(window.scrollY).toBe(650)
    expect(sessionStorage.getItem('t-scroll-restore-pending')).toBe(null)
  })

  it('restore（mount 语义）：无 pending 直接返回，不碰可视区', async () => {
    setWindowTop(77)
    sessionStorage.setItem('t-scroll', JSON.stringify({ top: 650, source: 'window' }))

    const calls = []
    await page.restore({ ifPending: true }, { syncViewport: (top) => calls.push(top) })
    expect(calls).toEqual([])
    expect(window.scrollY).toBe(77)

    sessionStorage.setItem('t-scroll-restore-pending', '1')
    await page.restore({ ifPending: true }, { syncViewport: (top) => calls.push(top) })
    expect(calls).toEqual([650])
    expect(window.scrollY).toBe(650)
    expect(sessionStorage.getItem('t-scroll-restore-pending')).toBe(null)
  })

  it('restore：无存储状态时按当前 DOM 位置同步可视区', async () => {
    setWindowTop(240)
    const calls = []
    await page.restore({}, { syncViewport: (top) => calls.push(top) })
    expect(calls).toEqual([240])
  })

  it('restore：top=0 的归零状态也会落顶并清 pending（外部重置后内存不复活旧值）', async () => {
    setWindowTop(300)
    page.saveScrollPosition(false, 'test')
    resetPageScrollToTop('t')

    await page.restore({}, { syncViewport: () => {} })

    expect(window.scrollY).toBe(0)
    expect(sessionStorage.getItem('t-scroll-restore-pending')).toBe(null)
    expect(JSON.parse(sessionStorage.getItem('t-scroll')).top).toBe(0)
  })

  it('滚动源是派生的：外部把存储改写后，无需任何标记即时生效', () => {
    setWindowTop(100)
    page.saveScrollPosition(false, 'a')
    expect(JSON.parse(sessionStorage.getItem('t-scroll')).source).toBe('window')

    // 旧版会受 sticky activeScrollSource 影响；新版每次现场派生
    sessionStorage.setItem('t-scroll', JSON.stringify({ top: 5, source: 'element' }))
    expect(page.getScrollState().source).toBe('element')
    expect(page.getScrollSource()).toBe('window')
  })

  it('锚点（withAnchor）：opt-in 才扫描，includeAnchor=false 跳过', () => {
    const el = pageBodyRef.value
    el.innerHTML = `
      <div data-scroll-anchor data-goods-id="g1" data-scroll-index="0"></div>
      <div data-scroll-anchor data-goods-id="g2" data-scroll-index="1"></div>
    `
    setWindowTop(420)

    // 默认（未开 withAnchor）不扫描
    page.saveScrollPosition(false, 'no-anchor-mode')
    expect(JSON.parse(sessionStorage.getItem('t-scroll')).anchorId).toBe('')

    const anchored = usePageScroll('t', pageBodyRef, { ...OPTS, withAnchor: true })
    anchored.saveScrollPosition(false, 'with-anchor')
    const state = JSON.parse(sessionStorage.getItem('t-scroll'))
    expect(state.anchorId).toBe('g2')
    expect(state.anchorIndex).toBe(1)

    anchored.saveScrollPosition(false, 'skip', { includeAnchor: false })
    expect(JSON.parse(sessionStorage.getItem('t-scroll')).anchorId).toBe('')
  })

  it('锚点字段不再写 anchorOffset（全库只写不读，已删）', () => {
    setWindowTop(10)
    page.saveScrollPosition(false, 'test')
    const state = JSON.parse(sessionStorage.getItem('t-scroll'))
    expect('anchorOffset' in state).toBe(false)
  })

  it('remember：只写 storage 不置 pending、不扫锚点', () => {
    setWindowTop(333)
    page.rememberCurrentScrollPosition('scroll')
    const state = JSON.parse(sessionStorage.getItem('t-scroll'))
    expect(state.top).toBe(333)
    expect(state.anchorId).toBe('')
    expect(sessionStorage.getItem('t-scroll-restore-pending')).toBe(null)
  })

  it('clearStoredScrollState 清 storage 与 pending；getScrollState 回 null', () => {
    setWindowTop(100)
    page.saveScrollPosition(true, 'test')
    page.clearStoredScrollState()
    expect(sessionStorage.getItem('t-scroll')).toBe(null)
    expect(sessionStorage.getItem('t-scroll-restore-pending')).toBe(null)
    expect(page.getScrollState()).toBe(null)
  })

  it('resetStoredScrollOnReload：非 reload 不动，reload 清一次', () => {
    setWindowTop(150)
    page.saveScrollPosition(false, 'test')

    expect(page.resetStoredScrollOnReload()).toBe(false)
    expect(sessionStorage.getItem('t-scroll')).not.toBe(null)

    vi.spyOn(performance, 'getEntriesByType').mockReturnValue([{ type: 'reload' }])
    expect(page.resetStoredScrollOnReload()).toBe(true)
    expect(sessionStorage.getItem('t-scroll')).toBe(null)

    page.saveScrollPosition(false, 'again')
    expect(page.resetStoredScrollOnReload()).toBe(false)
  })

  it('applyScrollTop(element)：元素不可滚时兜底写 window；可滚时只写元素', () => {
    // 文档级布局：写元素吸附不了 → window 同步
    setWindowTop(999)
    page.applyScrollTop(0, 'element')
    expect(window.scrollY).toBe(0)

    // 元素可滚布局：只写元素
    const el = pageBodyRef.value
    setElementScrollable(el)
    window.scrollTo(0, 88)
    page.applyScrollTop(250, 'element')
    expect(el.scrollTop).toBe(250)
    expect(window.scrollY).toBe(88)
  })

  it('clearDisplayedScrollPosition：element 与 window 一并归零', () => {
    setWindowTop(88)
    page.clearDisplayedScrollPosition()
    expect(window.scrollY).toBe(0)
  })
})

describe('usePageScroll 元素可滚布局（detail 类页面形态）', () => {
  let pageBodyRef
  let page

  beforeEach(() => {
    sessionStorage.clear()
    freshDom()
    pageBodyRef = ref(document.querySelector('.page-body'))
    setElementScrollable(pageBodyRef.value)
    page = usePageScroll('t2', pageBodyRef, {
      storageKey: 't2-scroll',
      pendingKey: 't2-scroll-restore-pending',
      selector: '.test-page .page-body',
    })
  })

  it('保存记 element 源（派生：元素可滚即 element，无需事件标记）', () => {
    pageBodyRef.value.scrollTop = 300
    window.scrollTo(0, 50)

    page.saveScrollPosition(false, 'test')

    const state = JSON.parse(sessionStorage.getItem('t2-scroll'))
    expect(state.source).toBe('element')
    expect(state.top).toBe(300)
  })

  it('恢复 element 源状态：写元素、不写 window', async () => {
    sessionStorage.setItem('t2-scroll', JSON.stringify({ top: 420, source: 'element' }))
    window.scrollTo(0, 99)

    await page.restore({}, { syncViewport: () => {} })

    expect(pageBodyRef.value.scrollTop).toBe(420)
    expect(window.scrollY).toBe(99)
    expect(sessionStorage.getItem('t2-scroll-restore-pending')).toBe(null)
  })
})

describe('usePageScroll 生命周期（真实组件挂载 + 路由）', () => {
  const captured = {}
  let pageBodyRef
  let onScrollCalls = []

  const TestView = defineComponent({
    name: 'TestView',
    setup() {
      pageBodyRef = ref(null)
      const page = usePageScroll('t', pageBodyRef, {
        ...OPTS,
        onScroll: (top) => onScrollCalls.push(top),
      })
      Object.assign(captured, page)
      captured.pageBodyRef = pageBodyRef
      return () => h('div', { class: 'test-page' }, [
        h('main', { class: 'page-body', ref: pageBodyRef }, 'content'),
      ])
    },
  })

  const OtherView = defineComponent({ name: 'OtherView', setup: () => () => h('div', 'other') })

  async function mountWithRouter() {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', component: TestView },
        { path: '/other', component: OtherView },
      ],
    })
    const host = document.createElement('div')
    document.body.appendChild(host)
    // 视图必须经 RouterView 渲染，onBeforeRouteLeave 才会注册到路由记录上
    const app = createApp({ setup: () => () => h(KeepAlive, () => h(RouterView)) })
    app.use(router)
    await router.push('/')
    app.mount(host)
    await new Promise((r) => setTimeout(r, 30))
    return { router, app, host }
  }

  beforeEach(() => {
    sessionStorage.clear()
    freshDom()
    onScrollCalls = []
    for (const key of Object.keys(globalThis)) {
      if (key.startsWith('__goods_scroll_reload_reset__')) delete globalThis[key]
    }
  })

  it('挂载即绑定滚动监听；window scroll 触发节流记住 + onScroll', async () => {
    const { app, host } = await mountWithRouter()
    try {
      setWindowTop(500)
      window.dispatchEvent(new Event('scroll'))
      await new Promise((r) => requestAnimationFrame(r))
      await new Promise((r) => setTimeout(r, 10))

      const state = JSON.parse(sessionStorage.getItem('t-scroll'))
      expect(state.top).toBe(500)
      expect(state.source).toBe('window')
      expect(onScrollCalls.length).toBeGreaterThan(0)
      expect(onScrollCalls.at(-1)).toBe(500)
    } finally {
      app.unmount()
      host.remove()
    }
  })

  it('路由离开自动保存；失活自动记住；回来自动重绑', async () => {
    const { router, app, host } = await mountWithRouter()
    try {
      setWindowTop(420)
      window.dispatchEvent(new Event('scroll'))
      await new Promise((r) => requestAnimationFrame(r))

      await router.push('/other')
      await new Promise((r) => setTimeout(r, 30))
      // onBeforeRouteLeave 内 saveScrollPosition(true) → storage + pending
      const leftState = JSON.parse(sessionStorage.getItem('t-scroll'))
      expect(leftState.top).toBe(420)
      expect(sessionStorage.getItem('t-scroll-restore-pending')).toBe('1')

      // 失活后的 remember 不得覆盖路由离开时的锚点数据（此处无锚点，top 一致即可）
      expect(JSON.parse(sessionStorage.getItem('t-scroll')).top).toBe(420)

      await router.push('/')
      await new Promise((r) => setTimeout(r, 30))
      // 回来后应仍能响应滚动（自动重绑）
      setWindowTop(77)
      window.dispatchEvent(new Event('scroll'))
      await new Promise((r) => requestAnimationFrame(r))
      expect(JSON.parse(sessionStorage.getItem('t-scroll')).top).toBe(77)
    } finally {
      app.unmount()
      host.remove()
    }
  })

  it('saveOnLeave=false：路由离开不写 pending，但仍置 isRouteLeaving 停止记住', async () => {
    sessionStorage.clear()
    freshDom()

    const NoSaveView = defineComponent({
      name: 'NoSaveView',
      setup() {
        const elRef = ref(null)
        usePageScroll('ns', elRef, {
          storageKey: 'ns-scroll',
          pendingKey: 'ns-scroll-restore-pending',
          selector: '.test-page .page-body',
          saveOnLeave: false,
        })
        return () => h('div', { class: 'test-page' }, h('main', { class: 'page-body', ref: elRef }))
      },
    })

    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', component: NoSaveView },
        { path: '/other', component: OtherView },
      ],
    })
    const host = document.createElement('div')
    document.body.appendChild(host)
    const app = createApp(() => h(NoSaveView))
    app.use(router)
    await router.push('/')
    app.mount(host)
    await new Promise((r) => setTimeout(r, 30))

    setWindowTop(99)
    window.dispatchEvent(new Event('scroll'))
    await new Promise((r) => requestAnimationFrame(r))
    expect(sessionStorage.getItem('ns-scroll')).not.toBe(null)

    await router.push('/other')
    await new Promise((r) => setTimeout(r, 30))
    expect(sessionStorage.getItem('ns-scroll-restore-pending')).toBe(null)

    app.unmount()
    host.remove()
  })
})
