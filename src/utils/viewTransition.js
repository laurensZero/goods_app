import { ref } from 'vue'
const DEBUG_VIEW_TRANSITION = false

function vtLog(message, payload = null) {
  if (!DEBUG_VIEW_TRANSITION) return
  if (payload == null) {
    console.log(`[view-transition] ${message}`)
    return
  }
  console.log(`[view-transition] ${message}`, payload)
}

function canUseViewTransition() {
  if (typeof document === 'undefined') return false
  if (typeof document.startViewTransition !== 'function') return false
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false
  return true
}

function setDirectionFlag(direction) {
  if (typeof document === 'undefined') return
  const normalizedDirection = direction === 'back' ? 'back' : 'forward'
  document.documentElement.dataset.vtDirection = normalizedDirection
  document.documentElement.classList.toggle('is-back', normalizedDirection === 'back')
}

function clearDirectionFlag() {
  if (typeof document === 'undefined') return
  delete document.documentElement.dataset.vtDirection
  document.documentElement.classList.remove('is-back')
}

function sanitizeHeroIdSegment(id) {
  return String(id || '').trim().replace(/[^a-zA-Z0-9_-]/g, '_')
}

export function buildGoodsHeroTransitionName(goodsId) {
  const normalizedId = String(goodsId || '').trim()
  if (!normalizedId) return 'none'
  return `goods-hero-${sanitizeHeroIdSegment(normalizedId)}`
}

export function buildEventHeroTransitionName(eventId) {
  const normalizedId = String(eventId || '').trim()
  if (!normalizedId) return 'none'
  return `event-hero-${sanitizeHeroIdSegment(normalizedId)}`
}

let activeGoodsHeroId = ''
const activeGoodsHeroIdRef = ref('')
const activeEventHeroIdRef = ref('')
let pendingDetailReturnPath = ''

export function getActiveGoodsHeroTransitionName(goodsId) {
  const normalizedId = String(goodsId || '').trim()
  if (!normalizedId || normalizedId !== activeGoodsHeroIdRef.value) return 'none'
  return buildGoodsHeroTransitionName(normalizedId)
}

export function getActiveEventHeroTransitionName(eventId) {
  const normalizedId = String(eventId || '').trim()
  if (!normalizedId || normalizedId !== activeEventHeroIdRef.value) return 'none'
  return buildEventHeroTransitionName(normalizedId)
}

function clearActiveGoodsHeroTransition() {
  activeGoodsHeroId = ''
  activeGoodsHeroIdRef.value = ''
}

function clearActiveEventHeroTransition() {
  activeEventHeroIdRef.value = ''
}

function clearAllHeroTransitions() {
  clearActiveGoodsHeroTransition()
  clearActiveEventHeroTransition()
}

export function setPendingDetailReturnPath(path) {
  const normalizedPath = String(path || '').trim()
  pendingDetailReturnPath = normalizedPath
}

export function getPendingDetailReturnPath() {
  return pendingDetailReturnPath
}

function countInlineNamedElements(transitionName) {
  if (!transitionName || typeof document === 'undefined') return 0
  const escapedName = transitionName.replace(/"/g, '\\"')
  try {
    return document.querySelectorAll(`[style*="view-transition-name: ${escapedName}"]`).length
  } catch {
    return 0
  }
}

export function runWithViewTransition(navigate, options = {}) {
  const {
    enabled = true,
    goodsId = '',
    eventId = '',
    sourceEl = null,
    direction = 'forward',
    returnPath = '',
    manageSlide = ''
  } = options
  if (typeof navigate !== 'function') return
  if (!enabled || !canUseViewTransition()) {
    vtLog('fallback:disabled-or-unsupported', { enabled, goodsId, direction })
    navigate()
    return
  }

  const normalizedGoodsId = String(goodsId || '').trim()
  const normalizedEventId = String(eventId || '').trim()
  if (direction === 'forward' && returnPath) {
    setPendingDetailReturnPath(returnPath)
  }
  const shouldUseHeroTransition = direction !== 'back'
  let transitionName = ''
  if (shouldUseHeroTransition) {
    if (normalizedEventId) {
      transitionName = buildEventHeroTransitionName(normalizedEventId)
    } else if (normalizedGoodsId) {
      transitionName = buildGoodsHeroTransitionName(normalizedGoodsId)
    }
  }
  const canTagSource = Boolean(sourceEl && transitionName)
  const shouldBindHero = Boolean(transitionName)
  if (canTagSource) {
    sourceEl.style.viewTransitionName = transitionName
  }
  if (shouldBindHero) {
    if (normalizedEventId) {
      activeEventHeroIdRef.value = normalizedEventId
      clearActiveGoodsHeroTransition()
    } else if (normalizedGoodsId) {
      activeGoodsHeroId = normalizedGoodsId
      activeGoodsHeroIdRef.value = normalizedGoodsId
      clearActiveEventHeroTransition()
    }
  } else {
    clearAllHeroTransitions()
  }

  const cleanup = () => {
    if (canTagSource) {
      sourceEl.style.viewTransitionName = ''
    }
    if (direction === 'back') {
      pendingDetailReturnPath = ''
    }
    clearAllHeroTransitions()
    clearDirectionFlag()
    if (manageSlide && typeof document !== 'undefined') {
      document.documentElement.removeAttribute('data-vt-manage-slide')
    }
    vtLog('cleanup', {
      goodsId: normalizedGoodsId,
      direction,
      hadSourceEl: canTagSource
    })
  }

  try {
    vtLog('start', {
      goodsId: normalizedGoodsId,
      direction,
      transitionName,
      canTagSource,
      sourceElTag: canTagSource ? sourceEl.style.viewTransitionName : '',
      inlineNamedCount: countInlineNamedElements(transitionName)
    })
    setDirectionFlag(direction)
    if (manageSlide && typeof document !== 'undefined') {
      document.documentElement.dataset.vtManageSlide = manageSlide
    }
    const transition = document.startViewTransition(() => Promise.resolve(navigate()))
    transition.ready.then(() => {
      vtLog('ready', {
        goodsId: normalizedGoodsId,
        direction,
        transitionName,
        inlineNamedCount: countInlineNamedElements(transitionName)
      })
    }).catch(() => {
      // ignore ready rejection
    })
    transition.finished.finally(cleanup)
    transition.finished.then(() => {
      vtLog('finished', {
        goodsId: normalizedGoodsId,
        direction,
        transitionName,
        inlineNamedCount: countInlineNamedElements(transitionName)
      })
    }).catch((error) => {
      vtLog('finished:rejected', { goodsId: normalizedGoodsId, direction, error })
    })
  } catch {
    vtLog('start:exception-fallback', { goodsId: normalizedGoodsId, direction })
    cleanup()
    navigate()
  }
}

export function runManageForwardNavigation(navigate) {
  return runWithViewTransition(navigate, { direction: 'forward', manageSlide: 'forward' })
}

export function runManageBackNavigation(navigate) {
  return runWithViewTransition(navigate, { direction: 'back', manageSlide: 'back' })
}
