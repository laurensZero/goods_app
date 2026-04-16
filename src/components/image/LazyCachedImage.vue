<template>
  <img
    v-if="!showFallback"
    ref="imageRef"
    v-bind="attrs"
    :class="{ 'lazy-image-element--hidden': showLoadingPlaceholder }"
    :src="resolvedSrc || undefined"
    :alt="alt"
    :loading="loading"
    :decoding="decoding"
    :fetchpriority="fetchpriority"
    @load="onImageLoad"
    @error="onImageError"
  />
  <div
    v-if="showLoadingPlaceholder"
    v-bind="attrs"
    class="lazy-image-placeholder"
    role="status"
    aria-live="polite"
    aria-label="图片加载中"
  >
    <span class="lazy-image-placeholder__dot" aria-hidden="true" />
    <span>加载中</span>
  </div>
  <div
    v-if="showFallback"
    v-bind="attrs"
    class="lazy-image-fallback"
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
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, useAttrs, watch } from 'vue'
import { getCachedImage, peekCachedImage } from '@/utils/imageCache'

defineOptions({ inheritAttrs: false })

const props = defineProps({
  src: { type: String, default: '' },
  alt: { type: String, default: '' },
  rootMargin: { type: String, default: '180px 0px' },
  loading: { type: String, default: 'lazy' },
  decoding: { type: String, default: 'async' },
  fetchpriority: { type: String, default: 'low' },
  useCache: { type: Boolean, default: true },
  lazy: { type: Boolean, default: true }
})

const attrs = useAttrs()
const imageRef = ref(null)
const resolvedSrc = ref('')
const hasEnteredViewport = ref(false)
const hasLoadError = ref(false)
const isImageLoading = ref(false)
const showLoadingPlaceholder = computed(() => {
  return !!props.src && !showFallback.value && (!resolvedSrc.value || isImageLoading.value)
})
const showFallback = computed(() => !!props.src && hasLoadError.value)
let visibilityObserver = null

watch(
  [() => props.src, hasEnteredViewport],
  async ([url, isVisible]) => {
    if (!url) {
      resolvedSrc.value = ''
      isImageLoading.value = false
      return
    }
    const cached = peekCachedImage(url)
    if (cached) {
      isImageLoading.value = true
      resolvedSrc.value = cached
      return
    }
    if (!isVisible) {
      resolvedSrc.value = ''
      isImageLoading.value = true
      return
    }
    isImageLoading.value = true
    resolvedSrc.value = props.useCache ? await getCachedImage(url) : url
  },
  { immediate: true }
)

watch(
  () => props.src,
  () => {
    hasLoadError.value = false
    isImageLoading.value = !!props.src
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
}

onMounted(() => {
  if (!props.lazy) {
    hasEnteredViewport.value = true
    return
  }

  const cached = peekCachedImage(props.src)
  if (cached) {
    resolvedSrc.value = cached
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

  if (imageRef.value) visibilityObserver.observe(imageRef.value)
})

onBeforeUnmount(() => {
  visibilityObserver?.disconnect()
  visibilityObserver = null
})
</script>

<style scoped>
.lazy-image-fallback {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  background:
    radial-gradient(120% 95% at 0% 0%, var(--app-glass), transparent 62%),
    linear-gradient(145deg, var(--app-surface-soft), var(--app-surface-muted));
  color: var(--app-text-tertiary);
  border: 1px solid var(--app-glass-border);
  border-radius: inherit;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.lazy-image-element--hidden {
  opacity: 0;
}

.lazy-image-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  background:
    radial-gradient(120% 95% at 0% 0%, var(--app-glass), transparent 62%),
    linear-gradient(145deg, var(--app-surface-soft), var(--app-surface-muted));
  color: var(--app-text-tertiary);
  border: 1px solid var(--app-glass-border);
  border-radius: inherit;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.lazy-image-placeholder__dot {
  width: 18px;
  height: 18px;
  border-radius: 999px;
  border: 2px solid var(--app-glass-border);
  border-top-color: var(--app-text-tertiary);
  animation: lazy-image-spin 1s linear infinite;
}

.lazy-image-placeholder span {
  font-size: 12px;
  font-weight: 600;
  line-height: 1.2;
  letter-spacing: -0.01em;
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

@keyframes lazy-image-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .lazy-image-placeholder__dot {
    animation: none;
  }
}
</style>
