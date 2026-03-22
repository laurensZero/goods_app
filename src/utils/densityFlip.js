import { nextTick } from 'vue'
import { HOME_MOTION } from '@/constants/homeMotion'

const DEFAULT_OVERSCAN_PX = 80
const DEFAULT_MAX_ITEMS = 48
const DENSITY_FLIP_DEBUG = import.meta.env.DEV

function pushDensityDebugLog(entry) {
  if (!DENSITY_FLIP_DEBUG) return
  try {
    const target = window
    const store = Array.isArray(target.__densityDebug) ? target.__densityDebug : []
    store.push({
      at: new Date().toISOString(),
      ...entry
    })
    target.__densityDebug = store
  } catch {}
}

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

function resolveOption(option, fallback) {
  if (typeof option === 'function') return option()
  if (option === undefined || option === null) return fallback
  return option
}

function nextAnimationFrame() {
  return new Promise((resolve) => window.requestAnimationFrame(resolve))
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
  scale = 0.99,
  canAnimate = () => true,
  debugLabel = ''
}) {
  const getElements = getItems || ((container) => container?.children ?? [])
  const firstRects = new Map()
  const logPrefix = debugLabel ? `[densityFlip:${debugLabel}]` : '[densityFlip]'
  let lastCaptureStats = null

  function capture() {
    if (!canAnimate()) return false
    firstRects.clear()
    const container = getContainer?.()
    if (!container) return false

    const viewport = getViewportRect(getViewport)
    const elements = getElements(container)
    const effectiveOverscan = resolveOption(overscan, DEFAULT_OVERSCAN_PX)
    const effectiveMaxItems = resolveOption(maxItems, DEFAULT_MAX_ITEMS)
    const totalElements = elements && typeof elements.length === 'number'
      ? elements.length
      : Array.isArray(elements)
        ? elements.length
        : undefined
    let collected = 0
    if (elements && typeof elements.length === 'number') {
      for (let i = 0; i < elements.length; i += 1) {
        if (collected >= effectiveMaxItems) break
        const el = elements[i]
        if (!el) continue
        const rect = el.getBoundingClientRect()
        if (!rect.width || !rect.height) continue
        if (!isRectInViewport(rect, viewport, effectiveOverscan)) continue
        firstRects.set(el, rect)
        collected += 1
      }
    } else if (elements && elements[Symbol.iterator]) {
      for (const el of elements) {
        if (collected >= effectiveMaxItems) break
        if (!el) continue
        const rect = el.getBoundingClientRect()
        if (!rect.width || !rect.height) continue
        if (!isRectInViewport(rect, viewport, effectiveOverscan)) continue
        firstRects.set(el, rect)
        collected += 1
      }
    }

    lastCaptureStats = {
      totalElements,
      captured: firstRects.size,
      maxItems: effectiveMaxItems,
      overscan: effectiveOverscan,
      viewportHeight: Math.round((viewport.bottom || 0) - (viewport.top || 0))
    }
    if (DENSITY_FLIP_DEBUG) {
      console.log(logPrefix, 'capture', lastCaptureStats)
      pushDensityDebugLog({
        source: logPrefix,
        phase: 'capture',
        ...lastCaptureStats
      })
    }

    return firstRects.size > 0
  }

  async function animate() {
    if (!firstRects.size || prefersReducedMotion() || !canAnimate()) {
      firstRects.clear()
      return
    }

    const animateStartedAt = performance.now()
    await nextTick()
    await nextAnimationFrame()
    const afterFrameAt = performance.now()

    const container = getContainer?.()
    if (!container) {
      firstRects.clear()
      return
    }

    const viewport = getViewportRect(getViewport)
    const effectiveOverscan = resolveOption(overscan, DEFAULT_OVERSCAN_PX)
    const effectiveDuration = resolveOption(duration, HOME_MOTION.densityDurationMs + 200)
    const effectiveEasing = resolveOption(easing, HOME_MOTION.easeEmphasis)
    const effectiveFade = resolveOption(fade, 0.96)
    const effectiveScale = resolveOption(scale, 0.99)
    const animations = []
    const rectReadStartedAt = performance.now()

    for (const [el, first] of firstRects.entries()) {
      if (!el || !el.isConnected || !el.animate) continue
      const last = el.getBoundingClientRect()
      if (!last.width || !last.height) continue
      if (!isRectInViewport(last, viewport, effectiveOverscan)) continue

      const dx = first.left - last.left
      const dy = first.top - last.top
      if (!dx && !dy) continue

      animations.push({ el, dx, dy })
    }
    const rectReadFinishedAt = performance.now()

    for (const { el, dx, dy } of animations) {
      el.animate(
        [
          { transform: `translate(${dx}px, ${dy}px) scale(${effectiveScale})`, opacity: effectiveFade },
          { transform: 'translate(0, 0) scale(1)', opacity: 1 }
        ],
        { duration: effectiveDuration, easing: effectiveEasing }
      )
    }

    if (DENSITY_FLIP_DEBUG) {
      const payload = {
        ...lastCaptureStats,
        animated: animations.length,
        waitForFrameMs: Math.round((afterFrameAt - animateStartedAt) * 100) / 100,
        rectReadMs: Math.round((rectReadFinishedAt - rectReadStartedAt) * 100) / 100,
        totalAnimatePrepMs: Math.round((rectReadFinishedAt - animateStartedAt) * 100) / 100,
        duration: effectiveDuration
      }
      console.log(logPrefix, 'animate', payload)
      pushDensityDebugLog({
        source: logPrefix,
        phase: 'animate',
        ...payload
      })
    }

    firstRects.clear()
  }

  return { capture, animate }
}
