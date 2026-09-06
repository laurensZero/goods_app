// @ts-check
/**
 * 全局下拉手势：页面滚动到顶时，大幅下拉并「停顿」一小段时间后触发回调。
 *
 * 判定链：按下时页面在顶部（任意可滚动祖先的 scrollTop 都为 0）→
 * 单指下拉超过 thresholdPx（横向偏移受限）→ 手指基本不动保持 holdMs → 触发。
 * 全程 passive 监听、不拦截滚动；有弹窗（useDialogBackButton 的 overlayStack）
 * 或 enabled() 为 false 时不启用。每次触摸最多触发一次。
 */

import { onBeforeUnmount, onMounted } from 'vue'
import { hasOverlays } from '@/composables/useDialogBackButton'

/**
 * @param {{
 *   thresholdPx?: number,
 *   holdMs?: number,
 *   maxHorizontalPx?: number,
 *   moveGracePx?: number,
 *   enabled?: () => boolean,
 *   onTrigger: () => void
 * }} options
 */
export function usePullDownGesture(options = {}) {
  const {
    thresholdPx = 150,
    holdMs = 380,
    maxHorizontalPx = 60,
    moveGracePx = 12,
    enabled = () => true,
    onTrigger
  } = options

  let tracking = false
  let triggered = false
  let startX = 0
  let startY = 0
  let holdTimer = 0
  let holdAnchorY = 0
  /** @type {Element | null} */
  let targetEl = null

  /** @param {TouchEvent} event */
  function isActiveTouch(event) {
    if (triggered || !event.touches || event.touches.length !== 1) return false
    if (hasOverlays() || !enabled()) return false
    const target = event.target
    if (target instanceof Element && target.closest('textarea, input, [contenteditable="true"]')) return false
    return true
  }

  /** 从按下位置向上找：任何可竖向滚动且不在顶部的容器都让手势失效 */
  function isAtScrollTop() {
    let el = targetEl
    while (el && el !== document.body && el !== document.documentElement) {
      if (el.scrollHeight > el.clientHeight + 1 && el.scrollTop > 0) return false
      el = el.parentElement
    }
    if (window.scrollY > 0) return false
    return true
  }

  function clearHoldTimer() {
    if (holdTimer) {
      window.clearTimeout(holdTimer)
      holdTimer = 0
    }
  }

  /** @param {number} anchorY 以当前手指位置为停顿锚点重新计时 */
  function scheduleHoldTrigger(anchorY) {
    clearHoldTimer()
    holdAnchorY = anchorY
    holdTimer = window.setTimeout(() => {
      holdTimer = 0
      triggered = true
      try {
        onTrigger?.()
      } catch (error) {
        console.warn('[pull-down-gesture] trigger failed:', error)
      }
    }, holdMs)
  }

  /** @param {TouchEvent} event */
  function onTouchStart(event) {
    clearHoldTimer()
    tracking = false
    triggered = false
    if (!isActiveTouch(event)) return
    const touch = event.touches[0]
    targetEl = event.target instanceof Element ? event.target : null
    if (!isAtScrollTop()) {
      targetEl = null
      return
    }
    startX = touch.clientX
    startY = touch.clientY
    tracking = true
  }

  /** @param {TouchEvent} event */
  function onTouchMove(event) {
    if (!tracking || triggered) return
    if (!event.touches || event.touches.length !== 1) {
      clearHoldTimer()
      return
    }
    const touch = event.touches[0]
    const dy = touch.clientY - startY
    const dx = Math.abs(touch.clientX - startX)
    if (dy < thresholdPx || dx > maxHorizontalPx || !isAtScrollTop()) {
      clearHoldTimer()
      return
    }
    if (!holdTimer) {
      scheduleHoldTrigger(touch.clientY)
    } else if (Math.abs(touch.clientY - holdAnchorY) > moveGracePx) {
      // 还在继续拖动（超出停顿容差）：以新位置为锚点重新计停顿
      scheduleHoldTrigger(touch.clientY)
    }
  }

  function onTouchEnd() {
    clearHoldTimer()
    tracking = false
    holdAnchorY = 0
  }

  onMounted(() => {
    // 从不 preventDefault，页面滚动行为不受影响
    window.addEventListener('touchstart', onTouchStart, { passive: true })
    window.addEventListener('touchmove', onTouchMove, { passive: true })
    window.addEventListener('touchend', onTouchEnd, { passive: true })
    window.addEventListener('touchcancel', onTouchEnd, { passive: true })
  })

  onBeforeUnmount(() => {
    clearHoldTimer()
    window.removeEventListener('touchstart', onTouchStart)
    window.removeEventListener('touchmove', onTouchMove)
    window.removeEventListener('touchend', onTouchEnd)
    window.removeEventListener('touchcancel', onTouchEnd)
  })
}
