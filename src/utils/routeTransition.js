import { nextTick } from 'vue'
import router from '@/router'

let pendingDetailReturnPath = ''
let pendingDetailTransitionKind = ''

/* ---------- page slide transition ---------- */

const DURATION = 300
const EASING = 'cubic-bezier(0.22, 0.8, 0.22, 1)'

function getRouteScene() {
  return document.querySelector('.route-scene')
}

function animateScene(scene, direction) {
  // Set the start offset without transition, then on the next frame
  // enable the transition and snap to the final position. This two‑rAF
  // dance replaces getBoundingClientRect() (which forces a synchronous
  // layout) and produces a clean directional slide with no shake.
  const offset = direction === 'back' ? -10 : 10
  scene.style.transition = 'none'
  scene.style.transform = `translateX(${offset}px)`

  requestAnimationFrame(() => {
    scene.style.transition = `transform ${DURATION}ms ${EASING}`
    scene.style.transform = 'translateX(0)'

    setTimeout(() => {
      scene.style.transition = ''
      scene.style.transform = ''
    }, DURATION + 30)
  })
}

function scheduleAnimation(direction) {
  requestAnimationFrame(() => {
    const scene = getRouteScene()
    if (scene) {
      animateScene(scene, direction)
    } else {
      // Lazy route — component not yet in DOM, retry next frame.
      requestAnimationFrame(() => {
        const scene = getRouteScene()
        if (scene) animateScene(scene, direction)
      })
    }
  })
}

function runSlideTransition(navigate, direction) {
  const result = navigate()

  // Wait for vue-router promise so the new route component is mounted
  // before animating.  Without this the animation may target the old
  // route-scene that KeepAlive is about to cache, leaving stale inline
  // styles in the cached DOM that cause a flash on reactivation.
  //
  // router.back() / history.back() returns undefined (not a Promise).
  // nextTick alone is insufficient because route guards are async — the
  // component swap hasn't happened yet when nextTick fires.  We hook
  // into router.afterEach + nextTick to guarantee the DOM is updated.
  if (result && typeof result.then === 'function') {
    result.then(() => scheduleAnimation(direction))
  } else {
    const stop = router.afterEach(() => {
      stop()
      nextTick(() => scheduleAnimation(direction))
    })
  }
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
