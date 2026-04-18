let pendingDetailReturnPath = ''
let fallbackAnimationTimer = 0

function clearFallbackRouteAnimation() {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  delete root.dataset.routeTransitionFallback
  delete root.dataset.routeTransitionDirection
  delete root.dataset.routeTransitionKind

  if (fallbackAnimationTimer && typeof window !== 'undefined') {
    window.clearTimeout(fallbackAnimationTimer)
    fallbackAnimationTimer = 0
  }
}

export function clearRouteTransitionFallback() {
  clearFallbackRouteAnimation()
}

function runFallbackRouteAnimation(direction = 'forward', kind = 'page') {
  if (typeof document === 'undefined' || typeof window === 'undefined') return
  const root = document.documentElement
  root.dataset.routeTransitionFallback = '1'
  root.dataset.routeTransitionDirection = direction === 'back' ? 'back' : 'forward'
  root.dataset.routeTransitionKind = kind

  if (fallbackAnimationTimer) {
    window.clearTimeout(fallbackAnimationTimer)
  }

  fallbackAnimationTimer = window.setTimeout(() => {
    delete root.dataset.routeTransitionFallback
    delete root.dataset.routeTransitionDirection
    delete root.dataset.routeTransitionKind
    fallbackAnimationTimer = 0
  }, 1000)
}

export function setPendingDetailReturnPath(path) {
  const normalizedPath = String(path || '').trim()
  pendingDetailReturnPath = normalizedPath
}

export function getPendingDetailReturnPath() {
  return pendingDetailReturnPath
}

export function runWithRouteTransition(navigate, options = {}) {
  const {
    enabled = true,
    preferFallback = false,
    goodsId = '',
    eventId = '',
    direction = 'forward',
    returnPath = '',
    manageSlide = ''
  } = options
  if (typeof navigate !== 'function') return
  const normalizedGoodsId = String(goodsId || '').trim()
  const normalizedEventId = String(eventId || '').trim()
  const fallbackKind = (normalizedGoodsId || normalizedEventId)
    ? (direction === 'back' ? 'detail-back' : 'detail-enter')
    : 'page'

  if (direction === 'forward' && returnPath) {
    setPendingDetailReturnPath(returnPath)
  }
  if (!enabled && !preferFallback) {
    clearFallbackRouteAnimation()
    navigate()
    return
  }

  if (manageSlide && typeof document !== 'undefined') {
    document.documentElement.dataset.routeTransitionManageSlide = manageSlide
  }

  runFallbackRouteAnimation(direction, fallbackKind)
  navigate()

  if (direction === 'back') {
    pendingDetailReturnPath = ''
  }

  if (manageSlide && typeof document !== 'undefined') {
    window.setTimeout(() => {
      document.documentElement.removeAttribute('data-route-transition-manage-slide')
    }, 240)
  }
}

export function runManageForwardNavigation(navigate) {
  return runWithRouteTransition(navigate, { direction: 'forward', manageSlide: 'forward' })
}

export function runManageBackNavigation(navigate) {
  return runWithRouteTransition(navigate, { direction: 'back', manageSlide: 'back' })
}
