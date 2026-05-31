import { useRoute } from 'vue-router'
import { hasPendingGoodsHeroBack, getHeroBackDurationMs, playGoodsHeroBack, cleanupAllHeroes } from '@/utils/platform/nativeGoodsHeroTransition'

/**
 * Shared composable for goods card hero back animation (resolve, retry, cancel).
 *
 * @param {Object} options
 * @param {() => HTMLElement|null} options.getScrollEl - Returns the scroll container element
 * @param {import('vue').Ref} options.rootRef - Ref to the page root element (fallback for scrollEl)
 * @param {number} [options.maxRetryFrames=25] - Max rAF retry attempts
 * @param {number} [options.guardTimeoutMs=500] - Timeout for deferred restore guard
 */
export function useGoodsBackHero({
  getScrollEl,
  rootRef,
  maxRetryFrames = 25,
  guardTimeoutMs = 500
} = {}) {
  const route = useRoute()

  let retryRaf = 0
  let deferredRestoreTimer = 0

  function resolveGoodsCardCover(goodsId) {
    const normalized = String(goodsId || '')
    if (!normalized) return null
    const escaped = typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
      ? CSS.escape(normalized)
      : normalized.replace(/"/g, '\\"')
    const rootEl = getScrollEl?.() || rootRef?.value || document
    const cardRoot = rootEl?.querySelector?.(`[data-goods-id="${escaped}"]`) || null
    if (cardRoot) {
      const coverInsideCard = cardRoot.querySelector?.(`[data-goods-hero-id="${escaped}"]`) || null
      if (coverInsideCard) return coverInsideCard
    }
    const directCover = rootEl?.querySelector?.(`[data-goods-hero-id="${escaped}"]`) || null
    if (directCover) return directCover
    return cardRoot
  }

  function tryPlayNativeGoodsBackHero(onReady) {
    return playGoodsHeroBack({
      currentPath: route.fullPath,
      resolveTargetEl: resolveGoodsCardCover,
      onReady
    })
  }

  function cancelGoodsBackHeroRetry() {
    if (!retryRaf) return
    window.cancelAnimationFrame(retryRaf)
    retryRaf = 0
  }

  function clearDeferredRestoreTimer() {
    if (!deferredRestoreTimer) return
    window.clearTimeout(deferredRestoreTimer)
    deferredRestoreTimer = 0
  }

  function scheduleGoodsBackHeroRetry(attempt = 0, hooks = null) {
    cancelGoodsBackHeroRetry()
    retryRaf = window.requestAnimationFrame(() => {
      retryRaf = 0
      const played = tryPlayNativeGoodsBackHero(hooks?.onReady)
      if (played) {
        hooks?.onPlayed?.()
        return
      }
      if (!hasPendingGoodsHeroBack(route.fullPath)) {
        hooks?.onGiveUp?.()
        return
      }
      if (attempt + 1 >= maxRetryFrames) {
        cleanupAllHeroes()
        hooks?.onGiveUp?.()
        return
      }
      scheduleGoodsBackHeroRetry(attempt + 1, hooks)
    })
  }

  function deferActivatedRestoreAfterGoodsBackHero(runRestore) {
    const safeRunRestore = typeof runRestore === 'function' ? runRestore : () => {}
    const hasPendingBackHero = hasPendingGoodsHeroBack(route.fullPath)
    if (!hasPendingBackHero) {
      safeRunRestore()
      return
    }

    clearDeferredRestoreTimer()
    let settled = false
    const settle = () => {
      if (settled) return
      settled = true
      clearDeferredRestoreTimer()
      safeRunRestore()
    }

    scheduleGoodsBackHeroRetry(0, {
      onPlayed: () => {
        deferredRestoreTimer = window.setTimeout(() => {
          deferredRestoreTimer = 0
          settle()
        }, Math.max(0, getHeroBackDurationMs() + 16))
      },
      onGiveUp: settle
    })

    deferredRestoreTimer = window.setTimeout(() => {
      deferredRestoreTimer = 0
      settle()
    }, guardTimeoutMs)
  }

  return {
    resolveGoodsCardCover,
    tryPlayNativeGoodsBackHero,
    cancelGoodsBackHeroRetry,
    clearDeferredRestoreTimer,
    scheduleGoodsBackHeroRetry,
    deferActivatedRestoreAfterGoodsBackHero
  }
}
