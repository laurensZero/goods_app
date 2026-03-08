import { onActivated, onBeforeUnmount, onMounted, ref } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'

export function usePageLeaveAnimation(duration = 180) {
  const isPageLeaving = ref(false)
  let leaveTimer = 0

  function resetLeaving() {
    isPageLeaving.value = false

    if (leaveTimer) {
      window.clearTimeout(leaveTimer)
      leaveTimer = 0
    }
  }

  onBeforeRouteLeave((to, from, next) => {
    if (isPageLeaving.value) {
      next()
      return
    }

    isPageLeaving.value = true
    leaveTimer = window.setTimeout(() => {
      leaveTimer = 0
      next()
    }, duration)
  })

  onMounted(resetLeaving)
  onActivated(resetLeaving)
  onBeforeUnmount(resetLeaving)

  return { isPageLeaving }
}
