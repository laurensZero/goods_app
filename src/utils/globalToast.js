/**
 * 全局 Toast 单例 — 用于 main.js / store 等非组件上下文。
 * 组件内请优先使用 useToast() composable。
 *
 * 用法：
 *   import { showGlobalToast, globalToastMsg } from '@/utils/globalToast'
 *   showGlobalToast('消息内容')
 *
 * App.vue 中渲染：<AppToast :message="globalToastMsg" />
 */
import { ref } from 'vue'

export const globalToastMsg = ref('')

let toastTimer = null
let lastToastText = ''
let lastToastAt = 0

export function showGlobalToast(message, duration = 2600) {
  const nextMessage = String(message || '').trim()
  if (!nextMessage) return
  const now = Date.now()
  if (nextMessage === lastToastText && now - lastToastAt < 1200) return
  lastToastText = nextMessage
  lastToastAt = now
  globalToastMsg.value = nextMessage
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { globalToastMsg.value = '' }, duration)
}
