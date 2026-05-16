/**
 * Composable for viewport-priority image loading.
 *
 * Key improvements over old LazyCachedImage:
 * 1. Observer stays alive — supports virtual list reuse and keepAlive
 * 2. Root element re-entry re-triggers load at viewport priority
 * 3. Uses getCachedImage with viewport/preload priority (existing dual-queue)
 * 4. Dynamic fetchpriority based on viewport position
 */

import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { peekCachedImage, getCachedImage } from '@/utils/image/cache'

export function useImageLoader(props, rootRef, options = {}) {
  const { rootMargin = ref('320px 0px') } = options

  const resolvedSrc = ref('')
  const hasEnteredViewport = ref(false)
  const hasLoadError = ref(false)
  const isImageLoading = ref(false)
  let observer = null
  let loadRequestId = 0

  const showSkeleton = computed(() =>
    !!props.src && hasEnteredViewport.value && !hasLoadError.value && isImageLoading.value
  )

  const showFallback = computed(() => !!props.src && hasLoadError.value)
  const isImageReady = computed(() => !!resolvedSrc.value && !hasLoadError.value && !isImageLoading.value)

  const dynamicFetchPriority = computed(() => {
    if (!props.src || !hasEnteredViewport.value) return 'low'
    if (isImageLoading.value) return 'auto'
    return 'low'
  })

  // --- Core loading ---

  function startLoad(url) {
    if (!url) return
    const reqId = ++loadRequestId

    const cached = peekCachedImage(url)
    if (cached) {
      if (reqId !== loadRequestId) return
      resolvedSrc.value = cached
      isImageLoading.value = false
      hasLoadError.value = false
      return
    }

    hasLoadError.value = false
    isImageLoading.value = true

    // Use getCachedImage directly — it has viewport/preload dual queues
    // and concurrency control already built in.
    const priority = hasEnteredViewport.value ? 'viewport' : 'preload'
    getCachedImage(url, { priority }).then((result) => {
      if (reqId !== loadRequestId) return
      if (!props.src) return
      resolvedSrc.value = result || ''
      isImageLoading.value = false
      if (!result) hasLoadError.value = true
    }).catch(() => {
      if (reqId !== loadRequestId) return
      isImageLoading.value = false
      hasLoadError.value = true
    })
  }

  // --- Observer ---

  function createObserver() {
    if (observer) {
      observer.disconnect()
      observer = null
    }
    if (typeof IntersectionObserver === 'undefined') {
      hasEnteredViewport.value = true
      startLoad(props.src)
      return
    }

    const currentMargin = typeof rootMargin === 'object' && rootMargin?.value !== undefined
      ? rootMargin.value
      : (typeof rootMargin === 'string' ? rootMargin : '320px 0px')

    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            hasEnteredViewport.value = true
            if (props.src) startLoad(props.src)
          }
          // Don't disconnect — keep observer alive for virtual list reuse
        }
      },
      { rootMargin: currentMargin }
    )

    if (rootRef.value) {
      observer.observe(rootRef.value)
    }
  }

  // --- Watchers ---

  watch(rootMargin, () => {
    nextTick(createObserver)
  })

  watch(
    () => props.src,
    (url) => {
      if (!url) {
        resolvedSrc.value = ''
        hasLoadError.value = false
        isImageLoading.value = false
        return
      }
      // If already in viewport, load immediately; otherwise observer will trigger
      if (hasEnteredViewport.value) {
        loadRequestId++
        startLoad(url)
      }
    },
    { immediate: true }
  )

  // --- Lifecycle ---

  onMounted(() => {
    if (!props.lazy) {
      hasEnteredViewport.value = true
      if (props.src) startLoad(props.src)
      return
    }
    createObserver()
  })

  onBeforeUnmount(() => {
    if (observer) {
      observer.disconnect()
      observer = null
    }
    loadRequestId++
  })

  function onImageLoad() {
    hasLoadError.value = false
    isImageLoading.value = false
  }

  function onImageError() {
    hasLoadError.value = true
    isImageLoading.value = false
    resolvedSrc.value = ''
  }

  return {
    resolvedSrc,
    hasEnteredViewport,
    hasLoadError,
    isImageLoading,
    showSkeleton,
    showFallback,
    isImageReady,
    dynamicFetchPriority,
    onImageLoad,
    onImageError
  }
}
