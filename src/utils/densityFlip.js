import { nextTick } from 'vue'
import { HOME_MOTION } from '@/constants/homeMotion'

const DEFAULT_OVERSCAN_PX = 120
const DEFAULT_MAX_ITEMS = 72

function getViewportRect(getViewport) {
  if (!getViewport) {
    return { top: 0, bottom: window.innerHeight, left: 0, right: window.innerWidth }
  }
  return getViewport() || { top: 0, bottom: window.innerHeight, left: 0, right: window.innerWidth }
}

function isRectInViewport(rect, viewport, overscan) {
  return !(
    rect.bottom < viewport.top - overscan ||
    rect.top > viewport.bottom + overscan ||
    rect.right < viewport.left - overscan ||
    rect.left > viewport.right + overscan
  )
}

function prefersReducedMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false
}

export function createDensityFlip({
  getContainer,
  getItems,
  getViewport,
  overscan = DEFAULT_OVERSCAN_PX,
  maxItems = DEFAULT_MAX_ITEMS,
  duration = HOME_MOTION.densityDurationMs + 200,
  easing = HOME_MOTION.easeEmphasis,
  fade = 0.96,
  scale = 0.99
}) {
  const getElements = getItems || ((container) => container?.querySelectorAll?.('.goods-card') ?? [])
  const firstRects = new Map()

  function capture() {
    firstRects.clear()
    const container = getContainer?.()
    if (!container) return false

    const viewport = getViewportRect(getViewport)
    const elements = Array.from(getElements(container))
    let collected = 0
    for (const el of elements) {
      if (collected >= maxItems) break
      const rect = el.getBoundingClientRect()
      if (!rect.width || !rect.height) continue
      if (!isRectInViewport(rect, viewport, overscan)) continue
      firstRects.set(el, rect)
      collected += 1
    }

    return firstRects.size > 0
  }

  async function animate() {
    if (!firstRects.size || prefersReducedMotion()) {
      firstRects.clear()
      return
    }

    await nextTick()

    const container = getContainer?.()
    if (!container) {
      firstRects.clear()
      return
    }

    const viewport = getViewportRect(getViewport)
    const elements = Array.from(getElements(container))
    for (const el of elements) {
      const first = firstRects.get(el)
      if (!first || !el.animate) continue

      const last = el.getBoundingClientRect()
      if (!last.width || !last.height) continue
      if (!isRectInViewport(last, viewport, overscan)) continue

      const dx = first.left - last.left
      const dy = first.top - last.top
      if (!dx && !dy) continue

      el.animate(
        [
          { transform: `translate(${dx}px, ${dy}px) scale(${scale})`, opacity: fade },
          { transform: 'translate(0, 0) scale(1)', opacity: 1 }
        ],
        { duration, easing }
      )
    }

    firstRects.clear()
  }

  return { capture, animate }
}
