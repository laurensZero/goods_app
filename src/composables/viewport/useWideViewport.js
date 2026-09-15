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
    isWide.value = shortSide >= minShortSide && longSide >= minLongSide
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
