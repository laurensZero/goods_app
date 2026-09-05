<template>
  <div class="photo-scroll">
    <div class="photo-scroll-wrapper" ref="scrollRef" @wheel="onWheel">
      <div class="photo-grid">
        <button
          v-for="(photo, index) in photos"
          :key="(photo.cloudFileName || photo.id) || index"
          type="button"
          class="photo-grid__item"
          @click="$emit('preview', index)"
        >
          <LazyCachedImage
            v-if="photo.uri && !suspend"
            :src="photo.uri"
            :thumb-max-size="THUMB_MAX_SIZE"
            :alt="photo.caption || t('events.photoAlt', { index: index + 1 })"
            root-margin="120px 0px"
            loading="lazy"
            decoding="async"
            fetchpriority="low"
            :skeleton-delay-ms="180"
            :image-attrs="{ class: 'photo-grid__img' }"
          />
          <div v-else class="photo-grid__placeholder">✦</div>
        </button>
      </div>
    </div>

    <div v-if="thumbWidthPct > 0" class="photo-scroll-indicator">
      <div
        class="photo-scroll-indicator__thumb"
        :style="{ width: thumbWidthPct + '%', left: thumbLeftPct + '%' }"
      />
    </div>
  </div>
</template>

<script>
// 网格项 136~156px，×3x DPR 后 480px 足够清晰。
// 导出供 EventDetailView 等调用方对齐同一尺寸做缩略图预热与缓存命中判断。
export const PHOTO_THUMB_MAX_SIZE = 480
</script>

<script setup>
import { onBeforeUnmount, onMounted, ref, watch, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import LazyCachedImage from '@/components/image/LazyCachedImage.vue'

const { t } = useI18n()

const props = defineProps({
  photos: { type: Array, default: () => [] },
  suspend: { type: Boolean, default: false }
})

defineEmits(['preview'])

// 缩略图由本地解码原图降采样生成并持久缓存（utils/image/thumb），
// 原图留给点开大图预览时再解码；生成失败时自动回退原图。
const THUMB_MAX_SIZE = PHOTO_THUMB_MAX_SIZE

const scrollRef = ref(null)
const thumbWidthPct = ref(0)
const thumbLeftPct = ref(0)

function updateScroll() {
  const el = scrollRef.value
  if (!el) return
  const { scrollLeft, scrollWidth, clientWidth } = el
  if (scrollWidth <= clientWidth) {
    thumbWidthPct.value = 0
    return
  }
  const ratio = clientWidth / scrollWidth
  thumbWidthPct.value = ratio * 100
  thumbLeftPct.value = (scrollLeft / (scrollWidth - clientWidth)) * (100 - ratio * 100)
}

function onWheel(e) {
  const el = scrollRef.value
  if (!el || el.scrollWidth <= el.clientWidth) return
  if (Math.abs(e.deltaX) >= Math.abs(e.deltaY)) return

  const delta = e.deltaY
  const atStart = el.scrollLeft <= 0
  const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 1

  if ((delta < 0 && atStart) || (delta > 0 && atEnd)) return

  e.preventDefault()
  el.scrollLeft += delta
}

watch(
  () => [props.photos, props.suspend],
  async () => {
    await nextTick()
    updateScroll()
  }
)

onMounted(() => {
  updateScroll()
  scrollRef.value?.addEventListener('scroll', updateScroll, { passive: true })
  window.addEventListener('resize', updateScroll)
})

onBeforeUnmount(() => {
  scrollRef.value?.removeEventListener('scroll', updateScroll)
  window.removeEventListener('resize', updateScroll)
})
</script>

<style scoped>
.photo-scroll {
  margin: 0;
}

.photo-scroll-wrapper {
  overflow-x: auto;
  overflow-y: visible;
  scrollbar-width: none;
  -ms-overflow-style: none;
  margin: -4px;
  padding: 4px;
  scroll-snap-type: x mandatory;
  -webkit-overflow-scrolling: touch;
    /* 右侧渐隐，避免图片被硬切 */
  -webkit-mask-image: linear-gradient(
    to right,
    black 0,
    black calc(100% - 32px),
    transparent 100%
  );
  mask-image: linear-gradient(
    to right,
    black 0,
    black calc(100% - 32px),
    transparent 100%
  );
}

.photo-scroll-wrapper::-webkit-scrollbar {
  display: none;
}

.photo-scroll-indicator {
  position: relative;
  height: 4px;
  margin: 4px 4px 0;
  border-radius: 999px;
  background: rgba(128, 128, 128, 0.18);
  overflow: hidden;
}

.photo-scroll-indicator__thumb {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  border-radius: 999px;
  background: rgba(128, 128, 128, 0.45);
  transition: left 0.05s linear;
}

.photo-grid {
  display: flex;
  gap: 8px;
  flex-wrap: nowrap;
}

.photo-grid__item {
  flex-shrink: 0;
  width: 136px;
  height: 136px;
  border: none;
  background: none;
  padding: 0;
  border-radius: 18px;
  overflow: hidden;
  cursor: pointer;
  scroll-snap-align: start;
  transition: transform 0.15s ease, opacity 0.15s ease;
}

.photo-grid__item:active {
  transform: scale(0.95);
  opacity: 0.85;
}

:deep(.photo-grid__img) {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.photo-grid__placeholder {
  width: 100%;
  height: 100%;
  background: var(--app-surface-soft);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--app-text-tertiary);
  font-size: 14px;
}

@media (min-width: 600px) {
  .photo-grid__item {
    width: 156px;
    height: 156px;
  }
}
</style>
