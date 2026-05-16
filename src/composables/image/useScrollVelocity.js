/**
 * Composable for tracking scroll velocity and computing dynamic image loading parameters.
 *
 * Returns reactive scroll state and a dynamic rootMargin that shrinks during fast scrolling
 * to prevent wasteful image preload requests.
 */

import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

export function useScrollVelocity() {
  const velocity = ref(0)
  const isScrolling = ref(false)
  const isFlinging = ref(false)

  let lastScrollTop = 0
  let lastScrollTime = 0
  let scrollTimeout = 0
  let velocityDecayRaf = 0
  let bound = false

  function handleScroll() {
    const now = performance.now()
    const scrollTop = window.scrollY || document.documentElement.scrollTop || 0
    const elapsed = Math.max(1, now - lastScrollTime)
    const rawVelocity = Math.abs(scrollTop - lastScrollTop) / elapsed

    velocity.value = rawVelocity
    isScrolling.value = true
    isFlinging.value = rawVelocity > 2.2 || Math.abs(scrollTop - lastScrollTop) > 160

    lastScrollTop = scrollTop
    lastScrollTime = now

    clearTimeout(scrollTimeout)
    scrollTimeout = window.setTimeout(() => {
      velocity.value = 0
      isScrolling.value = false
      isFlinging.value = false
    }, 150)

    if (!velocityDecayRaf) {
      velocityDecayRaf = requestAnimationFrame(decayVelocity)
    }
  }

  function decayVelocity() {
    velocityDecayRaf = 0
    if (!isScrolling.value) return
    if (!velocityDecayRaf && velocity.value > 0) {
      velocityDecayRaf = requestAnimationFrame(decayVelocity)
    }
  }

  /**
   * Dynamic rootMargin based on scroll velocity.
   * Slow scroll = generous preload zone (600px).
   * Fast scroll = reduced zone (200px).
   * Fling = minimal zone (100px).
   */
  const dynamicRootMargin = computed(() => {
    if (!isScrolling.value) return '600px 0px'
    if (isFlinging.value) return '100px 0px'
    const v = velocity.value
    if (v < 0.5) return '600px 0px'
    if (v < 1.0) return '480px 0px'
    if (v < 1.5) return '360px 0px'
    if (v < 2.2) return '240px 0px'
    return '100px 0px'
  })

  onMounted(() => {
    if (bound) return
    window.addEventListener('scroll', handleScroll, { passive: true })
    bound = true
    lastScrollTop = window.scrollY || document.documentElement.scrollTop || 0
    lastScrollTime = performance.now()
  })

  onBeforeUnmount(() => {
    if (!bound) return
    window.removeEventListener('scroll', handleScroll)
    bound = false
    clearTimeout(scrollTimeout)
    if (velocityDecayRaf) {
      cancelAnimationFrame(velocityDecayRaf)
      velocityDecayRaf = 0
    }
  })

  return {
    velocity,
    isScrolling,
    isFlinging,
    dynamicRootMargin
  }
}
