import { onBeforeUnmount, ref } from 'vue'

const DEFAULT_LONG_PRESS_MS = 500
const TOUCH_MOVE_THRESHOLD = 12
const MOUSE_MOVE_THRESHOLD = 6

// 点击 + 长按手势（与 EventCard 行为一致）：长按触发震动并进入多选，滑动取消。
export function useEventCardPress(callbacks, options = {}) {
  const longPressMs = options.longPressMs || DEFAULT_LONG_PRESS_MS

  const startX = ref(0)
  const startY = ref(0)
  const gestureMoved = ref(false)
  const longPressTriggered = ref(false)
  let longPressTimer = 0
  let tracking = false

  function fireLongPress() {
    longPressTimer = 0
    longPressTriggered.value = true
    try {
      navigator.vibrate?.(50)
    } catch {
      // ignore vibration failures
    }
    callbacks.onLongPress?.()
  }

  function startPress(x, y) {
    startX.value = x
    startY.value = y
    gestureMoved.value = false
    longPressTriggered.value = false
    tracking = true
    cancelLongPress()
    longPressTimer = window.setTimeout(fireLongPress, longPressMs)
  }

  function cancelLongPress() {
    if (!longPressTimer) return
    window.clearTimeout(longPressTimer)
    longPressTimer = 0
  }

  function markMoved(dx, dy, threshold) {
    if (!tracking) return
    if (Math.abs(dx) > threshold || Math.abs(dy) > threshold) {
      gestureMoved.value = true
      cancelLongPress()
    }
  }

  function handleTap() {
    if (callbacks.onTap) callbacks.onTap()
  }

  return {
    gestureMoved,
    longPressTriggered,
    onTouchStart(event) {
      const touch = event.touches[0]
      startPress(touch.clientX, touch.clientY)
    },
    onTouchMove(event) {
      const touch = event.touches[0]
      markMoved(touch.clientX - startX.value, touch.clientY - startY.value, TOUCH_MOVE_THRESHOLD)
    },
    onTouchEnd(event) {
      event.preventDefault()
      cancelLongPress()
      tracking = false
      if (longPressTriggered.value || gestureMoved.value) return
      handleTap()
    },
    onTouchCancel() {
      gestureMoved.value = true
      cancelLongPress()
      tracking = false
    },
    onMouseDown(event) {
      if (event.button !== 0) return
      startPress(event.clientX, event.clientY)
    },
    onMouseMove(event) {
      markMoved(event.clientX - startX.value, event.clientY - startY.value, MOUSE_MOVE_THRESHOLD)
    },
    onMouseUp(event) {
      if (event.button !== 0) return
      cancelLongPress()
      tracking = false
      if (!longPressTriggered.value && !gestureMoved.value) handleTap()
    },
    onMouseLeave() {
      gestureMoved.value = true
      cancelLongPress()
      tracking = false
    },
    dispose() {
      cancelLongPress()
      tracking = false
    }
  }
}

export function bindEventCardPress(press) {
  onBeforeUnmount(() => press.dispose())
}
