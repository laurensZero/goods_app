import { ref, toValue } from 'vue'
import { onBeforeRouteLeave, useRouter } from 'vue-router'
import { useDialogBackButton } from '@/composables/useDialogBackButton'
import { runWithRouteTransition } from '@/utils/routeTransition'

/**
 * 编辑页「有未保存修改时返回二次确认」。
 *
 * - NavBar @back / Android 返回键统一走 requestLeave
 * - 确认框关闭时再次返回才真正离开；确认后 markLeaveAllowed 再导航
 * - onBeforeRouteLeave 兜底浏览器返回；allowRoute 放行业务内跳转（如选关联谷子）
 */
export function useUnsavedLeaveGuard(options = {}) {
  const router = useRouter()
  const isDirty = options.isDirty
  const onLeave = typeof options.onLeave === 'function' ? options.onLeave : null
  const allowRoute = typeof options.allowRoute === 'function' ? options.allowRoute : null

  const showLeaveConfirm = ref(false)
  const allowLeave = ref(false)

  function navigateAway() {
    showLeaveConfirm.value = false
    if (onLeave) {
      onLeave()
      return
    }
    runWithRouteTransition(() => router.back(), {
      direction: 'back',
      fallbackTransitionKind: 'detail-fade'
    })
  }

  function markLeaveAllowed() {
    allowLeave.value = true
    showLeaveConfirm.value = false
  }

  function requestLeave() {
    if (allowLeave.value || !toValue(isDirty)) {
      markLeaveAllowed()
      navigateAway()
      return
    }
    showLeaveConfirm.value = true
  }

  function confirmDiscard() {
    markLeaveAllowed()
    navigateAway()
  }

  function cancelLeaveConfirm() {
    showLeaveConfirm.value = false
  }

  // 编辑页常驻拦截 Android 返回：确认框开着时只关确认框，否则走 requestLeave
  useDialogBackButton(() => {
    if (showLeaveConfirm.value) {
      showLeaveConfirm.value = false
      return
    }
    requestLeave()
  }, () => true)

  onBeforeRouteLeave((to) => {
    if (allowLeave.value) return true
    if (allowRoute && allowRoute(to)) return true
    if (!toValue(isDirty)) {
      markLeaveAllowed()
      return true
    }
    showLeaveConfirm.value = true
    return false
  })

  return {
    showLeaveConfirm,
    allowLeave,
    requestLeave,
    markLeaveAllowed,
    confirmDiscard,
    cancelLeaveConfirm
  }
}
