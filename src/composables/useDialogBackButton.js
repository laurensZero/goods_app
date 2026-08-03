import { computed, onMounted, onUnmounted, toValue, watch } from 'vue'
import { APP_BACK_BUTTON_EVENT } from '@/utils/platform/androidBackButton'

/**
 * 全局弹窗 Android 返回键支持。
 *
 * 维护一个 LIFO 的 overlayStack，按注册顺序（后进先出）关闭弹窗。
 * 全局 listener 仅在 stack 非空时注册，空时自动移除。
 *
 * 两种使用模式：
 *   1. v-if 控制的弹窗（挂载=打开，卸载=关闭）— 只传 close
 *   2. prop 或 ref 始终挂载/KeepAlive 的弹窗 — 传 close + isOpened，动态注册/注销
 *
 * @example
 * // v-if 弹窗（非 KeepAlive 组件内的独立弹窗）
 * useDialogBackButton(closeDialog)
 *
 * // ref/prop 控制的弹窗（QQBindingSheet、FeedbackDialog 等）
 * useDialogBackButton(close, () => props.show)
 *
 * // KeepAlive 组件内的弹窗（必须用 isOpened 模式，因为 onMounted 只触发一次）
 * useDialogBackButton(closeDialog, showDialog)
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
 * @param {Ref|Function|boolean} [isOpened] - 弹窗是否打开的状态
 *   - 非 KeepAlive 组件内的 v-if 弹窗可不传（挂载=注册，卸载=注销）
 *   - KeepAlive 组件或 prop 控制的弹窗必须传入（动态注册/注销）
 */
export function useDialogBackButton(close, isOpened) {
  if (isOpened !== undefined) {
    // prop 控制的弹窗：动态注册/注销
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
  } else {
    // v-if 控制的弹窗：挂载时注册，卸载时注销
    onMounted(() => {
      overlayStack.push(close)
      ensureGlobalListener()
    })

    onUnmounted(() => {
      const idx = overlayStack.lastIndexOf(close)
      if (idx !== -1) overlayStack.splice(idx, 1)
      removeGlobalListenerIfNeeded()
    })
  }
}
