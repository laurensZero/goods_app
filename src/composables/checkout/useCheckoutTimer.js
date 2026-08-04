/**
 * 定时下单 composable
 * 支持设置目标时间，到点自动触发下单
 */
import { ref, computed, onUnmounted } from 'vue'

export function useCheckoutTimer(nowProvider) {
  const getNow = typeof nowProvider === 'function' ? nowProvider : () => Date.now()
  const targetTime = ref(0)
  const enabled = ref(false)
  const remaining = ref(0)
  const autoFired = ref(false)
  let rafId = 0
  let intervalId = 0

  const targetDate = computed(() => {
    if (!targetTime.value) return null
    return new Date(targetTime.value)
  })

  const formattedTarget = computed(() => {
    if (!targetDate.value) return ''
    return targetDate.value.toLocaleString('zh-CN', {
      timeZone: 'Asia/Shanghai',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  })

  const remainingText = computed(() => {
    if (remaining.value <= 0) return ''
    const sec = Math.ceil(remaining.value / 1000)
    const h = Math.floor(sec / 3600)
    const m = Math.floor((sec % 3600) / 60)
    const s = sec % 60
    if (h > 0) return `${h}时${m}分${s}秒`
    if (m > 0) return `${m}分${s}秒`
    return `${s}秒`
  })

  const isReady = computed(() => enabled.value && targetTime.value > 0 && remaining.value <= 0)

  let onFireCallback = null

  function startWatching(callback) {
    stopWatching()
    onFireCallback = callback
    const update = () => {
      if (!enabled.value || !targetTime.value) return
      const now = getNow()
      remaining.value = targetTime.value - now
      if (remaining.value <= 0 && !autoFired.value) {
        autoFired.value = true
        onFireCallback?.()
      }
    }
    update()
    intervalId = setInterval(update, 200)
    rafId = requestAnimationFrame(function tick() {
      update()
      if (!autoFired.value) rafId = requestAnimationFrame(tick)
    })
  }

  function stopWatching() {
    if (intervalId) clearInterval(intervalId)
    if (rafId) cancelAnimationFrame(rafId)
    intervalId = 0
    rafId = 0
    onFireCallback = null
  }

  function setTargetTime(timestamp) {
    targetTime.value = timestamp
    autoFired.value = false
    remaining.value = Math.max(0, timestamp - getNow())
  }

  function setEnabled(val) {
    enabled.value = val
    if (!val) stopWatching()
  }

  function reset() {
    stopWatching()
    targetTime.value = 0
    enabled.value = false
    remaining.value = 0
    autoFired.value = false
  }

  onUnmounted(stopWatching)

  return {
    targetTime,
    enabled,
    remaining,
    remainingText,
    targetDate,
    formattedTarget,
    isReady,
    autoFired,
    setTargetTime,
    setEnabled,
    startWatching,
    stopWatching,
    reset,
  }
}
