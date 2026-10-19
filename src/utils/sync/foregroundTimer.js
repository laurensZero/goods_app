import { Capacitor } from '@capacitor/core'
import { App as CapacitorApp } from '@capacitor/app'

/**
 * 前台感知定时器。
 *
 * Android WebView / iOS WKWebView 在 App 进入后台后会冻结 JS 定时器；回到前台时，
 * 被冻结的 setTimeout 往往会在恢复瞬间集中补跑。对超时类定时器来说，这会把
 * 「后台挂着的那段时间」也算进超时，导致一回到前台就把仍在途的请求 abort 掉，
 * 日志表现为 `AbortError: signal is aborted without reason`。
 *
 * 这里只在「App 在前台」时累计计时：进入后台暂停并扣减已用前台时间，回到前台
 * 用剩余时间重新计时。另加一次「迟到定时器」宽限，防止个别机型没派发
 * visibilitychange / appStateChange 时仍然在恢复瞬间误杀请求。
 */

// 最近一次已知的前后台状态。文档可见性 + Capacitor appStateChange 双通道更新，
// 任一通道没有触发时另一个仍能兜底。
let foreground = typeof document === 'undefined' ? true : !document.hidden
let trackingInitialized = false
const foregroundListeners = new Set()

// 定时器被系统挂起后补跑时，实际耗时通常远大于设定值。
// 超过该宽限仍判定为「迟到」，补一小段前台时间而不是立刻触发超时。
const LATE_GRACE_MS = 2000

function notifyForegroundChange() {
  for (const listener of [...foregroundListeners]) {
    try { listener(foreground) } catch { /* listener 异常不影响其它定时器 */ }
  }
}

function setForeground(next) {
  if (next === foreground) return
  foreground = next
  notifyForegroundChange()
}

function ensureForegroundTracking() {
  if (trackingInitialized) return
  trackingInitialized = true

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => setForeground(!document.hidden), { passive: true })
  }

  // 原生端 appStateChange 比 WebView visibilitychange 更可靠；Web 端不注册。
  if (Capacitor.isNativePlatform()) {
    try {
      const handle = CapacitorApp.addListener('appStateChange', ({ isActive }) => setForeground(!!isActive))
      if (handle && typeof handle.catch === 'function') handle.catch(() => {})
    } catch { /* 插件不可用时退回 document 可见性 */ }
  }
}

/** 当前是否处于前台（可见） */
export function isAppForeground() {
  ensureForegroundTracking()
  return foreground
}

function onForegroundChange(listener) {
  ensureForegroundTracking()
  foregroundListeners.add(listener)
  return () => { foregroundListeners.delete(listener) }
}

/**
 * setTimeout 的前台计时版本：后台时间不计入超时。
 *
 * @param {() => void} callback
 * @param {number} delayMs
 * @returns {{ cancel: () => void, readonly remaining: number }}
 */
export function setForegroundTimeout(callback, delayMs) {
  const total = Math.max(0, Number(delayMs) || 0)
  let remaining = total
  let armedAt = 0
  let armedFor = 0
  let timer = null
  let cancelled = false
  let unsubscribe = null

  function clearTimer() {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
  }

  function arm() {
    if (cancelled || timer !== null || remaining < 0) return
    // 后台创建/后台恢复：先不计时，等回前台再开始
    if (!foreground) return
    armedAt = Date.now()
    armedFor = remaining
    timer = setTimeout(onTimer, remaining)
  }

  function disarm() {
    if (timer === null) return
    clearTimer()
    remaining = Math.max(0, remaining - (Date.now() - armedAt))
  }

  function finish() {
    if (cancelled) return
    cancelled = true
    clearTimer()
    unsubscribe?.()
    unsubscribe = null
  }

  function onTimer() {
    timer = null
    if (cancelled) return

    // 后台期间定时器仍然补跑了（可见性事件没来得及派发）：
    // 保持剩余时间，回前台后重新计时，不在恢复瞬间误触发。
    if (!foreground) {
      arm()
      return
    }

    const elapsed = Date.now() - armedAt
    if (elapsed > armedFor + LATE_GRACE_MS) {
      // 系统休眠导致的迟到（elapsed 远大于设定时长）：
      // 补一小段前台宽限，避免「刚恢复就 abort」。
      remaining = Math.min(armedFor, LATE_GRACE_MS)
      arm()
      return
    }

    remaining = 0
    finish()
    callback()
  }

  unsubscribe = onForegroundChange(() => {
    if (cancelled) return
    if (!foreground) disarm()
    else arm()
  })
  arm()

  return {
    cancel: finish,
    get remaining() { return remaining }
  }
}
