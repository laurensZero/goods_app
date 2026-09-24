import { Capacitor } from '@capacitor/core'
import { Haptics } from '@capacitor/haptics'

// 整体触觉统一压弱。还要再轻/再重只改这一处。
const STRENGTH = 0.25

/** 连续滑动刻度（年月条） */
export const HAPTIC_TICK = 8
/** 拖拽拿起等轻反馈 */
export const HAPTIC_LIGHT = 24
/** 长按进入多选等确认反馈 */
export const HAPTIC_MEDIUM = 48
/** 通知双短振（名义值，实际 × STRENGTH） */
export const HAPTIC_NOTICE = [48, 36, 48]

function scaleMs(ms) {
  return Math.max(1, Math.round((Number(ms) || 0) * STRENGTH))
}

function scalePattern(pattern) {
  return Array.isArray(pattern) ? pattern.map(scaleMs) : scaleMs(pattern)
}

/**
 * 统一震动入口。原生优先 Capacitor Haptics（Android WebView 的 navigator.vibrate 常不可用）。
 * @param {number|number[]} pattern 毫秒，或 [振, 停, 振…]；一律 × STRENGTH
 */
export function vibrate(pattern = HAPTIC_LIGHT) {
  const scaled = scalePattern(pattern)

  if (Capacitor.isNativePlatform()) {
    try {
      const duration = Array.isArray(scaled)
        ? scaled.filter((_, i) => i % 2 === 0).reduce((a, b) => a + b, 0)
        : scaled
      Haptics.vibrate({ duration })
      return
    } catch {
      // fall through 到 Web Vibration API
    }
  }

  try {
    navigator.vibrate?.(scaled)
  } catch {
    // ignore vibration failures
  }
}
