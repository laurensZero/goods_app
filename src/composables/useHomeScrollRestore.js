import { nextTick } from 'vue'

const HOME_SCROLL_STORAGE_KEY = 'home-scroll'
const HOME_SCROLL_RESTORE_PENDING_KEY = 'home-scroll-restore-pending'

export function useHomeScrollRestore(pageBodyRef) {
  let savedScrollTop = 0

  function getScrollEl() {
    return pageBodyRef.value || document.querySelector('.home-page .page-body')
  }

  function readScrollTop() {
    const elTop = getScrollEl()?.scrollTop ?? 0
    const winTop = window.scrollY || document.documentElement.scrollTop || 0
    return elTop > 0 ? elTop : winTop
  }

  function saveScrollPosition() {
    const top = readScrollTop()
    savedScrollTop = top
    sessionStorage.setItem(HOME_SCROLL_STORAGE_KEY, String(top))
    sessionStorage.setItem(HOME_SCROLL_RESTORE_PENDING_KEY, '1')
  }

  function applyScrollPosition(top) {
    if (!top || top <= 0) return

    const setAll = () => {
      const el = getScrollEl()
      if (el) el.scrollTop = top
      try { document.documentElement.scrollTop = top } catch {}
      try { document.body.scrollTop = top } catch {}
      try { window.scrollTo({ top, behavior: 'instant' }) } catch { window.scrollTo(0, top) }
    }

    setAll()
    ;[50, 100, 200].forEach((delay) => setTimeout(setAll, delay))
  }

  async function restorePendingScrollPosition(syncVisibleGoodsCount, syncVisibleTimelineMonthCount) {
    const shouldRestore = sessionStorage.getItem(HOME_SCROLL_RESTORE_PENDING_KEY) === '1'
    const storedTop = savedScrollTop || Number(sessionStorage.getItem(HOME_SCROLL_STORAGE_KEY) || 0)

    if (!shouldRestore) return

    syncVisibleGoodsCount(storedTop)
    syncVisibleTimelineMonthCount(storedTop)
    await nextTick()
    applyScrollPosition(storedTop)
    sessionStorage.removeItem(HOME_SCROLL_RESTORE_PENDING_KEY)
  }

  async function restoreActivatedScrollPosition(syncVisibleGoodsCount, syncVisibleTimelineMonthCount) {
    const domTop = getScrollEl()?.scrollTop ?? 0
    const shouldRestore = sessionStorage.getItem(HOME_SCROLL_RESTORE_PENDING_KEY) === '1'
    const storedTop = shouldRestore
      ? (savedScrollTop || Number(sessionStorage.getItem(HOME_SCROLL_STORAGE_KEY) || 0))
      : 0

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
    if (storedTop > 0) {
      applyScrollPosition(storedTop)
    }
    await nextTick()
    if (storedTop > 0) {
      applyScrollPosition(storedTop)
    }
    if (shouldRestore) {
      sessionStorage.removeItem(HOME_SCROLL_RESTORE_PENDING_KEY)
    }
  }

  function rememberCurrentScrollPosition() {
    const top = readScrollTop()
    if (top > 0) {
      savedScrollTop = top
      sessionStorage.setItem(HOME_SCROLL_STORAGE_KEY, String(top))
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
