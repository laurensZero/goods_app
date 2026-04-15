import { ref } from 'vue'
const DEBUG_VIEW_TRANSITION = false
const VIEW_TRANSITION_DISABLED_STORAGE_KEY = 'goods-view-transition-disabled-v1'
const VIEW_TRANSITION_SETTING_EVENT = 'goods-app:view-transition-setting-change'

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
  if (isViewTransitionDisabled()) return false
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false
  return true
}

export function isViewTransitionDisabled() {
  if (typeof localStorage === 'undefined') return false
  try {
    return localStorage.getItem(VIEW_TRANSITION_DISABLED_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

export function setViewTransitionDisabled(disabled) {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(VIEW_TRANSITION_DISABLED_STORAGE_KEY, disabled ? '1' : '0')
  } catch {
    return
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(VIEW_TRANSITION_SETTING_EVENT, {
      detail: { disabled: Boolean(disabled) }
    }))
  }
}

export function getViewTransitionSettingEventName() {
  return VIEW_TRANSITION_SETTING_EVENT
}

export function getViewTransitionSettingStorageKey() {
  return VIEW_TRANSITION_DISABLED_STORAGE_KEY
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
let fallbackAnimationTimer = 0

function runFallbackRouteAnimation(direction = 'forward', kind = 'page') {
  if (typeof document === 'undefined' || typeof window === 'undefined') return
  const root = document.documentElement
  root.dataset.vtFallback = '1'
  root.dataset.vtFallbackDirection = direction === 'back' ? 'back' : 'forward'
  root.dataset.vtFallbackKind = kind

  if (fallbackAnimationTimer) {
    window.clearTimeout(fallbackAnimationTimer)
  }

  fallbackAnimationTimer = window.setTimeout(() => {
    delete root.dataset.vtFallback
    delete root.dataset.vtFallbackDirection
    delete root.dataset.vtFallbackKind
    fallbackAnimationTimer = 0
  }, 1000)
}

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
    if (isViewTransitionDisabled()) {
      const normalizedGoodsId = String(goodsId || '').trim()
      const normalizedEventId = String(eventId || '').trim()
      const fallbackKind = (normalizedGoodsId || normalizedEventId)
        ? (direction === 'back' ? 'detail-back' : 'detail-enter')
        : 'page'
      runFallbackRouteAnimation(direction, fallbackKind)
    }
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
