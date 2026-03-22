export function useDensityGridViewport({
  getScrollEl,
  getActiveScrollSource
}) {
  function canUseElementViewport() {
    const el = getScrollEl?.()
    if (!el) return false

    const overflowY = window.getComputedStyle?.(el)?.overflowY || ''
    const allowsElementScroll = overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay'
    if (!allowsElementScroll) return false

    return (el.scrollHeight - el.clientHeight) > 1
  }

  function getDensityScrollSource() {
    const activeSource = getActiveScrollSource?.()
    if (activeSource === 'window') return 'window'
    if (activeSource === 'element' && canUseElementViewport()) return 'element'
    return canUseElementViewport() ? 'element' : 'window'
  }

  function getDensityScrollMetrics() {
    const source = getDensityScrollSource()
    const scrollEl = getScrollEl?.()
    const viewportHeight = source === 'window'
      ? (window.innerHeight || document.documentElement.clientHeight || 800)
      : Math.max(0, scrollEl?.clientHeight || 0)
    const scrollTop = source === 'window'
      ? (window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0)
      : (scrollEl?.scrollTop || 0)
    const scrollHeight = source === 'window'
      ? Math.max(
          document.documentElement.scrollHeight || 0,
          document.body.scrollHeight || 0,
          scrollEl?.scrollHeight || 0
        )
      : (scrollEl?.scrollHeight || 0)

    return { source, viewportHeight, scrollTop, scrollHeight }
  }

  function getDensityScrollTop() {
    return getDensityScrollMetrics().scrollTop
  }

  function getFlipViewportHeight() {
    if (getDensityScrollSource() === 'window') {
      return window.innerHeight || document.documentElement.clientHeight || 800
    }

    const rect = getScrollEl?.()?.getBoundingClientRect()
    if (!rect) return window.innerHeight || document.documentElement.clientHeight || 800

    const visibleTop = Math.max(0, rect.top)
    const visibleBottom = Math.min(window.innerHeight || document.documentElement.clientHeight || 0, rect.bottom)
    const visibleHeight = visibleBottom - visibleTop
    return visibleHeight > 0 ? visibleHeight : (window.innerHeight || document.documentElement.clientHeight || 800)
  }

  function getFlipViewportRect() {
    if (getDensityScrollSource() === 'window') {
      return {
        top: 0,
        bottom: window.innerHeight || document.documentElement.clientHeight || 0,
        left: 0,
        right: window.innerWidth || document.documentElement.clientWidth || 0
      }
    }

    const rect = getScrollEl?.()?.getBoundingClientRect()
    if (!rect) return undefined

    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0
    return {
      top: Math.max(0, rect.top),
      bottom: Math.min(viewportHeight, rect.bottom),
      left: Math.max(0, rect.left),
      right: Math.min(viewportWidth, rect.right)
    }
  }

  function getContainerScrollOffset(container) {
    if (!container) return 0

    if (getDensityScrollSource() === 'window') {
      return container.getBoundingClientRect().top + (window.scrollY || document.documentElement.scrollTop || 0)
    }

    const scrollEl = getScrollEl?.()
    if (!scrollEl) return container.offsetTop || 0

    const containerRect = container.getBoundingClientRect()
    const scrollRect = scrollEl.getBoundingClientRect()
    return containerRect.top - scrollRect.top + scrollEl.scrollTop
  }

  return {
    getDensityScrollSource,
    getDensityScrollMetrics,
    getDensityScrollTop,
    getFlipViewportHeight,
    getFlipViewportRect,
    getContainerScrollOffset
  }
}
