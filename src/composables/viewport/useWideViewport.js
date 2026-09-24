import { ref, onMounted, onBeforeUnmount } from 'vue'

/**
 * 宽屏/平板断点：仅按 CSS 像素判断，不依赖 UA。
 * 默认：短边 ≥600 且长边 ≥900 → isWide（弹层居中）；否则手机底部。
 * 手机横屏短边通常 <600，不会被误判为平板。
 */
export function useWideViewport(minShortSide = 600, minLongSide = 900) {
  const isWide = ref(false)

  function sync() {
    const w = window.innerWidth
    const h = window.innerHeight
    const shortSide = Math.min(w, h)
    const longSide = Math.max(w, h)
    let wide = shortSide >= minShortSide && longSide >= minLongSide
    // 输入法/分屏会把 innerHeight 压扁，平板长边掉下阈值后误判成手机。
    // 宽度与屏幕短边（不随软键盘变化）仍达标时维持宽屏。
    if (!wide && w >= minShortSide) {
      const screenShort = Math.min(window.screen?.width || 0, window.screen?.height || 0)
      if (screenShort >= minShortSide) wide = true
    }
    isWide.value = wide
  }

  onMounted(() => {
    sync()
    window.addEventListener('resize', sync, { passive: true })
    window.addEventListener('orientationchange', sync)
  })

  onBeforeUnmount(() => {
    window.removeEventListener('resize', sync)
    window.removeEventListener('orientationchange', sync)
  })

  if (typeof window !== 'undefined') {
    sync()
  }

  return { isWide }
}
