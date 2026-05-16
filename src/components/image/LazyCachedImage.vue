<template>
  <div ref="rootRef" v-bind="rootAttrs" class="lazy-image-root">
    <img
      v-if="resolvedSrc && !showFallback"
      :key="imageElementKey"
      v-bind="imageAttrs"
      :class="['lazy-image-element', { 'lazy-image-element--hidden': showSkeleton }]"
      :src="resolvedSrc || undefined"
      :alt="alt"
      :loading="loading"
      :decoding="decoding"
      :fetchpriority="computedFetchPriority"
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
import { useImageLoader } from '@/composables/image/useImageLoader'
import { peekCachedImage } from '@/utils/image/cache'

defineOptions({ inheritAttrs: false })

const props = defineProps({
  src: { type: String, default: '' },
  alt: { type: String, default: '' },
  rootMargin: { type: String, default: '320px 0px' },
  loading: { type: String, default: 'lazy' },
  decoding: { type: String, default: 'async' },
  fetchpriority: { type: String, default: '' },
  useCache: { type: Boolean, default: true },
  lazy: { type: Boolean, default: true },
  hero: { type: Boolean, default: false }
})

const attrs = useAttrs()
const rootRef = ref(null)
const rootMarginRef = computed(() => props.rootMargin)

const {
  resolvedSrc,
  isImageReady,
  showSkeleton,
  showFallback,
  dynamicFetchPriority,
  onImageLoad,
  onImageError
} = useImageLoader(props, rootRef, { rootMargin: rootMarginRef })

const computedFetchPriority = computed(() => {
  if (props.hero) return 'high'
  if (props.fetchpriority) return props.fetchpriority
  return dynamicFetchPriority.value
})

const refreshGeneration = ref(0)
const imageElementKey = computed(() => `${props.src || 'empty'}:${refreshGeneration.value}`)

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
  return {
    ...rest,
    class: _class,
    style: _style
  }
})

// Keep the old event API for backward compatibility
let imageCacheRefreshHandler = null

onMounted(() => {
  imageCacheRefreshHandler = () => {
    refreshGeneration.value += 1
    const cached = peekCachedImage(props.src)
    if (cached) {
      resolvedSrc.value = cached
    }
  }
  window.addEventListener('goodsapp:image-cache-refresh', imageCacheRefreshHandler)
})

onBeforeUnmount(() => {
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
