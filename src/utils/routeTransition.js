let pendingDetailReturnPath = ''
let pendingDetailTransitionKind = ''

/* ---------- page slide transition ---------- */

const DURATION = 300
const EASING = 'cubic-bezier(0.22, 0.8, 0.22, 1)'

function getRouteScene() {
  return document.querySelector('.route-scene')
}

function animateScene(scene, direction) {
  scene.style.transition = 'none'
  if (direction === 'back') {
    scene.style.transform = 'translateX(-16px)'
  } else {
    scene.style.transform = 'translateX(20px)'
  }
  scene.style.opacity = '0.95'

  scene.getBoundingClientRect()

  scene.style.transition = `transform ${DURATION}ms ${EASING}, opacity ${DURATION}ms ${EASING}`
  scene.style.transform = 'translateX(0)'
  scene.style.opacity = '1'

  setTimeout(() => {
    scene.style.transition = ''
    scene.style.transform = ''
    scene.style.opacity = ''
  }, DURATION + 30)
}

function runSlideTransition(navigate, direction) {
  // Start navigation immediately — do not await it. Waiting for the
  // navigation promise defers the slide animation until after the new
  // component mounts, which causes a visible dead gap on the tab bar.
  navigate()

  // Schedule the slide animation across two rAFs so it reliably runs
  // after the DOM update, regardless of whether the route was lazy.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const scene = getRouteScene()
      if (scene) animateScene(scene, direction)
    })
  })
}

/* ---------- public API ---------- */

export function clearRouteTransitionFallback() {
  // kept for backwards compatibility
}

export function setPendingDetailReturnPath(path) {
  pendingDetailReturnPath = String(path || '').trim()
}

export function setPendingDetailTransitionKind(kind) {
  pendingDetailTransitionKind = String(kind || '').trim()
}

export function getPendingDetailReturnPath() {
  return pendingDetailReturnPath
}

export function getPendingDetailTransitionKind() {
  return pendingDetailTransitionKind
}

export function clearPendingDetailTransitionKind() {
  pendingDetailTransitionKind = ''
}

export function runWithRouteTransition(navigate, options = {}) {
  const {
    direction = 'forward',
    returnPath = '',
    manageSlide = '',
    detailTransitionKind = ''
  } = options

  if (typeof navigate !== 'function') return

  const normalizedDetailTransitionKind = String(detailTransitionKind || '').trim()

  if (direction === 'forward' && returnPath) {
    setPendingDetailReturnPath(returnPath)
  }
  if (normalizedDetailTransitionKind) {
    setPendingDetailTransitionKind(normalizedDetailTransitionKind)
  }

  const slideDir = (manageSlide || direction) === 'back' ? 'back' : 'forward'
  runSlideTransition(navigate, slideDir)

  if (direction === 'back') {
    pendingDetailReturnPath = ''
    pendingDetailTransitionKind = ''
  }
}

export function runManageForwardNavigation(navigate) {
  return runWithRouteTransition(navigate, { direction: 'forward', manageSlide: 'forward' })
}

export function runManageBackNavigation(navigate) {
  return runWithRouteTransition(navigate, { direction: 'back', manageSlide: 'back' })
}
