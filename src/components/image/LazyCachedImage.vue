<template>
  <div ref="rootRef" v-bind="rootAttrs" class="lazy-image-root">
    <img
      v-if="resolvedSrc && !showFallback"
      :key="imageRenderKey"
      v-bind="imageAttrs"
      :class="['lazy-image-element', { 'lazy-image-element--hidden': showSkeleton }]"
      :src="resolvedSrc || undefined"
      :alt="alt"
      :loading="loading"
      :decoding="decoding"
      :fetchpriority="fetchpriority"
      @load="onImageLoad"
      @error="onImageError"
    />
    <div
      v-if="showSkeleton"
      class="lazy-image-skeleton lazy-image-layer"
      role="status"
      aria-live="polite"
      aria-label="图片加载中"
    />
    <div
      v-if="showFallback"
      class="lazy-image-fallback lazy-image-layer"
      role="img"
      :aria-label="alt || '图片加载失败'"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M5.5 6.5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2h-13Zm0 1.5h13a.5.5 0 0 1 .5.5v4.28l-2.9-2.47a1.1 1.1 0 0 0-1.42.02l-2.37 2.11-1.66-1.36a1.1 1.1 0 0 0-1.42.04L5 14.87V8.5a.5.5 0 0 1 .5-.5Zm2.9 2.35a1.05 1.05 0 1 0 0-2.1 1.05 1.05 0 0 0 0 2.1Z"
        />
      </svg>
      <span>加载失败</span>
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, useAttrs, watch } from 'vue'
import { getCachedImage, markImageDecoded, peekCachedImage, refreshCachedImage } from '@/utils/image/cache'

defineOptions({ inheritAttrs: false })

const props = defineProps({
  src: { type: String, default: '' },
  alt: { type: String, default: '' },
  rootMargin: { type: String, default: '720px 0px' },
  loading: { type: String, default: 'lazy' },
  decoding: { type: String, default: 'async' },
  fetchpriority: { type: String, default: 'low' },
  useCache: { type: Boolean, default: true },
  lazy: { type: Boolean, default: true },
  skeletonEnabled: { type: Boolean, default: true },
  skeletonDelayMs: { type: Number, default: 0 },
  imageAttrs: { type: Object, default: () => ({}) }
})

const attrs = useAttrs()
const rootRef = ref(null)
const rootAttrs = computed(() => {
  const { class: _class, style: _style, ...rest } = attrs
  return {
    ...rest,
    class: _class,
    style: _style,
    'data-lazy-image-ready': isImageReady.value ? 'true' : 'false'
  }
})
const imageAttrs = computed(() => {
  const { class: _class, style: _style, ...rest } = attrs
  const { class: imageClass, style: imageStyle, ...imageRest } = props.imageAttrs || {}
  return {
    ...rest,
    ...imageRest,
    class: [_class, imageClass],
    style: [_style, imageStyle]
  }
})
const resolvedSrc = ref('')
const imageRenderKey = ref(0)
const hasEnteredViewport = ref(false)
const hasLoadError = ref(false)
const isImageLoading = ref(false)
const isSkeletonReady = ref(Number(props.skeletonDelayMs || 0) <= 0)
const showSkeleton = computed(() => {
  return !!props.src && props.skeletonEnabled && hasEnteredViewport.value && !showFallback.value && isImageLoading.value && isSkeletonReady.value
})
const showFallback = computed(() => !!props.src && hasLoadError.value)
const isImageReady = computed(() => !!resolvedSrc.value && !showFallback.value && !isImageLoading.value)

let visibilityObserver = null
let imageCacheRefreshHandler = null
let loadRequestId = 0
let skeletonDelayTimer = null

function forceRebuildImageElement() {
  imageRenderKey.value += 1
}

function clearSkeletonDelayTimer() {
  if (skeletonDelayTimer != null) {
    window.clearTimeout(skeletonDelayTimer)
    skeletonDelayTimer = null
  }
}

function resetSkeletonVisibility() {
  clearSkeletonDelayTimer()
  const delayMs = Math.max(0, Number(props.skeletonDelayMs || 0))
  if (delayMs <= 0) {
    isSkeletonReady.value = true
    return
  }
  isSkeletonReady.value = false
  skeletonDelayTimer = window.setTimeout(() => {
    isSkeletonReady.value = true
    skeletonDelayTimer = null
  }, delayMs)
}

async function waitForImgDecode(src, timeoutMs = 400) {
  if (!src || typeof window === 'undefined') return false
  try {
    const img = new Image()
    img.decoding = 'async'
    img.src = src
    if (img.complete && img.naturalWidth > 0 && img.naturalHeight > 0) {
      if (typeof img.decode === 'function') await img.decode().catch(() => {})
      return true
    }
    return await new Promise((resolve) => {
      let done = false
      const onDone = (ok) => {
        if (done) return
        done = true
        clearTimeout(timer)
        resolve(ok)
      }
      const onLoad = () => {
        if (typeof img.decode === 'function') {
          img.decode().then(() => onDone(true)).catch(() => onDone(true))
        } else {
          onDone(true)
        }
      }
      const onError = () => onDone(false)
      const timer = setTimeout(() => onDone(false), Math.max(50, timeoutMs))
      img.addEventListener('load', onLoad, { once: true })
      img.addEventListener('error', onError, { once: true })
    })
  } catch {
    return false
  }
}

async function ensureCachedImageReady(src, requestId, timeoutMs = 220) {
  if (!src) return false
  isImageLoading.value = true
  const ok = await waitForImgDecode(src, timeoutMs)
  if (requestId !== loadRequestId) return false
  isImageLoading.value = !ok
  if (ok) {
    markImageDecoded(src)
  }
  return ok
}

function getViewportDistance() {
  const el = rootRef.value
  if (!el) return Infinity
  const rect = el.getBoundingClientRect()
  const elCenter = rect.top + rect.height / 2
  const vpCenter = window.innerHeight / 2
  return Math.abs(elCenter - vpCenter)
}

watch(
  [() => props.src, hasEnteredViewport],
  async ([url, isVisible]) => {
    const requestId = ++loadRequestId
    if (!url) {
      resolvedSrc.value = ''
      hasLoadError.value = false
      isImageLoading.value = false
      resetSkeletonVisibility()
      return
    }
    if (!isVisible) {
      resolvedSrc.value = ''
      hasLoadError.value = false
      isImageLoading.value = false
      resetSkeletonVisibility()
      return
    }
    hasLoadError.value = false
    const cached = peekCachedImage(url)
    if (cached) {
      resolvedSrc.value = cached
      resetSkeletonVisibility()
      isImageLoading.value = false
      return
    }
    resolvedSrc.value = ''
    isImageLoading.value = true
    resetSkeletonVisibility()
    const nextSrc = props.useCache
      ? await getCachedImage(url, { viewportDistance: getViewportDistance() })
      : url
    if (requestId !== loadRequestId) return
    resolvedSrc.value = nextSrc
    const ok = await waitForImgDecode(nextSrc)
    if (requestId !== loadRequestId) return
    isImageLoading.value = !ok
    if (ok) markImageDecoded(nextSrc)
  },
  { immediate: true }
)

watch(
  () => props.src,
  () => {
    hasLoadError.value = false
  },
  { immediate: true }
)

function onImageLoad() {
  hasLoadError.value = false
  isImageLoading.value = false
  if (resolvedSrc.value) markImageDecoded(resolvedSrc.value)
}

function onImageError() {
  hasLoadError.value = true
  isImageLoading.value = false
  resolvedSrc.value = ''
}

onMounted(() => {
  // Listen for cache refresh signals (e.g. app resume). For hero images we
  // attempt offscreen decode + crossfade to avoid remount flashes.
  imageCacheRefreshHandler = (event) => {
    const reason = String(event?.detail?.reason || '')
    const requestId = ++loadRequestId

    if (!props.src || !hasEnteredViewport.value) return
    if (reason !== 'resume') return

    const rootEl = rootRef.value
    const isHero = !!(rootEl && typeof rootEl.closest === 'function' && rootEl.closest('[data-goods-hero-id]'))
    if (!isHero) return

    // schedule on next frame to avoid blocking mount
    const scheduleReload = typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function'
      ? window.requestAnimationFrame.bind(window)
      : (cb) => window.setTimeout(cb, 0)

    hasLoadError.value = false
    isImageLoading.value = true
    resetSkeletonVisibility()

    scheduleReload(() => {
      void (async () => {
        if (requestId !== loadRequestId) return
        const freshSrc = await refreshCachedImage(props.src).catch(() => peekCachedImage(props.src) || resolvedSrc.value || props.src)
        if (requestId !== loadRequestId) return

        // Pre-decode offscreen
        const off = new Image()
        off.decoding = 'async'
        off.src = freshSrc
        let decoded = false
        try {
          if (typeof off.decode === 'function') await off.decode()
          else if (off.complete && off.naturalWidth > 0) {}
          decoded = true
        } catch {}
        if (requestId !== loadRequestId) return

        if (decoded && rootEl) {
          const overlay = document.createElement('div')
          overlay.style.position = 'absolute'
          overlay.style.inset = '0'
          overlay.style.backgroundSize = 'cover'
          overlay.style.backgroundPosition = 'center'
          overlay.style.backgroundRepeat = 'no-repeat'
          overlay.style.backgroundImage = `url(${freshSrc})`
          overlay.style.opacity = '0'
          overlay.style.transition = 'opacity 220ms ease'
          overlay.style.pointerEvents = 'none'
          rootEl.appendChild(overlay)
          // force reflow
          // eslint-disable-next-line no-unused-expressions
          overlay.offsetHeight
          overlay.style.opacity = '1'

          const cleanup = () => { try { overlay.remove() } catch {} }
          const onEnd = () => {
            overlay.removeEventListener('transitionend', onEnd)
            if (requestId !== loadRequestId) { cleanup(); return }
            resolvedSrc.value = freshSrc
            if (decoded) markImageDecoded(freshSrc)
            isImageLoading.value = false
            setTimeout(cleanup, 32)
          }
          overlay.addEventListener('transitionend', onEnd)
          setTimeout(() => { if (overlay.parentNode) onEnd() }, 400)
          return
        }

        // Fallback: assign directly and try ensure decode
        resolvedSrc.value = freshSrc
        const ok = await ensureCachedImageReady(freshSrc, requestId, 260)
        if (requestId !== loadRequestId) return
        isImageLoading.value = !ok
        if (ok) markImageDecoded(freshSrc)
      })()
    })
  }

  window.addEventListener('goodsapp:image-cache-refresh', imageCacheRefreshHandler)

  if (!props.lazy) {
    hasEnteredViewport.value = true
    return
  }

  if (typeof IntersectionObserver === 'undefined') {
    hasEnteredViewport.value = true
    return
  }

  visibilityObserver = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        hasEnteredViewport.value = true
        visibilityObserver?.disconnect()
        visibilityObserver = null
      }
    },
    { rootMargin: props.rootMargin }
  )

  if (rootRef.value) visibilityObserver.observe(rootRef.value)
})

onBeforeUnmount(() => {
  visibilityObserver?.disconnect()
  visibilityObserver = null
  if (imageCacheRefreshHandler) {
    window.removeEventListener('goodsapp:image-cache-refresh', imageCacheRefreshHandler)
    imageCacheRefreshHandler = null
  }
  clearSkeletonDelayTimer()
})
</script>

<style scoped>
.lazy-image-root {
  position: relative;
  display: block;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.lazy-image-layer {
  position: absolute;
  inset: 0;
}

.lazy-image-element {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center;
  border-radius: inherit;
}

/* When wrapper receives utility classes like `cover-img`, forward
   display behavior to the actual <img> so callers can control
   object-fit via wrapper class without reaching into the child. */
.lazy-image-root.cover-img .lazy-image-element {
  object-fit: cover;
  object-position: center;
  border-radius: inherit;
}

.lazy-image-element--hidden {
  opacity: 0;
}

.lazy-image-skeleton {
  position: absolute;
  inset: 0;
  background: var(--app-surface-soft);
  border-radius: inherit;
  pointer-events: none;
}

.lazy-image-fallback {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  background: var(--app-surface-soft);
  color: var(--app-text-tertiary);
  border-radius: inherit;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  pointer-events: none;
}

.lazy-image-fallback svg {
  width: 28px;
  height: 28px;
  fill: currentColor;
  opacity: 0.72;
}

.lazy-image-fallback span {
  font-size: 12px;
  font-weight: 600;
  line-height: 1.2;
  letter-spacing: -0.01em;
}

:global(html.theme-dark) .lazy-image-fallback {
  border-color: var(--app-glass-border);
}

:global(html.theme-dark) .lazy-image-placeholder {
  border-color: var(--app-glass-border);
}

/* removed shimmer and spin animations for performance */
</style>
