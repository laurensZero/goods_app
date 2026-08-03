import { computed, onMounted, onUnmounted, toValue, watch } from 'vue'
import { APP_BACK_BUTTON_EVENT } from '@/utils/platform/androidBackButton'

/**
 * 全局弹窗 Android 返回键支持。
 *
 * 维护一个 LIFO 的 overlayStack，按注册顺序（后进先出）关闭弹窗。
 * 全局 listener 仅在 stack 非空时注册，空时自动移除。
 *
 * 所有弹窗统一使用 isOpened 模式：
 *   useDialogBackButton(closeFn, isOpened)
 *
 * @example
 * // ref 控制（MyView 内联弹窗）
 * useDialogBackButton(closeBudgetDialog, showBudgetDialog)
 *
 * // prop 控制（子组件）
 * useDialogBackButton(close, () => props.show)
 *
 * // store 控制（全局弹窗）
 * useDialogBackButton(() => store.dismiss(), () => store.dialogVisible)
 */

const overlayStack = []

let globalListener = null

function ensureGlobalListener() {
  if (globalListener) return
  globalListener = (event) => {
    if (overlayStack.length > 0) {
      overlayStack[overlayStack.length - 1]()
      event.preventDefault()
    }
  }
  window.addEventListener(APP_BACK_BUTTON_EVENT, globalListener)
}

function removeGlobalListenerIfNeeded() {
  if (overlayStack.length > 0 || !globalListener) return
  window.removeEventListener(APP_BACK_BUTTON_EVENT, globalListener)
  globalListener = null
}

export function hasOverlays() {
  return overlayStack.length > 0
}

/**
 * 注册弹窗的 Android 返回键关闭行为。
 * @param {Function} close - 关闭弹窗的回调
 * @param {Ref|Function|boolean} isOpened - 弹窗是否打开的状态（ref / getter / boolean）
 */
export function useDialogBackButton(close, isOpened) {
  const openRef = computed(() => !!toValue(isOpened))

  onMounted(() => {
    watch(openRef, (open) => {
      const idx = overlayStack.lastIndexOf(close)
      if (open && idx === -1) {
        overlayStack.push(close)
        ensureGlobalListener()
      } else if (!open && idx !== -1) {
        overlayStack.splice(idx, 1)
        removeGlobalListenerIfNeeded()
      }
    }, { immediate: true })
  })

  onUnmounted(() => {
    const idx = overlayStack.lastIndexOf(close)
    if (idx !== -1) overlayStack.splice(idx, 1)
    removeGlobalListenerIfNeeded()
  })
}
