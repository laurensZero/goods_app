<template>
  <div ref="rootRef" v-bind="rootAttrs" class="lazy-image-root">
    <img
      v-if="resolvedSrc && !showFallback"
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
  lazy: { type: Boolean, default: true }
})

const attrs = useAttrs()
const rootRef = ref(null)
const rootAttrs = computed(() => {
  const { class: _class, style: _style, ...rest } = attrs
  return {
    ...rest,
    class: _class,
    style: _style
  }
})
const imageAttrs = computed(() => {
  const { class: _class, style: _style, ...rest } = attrs
  // forward class and style also to the actual <img> element so callers
  // (e.g. cover-img) can style the image itself instead of only the wrapper
  return {
    ...rest,
    class: _class,
    style: _style
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
let visibilityObserver = null
let loadRequestId = 0

watch(
  [() => props.src, hasEnteredViewport],
  async ([url, isVisible]) => {
    const requestId = ++loadRequestId
    if (!url) {
      resolvedSrc.value = ''
      isImageLoading.value = false
      return
    }
    if (!isVisible) {
      resolvedSrc.value = ''
      isImageLoading.value = false
      return
    }
    const cached = peekCachedImage(url)
    if (cached) {
      resolvedSrc.value = cached
      // cached image is already available — don't show loading skeleton
      isImageLoading.value = false
      return
    }
    // start actual loading only when we will fetch
    isImageLoading.value = true
    const nextSrc = props.useCache ? await getCachedImage(url) : url
    if (requestId !== loadRequestId) return
    resolvedSrc.value = nextSrc
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
  isImageLoading.value = false
}

function onImageError() {
  hasLoadError.value = true
  isImageLoading.value = false
  resolvedSrc.value = ''
}

onMounted(() => {
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
