const FORWARD_DURATION_MS = 380
const BACK_DURATION_MS = 360
const BACK_SCROLL_LOCK_MS = 200
const BACK_HERO_PENDING_TTL_MS = 5000
const HERO_FORWARD_EASING_NEAR = 'cubic-bezier(0.22, 1, 0.36, 1)'
const HERO_FORWARD_EASING_FAR = 'cubic-bezier(0.18, 0.96, 0.28, 1)'
const HERO_BACK_EASING_NEAR = 'cubic-bezier(0.2, 0.9, 0.24, 1)'
const HERO_BACK_EASING_FAR = 'cubic-bezier(0.16, 1, 0.3, 1)'
const IS_ANDROID = typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent || '')

let pendingForwardHero = null
let pendingBackHero = null
let pendingForwardEventHero = null
let pendingBackEventHero = null

export function getHeroBackDurationMs() {
  return BACK_DURATION_MS
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

function resolveHeroDuration(baseDuration, snapshot, targetRect) {
  const normalizedBase = Number.isFinite(baseDuration) ? baseDuration : FORWARD_DURATION_MS
  const { travel, size } = resolveHeroMotionFactors(snapshot, targetRect)
  const multiplier = 0.8 + travel * 0.22 + size * 0.12
  const value = Math.round(normalizedBase * multiplier)
  return clamp(value, 240, 520)
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

function createHeroNode(snapshot) {
  const node = document.createElement('div')
  node.setAttribute('aria-hidden', 'true')
  node.style.position = 'fixed'
  node.style.left = '0'
  node.style.top = '0'
  node.style.width = `${snapshot.width}px`
  node.style.height = `${snapshot.height}px`
  node.style.overflow = 'visible'
  node.style.pointerEvents = 'none'
  node.style.zIndex = '9999'
  node.style.willChange = 'transform, opacity'
  node.style.transformOrigin = 'top left'
  node.style.contain = 'layout paint style'
  node.style.backfaceVisibility = 'hidden'
  node.style.background = 'transparent'

  const clip = document.createElement('div')
  clip.dataset.heroClip = 'true'
  clip.style.width = '100%'
  clip.style.height = '100%'
  clip.style.overflow = 'hidden'
  clip.style.willChange = 'border-radius'
  clip.style.backfaceVisibility = 'hidden'
  clip.style.borderRadius = `${snapshot.radius || 0}px`
  clip.style.boxShadow = '0 10px 24px rgba(0, 0, 0, 0.14)'
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
    img.dataset.heroMedia = 'image'
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
  if (aspectDelta <= 0.04) return true
  return direction === 'back' && IS_ANDROID
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

  const node = createHeroNode(snapshot)

  node.style.transform = `translate3d(${snapshot.left}px, ${snapshot.top}px, 0)`
  document.body.appendChild(node)

  const targetEl = options.targetEl || null
  const previousVisibility = targetEl?.style?.visibility || ''

  const baseDuration = Number(options.duration) || FORWARD_DURATION_MS
  const direction = options.direction === 'back' ? 'back' : 'forward'
  const duration = resolveHeroDuration(baseDuration, snapshot, targetRect)
  const easing = resolveHeroEasing(direction, snapshot, targetRect)
  const radiusFrom = Number.isFinite(snapshot.radius) ? snapshot.radius : 0
  const radiusTo = Number.isFinite(targetRadius) ? targetRadius : 0
  const sourceAspectRatio = snapshot.height > 0 ? snapshot.width / snapshot.height : 1
  const targetAspectRatio = targetRect.height > 0 ? targetRect.width / targetRect.height : 1
  const aspectDelta = Math.abs(sourceAspectRatio - targetAspectRatio)
  const canUseScalePath = shouldPreferTransformOnlyHero(direction, aspectDelta)
  const transformTarget = resolveTransformOnlyTarget(snapshot, targetRect)
  const fromTransform = `translate3d(${snapshot.left}px, ${snapshot.top}px, 0) scale(1, 1)`
  const toTransform = `translate3d(${transformTarget.translateX}px, ${transformTarget.translateY}px, 0) scale(${transformTarget.scaleX}, ${transformTarget.scaleY})`
  const clipEl = node.querySelector('[data-hero-clip="true"]')

  const keyframes = canUseScalePath
    ? [
        {
          transform: fromTransform,
          opacity: 0.98
        },
        {
          transform: toTransform,
          opacity: 1
        }
      ]
    : [
        {
          transform: `translate3d(${snapshot.left}px, ${snapshot.top}px, 0)`,
          width: `${snapshot.width}px`,
          height: `${snapshot.height}px`,
          opacity: 0.98
        },
        {
          transform: `translate3d(${targetRect.left}px, ${targetRect.top}px, 0)`,
          width: `${targetRect.width}px`,
          height: `${targetRect.height}px`,
          opacity: 1
        }
      ]

  const previousOpacity = targetEl?.style?.opacity || ''
  if (targetEl) {
    targetEl.style.visibility = 'hidden'
  }

  const animation = node.animate(
    keyframes,
    {
      duration,
      easing,
      fill: 'both'
    }
  )

  const clipAnimation = clipEl
    ? clipEl.animate(
        canUseScalePath
          ? [
              {
                borderRadius: resolveCompensatedRadius(radiusFrom, 1, 1)
              },
              {
                borderRadius: resolveCompensatedRadius(radiusTo, transformTarget.scaleX, transformTarget.scaleY)
              }
            ]
          : [
              {
                borderRadius: `${radiusFrom}px`
              },
              {
                borderRadius: `${radiusTo}px`
              }
            ],
        {
          duration,
          easing,
          fill: 'both'
        }
      )
    : null

  return Promise.allSettled([
    animation.finished,
    clipAnimation?.finished
  ]).catch(() => {
    // ignore interruption
  }).finally(() => {
    node.remove()
    if (targetEl) {
      targetEl.style.visibility = previousVisibility
      targetEl.style.opacity = previousOpacity
    }
  })
}

export function prepareGoodsHeroForward({ goodsId, sourceEl }) {
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
    pendingForwardHero = null
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
    pendingBackHero = null
    return false
  }
  if (typeof resolveTargetEl !== 'function') return false

  const targetEl = resolveTargetEl(pendingBackHero.goodsId)
  const targetRect = readRect(targetEl)
  if (!targetRect) {
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
    pendingForwardEventHero = null
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
    pendingBackEventHero = null
    return false
  }
  if (typeof resolveTargetEl !== 'function') return false

  const targetEl = resolveTargetEl(pendingBackEventHero.eventId)
  const targetRect = readRect(targetEl)
  if (!targetRect) {
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
