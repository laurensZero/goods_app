import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

const TABLET_MIN_SHORT_SIDE = 600
const TABLET_MIN_LONG_SIDE = 900

export function useTabletViewport() {
  const viewportWidth = ref(typeof window === 'undefined' ? 0 : window.innerWidth)
  const viewportHeight = ref(typeof window === 'undefined' ? 0 : window.innerHeight)

  const isTabletViewport = computed(() => {
    const width = viewportWidth.value || 0
    const height = viewportHeight.value || 0
    const shortSide = Math.min(width, height)
    const longSide = Math.max(width, height)
    const isMobileDevice = typeof navigator !== 'undefined'
      ? (navigator.userAgentData?.mobile ?? /Mobile|iPhone|iPod|Windows Phone/i.test(navigator.userAgent || ''))
      : false

    if (isMobileDevice) {
      return false
    }

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
