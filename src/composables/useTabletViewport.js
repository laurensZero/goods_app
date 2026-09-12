import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

// 纯像素断点（不用 UA）：短边 ≥600 且长边 ≥900 视为平板/宽屏，弹层居中；否则手机底部。
// 手机横屏短边通常 <600，不会被误判成平板。
const TABLET_MIN_SHORT_SIDE = 600
const TABLET_MIN_LONG_SIDE = 900

export function useTabletViewport() {
  const viewportWidth = ref(typeof window === 'undefined' ? 0 : window.innerWidth)
  const viewportHeight = ref(typeof window === 'undefined' ? 0 : window.innerHeight)

  const isTabletViewport = computed(() => {
    const width = viewportWidth.value || 0
    const height = viewportHeight.value || 0
    if (!width || !height) return false
    const shortSide = Math.min(width, height)
    const longSide = Math.max(width, height)
    return shortSide >= TABLET_MIN_SHORT_SIDE && longSide >= TABLET_MIN_LONG_SIDE
  })

  function updateViewport() {
    viewportWidth.value = window.innerWidth
    viewportHeight.value = window.innerHeight
  }

  onMounted(() => {
    updateViewport()
    window.addEventListener('resize', updateViewport, { passive: true })
    window.addEventListener('orientationchange', updateViewport)
  })

  onBeforeUnmount(() => {
    window.removeEventListener('resize', updateViewport)
    window.removeEventListener('orientationchange', updateViewport)
  })

  return {
    viewportWidth,
    viewportHeight,
    isTabletViewport,
    updateViewport
  }
}
