<template>
  <img
    ref="imageRef"
    v-bind="attrs"
    :src="resolvedSrc || undefined"
    :alt="alt"
    :loading="loading"
    :decoding="decoding"
    :fetchpriority="fetchpriority"
  />
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref, useAttrs, watch } from 'vue'
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
let visibilityObserver = null

watch(
  [() => props.src, hasEnteredViewport],
  async ([url, isVisible]) => {
    if (!url) {
      resolvedSrc.value = ''
      return
    }
    const cached = peekCachedImage(url)
    if (cached) {
      resolvedSrc.value = cached
      return
    }
    if (!isVisible) return
    resolvedSrc.value = props.useCache ? await getCachedImage(url) : url
  },
  { immediate: true }
)

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
