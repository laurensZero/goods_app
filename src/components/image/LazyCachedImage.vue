<template>
  <div ref="rootRef" v-bind="rootAttrs" class="lazy-image-root">
    <img
      v-if="resolvedSrc && !showFallback"
      ref="imageRef"
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
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useAttrs, watch } from 'vue'
import { getCachedImage, peekCachedImage } from '@/utils/image/cache'

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
  imageAttrs: { type: Object, default: () => ({}) }
})

const attrs = useAttrs()
const rootRef = ref(null)
const imageRef = ref(null)
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
  // forward class and style also to the actual <img> element so callers
  // (e.g. cover-img) can style the image itself instead of only the wrapper
  return {
    ...rest,
    ...imageRest,
    class: [_class, imageClass],
    style: [_style, imageStyle]
  }
})
const resolvedSrc = ref('')
const hasEnteredViewport = ref(false)
const hasLoadError = ref(false)
const isImageLoading = ref(false)
const showSkeleton = computed(() => {
  return !!props.src && hasEnteredViewport.value && !showFallback.value && isImageLoading.value
})
const showFallback = computed(() => !!props.src && hasLoadError.value)
const isImageReady = computed(() => !!resolvedSrc.value && !showFallback.value && !isImageLoading.value)
let visibilityObserver = null
let loadRequestId = 0
let imageCacheRefreshHandler = null

async function settleImageReady(requestId) {
  await nextTick()
  if (requestId !== loadRequestId) return

  const img = imageRef.value
  if (!img) return

  if (typeof img.decode === 'function') {
    try {
      await img.decode()
    } catch (error) {
      if (requestId !== loadRequestId) return
      if (img.naturalWidth <= 0 || img.naturalHeight <= 0) return
    }
  } else if (!img.complete) {
    await new Promise((resolve) => {
      const finish = () => resolve()
      img.addEventListener('load', finish, { once: true })
      img.addEventListener('error', finish, { once: true })
    })
  }

  if (requestId !== loadRequestId) return
  if (img.naturalWidth > 0 && img.naturalHeight > 0) {
    isImageLoading.value = false
  }
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
      return
    }
    if (!isVisible) {
      resolvedSrc.value = ''
      hasLoadError.value = false
      isImageLoading.value = false
      return
    }
    hasLoadError.value = false
    resolvedSrc.value = ''
    isImageLoading.value = true
    const cached = peekCachedImage(url)
    if (cached) {
      if (requestId !== loadRequestId) return
      resolvedSrc.value = cached
      void settleImageReady(requestId)
      return
    }
    const nextSrc = props.useCache
      ? await getCachedImage(url, { viewportDistance: getViewportDistance() })
      : url
    if (requestId !== loadRequestId) return
    resolvedSrc.value = nextSrc
    void settleImageReady(requestId)
  },
  { immediate: true }
)

watch(
  () => props.src,
  () => {
    hasLoadError.value = false
    // do not change isImageLoading here; loading is driven by the
    // [props.src, hasEnteredViewport] watcher to avoid redundant updates
  },
  { immediate: true }
)

function onImageLoad() {
  hasLoadError.value = false
  void settleImageReady(loadRequestId)
}

function onImageError() {
  hasLoadError.value = true
  isImageLoading.value = false
  resolvedSrc.value = ''
}

onMounted(() => {
  imageCacheRefreshHandler = () => {
    const requestId = ++loadRequestId
    resolvedSrc.value = ''
    hasLoadError.value = false
    isImageLoading.value = false
    if (props.src && hasEnteredViewport.value) {
      void Promise.resolve().then(() => {
        if (requestId !== loadRequestId) return
        if (props.src && hasEnteredViewport.value) {
          const cached = peekCachedImage(props.src)
          if (cached) {
            if (requestId !== loadRequestId) return
            resolvedSrc.value = cached
            void settleImageReady(requestId)
            return
          }
          isImageLoading.value = true
          const loadPromise = props.useCache
            ? getCachedImage(props.src, { viewportDistance: getViewportDistance() })
            : Promise.resolve(props.src)
          void loadPromise.then((nextSrc) => {
            if (requestId !== loadRequestId) return
            if (!props.src || !hasEnteredViewport.value) return
            resolvedSrc.value = nextSrc
            void settleImageReady(requestId)
          }).catch(() => {
            if (requestId !== loadRequestId) return
            if (!props.src || !hasEnteredViewport.value) return
            resolvedSrc.value = props.src
            void settleImageReady(requestId)
          })
        }
      })
    }
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
