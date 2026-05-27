/**
 * Manages bind/unbind of dual scroll listeners (element + window).
 * Each view passes its own getScrollEl, markScrollSource, and handlePageScroll.
 */
export function usePageScrollBinder({ getScrollEl, markScrollSource, handlePageScroll }) {
  let bound = false
  let elementScrollHandler = null
  let windowScrollHandler = null

  function bindPageScroll() {
    if (bound) return
    elementScrollHandler = () => {
      markScrollSource('element')
      handlePageScroll()
    }
    windowScrollHandler = () => {
      markScrollSource('window')
      handlePageScroll()
    }
    getScrollEl()?.addEventListener('scroll', elementScrollHandler, { passive: true })
    window.addEventListener('scroll', windowScrollHandler, { passive: true })
    bound = true
  }

  function unbindPageScroll() {
    if (!bound) return
    if (elementScrollHandler) {
      getScrollEl()?.removeEventListener('scroll', elementScrollHandler)
      elementScrollHandler = null
    }
    if (windowScrollHandler) {
      window.removeEventListener('scroll', windowScrollHandler)
      windowScrollHandler = null
    }
    bound = false
  }

  return { bindPageScroll, unbindPageScroll }
}
