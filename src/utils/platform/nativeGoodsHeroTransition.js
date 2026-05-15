import { setImagePreloadPaused } from '@/utils/image/cache'

const FORWARD_DURATION_MS = 390
const BACK_DURATION_MS = 350
const BACK_SCROLL_LOCK_MS = 200
const BACK_HERO_PENDING_TTL_MS = 5000
const HERO_FORWARD_EASING_NEAR = 'cubic-bezier(0.2, 0.85, 0.25, 1)'
const HERO_FORWARD_EASING_FAR = 'cubic-bezier(0.15, 0.9, 0.2, 1)'
const HERO_BACK_EASING_NEAR = 'cubic-bezier(0.25, 0.85, 0.3, 1)'
const HERO_BACK_EASING_FAR = 'cubic-bezier(0.2, 0.9, 0.25, 1)'
const HERO_FORWARD_OVERLAY_Z_INDEX = 48
const HERO_BACK_OVERLAY_Z_INDEX = 58

let pendingForwardHero = null
let pendingBackHero = null
let pendingForwardEventHero = null
let pendingBackEventHero = null
let heroAnimationLockCount = 0
let heroLifecycleCleanupBound = false
let heroRuntimeGeneration = 0

const activeHeroNodes = new Set()
const activeHeroAnimations = new Set()
const hiddenElementsMap = new Map()

function hideElement(el) {
  if (!el || hiddenElementsMap.has(el)) return
  hiddenElementsMap.set(el, {
    visibility: el.style.visibility ?? '',
    opacity: el.style.opacity ?? ''
  })
  el.setAttribute('data-hero-hidden', '')
  el.style.visibility = 'hidden'
}

function restoreElement(el) {
  if (!el) return
  const prev = hiddenElementsMap.get(el)
  if (!prev) return
  el.style.visibility = prev.visibility
  el.style.opacity = prev.opacity
  el.removeAttribute('data-hero-hidden')
  hiddenElementsMap.delete(el)
}

function restoreAllHiddenElements() {
  hiddenElementsMap.forEach((prev, el) => {
    try {
      if (el.isConnected) {
        el.style.visibility = prev.visibility
        el.style.opacity = prev.opacity
      }
      el.removeAttribute('data-hero-hidden')
    } catch (e) {}
  })
  hiddenElementsMap.clear()

  // Vue re-render 后旧 DOM 被替换，新 DOM 上无 data-hero-hidden，
  // 但可能仍有残留标记（旧 DOM 尚未被 GC）。兜底清理所有标记。
  document.querySelectorAll('[data-hero-hidden]').forEach((el) => {
    try {
      el.style.visibility = ''
      el.style.opacity = ''
      el.removeAttribute('data-hero-hidden')
    } catch (e) {}
  })
}

function resetHeroRuntimeState() {
  pendingForwardHero = null
  pendingBackHero = null
  pendingForwardEventHero = null
  pendingBackEventHero = null
  heroAnimationLockCount = 0
  setImagePreloadPaused(false)
}

function bindHeroLifecycleCleanup() {
  if (heroLifecycleCleanupBound) return
  if (typeof document === 'undefined' || typeof window === 'undefined') return

  const handleVisibilityChange = () => {
    if (document.visibilityState !== 'visible') {
      cleanupAllHeroes()
    }
  }

  const handlePageHide = () => {
    cleanupAllHeroes()
  }

  document.addEventListener('visibilitychange', handleVisibilityChange, { passive: true })
  window.addEventListener('pagehide', handlePageHide, { passive: true })
  heroLifecycleCleanupBound = true
}

export function cleanupAllHeroes() {
  heroRuntimeGeneration += 1

  restoreAllHiddenElements()

  const animations = Array.from(activeHeroAnimations)
  activeHeroAnimations.clear()

  animations.forEach(anim => {
    try {
      anim.cancel()
    } catch (e) {}
  })

  activeHeroNodes.forEach(node => {
    try {
      if (node.parentNode) {
        node.remove()
      }
    } catch (e) {}
  })
  activeHeroNodes.clear()
  resetHeroRuntimeState()
}


bindHeroLifecycleCleanup()
export function getHeroBackDurationMs() {
  return BACK_DURATION_MS
}

export function isGoodsHeroAnimating() {
  return heroAnimationLockCount > 0
}

function isPendingBackHeroValid(pendingHero, currentPath = '') {
  if (!pendingHero) return false
  const ageMs = Date.now() - Number(pendingHero.preparedAt || 0)
  if (!Number.isFinite(ageMs) || ageMs > BACK_HERO_PENDING_TTL_MS) {
    return false
  }
  const normalizedCurrentPath = String(currentPath || '').split('?')[0]
  const normalizedTargetPath = String(pendingHero.targetPath || '').split('?')[0]
  if (normalizedTargetPath && !normalizedCurrentPath.startsWith(normalizedTargetPath)) {
    return false
  }
  return true
}

export function hasPendingGoodsHeroBack(currentPath = '') {
  return isPendingBackHeroValid(pendingBackHero, currentPath)
}

export function hasPendingEventHeroBack(currentPath = '') {
  return isPendingBackHeroValid(pendingBackEventHero, currentPath)
}

function isScrollable(el) {
  if (!el || typeof window === 'undefined') return false
  const style = window.getComputedStyle(el)
  const overflowY = style.overflowY || ''
  const canScroll = /(auto|scroll|overlay)/i.test(overflowY)
  return canScroll && el.scrollHeight > el.clientHeight
}

function collectScrollContainers(startEl) {
  const containers = []
  let current = startEl?.parentElement || null

  while (current && current !== document.body) {
    if (isScrollable(current)) {
      containers.push(current)
    }
    current = current.parentElement
  }

  if (document.body && isScrollable(document.body)) {
    containers.push(document.body)
  }
  const scrollingEl = document.scrollingElement
  if (scrollingEl && isScrollable(scrollingEl) && !containers.includes(scrollingEl)) {
    containers.push(scrollingEl)
  }

  return containers
}

function lockBackScroll(targetEl, duration = BACK_SCROLL_LOCK_MS) {
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    return () => {}
  }

  const containers = collectScrollContainers(targetEl)
  const restores = []
  const cleanups = []

  const lockContainer = (el) => {
    const prev = {
      overflow: el.style.overflow,
      overscrollBehavior: el.style.overscrollBehavior,
      scrollBehavior: el.style.scrollBehavior
    }

    el.style.overflow = 'hidden'
    el.style.overscrollBehavior = 'none'
    el.style.scrollBehavior = 'auto'

    restores.push(() => {
      el.style.overflow = prev.overflow
      el.style.overscrollBehavior = prev.overscrollBehavior
      el.style.scrollBehavior = prev.scrollBehavior
    })
  }

  containers.forEach(lockContainer)

  const preventDefault = (event) => {
    event.preventDefault()
  }

  window.addEventListener('wheel', preventDefault, { passive: false, capture: true })
  window.addEventListener('touchmove', preventDefault, { passive: false, capture: true })
  cleanups.push(() => {
    window.removeEventListener('wheel', preventDefault, { capture: true })
    window.removeEventListener('touchmove', preventDefault, { capture: true })
  })

  let released = false
  const timer = window.setTimeout(() => {
    release()
  }, Math.max(0, duration))

  const release = () => {
    if (released) return
    released = true
    window.clearTimeout(timer)
    cleanups.forEach((fn) => fn())
    restores.forEach((fn) => fn())
  }

  return release
}

function readImageSource(el) {
  if (!el) return ''
  if (String(el.tagName || '').toUpperCase() === 'IMG') {
    return el.currentSrc || el.src || ''
  }
  const img = el.querySelector('img')
  return img?.currentSrc || img?.src || ''
}

function readFallbackText(el) {
  if (!el) return ''
  const selector = '.cover-fallback, .cover-card__fallback, .event-card__placeholder, .linked-goods-card__placeholder, .cover-initial'
  const fallback = el.matches?.(selector) ? el : el.querySelector(selector)
  return String(fallback?.textContent || '').trim().slice(0, 1)
}

function readRadius(el) {
  if (!el || typeof window === 'undefined') return 0
  const style = window.getComputedStyle(el)
  const value = Number.parseFloat(style.borderRadius)
  return Number.isFinite(value) ? value : 0
}

function readRect(el) {
  if (!el) return null
  const rect = el.getBoundingClientRect()
  if (!Number.isFinite(rect.width) || !Number.isFinite(rect.height)) return null
  if (rect.width <= 0 || rect.height <= 0) return null
  return {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height
  }
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function resolveHeroMotionFactors(snapshot, targetRect) {
  if (!snapshot || !targetRect || typeof window === 'undefined') {
    return { travel: 0, size: 0 }
  }

  const fromCenterX = Number(snapshot.left || 0) + Number(snapshot.width || 0) / 2
  const fromCenterY = Number(snapshot.top || 0) + Number(snapshot.height || 0) / 2
  const toCenterX = Number(targetRect.left || 0) + Number(targetRect.width || 0) / 2
  const toCenterY = Number(targetRect.top || 0) + Number(targetRect.height || 0) / 2
  const distance = Math.hypot(toCenterX - fromCenterX, toCenterY - fromCenterY)
  const viewportDiagonal = Math.hypot(window.innerWidth || 1, window.innerHeight || 1) || 1
  const travel = clamp(distance / viewportDiagonal, 0, 1)

  const fromArea = Math.max(1, Number(snapshot.width || 0) * Number(snapshot.height || 0))
  const toArea = Math.max(1, Number(targetRect.width || 0) * Number(targetRect.height || 0))
  const areaRatio = Math.max(fromArea, toArea) / Math.min(fromArea, toArea)
  const size = clamp(Math.log2(areaRatio) / 3, 0, 1)

  return { travel, size }
}

function resolveHeroDuration(baseDuration) {
  const normalizedBase = Number.isFinite(baseDuration) ? baseDuration : FORWARD_DURATION_MS
  return clamp(Math.round(normalizedBase), BACK_DURATION_MS, FORWARD_DURATION_MS)
}

function resolveHeroEasing(direction, snapshot, targetRect) {
  const normalizedDirection = direction === 'back' ? 'back' : 'forward'
  const { travel, size } = resolveHeroMotionFactors(snapshot, targetRect)
  const intensity = travel * 0.7 + size * 0.3

  if (normalizedDirection === 'back') {
    return intensity > 0.42 ? HERO_BACK_EASING_FAR : HERO_BACK_EASING_NEAR
  }

  return intensity > 0.42 ? HERO_FORWARD_EASING_FAR : HERO_FORWARD_EASING_NEAR
}

function createHeroNode(snapshot, zIndex = HERO_FORWARD_OVERLAY_Z_INDEX) {
  const node = document.createElement('div')
  node.setAttribute('aria-hidden', 'true')
  node.style.position = 'fixed'
  node.style.left = '0'
  node.style.top = '0'
  node.style.width = `${snapshot.width}px`
  node.style.height = `${snapshot.height}px`
  node.style.overflow = 'visible'
  node.style.pointerEvents = 'none'
  node.style.zIndex = String(zIndex)
  node.style.willChange = 'transform, opacity'
  node.style.transformOrigin = 'top left'
  node.style.contain = 'layout style'
  node.style.backfaceVisibility = 'hidden'
  node.style.background = 'transparent'
  node.style.overflow = 'visible'

  const shadow = document.createElement('div')
  shadow.style.position = 'absolute'
  shadow.style.inset = '0'
  shadow.style.borderRadius = `${snapshot.radius || 0}px`
  shadow.style.boxShadow = 'var(--app-shadow)'
  shadow.style.pointerEvents = 'none'
  shadow.style.backfaceVisibility = 'hidden'
  node.appendChild(shadow)

  const clip = document.createElement('div')
  clip.dataset.heroClip = 'true'
  clip.style.position = 'relative'
  clip.style.zIndex = '1'
  clip.style.width = '100%'
  clip.style.height = '100%'
  clip.style.overflow = 'hidden'
  clip.style.backfaceVisibility = 'hidden'
  clip.style.borderRadius = 'inherit'
  clip.style.background = snapshot.background || 'var(--app-surface, #fff)'
  node.appendChild(clip)

  if (snapshot.imageSrc) {
    const img = document.createElement('img')
    img.src = snapshot.imageSrc
    img.alt = ''
    img.decoding = 'async'
    img.style.width = '100%'
    img.style.height = '100%'
    img.style.objectFit = 'cover'
    img.style.display = 'block'
    img.style.backfaceVisibility = 'hidden'
    img.style.transform = 'translateZ(0)'
    img.style.transformOrigin = 'center center'
    img.style.opacity = '0'
    img.style.visibility = 'hidden'
    img.dataset.heroMedia = 'image'

    const revealImage = () => {
      if (img.naturalWidth > 0 && img.naturalHeight > 0) {
        img.style.opacity = '1'
        img.style.visibility = 'visible'
      } else {
        img.style.opacity = '0'
        img.style.visibility = 'hidden'
      }
    }

    const hideImage = () => {
      img.style.opacity = '0'
      img.style.visibility = 'hidden'
    }

    img.addEventListener('load', revealImage, { once: true })
    img.addEventListener('error', hideImage, { once: true })

    if (img.complete) {
      revealImage()
    }

    clip.appendChild(img)
  } else {
    const text = document.createElement('span')
    text.textContent = snapshot.fallbackText || '?'
    text.style.display = 'grid'
    text.style.placeItems = 'center'
    text.style.width = '100%'
    text.style.height = '100%'
    text.style.fontSize = '28px'
    text.style.fontWeight = '700'
    text.style.color = 'rgba(255,255,255,0.92)'
    clip.appendChild(text)
  }

  return node
}

function shouldPreferTransformOnlyHero(direction, aspectDelta) {
  if (aspectDelta <= 0.15) return true
  return direction === 'back'
}

function resolveTransformOnlyTarget(snapshot, targetRect) {
  const scaleX = snapshot.width > 0 ? targetRect.width / snapshot.width : 1
  const scaleY = snapshot.height > 0 ? targetRect.height / snapshot.height : 1
  const normalizedScaleX = Number.isFinite(scaleX) ? scaleX : 1
  const normalizedScaleY = Number.isFinite(scaleY) ? scaleY : 1

  return {
    scaleX: normalizedScaleX,
    scaleY: normalizedScaleY,
    translateX: targetRect.left,
    translateY: targetRect.top
  }
}

function resolveCompensatedRadius(radius, scaleX = 1, scaleY = 1) {
  const normalizedRadius = Math.max(0, Number(radius) || 0)
  const normalizedScaleX = Math.max(Math.abs(Number(scaleX) || 1), 0.0001)
  const normalizedScaleY = Math.max(Math.abs(Number(scaleY) || 1), 0.0001)
  const horizontalRadius = normalizedRadius / normalizedScaleX
  const verticalRadius = normalizedRadius / normalizedScaleY
  return `${horizontalRadius}px / ${verticalRadius}px`
}

function animateHero(snapshot, targetRect, targetRadius, options = {}) {
  if (typeof document === 'undefined' || typeof window === 'undefined') return Promise.resolve()
  if (!snapshot || !targetRect) return Promise.resolve()

  const baseDuration = Number(options.duration) || FORWARD_DURATION_MS
  const direction = options.direction === 'back' ? 'back' : 'forward'
  const overlayZIndex = direction === 'back'
    ? HERO_BACK_OVERLAY_Z_INDEX
    : HERO_FORWARD_OVERLAY_Z_INDEX
  const node = createHeroNode(snapshot, overlayZIndex)
  const animationGeneration = heroRuntimeGeneration
  const targetEl = options.targetEl || null
  const duration = resolveHeroDuration(baseDuration)
  let finalized = false
  let animation = null
  let timeoutId = null

  const finalize = () => {
    if (finalized) return
    finalized = true

    if (timeoutId != null) {
      clearTimeout(timeoutId)
      timeoutId = null
    }

    if (animation && activeHeroAnimations.has(animation)) {
      activeHeroAnimations.delete(animation)
    }

    if (activeHeroNodes.has(node)) {
      activeHeroNodes.delete(node)
    }

    try {
      if (node.parentNode) {
        node.remove()
      }
    } catch (e) {}

    restoreElement(targetEl)

    if (animationGeneration === heroRuntimeGeneration) {
      heroAnimationLockCount = Math.max(0, heroAnimationLockCount - 1)
      if (heroAnimationLockCount === 0) {
        setImagePreloadPaused(false)
      }
    }
  }

  heroAnimationLockCount += 1
  setImagePreloadPaused(true)

  node.style.left = `${snapshot.left}px`
  node.style.top = `${snapshot.top}px`
  node.style.width = `${snapshot.width}px`
  node.style.height = `${snapshot.height}px`
  document.body.appendChild(node)
  activeHeroNodes.add(node)

  const easing = resolveHeroEasing(direction, snapshot, targetRect)
  const radiusFrom = Number.isFinite(snapshot.radius) ? snapshot.radius : 0
  const radiusTo = Number.isFinite(targetRadius) ? targetRadius : 0
  const keyframes = [
    {
      left: `${snapshot.left}px`,
      top: `${snapshot.top}px`,
      width: `${snapshot.width}px`,
      height: `${snapshot.height}px`,
      opacity: 1,
      borderRadius: `${radiusFrom}px`
    },
    {
      left: `${targetRect.left}px`,
      top: `${targetRect.top}px`,
      width: `${targetRect.width}px`,
      height: `${targetRect.height}px`,
      opacity: 1,
      borderRadius: `${radiusTo}px`
    }
  ]

  hideElement(targetEl)

  try {
    animation = node.animate(
      keyframes,
      {
        duration,
        easing,
        fill: 'both'
      }
    )
  } catch (e) {
    finalize()
    return Promise.resolve()
  }

  activeHeroAnimations.add(animation)

  if (typeof animation.addEventListener === 'function') {
    animation.addEventListener('finish', finalize, { once: true })
    animation.addEventListener('cancel', finalize, { once: true })
  }

  timeoutId = setTimeout(() => {
    finalize()
  }, duration + 600)

  return Promise.allSettled([
    animation.finished,
  ]).catch(() => {
    // ignore interruption
  }).finally(() => {
    finalize()
  })
}

export function prepareGoodsHeroForward({ goodsId, sourceEl }) {
  cleanupAllHeroes()
  if (!sourceEl || !goodsId) return
  const rect = readRect(sourceEl)
  if (!rect) return

  pendingForwardHero = {
    goodsId: String(goodsId),
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
    radius: readRadius(sourceEl),
    imageSrc: readImageSource(sourceEl),
    fallbackText: readFallbackText(sourceEl),
    background: window.getComputedStyle(sourceEl).background
  }
}

export function playGoodsHeroForward(goodsId, targetEl) {
  if (!pendingForwardHero) return
  if (String(goodsId) !== pendingForwardHero.goodsId) return

  const targetRect = readRect(targetEl)
  if (!targetRect) {
    cleanupAllHeroes()
    return
  }

  void animateHero(
    pendingForwardHero,
    targetRect,
    readRadius(targetEl),
    {
      duration: FORWARD_DURATION_MS,
      direction: 'forward',
      targetEl
    }
  )

  pendingForwardHero = null
}

export function prepareGoodsHeroBack({ goodsId, sourceEl, targetPath = '' }) {
  cleanupAllHeroes()
  if (!sourceEl || !goodsId) return
  const rect = readRect(sourceEl)
  if (!rect) return

  pendingBackHero = {
    goodsId: String(goodsId),
    preparedAt: Date.now(),
    targetPath: String(targetPath || ''),
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
    radius: readRadius(sourceEl),
    imageSrc: readImageSource(sourceEl),
    fallbackText: readFallbackText(sourceEl),
    background: window.getComputedStyle(sourceEl).background
  }
}

export function playGoodsHeroBack({ currentPath = '', resolveTargetEl }) {
  if (!pendingBackHero) return false
  if (!isPendingBackHeroValid(pendingBackHero, currentPath)) {
    cleanupAllHeroes()
    return false
  }
  if (typeof resolveTargetEl !== 'function') {
    cleanupAllHeroes()
    return false
  }

  const targetEl = resolveTargetEl(pendingBackHero.goodsId)
  const targetRect = readRect(targetEl)
  if (!targetRect) {
    cleanupAllHeroes()
    return false
  }

  const releaseScrollLock = lockBackScroll(
    targetEl,
    Math.max(BACK_SCROLL_LOCK_MS, BACK_DURATION_MS + 40)
  )

  void animateHero(
    pendingBackHero,
    targetRect,
    readRadius(targetEl),
    {
      duration: BACK_DURATION_MS,
      direction: 'back',
      targetEl
    }
  ).finally(() => {
    releaseScrollLock()
  })

  pendingBackHero = null
  return true
}

export function prepareEventHeroForward({ eventId, sourceEl }) {
  cleanupAllHeroes()
  if (!sourceEl || !eventId) return
  const rect = readRect(sourceEl)
  if (!rect) return

  pendingForwardEventHero = {
    eventId: String(eventId),
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
    radius: readRadius(sourceEl),
    imageSrc: readImageSource(sourceEl),
    fallbackText: readFallbackText(sourceEl),
    background: window.getComputedStyle(sourceEl).background
  }
}

export function playEventHeroForward(eventId, targetEl) {
  if (!pendingForwardEventHero) return
  if (String(eventId) !== pendingForwardEventHero.eventId) return

  const targetRect = readRect(targetEl)
  if (!targetRect) {
    cleanupAllHeroes()
    return
  }

  void animateHero(
    pendingForwardEventHero,
    targetRect,
    readRadius(targetEl),
    {
      duration: FORWARD_DURATION_MS,
      direction: 'forward',
      targetEl
    }
  )

  pendingForwardEventHero = null
}

export function prepareEventHeroBack({ eventId, sourceEl, targetPath = '' }) {
  cleanupAllHeroes()
  if (!sourceEl || !eventId) return
  const rect = readRect(sourceEl)
  if (!rect) return

  pendingBackEventHero = {
    eventId: String(eventId),
    preparedAt: Date.now(),
    targetPath: String(targetPath || ''),
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
    radius: readRadius(sourceEl),
    imageSrc: readImageSource(sourceEl),
    fallbackText: readFallbackText(sourceEl),
    background: window.getComputedStyle(sourceEl).background
  }
}

export function playEventHeroBack({ currentPath = '', resolveTargetEl }) {
  if (!pendingBackEventHero) return false
  if (!isPendingBackHeroValid(pendingBackEventHero, currentPath)) {
    cleanupAllHeroes()
    return false
  }
  if (typeof resolveTargetEl !== 'function') {
    cleanupAllHeroes()
    return false
  }

  const targetEl = resolveTargetEl(pendingBackEventHero.eventId)
  const targetRect = readRect(targetEl)
  if (!targetRect) {
    cleanupAllHeroes()
    return false
  }

  const releaseScrollLock = lockBackScroll(
    targetEl,
    Math.max(BACK_SCROLL_LOCK_MS, BACK_DURATION_MS + 40)
  )

  void animateHero(
    pendingBackEventHero,
    targetRect,
    readRadius(targetEl),
    {
      duration: BACK_DURATION_MS,
      direction: 'back',
      targetEl
    }
  ).finally(() => {
    releaseScrollLock()
  })

  pendingBackEventHero = null
  return true
}
