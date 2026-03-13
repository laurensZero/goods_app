import { nextTick } from 'vue'

export function usePageScrollRestore(pageBodyRef, options) {
  const {
    storageKey,
    pendingKey,
    selector
  } = options

  let savedScrollState = null
  let activeScrollSource = null

  // Guardrail:
  // Home/Wishlist do not have a stable single scroll container across all flows.
  // We must remember which source actually emitted scroll events and restore to that same source.
  // Do not simplify this to "always window" or "always element" unless the page structure is changed first.
  function getPreferredScrollSnapshot() {
    const snapshot = getDomScrollSnapshot()

    if (activeScrollSource === 'element') {
      return { top: snapshot.elementTop, source: 'element', snapshot }
    }

    if (activeScrollSource === 'window') {
      return { top: snapshot.windowTop, source: 'window', snapshot }
    }

    if (snapshot.windowTop > snapshot.elementTop) {
      return { top: snapshot.windowTop, source: 'window', snapshot }
    }

    return { top: snapshot.elementTop, source: 'element', snapshot }
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

  function getScrollEl() {
    return pageBodyRef.value || document.querySelector(selector)
  }

  function getWindowScrollTop() {
    return window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0
  }

  function getDomScrollSnapshot() {
    const elementTop = getScrollEl()?.scrollTop || 0
    const windowTop = getWindowScrollTop()

    return {
      elementTop,
      windowTop,
      maxTop: Math.max(elementTop, windowTop)
    }
  }

  function setWindowScrollTop(top) {
    try { document.documentElement.scrollTop = top } catch {}
    try { document.body.scrollTop = top } catch {}
    try { window.scrollTo(0, top) } catch {}
  }

  function detectScrollSource() {
    const el = getScrollEl()
    return el ? 'element' : 'window'
  }

  function getActiveScrollSource() {
    return activeScrollSource || detectScrollSource()
  }

  function markScrollSource(source) {
    if (source === 'element' || source === 'window') {
      activeScrollSource = source
    }
  }

  function readScrollTop() {
    return getPreferredScrollSnapshot().top
  }

  function readStoredScrollState() {
    if (savedScrollState) return savedScrollState

    const raw = sessionStorage.getItem(storageKey)
    if (!raw) return null

    try {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object') {
        savedScrollState = {
          top: Number(parsed.top) || 0,
          source: parsed.source === 'window' ? 'window' : 'element',
          anchorId: parsed.anchorId ? String(parsed.anchorId) : '',
          anchorIndex: Number.isFinite(Number(parsed.anchorIndex)) ? Number(parsed.anchorIndex) : -1,
          anchorOffset: Number(parsed.anchorOffset) || 0
        }
        return savedScrollState
      }
    } catch {}

    const top = Number(raw || 0)
    if (top < 0) return null

    savedScrollState = {
      top,
      source: 'element',
      anchorId: '',
      anchorIndex: -1,
      anchorOffset: 0
    }
    return savedScrollState
  }

  function getScrollAnchors() {
    return Array.from(getScrollEl()?.querySelectorAll?.('[data-scroll-anchor][data-goods-id]') || [])
  }

  function readScrollAnchor(top = readScrollTop()) {
    const anchors = getScrollAnchors()
    if (!anchors.length) {
      return {
        anchorId: '',
        anchorIndex: -1,
        anchorOffset: 0
      }
    }

    const anchorEl = anchors.find((el) => (el.offsetTop + el.offsetHeight) > top) || anchors[anchors.length - 1]
    const anchorIndex = Number(anchorEl.dataset.scrollIndex)

    return {
      anchorId: anchorEl.dataset.goodsId || '',
      anchorIndex: Number.isFinite(anchorIndex) ? anchorIndex : anchors.indexOf(anchorEl),
      anchorOffset: top - anchorEl.offsetTop
    }
  }

  function writeScrollState(state) {
    savedScrollState = state
    sessionStorage.setItem(storageKey, JSON.stringify(state))
  }

  function getStoredScrollState() {
    return readStoredScrollState()
  }

  function hasPendingRestore() {
    return sessionStorage.getItem(pendingKey) === '1'
  }

  function saveScrollPosition(markPending = true, reason = 'save') {
    // Save both the numeric scrollTop and the source that produced it.
    // Losing the source is what previously caused wrong restores and broken scroll-top behavior.
    const { top, source } = getPreferredScrollSnapshot()
    activeScrollSource = source
    const state = {
      top,
      source,
      ...readScrollAnchor(top)
    }
    writeScrollState(state)
    if (markPending) {
      sessionStorage.setItem(pendingKey, '1')
    }
  }

  function resolveScrollTargetTop(stateOrTop) {
    const state = typeof stateOrTop === 'number'
      ? { top: stateOrTop, anchorId: '', anchorIndex: -1, anchorOffset: 0 }
      : stateOrTop

    const fallbackTop = Math.max(0, Number(state?.top) || 0)
    if (!state?.anchorId) return fallbackTop

    const anchorEl = getScrollAnchors().find((el) => el.dataset.goodsId === state.anchorId)
    if (!anchorEl) return fallbackTop

    return Math.max(0, anchorEl.offsetTop + (Number(state.anchorOffset) || 0))
  }

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
      return true
    }

    if (el) {
      el.scrollTop = normalizedTop
    }

    if (source === 'both' || normalizedTop === 0 || !el) {
      setWindowScrollTop(normalizedTop)
      return true
    }

    return false
  }

  function applyScrollPosition(stateOrTop) {
    // Restore against the recorded source first.
    // Writing to the wrong target can leave the page visually unchanged while storage says restore succeeded.
    const top = resolveScrollTargetTop(stateOrTop)
    const source = typeof stateOrTop === 'object' && stateOrTop?.source === 'window' ? 'window' : 'element'

    if (!setScrollTop(top, source)) {
      setScrollTop(top, 'both')
    }

    let frame = 0
    const tick = () => {
      frame += 1
      setScrollTop(top, source)
      if (frame < 5) {
        window.requestAnimationFrame(tick)
      }
    }

    window.requestAnimationFrame(tick)
  }

  async function waitForLayout(frames = 1) {
    for (let index = 0; index < frames; index += 1) {
      await nextTick()
      await new Promise((resolve) => window.requestAnimationFrame(resolve))
    }
  }

  async function restorePendingScrollPosition(syncVisibleGoodsCount, syncVisibleTimelineMonthCount, prepareRestoreState = null) {
    const shouldRestore = sessionStorage.getItem(pendingKey) === '1'
    const storedState = readStoredScrollState()
    const storedTop = storedState?.top || 0

    if (!shouldRestore) return

    syncVisibleGoodsCount(storedTop)
    syncVisibleTimelineMonthCount(storedTop)
    prepareRestoreState?.(storedState)
    // top=0 is a valid stored position. Never treat it as "no data".
    if (storedTop <= 0) {
      setScrollTop(0, storedState?.source || 'both')
      sessionStorage.removeItem(pendingKey)
      return
    }
    await waitForLayout(2)
    applyScrollPosition(storedState || storedTop)
    sessionStorage.removeItem(pendingKey)
  }

  async function restoreActivatedScrollPosition(syncVisibleGoodsCount, syncVisibleTimelineMonthCount, prepareRestoreState = null) {
    const storedState = readStoredScrollState()
    const storedTop = storedState?.top || 0

    if (!storedState) {
      const domTop = readScrollTop()
      syncVisibleGoodsCount(domTop)
      syncVisibleTimelineMonthCount(domTop)
      return
    }

    syncVisibleGoodsCount(storedTop)
    syncVisibleTimelineMonthCount(storedTop)
    prepareRestoreState?.(storedState)
    // top=0 is a valid stored position. Never treat it as "no data".
    if (storedTop <= 0) {
      setScrollTop(0, storedState?.source || 'both')
      sessionStorage.removeItem(pendingKey)
      return
    }
    await waitForLayout(2)
    applyScrollPosition(storedState || storedTop)
    await waitForLayout(2)
    applyScrollPosition(storedState || storedTop)
    sessionStorage.removeItem(pendingKey)
  }

  function rememberCurrentScrollPosition(reason = 'remember', shouldLog = false) {
    const { top, source } = getPreferredScrollSnapshot()
    activeScrollSource = source
    const state = {
      top,
      source,
      ...readScrollAnchor(top)
    }
    writeScrollState(state)
  }

  function clearDisplayedScrollPosition() {
    activeScrollSource = null
    setScrollTop(0, 'both')
  }

  function resetStoredScrollOnReload() {
    if (!isReloadNavigation()) return false
    const reloadResetFlagKey = `__goods_scroll_reload_reset__:${storageKey}`
    if (globalThis[reloadResetFlagKey]) {
      return false
    }
    globalThis[reloadResetFlagKey] = true

    savedScrollState = null
    activeScrollSource = null
    sessionStorage.removeItem(storageKey)
    sessionStorage.removeItem(pendingKey)
    return true
  }

  return {
    getScrollEl,
    getActiveScrollSource,
    getDomScrollSnapshot,
    markScrollSource,
    readScrollTop,
    getStoredScrollState,
    hasPendingRestore,
    saveScrollPosition,
    applyScrollPosition,
    restorePendingScrollPosition,
    restoreActivatedScrollPosition,
    rememberCurrentScrollPosition,
    clearDisplayedScrollPosition,
    resetStoredScrollOnReload
  }
}
