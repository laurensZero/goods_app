import { getCurrentInstance, nextTick, onActivated, onBeforeUnmount, onDeactivated, onMounted } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import { isGoodsHeroAnimating } from '@/utils/platform/nativeGoodsHeroTransition'
import { createLogger } from '@/utils/logger'

const log = createLogger('scroll-restore')

function setWindowScrollTop(top) {
  try { document.documentElement.scrollTop = top } catch {}
  try { document.body.scrollTop = top } catch {}
  try { window.scrollTo(0, top) } catch {}
}

/**
 * 把某个页面的滚动恢复状态重置为「回到顶部」。
 * 用于导入确认这类「完成型」导航：目标页（KeepAlive 缓存）重新激活时
 * 按既定恢复流程落到顶部，而不是恢复离开时的旧位置。
 * 写入 top=0 + pending 而不是直接删 key：复用视图自身的恢复流程，
 * 连同虚拟列表可视区同步（syncViewport 等）一起走，避免列表渲染错位。
 * source 记 'window'：默认布局下 .page-body 不是真实滚动容器，文档级滚动
 * 只发生在 window 上（见 usePageScroll 内 isElementScrollContainer 注释）。
 */
export function resetPageScrollToTop(pageName) {
  try {
    sessionStorage.setItem(`${pageName}-scroll`, JSON.stringify({ top: 0, source: 'window' }))
    sessionStorage.setItem(`${pageName}-scroll-restore-pending`, '1')
  } catch {}
}

/**
 * 页面滚动位置的记忆/恢复核心（usePageScrollRestore 的重构版）。
 *
 * 与旧版的关键差异：
 * - 滚动源不再用事件标记（sticky activeScrollSource），改为每次按
 *   isElementScrollContainer() 现场派生：元素是真实滚动容器 → element，
 *   否则 → window。两者不会同时滚动（元素滚的布局页面高度恒为 100dvh，
 *   文档放不下多余内容），从根上消灭 sticky 源污染一类 bug。
 * - sessionStorage 是唯一可信源，无内存状态副本，外部写入（resetPageScrollToTop）
 *   立即生效。
 * - 滚动绑定 + 节流记住 + 路由离开保存 + 失活/卸载处理内置，视图不再复制
 *   usePageScrollBinder 和五段生命周期样板；mounted/activated 的恢复调用
 *   保留在视图侧（时序与 refresh/hero 遮罩耦合，不自动执行）。
 *
 * options:
 * - selector: 滚动容器选择器，缺省 `.${pageName}-page .page-body`
 * - withAnchor: 保存时扫描 data-scroll-anchor 锚点（仅时间线/锚点恢复视图需要）
 * - listenScroll: 是否绑定滚动监听并自动记住（GroupDetail 只显式保存，传 false）
 * - onScroll(top): 视图自己的滚动处理（rAF 节流后回调）
 * - saveOnLeave: true | false | (to, from) => boolean，路由离开时是否置 pending
 *   （ManageView 按目标路由决定）
 */
export function usePageScroll(pageName, pageBodyRef, options = {}) {
  const {
    selector = `.${pageName}-page .page-body`,
    storageKey = `${pageName}-scroll`,
    pendingKey = `${pageName}-scroll-restore-pending`,
    withAnchor = false,
    listenScroll = true,
    onScroll = null,
    saveOnLeave = true,
  } = options

  let restoreSessionId = 0
  let isRouteLeaving = false
  let scrollRaf = 0
  let elementScrollHandler = null
  let windowScrollHandler = null
  let scrollBound = false

  function debugLog(message, payload = null) {
    if (payload === null) {
      log.debug(message, { storageKey })
      return
    }
    log.debug(message, { storageKey, ...payload })
  }

  // ── 滚动源：现场派生，不存储 ──
  // 关键事实（2026-11 实测复现）：.page 只有 min-height:100dvh、会随内容长高，
  // 默认布局下 .page-body 不是真实滚动容器（scrollHeight === clientHeight，
  // scrollTop 恒为 0），实际滚动发生在文档（window）上。元素是真实滚动容器的
  // 布局（height:100dvh + overflow:hidden）下文档高度恒等于视口，window 不会滚。
  function getScrollEl() {
    return pageBodyRef.value || document.querySelector(selector)
  }

  function isElementScrollContainer() {
    const el = getScrollEl()
    return !!el && el.scrollHeight > el.clientHeight + 1
  }

  function getScrollSource() {
    return isElementScrollContainer() ? 'element' : 'window'
  }

  function getWindowScrollTop() {
    return window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0
  }

  function getScrollSnapshot() {
    const el = getScrollEl()
    if (isElementScrollContainer()) {
      return { top: el.scrollTop || 0, source: 'element' }
    }
    return { top: getWindowScrollTop(), source: 'window' }
  }

  function readScrollTop() {
    return getScrollSnapshot().top
  }

  // ── 存储状态：sessionStorage 唯一可信源 ──
  function readStoredScrollState() {
    const raw = sessionStorage.getItem(storageKey)
    if (!raw) return null

    try {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object') {
        return {
          top: Number(parsed.top) || 0,
          source: parsed.source === 'window' ? 'window' : 'element',
          anchorId: parsed.anchorId ? String(parsed.anchorId) : '',
          anchorIndex: Number.isFinite(Number(parsed.anchorIndex)) ? Number(parsed.anchorIndex) : -1,
        }
      }
    } catch {}

    const top = Number(raw || 0)
    if (top < 0) return null
    return { top, source: 'element', anchorId: '', anchorIndex: -1 }
  }

  function getScrollState() {
    return readStoredScrollState()
  }

  function hasPendingRestore() {
    return sessionStorage.getItem(pendingKey) === '1'
  }

  /** 清掉 pending 标记（不终止恢复会话）：ManageView 按 history.state 决定是否恢复后用 */
  function clearPendingRestoreFlag() {
    sessionStorage.removeItem(pendingKey)
  }

  // ── 锚点（opt-in）：只有需要按条目定位恢复的视图扫描，避免每次保存全量扫 DOM ──
  function readScrollAnchor(top) {
    const anchors = Array.from(getScrollEl()?.querySelectorAll?.('[data-scroll-anchor][data-goods-id]') || [])
    if (!anchors.length) {
      return { anchorId: '', anchorIndex: -1 }
    }

    const anchorEl = anchors.find((el) => (el.offsetTop + el.offsetHeight) > top) || anchors[anchors.length - 1]
    const anchorIndex = Number(anchorEl.dataset.scrollIndex)

    return {
      anchorId: anchorEl.dataset.goodsId || '',
      anchorIndex: Number.isFinite(anchorIndex) ? anchorIndex : anchors.indexOf(anchorEl),
    }
  }

  function writeScrollState(state) {
    sessionStorage.setItem(storageKey, JSON.stringify(state))
  }

  function saveScrollPosition(markPending = true, reason = 'save', saveOptions = {}) {
    if (isGoodsHeroAnimating()) return
    const { top, source } = getScrollSnapshot()
    const includeAnchor = withAnchor && saveOptions.includeAnchor !== false
    const state = {
      top,
      source,
      ...(includeAnchor ? readScrollAnchor(top) : { anchorId: '', anchorIndex: -1 }),
    }
    debugLog('saveScrollPosition', { reason, markPending, state })
    writeScrollState(state)
    if (markPending) {
      sessionStorage.setItem(pendingKey, '1')
    }
  }

  function rememberCurrentScrollPosition(reason = 'remember') {
    if (isGoodsHeroAnimating()) return
    // 高频滚动路径：跳过锚点扫描（锚点由路由离开时的 saveScrollPosition 落盘）
    const { top, source } = getScrollSnapshot()
    writeScrollState({ top, source, anchorId: '', anchorIndex: -1 })
    debugLog('rememberCurrentScrollPosition', { reason, top, source })
  }

  // ── 位置写入 ──
  function setScrollTop(top, source = 'both') {
    const normalizedTop = Math.max(0, Number(top) || 0)
    const el = getScrollEl()

    if (source === 'window') {
      setWindowScrollTop(normalizedTop)
      return true
    }

    if (source === 'element') {
      if (!el) return false
      el.scrollTop = normalizedTop
      // 元素不是真实滚动容器时（文档级滚动布局），写它吸附不了位置，
      // 窗口才是真正承载滚动的一方：一并同步，避免恢复/清零后窗口
      // 仍停在上一个页面滚到的位置（表现为返回后页面位移、不在顶部）
      if (el.scrollHeight <= el.clientHeight + 1) {
        setWindowScrollTop(normalizedTop)
      }
      return true
    }

    if (el) {
      el.scrollTop = normalizedTop
    }
    if (source === 'both' || normalizedTop === 0 || !el) {
      setWindowScrollTop(normalizedTop)
    }
    return true
  }

  function resolveScrollTargetTop(stateOrTop) {
    const state = typeof stateOrTop === 'number'
      ? { top: stateOrTop }
      : stateOrTop
    // 虚拟列表/重排场景下锚点偏移漂移大，数值 top 是跨页恢复最稳定的依据
    return Math.max(0, Number(state?.top) || 0)
  }

  async function applyScrollPosition(stateOrTop, sessionId = restoreSessionId) {
    if (sessionId !== restoreSessionId) return false
    const top = resolveScrollTargetTop(stateOrTop)
    const source = typeof stateOrTop === 'object' && stateOrTop?.source === 'window' ? 'window' : 'element'
    debugLog('applyScrollPosition:start', { sessionId, top, source })

    const applyTarget = () => {
      setScrollTop(top, 'both')
    }

    applyTarget()
    for (let frame = 0; frame < 4; frame += 1) {
      if (sessionId !== restoreSessionId) return false
      // 命中即退：布局已能容纳目标位置时，多跑剩余帧只会拉长激活遮罩时间
      if (Math.abs(readScrollTop() - top) <= 1) return true
      await new Promise((resolve) => window.requestAnimationFrame(resolve))
      if (sessionId !== restoreSessionId) return false
      applyTarget()
    }

    if (Math.abs(readScrollTop() - top) <= 1) {
      return true
    }

    await new Promise((resolve) => window.setTimeout(resolve, 56))
    if (sessionId !== restoreSessionId) return false
    applyTarget()

    await new Promise((resolve) => window.requestAnimationFrame(resolve))
    if (sessionId !== restoreSessionId) return false
    applyTarget()

    return Math.abs(readScrollTop() - top) <= 2
  }

  async function waitForLayout(frames = 1, sessionId = restoreSessionId) {
    for (let index = 0; index < frames; index += 1) {
      if (sessionId !== restoreSessionId) return false
      await nextTick()
      if (sessionId !== restoreSessionId) return false
      await new Promise((resolve) => window.requestAnimationFrame(resolve))
    }
    return sessionId === restoreSessionId
  }

  function beginRestoreSession() {
    restoreSessionId += 1
    return restoreSessionId
  }

  function cancelPendingRestore() {
    restoreSessionId += 1
  }

  /**
   * 恢复存储的滚动位置（合并原 restorePending/restoreActivated 两条路径）。
   * - ifPending=true：仅当存在 pending 标记才执行（mount 场景，冷启动不清）
   * - ifPending=false：始终按存储状态恢复（keep-alive 重新激活场景）
   * - phase: 传给 syncViewport 的恢复阶段标识（视图按阶段选可视区同步策略）
   * - callbacks.syncViewport(top, { phase })：恢复时同步虚拟列表可视区
   * - callbacks.prepareRestore(state)：恢复前按锚点扩展渲染窗口（时间线视图）
   */
  async function restore({ ifPending = false, phase = 'activated' } = {}, { syncViewport = null, prepareRestore = null } = {}) {
    const sessionId = beginRestoreSession()
    if (ifPending && !hasPendingRestore()) return

    const storedState = readStoredScrollState()
    const storedTop = storedState?.top || 0
    debugLog('restore:enter', { sessionId, ifPending, phase, storedState, storedTop })

    if (!storedState) {
      syncViewport?.(readScrollTop(), { phase })
      return
    }

    syncViewport?.(storedTop, { phase })
    prepareRestore?.(storedState)
    // top=0 是合法存储位置，不能当「无数据」处理
    if (storedTop <= 0) {
      setScrollTop(0, storedState?.source || 'both')
      sessionStorage.removeItem(pendingKey)
      debugLog('restore:top<=0-clear-pending', { sessionId, storedState })
      return
    }
    // 先直接落一次目标位置，避免页顶可见跳动
    setScrollTop(storedTop, storedState?.source || 'both')
    if (Math.abs(readScrollTop() - storedTop) <= 1) {
      sessionStorage.removeItem(pendingKey)
      debugLog('restore:already-at-target', { sessionId, storedTop })
      return
    }

    if (!(await waitForLayout(2, sessionId))) return
    const didApply = await applyScrollPosition(storedState, sessionId)
    if (!didApply) {
      if (!(await waitForLayout(1, sessionId))) return
      await applyScrollPosition(storedState, sessionId)
    }
    sessionStorage.removeItem(pendingKey)
    debugLog('restore:done', { sessionId, storedState, storedTop })
  }

  // ── 清理 ──
  function clearDisplayedScrollPosition() {
    cancelPendingRestore()
    setScrollTop(0, 'both')
    debugLog('clearDisplayedScrollPosition')
  }

  function clearStoredScrollState() {
    sessionStorage.removeItem(storageKey)
    sessionStorage.removeItem(pendingKey)
    debugLog('clearStoredScrollState')
  }

  function isReloadNavigation() {
    try {
      const navigationEntry = performance.getEntriesByType?.('navigation')?.[0]
      if (navigationEntry && navigationEntry.type === 'reload') {
        return true
      }
    } catch {}

    try {
      return performance.navigation?.type === 1
    } catch {}

    return false
  }

  function resetStoredScrollOnReload() {
    if (!isReloadNavigation()) return false
    const reloadResetFlagKey = `__goods_scroll_reload_reset__:${storageKey}`
    if (globalThis[reloadResetFlagKey]) {
      return false
    }
    globalThis[reloadResetFlagKey] = true

    sessionStorage.removeItem(storageKey)
    sessionStorage.removeItem(pendingKey)
    debugLog('resetStoredScrollOnReload')
    return true
  }

  // ── 滚动监听 + 节流记住 ──
  function handlePageScroll() {
    if (scrollRaf) return
    scrollRaf = window.requestAnimationFrame(() => {
      scrollRaf = 0
      if (isRouteLeaving || isGoodsHeroAnimating()) return
      const top = readScrollTop()
      rememberCurrentScrollPosition('scroll')
      onScroll?.(top)
    })
  }

  function bindPageScroll() {
    if (scrollBound || !listenScroll) return
    const el = getScrollEl()
    elementScrollHandler = () => handlePageScroll()
    windowScrollHandler = () => handlePageScroll()
    el?.addEventListener('scroll', elementScrollHandler, { passive: true })
    window.addEventListener('scroll', windowScrollHandler, { passive: true })
    scrollBound = true
  }

  function unbindPageScroll() {
    if (!scrollBound) return
    const el = getScrollEl()
    if (elementScrollHandler && el) {
      el.removeEventListener('scroll', elementScrollHandler)
    }
    if (windowScrollHandler) {
      window.removeEventListener('scroll', windowScrollHandler)
    }
    elementScrollHandler = null
    windowScrollHandler = null
    scrollBound = false
    if (scrollRaf) {
      window.cancelAnimationFrame(scrollRaf)
      scrollRaf = 0
    }
  }

  // ── 生命周期：绑定/解绑 + 离开保存 + 失活记住，视图不再复制这套样板 ──
  if (getCurrentInstance()) {
    onMounted(() => {
      isRouteLeaving = false
      bindPageScroll()
    })

    onActivated(() => {
      isRouteLeaving = false
      bindPageScroll()
    })

    onDeactivated(() => {
      // 终止可能在飞的恢复循环（旧版 deactivate 时同样先 cancel）
      cancelPendingRestore()
      if (!hasPendingRestore() && !isRouteLeaving) {
        rememberCurrentScrollPosition('deactivated')
      }
      unbindPageScroll()
    })

    onBeforeUnmount(() => {
      cancelPendingRestore()
      if (!hasPendingRestore() && !isRouteLeaving) {
        rememberCurrentScrollPosition('unmount')
      }
      unbindPageScroll()
    })

    if (saveOnLeave !== false) {
      onBeforeRouteLeave((to, from) => {
        isRouteLeaving = true
        const markPending = typeof saveOnLeave === 'function'
          ? Boolean(saveOnLeave(to, from))
          : saveOnLeave
        saveScrollPosition(markPending, `${pageName}:onBeforeRouteLeave`)
        unbindPageScroll()
      })
    } else {
      onBeforeRouteLeave(() => {
        isRouteLeaving = true
        unbindPageScroll()
      })
    }
  }

  return {
    getScrollEl,
    getScrollSource,
    readScrollTop,
    getScrollState,
    hasPendingRestore,
    clearPendingRestoreFlag,
    saveScrollPosition,
    rememberCurrentScrollPosition,
    applyScrollPosition,
    restore,
    applyScrollTop: setScrollTop,
    clearDisplayedScrollPosition,
    clearStoredScrollState,
    resetStoredScrollOnReload,
    cancelPendingRestore,
    bindPageScroll,
    unbindPageScroll,
  }
}
