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

export function buildGoodsHeroTransitionName(goodsId) {
  const normalizedId = String(goodsId || '').trim()
  if (!normalizedId) return 'none'
  return 'product-hero'
}

let activeGoodsHeroId = ''
const activeGoodsHeroIdRef = ref('')
let pendingDetailReturnPath = ''

export function getActiveGoodsHeroTransitionName(goodsId) {
  const normalizedId = String(goodsId || '').trim()
  if (!normalizedId || normalizedId !== activeGoodsHeroIdRef.value) return 'none'
  return buildGoodsHeroTransitionName(normalizedId)
}

function clearActiveGoodsHeroTransition() {
  activeGoodsHeroId = ''
  activeGoodsHeroIdRef.value = ''
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
    sourceEl = null,
    direction = 'forward',
    returnPath = ''
  } = options
  if (typeof navigate !== 'function') return
  if (!enabled || !canUseViewTransition()) {
    vtLog('fallback:disabled-or-unsupported', { enabled, goodsId, direction })
    navigate()
    return
  }

  const normalizedId = String(goodsId || '').trim()
  if (direction === 'forward' && returnPath) {
    setPendingDetailReturnPath(returnPath)
  }
  const shouldUseHeroTransition = direction !== 'back'
  const transitionName = shouldUseHeroTransition && normalizedId ? buildGoodsHeroTransitionName(normalizedId) : ''
  const canTagSource = Boolean(sourceEl && transitionName)
  const shouldBindHero = Boolean(transitionName)
  if (canTagSource) {
    sourceEl.style.viewTransitionName = transitionName
  }
  if (shouldBindHero) {
    activeGoodsHeroId = normalizedId
    activeGoodsHeroIdRef.value = normalizedId
  }
  else clearActiveGoodsHeroTransition()

  const cleanup = () => {
    if (canTagSource) {
      sourceEl.style.viewTransitionName = ''
    }
    if (direction === 'back') {
      pendingDetailReturnPath = ''
    }
    clearActiveGoodsHeroTransition()
    clearDirectionFlag()
    vtLog('cleanup', {
      goodsId: normalizedId,
      direction,
      hadSourceEl: canTagSource
    })
  }

  try {
    vtLog('start', {
      goodsId: normalizedId,
      direction,
      transitionName,
      canTagSource,
      sourceElTag: canTagSource ? sourceEl.style.viewTransitionName : '',
      inlineNamedCount: countInlineNamedElements(transitionName)
    })
    setDirectionFlag(direction)
    const transition = document.startViewTransition(() => Promise.resolve(navigate()))
    transition.ready.then(() => {
      vtLog('ready', {
        goodsId: normalizedId,
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
        goodsId: normalizedId,
        direction,
        transitionName,
        inlineNamedCount: countInlineNamedElements(transitionName)
      })
    }).catch((error) => {
      vtLog('finished:rejected', { goodsId: normalizedId, direction, error })
    })
  } catch {
    vtLog('start:exception-fallback', { goodsId: normalizedId, direction })
    cleanup()
    navigate()
  }
}
