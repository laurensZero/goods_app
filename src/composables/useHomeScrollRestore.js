import { nextTick } from 'vue'

const HOME_SCROLL_STORAGE_KEY = 'home-scroll'
const HOME_SCROLL_RESTORE_PENDING_KEY = 'home-scroll-restore-pending'

export function useHomeScrollRestore(pageBodyRef) {
  let savedScrollState = null

  function getScrollEl() {
    return pageBodyRef.value || document.querySelector('.home-page .page-body')
  }

  function readScrollTop() {
    const elTop = getScrollEl()?.scrollTop ?? 0
    const winTop = window.scrollY || document.documentElement.scrollTop || 0
    return elTop > 0 ? elTop : winTop
  }

  function readStoredScrollState() {
    if (savedScrollState) return savedScrollState

    const raw = sessionStorage.getItem(HOME_SCROLL_STORAGE_KEY)
    if (!raw) return null

    try {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object') {
        savedScrollState = {
          top: Number(parsed.top) || 0,
          anchorId: parsed.anchorId ? String(parsed.anchorId) : '',
          anchorIndex: Number.isFinite(Number(parsed.anchorIndex)) ? Number(parsed.anchorIndex) : -1,
          anchorOffset: Number(parsed.anchorOffset) || 0
        }
        return savedScrollState
      }
    } catch {}

    const top = Number(raw || 0)
    if (top <= 0) return null

    savedScrollState = {
      top,
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
      anchorOffset: Math.max(0, top - anchorEl.offsetTop)
    }
  }

  function writeScrollState(state) {
    savedScrollState = state
    sessionStorage.setItem(HOME_SCROLL_STORAGE_KEY, JSON.stringify(state))
  }

  function saveScrollPosition() {
    const top = readScrollTop()
    const state = {
      top,
      ...readScrollAnchor(top)
    }
    writeScrollState(state)
    sessionStorage.setItem(HOME_SCROLL_RESTORE_PENDING_KEY, '1')
  }

  function resolveScrollTargetTop(stateOrTop) {
    const state = typeof stateOrTop === 'number'
      ? { top: stateOrTop, anchorId: '', anchorIndex: -1, anchorOffset: 0 }
      : stateOrTop

    const fallbackTop = Number(state?.top) || 0
    if (!state?.anchorId) return fallbackTop

    const anchorEl = getScrollAnchors().find((el) => el.dataset.goodsId === state.anchorId)
    if (!anchorEl) return fallbackTop

    return Math.max(0, anchorEl.offsetTop + (Number(state.anchorOffset) || 0))
  }

  function applyScrollPosition(stateOrTop) {
    const top = resolveScrollTargetTop(stateOrTop)
    if (!top || top <= 0) return

    const setAll = () => {
      const el = getScrollEl()
      if (el) el.scrollTop = top
      try { document.documentElement.scrollTop = top } catch {}
      try { document.body.scrollTop = top } catch {}
      try { window.scrollTo({ top, behavior: 'instant' }) } catch { window.scrollTo(0, top) }
    }

    setAll()
    ;[50, 120, 220, 360].forEach((delay) => setTimeout(setAll, delay))
  }

  async function restorePendingScrollPosition(syncVisibleGoodsCount, syncVisibleTimelineMonthCount, prepareRestoreState = null) {
    const shouldRestore = sessionStorage.getItem(HOME_SCROLL_RESTORE_PENDING_KEY) === '1'
    const storedState = readStoredScrollState()
    const storedTop = storedState?.top || 0

    if (!shouldRestore) return

    syncVisibleGoodsCount(storedTop)
    syncVisibleTimelineMonthCount(storedTop)
    prepareRestoreState?.(storedState)
    await nextTick()
    applyScrollPosition(storedState || storedTop)
    sessionStorage.removeItem(HOME_SCROLL_RESTORE_PENDING_KEY)
  }

  async function restoreActivatedScrollPosition(syncVisibleGoodsCount, syncVisibleTimelineMonthCount, prepareRestoreState = null) {
    const domTop = getScrollEl()?.scrollTop ?? 0
    const shouldRestore = sessionStorage.getItem(HOME_SCROLL_RESTORE_PENDING_KEY) === '1'
    const storedState = shouldRestore ? readStoredScrollState() : null
    const storedTop = storedState?.top || 0

    if (domTop > 0) {
      syncVisibleGoodsCount(domTop)
      syncVisibleTimelineMonthCount(domTop)
      if (shouldRestore) {
        sessionStorage.removeItem(HOME_SCROLL_RESTORE_PENDING_KEY)
      }
      return
    }

    syncVisibleGoodsCount(storedTop)
    syncVisibleTimelineMonthCount(storedTop)
    prepareRestoreState?.(storedState)
    if (storedTop > 0) {
      applyScrollPosition(storedState || storedTop)
    }
    await nextTick()
    if (storedTop > 0) {
      applyScrollPosition(storedState || storedTop)
    }
    if (shouldRestore) {
      sessionStorage.removeItem(HOME_SCROLL_RESTORE_PENDING_KEY)
    }
  }

  function rememberCurrentScrollPosition() {
    const top = readScrollTop()
    if (top > 0) {
      writeScrollState({
        top,
        ...readScrollAnchor(top)
      })
    }
  }

  return {
    getScrollEl,
    readScrollTop,
    saveScrollPosition,
    applyScrollPosition,
    restorePendingScrollPosition,
    restoreActivatedScrollPosition,
    rememberCurrentScrollPosition
  }
}
