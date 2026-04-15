const FORWARD_DURATION_MS = 380
const BACK_DURATION_MS = 340
const BACK_SCROLL_LOCK_MS = 200
const HERO_EASING = 'cubic-bezier(0.22, 1, 0.36, 1)'

let pendingForwardHero = null
let pendingBackHero = null
let pendingForwardEventHero = null
let pendingBackEventHero = null

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
    const top = el.scrollTop
    const left = el.scrollLeft
    const prev = {
      overflow: el.style.overflow,
      overscrollBehavior: el.style.overscrollBehavior,
      scrollBehavior: el.style.scrollBehavior
    }

    el.style.overflow = 'hidden'
    el.style.overscrollBehavior = 'none'
    el.style.scrollBehavior = 'auto'

    const keepPosition = () => {
      if (el.scrollTop !== top) el.scrollTop = top
      if (el.scrollLeft !== left) el.scrollLeft = left
    }

    el.addEventListener('scroll', keepPosition, { passive: true })

    restores.push(() => {
      el.style.overflow = prev.overflow
      el.style.overscrollBehavior = prev.overscrollBehavior
      el.style.scrollBehavior = prev.scrollBehavior
      el.removeEventListener('scroll', keepPosition)
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

function createHeroNode(snapshot) {
  const node = document.createElement('div')
  node.setAttribute('aria-hidden', 'true')
  node.style.position = 'fixed'
  node.style.left = '0'
  node.style.top = '0'
  node.style.width = `${snapshot.width}px`
  node.style.height = `${snapshot.height}px`
  node.style.overflow = 'hidden'
  node.style.pointerEvents = 'none'
  node.style.zIndex = '9999'
  node.style.willChange = 'transform, opacity, border-radius'
  node.style.transformOrigin = 'top left'
  node.style.borderRadius = `${snapshot.radius || 0}px`
  node.style.boxShadow = '0 14px 36px rgba(0, 0, 0, 0.18)'
  node.style.background = snapshot.background || 'var(--app-surface, #fff)'

  if (snapshot.imageSrc) {
    const img = document.createElement('img')
    img.src = snapshot.imageSrc
    img.alt = ''
    img.decoding = 'async'
    img.style.width = '100%'
    img.style.height = '100%'
    img.style.objectFit = 'cover'
    img.style.display = 'block'
    node.appendChild(img)
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
    node.appendChild(text)
  }

  return node
}

function animateHero(snapshot, targetRect, targetRadius, options = {}) {
  if (typeof document === 'undefined' || typeof window === 'undefined') return Promise.resolve()
  if (!snapshot || !targetRect) return Promise.resolve()

  const node = createHeroNode(snapshot)

  node.style.transform = `translate3d(${snapshot.left}px, ${snapshot.top}px, 0)`
  document.body.appendChild(node)

  const targetEl = options.targetEl || null
  const previousVisibility = targetEl?.style?.visibility || ''
  if (targetEl) {
    targetEl.style.visibility = 'hidden'
  }

  const duration = Number(options.duration) || FORWARD_DURATION_MS
  const radiusFrom = Number.isFinite(snapshot.radius) ? snapshot.radius : 0
  const radiusTo = Number.isFinite(targetRadius) ? targetRadius : 0

  const animation = node.animate(
    [
      {
        transform: `translate3d(${snapshot.left}px, ${snapshot.top}px, 0)`,
        width: `${snapshot.width}px`,
        height: `${snapshot.height}px`,
        borderRadius: `${radiusFrom}px`,
        opacity: 0.98
      },
      {
        transform: `translate3d(${targetRect.left}px, ${targetRect.top}px, 0)`,
        width: `${targetRect.width}px`,
        height: `${targetRect.height}px`,
        borderRadius: `${radiusTo}px`,
        opacity: 1
      }
    ],
    {
      duration,
      easing: HERO_EASING,
      fill: 'both'
    }
  )

  return animation.finished.catch(() => {
    // ignore interruption
  }).finally(() => {
    node.remove()
    if (targetEl) {
      targetEl.style.visibility = previousVisibility
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
  if (!pendingBackHero) return
  const normalizedCurrentPath = String(currentPath || '').split('?')[0]
  const normalizedTargetPath = String(pendingBackHero.targetPath || '').split('?')[0]
  if (normalizedTargetPath && !normalizedCurrentPath.startsWith(normalizedTargetPath)) return
  if (typeof resolveTargetEl !== 'function') return

  const targetEl = resolveTargetEl(pendingBackHero.goodsId)
  const targetRect = readRect(targetEl)
  if (!targetRect) {
    pendingBackHero = null
    return
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
      targetEl
    }
  ).finally(() => {
    releaseScrollLock()
  })

  pendingBackHero = null
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
  if (!pendingBackEventHero) return
  const normalizedCurrentPath = String(currentPath || '').split('?')[0]
  const normalizedTargetPath = String(pendingBackEventHero.targetPath || '').split('?')[0]
  if (normalizedTargetPath && !normalizedCurrentPath.startsWith(normalizedTargetPath)) return
  if (typeof resolveTargetEl !== 'function') return

  const targetEl = resolveTargetEl(pendingBackEventHero.eventId)
  const targetRect = readRect(targetEl)
  if (!targetRect) {
    pendingBackEventHero = null
    return
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
      targetEl
    }
  ).finally(() => {
    releaseScrollLock()
  })

  pendingBackEventHero = null
}
