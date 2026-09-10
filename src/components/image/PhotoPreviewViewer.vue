<template>
  <Transition name="photo-preview">
    <div v-if="isOpen" class="photo-preview-overlay">
      <div
        ref="stageRef"
        class="photo-preview__stage"
        @touchstart="onTouchStart"
        @touchmove="onTouchMove"
        @touchend="onTouchEnd"
        @touchcancel="onTouchEnd"
        @click="onStageClick"
        @dblclick="onDblClick"
      >
        <div class="photo-preview__zoom" :style="zoomStyle">
          <div class="photo-preview__track" :style="trackStyle">
            <div class="photo-preview__cell">
              <LazyCachedImage
                v-if="prevPhoto"
                :key="prevPhoto.uri"
                :src="prevPhoto.uri"
                :alt="prevPhoto.caption || ''"
                :lazy="false"
                loading="eager"
                fetchpriority="low"
                :image-attrs="{ class: 'photo-preview__img' }"
              />
            </div>
            <div class="photo-preview__cell">
              <LazyCachedImage
                v-if="currentPhoto"
                :key="currentPhoto.uri"
                :src="currentPhoto.uri"
                :alt="currentPhoto.caption || ''"
                :lazy="false"
                loading="eager"
                fetchpriority="high"
                resume-decode-validation
                :image-attrs="{ class: 'photo-preview__img' }"
              />
            </div>
            <div class="photo-preview__cell">
              <LazyCachedImage
                v-if="nextPhoto"
                :key="nextPhoto.uri"
                :src="nextPhoto.uri"
                :alt="nextPhoto.caption || ''"
                :lazy="false"
                loading="eager"
                fetchpriority="low"
                :image-attrs="{ class: 'photo-preview__img' }"
              />
            </div>
          </div>
        </div>
      </div>
      <button
        v-if="canGoPrev"
        class="photo-preview__nav photo-preview__nav--prev"
        type="button"
        @click.stop="showPrev"
      >
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M15 18L9 12L15 6" />
        </svg>
      </button>
      <button
        v-if="canGoNext"
        class="photo-preview__nav photo-preview__nav--next"
        type="button"
        @click.stop="showNext"
      >
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M9 6L15 12L9 18" />
        </svg>
      </button>
      <button class="photo-preview__close" type="button" @click.stop="close">
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M18 6L6 18" />
          <path d="M6 6L18 18" />
        </svg>
      </button>
    </div>
  </Transition>
</template>

<script setup>
// @ts-check
/**
 * 全屏照片查看器：双指/双击缩放、未放大时左右滑动/箭头切换、单击空白关闭。
 * 从 EventDetailView 的 photo-preview 区块抽出，供活动详情与 AI 聊天复用。
 * index < 0 表示关闭；由父组件通过 v-model:index / v-model:show 控制。
 */
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import LazyCachedImage from '@/components/image/LazyCachedImage.vue'
import { getCachedImage } from '@/utils/image/cache'

const props = defineProps({
  /** @type {import('vue').PropType<Array<{ uri: string, caption?: string } | string>>} */
  photos: { type: Array, default: () => [] },
  index: { type: Number, default: -1 },
  show: { type: Boolean, default: false }
})

const emit = defineEmits(['update:index', 'update:show', 'close'])

const stageRef = ref(null)
const index = ref(Number(props.index) || -1)
const show = ref(Boolean(props.show))
const zoom = reactive({ scale: 1, x: 0, y: 0 })
const swipeX = ref(0)
const animating = ref(false)

const MAX_SCALE = 4
const DOUBLE_TAP_SCALE = 2.5
const DOUBLE_TAP_GAP_MS = 350
const DOUBLE_TAP_DISTANCE_PX = 64
const BLANK_TAP_TOLERANCE_PX = 10
const SWIPE_RATIO = 0.18

let gesture = null
let start = null
let tapMoved = false
let lastTap = { time: 0, x: 0, y: 0 }
let lastTouchEndAt = 0
let pendingBlankClose = null
let animatingTimer = 0

const normalizedPhotos = computed(() => (Array.isArray(props.photos) ? props.photos : [])
  .map((item) => {
    if (typeof item === 'string') return { uri: String(item || '').trim(), caption: '' }
    const uri = String(item?.uri || '').trim()
    return { uri, caption: String(item?.caption || '') }
  })
  .filter((item) => item.uri))

const isOpen = computed(() => (show.value || index.value >= 0) && !!normalizedPhotos.value[index.value]?.uri)

const currentPhoto = computed(() => normalizedPhotos.value[index.value] || null)
const prevPhoto = computed(() => (index.value > 0 ? normalizedPhotos.value[index.value - 1] || null : null))
const nextPhoto = computed(() => (
  index.value >= 0 && index.value < normalizedPhotos.value.length - 1
    ? normalizedPhotos.value[index.value + 1] || null
    : null
))
const canGoPrev = computed(() => index.value > 0)
const canGoNext = computed(() => index.value >= 0 && index.value < normalizedPhotos.value.length - 1)

const zoomStyle = computed(() => ({
  transform: `translate3d(${zoom.x}px, ${zoom.y}px, 0) scale(${zoom.scale})`,
  transition: animating.value ? 'transform 260ms cubic-bezier(0.22, 1, 0.36, 1)' : 'none'
}))

const trackStyle = computed(() => ({
  transform: `translate3d(calc(-100% + ${swipeX.value}px), 0, 0)`,
  transition: animating.value ? 'transform 260ms cubic-bezier(0.22, 1, 0.36, 1)' : 'none'
}))

function normalizeIndex(value) {
  const n = Number(value)
  return Number.isFinite(n) ? Math.trunc(n) : -1
}

watch(() => props.index, (value) => {
  const next = normalizeIndex(value)
  if (next === index.value) return
  index.value = next
  if (next >= 0) {
    show.value = true
    openSideEffects(next)
  } else {
    show.value = false
  }
}, { immediate: true })

watch(() => props.show, (value) => {
  show.value = Boolean(value)
  if (show.value && index.value < 0 && normalizedPhotos.value.length > 0) {
    index.value = 0
    openSideEffects(0)
  }
})

watch(isOpen, (open) => {
  if (!open) return
  show.value = true
  if (index.value < 0) index.value = 0
})

function openSideEffects(atIndex) {
  resetZoom(false)
  swipeX.value = 0
  lastTap.time = 0
  cancelPendingBlankClose()
  const photos = normalizedPhotos.value
  ;[atIndex - 2, atIndex - 1, atIndex + 1, atIndex + 2].forEach((i) => {
    const uri = photos[i]?.uri
    if (uri) getCachedImage(uri, { priority: 'viewport' }).catch(() => null)
  })
}

function setAnimating(animate) {
  if (animatingTimer) {
    window.clearTimeout(animatingTimer)
    animatingTimer = 0
  }
  animating.value = !!animate
  if (animate) {
    animatingTimer = window.setTimeout(() => {
      animatingTimer = 0
      animating.value = false
    }, 280)
  }
}

function resetZoom(animate = false) {
  zoom.scale = 1
  zoom.x = 0
  zoom.y = 0
  setAnimating(animate)
}

function snapBackSwipe() {
  setAnimating(true)
  swipeX.value = 0
}

function commitSwipeSwitch(direction) {
  const stageW = window.innerWidth
  setAnimating(true)
  swipeX.value = direction * stageW
  window.setTimeout(() => {
    index.value += direction < 0 ? 1 : -1
    emit('update:index', index.value)
    openSideEffects(index.value)
    animating.value = false
    swipeX.value = 0
    window.requestAnimationFrame(() => {
      animating.value = false
    })
  }, 260)
}

function clampScale(value) {
  return Math.min(MAX_SCALE, Math.max(1, value))
}

function maxOffset(scale) {
  const stageEl = stageRef.value
  const imgs = stageEl?.querySelectorAll('.photo-preview__img') || []
  const imgEl = imgs[Math.min(1, imgs.length - 1)] || null
  const stageW = stageEl?.offsetWidth || window.innerWidth
  const stageH = stageEl?.offsetHeight || window.innerHeight
  let contentW = stageW
  let contentH = stageH
  const naturalW = imgEl?.naturalWidth || 0
  const naturalH = imgEl?.naturalHeight || 0
  if (naturalW > 0 && naturalH > 0) {
    const fit = Math.min(stageW / naturalW, stageH / naturalH)
    contentW = naturalW * fit
    contentH = naturalH * fit
  }
  return {
    x: Math.max(0, (contentW * scale - stageW) / 2),
    y: Math.max(0, (contentH * scale - stageH) / 2)
  }
}

function clampTranslate(x, y, scale) {
  const max = maxOffset(scale)
  return {
    x: Math.min(max.x, Math.max(-max.x, x)),
    y: Math.min(max.y, Math.max(-max.y, y))
  }
}

function applyZoom(scale, x, y, animate = false) {
  const next = clampTranslate(x, y, scale)
  zoom.scale = scale
  zoom.x = next.x
  zoom.y = next.y
  setAnimating(animate)
}

function toggleZoomAt(clientX, clientY) {
  if (zoom.scale > 1) {
    applyZoom(1, 0, 0, true)
    return
  }
  const ux = clientX - window.innerWidth / 2
  const uy = clientY - window.innerHeight / 2
  applyZoom(
    DOUBLE_TAP_SCALE,
    ux - (ux - zoom.x) * DOUBLE_TAP_SCALE,
    uy - (uy - zoom.y) * DOUBLE_TAP_SCALE,
    true
  )
}

function getTouchDistance(touches) {
  const dx = touches[0].clientX - touches[1].clientX
  const dy = touches[0].clientY - touches[1].clientY
  return Math.hypot(dx, dy)
}

function isPointOnImage(clientX, clientY) {
  const stageEl = stageRef.value
  if (!stageEl) return true
  const stageW = stageEl.offsetWidth || window.innerWidth
  const stageH = stageEl.offsetHeight || window.innerHeight
  const imgs = stageEl.querySelectorAll('.photo-preview__img')
  const imgEl = imgs[Math.min(1, imgs.length - 1)] || null
  const naturalW = imgEl?.naturalWidth || 0
  const naturalH = imgEl?.naturalHeight || 0
  let contentW = stageW
  let contentH = stageH
  if (naturalW > 0 && naturalH > 0) {
    const fit = Math.min(stageW / naturalW, stageH / naturalH)
    contentW = naturalW * fit
    contentH = naturalH * fit
  }
  const halfW = (contentW * zoom.scale) / 2 + BLANK_TAP_TOLERANCE_PX
  const halfH = (contentH * zoom.scale) / 2 + BLANK_TAP_TOLERANCE_PX
  return (
    clientX >= stageW / 2 - halfW + zoom.x &&
    clientX <= stageW / 2 + halfW + zoom.x &&
    clientY >= stageH / 2 - halfH + zoom.y &&
    clientY <= stageH / 2 + halfH + zoom.y
  )
}

function scheduleBlankCloseIfNeeded(clientX, clientY) {
  if (isPointOnImage(clientX, clientY)) return
  if (pendingBlankClose) clearTimeout(pendingBlankClose)
  pendingBlankClose = setTimeout(() => {
    pendingBlankClose = null
    close()
  }, DOUBLE_TAP_GAP_MS)
}

function cancelPendingBlankClose() {
  if (pendingBlankClose) {
    clearTimeout(pendingBlankClose)
    pendingBlankClose = null
  }
}

function onStageClick(event) {
  if (Date.now() - lastTouchEndAt < 700) return
  if (event.detail > 1) {
    cancelPendingBlankClose()
    return
  }
  scheduleBlankCloseIfNeeded(event.clientX, event.clientY)
}

function onTouchStart(event) {
  const touches = event.touches
  if (touches.length >= 2) {
    gesture = 'pinch'
    start = {
      distance: getTouchDistance(touches),
      centerX: (touches[0].clientX + touches[1].clientX) / 2,
      centerY: (touches[0].clientY + touches[1].clientY) / 2,
      scale: zoom.scale,
      x: zoom.x,
      y: zoom.y
    }
    return
  }
  gesture = 'pan'
  tapMoved = false
  start = {
    startX: touches[0].clientX,
    startY: touches[0].clientY,
    x: zoom.x,
    y: zoom.y
  }
}

function onTouchMove(event) {
  if (!start) return
  const touches = event.touches
  if (gesture === 'pinch') {
    if (touches.length < 2) return
    event.preventDefault()
    const nextScale = clampScale(start.scale * getTouchDistance(touches) / Math.max(1, start.distance))
    const ux = start.centerX - window.innerWidth / 2
    const uy = start.centerY - window.innerHeight / 2
    const ratio = nextScale / Math.max(start.scale, 0.01)
    tapMoved = true
    applyZoom(
      nextScale,
      ux - (ux - start.x) * ratio,
      uy - (uy - start.y) * ratio
    )
    return
  }
  if (zoom.scale <= 1) {
    if (
      Math.abs(touches[0].clientX - start.startX) > 6 ||
      Math.abs(touches[0].clientY - start.startY) > 6
    ) {
      tapMoved = true
    }
    const dx = touches[0].clientX - start.startX
    const dy = touches[0].clientY - start.startY
    if (Math.abs(dx) > Math.abs(dy)) {
      event.preventDefault()
    }
    swipeX.value = dx
    return
  }
  const dx = touches[0].clientX - start.startX
  const dy = touches[0].clientY - start.startY
  if (!tapMoved) {
    if (Math.hypot(dx, dy) <= 6) {
      event.preventDefault()
      return
    }
    start.startX = touches[0].clientX
    start.startY = touches[0].clientY
    start.x = zoom.x
    start.y = zoom.y
  }
  event.preventDefault()
  tapMoved = true
  applyZoom(
    zoom.scale,
    start.x + (touches[0].clientX - start.startX),
    start.y + (touches[0].clientY - start.startY)
  )
}

function onTouchEnd(event) {
  if (!start) return
  if (event.touches.length === 0) {
    lastTouchEndAt = Date.now()
    if (gesture === 'pan') {
      const touch = event.changedTouches[0]
      const dx = swipeX.value
      const dy = touch.clientY - start.startY
      const swipeThreshold = Math.max(40, window.innerWidth * SWIPE_RATIO)
      if (Math.abs(dx) > swipeThreshold && Math.abs(dx) > Math.abs(dy)) {
        if ((dx < 0 && canGoNext.value) || (dx > 0 && canGoPrev.value)) {
          commitSwipeSwitch(dx < 0 ? -1 : 1)
        } else {
          snapBackSwipe()
        }
        start = null
        gesture = null
        return
      }
      if (!tapMoved) {
        const now = lastTouchEndAt
        const isNearLastTap = Math.hypot(touch.clientX - lastTap.x, touch.clientY - lastTap.y) < DOUBLE_TAP_DISTANCE_PX
        if (now - lastTap.time < DOUBLE_TAP_GAP_MS && isNearLastTap) {
          lastTap.time = 0
          cancelPendingBlankClose()
          toggleZoomAt(touch.clientX, touch.clientY)
        } else {
          lastTap.time = now
          lastTap.x = touch.clientX
          lastTap.y = touch.clientY
          scheduleBlankCloseIfNeeded(touch.clientX, touch.clientY)
        }
      }
    }
    if (zoom.scale < 1) {
      applyZoom(1, 0, 0, true)
    }
    if (swipeX.value !== 0) {
      snapBackSwipe()
    }
    start = null
    gesture = null
    return
  }
  if (gesture === 'pinch' && event.touches.length === 1) {
    gesture = 'pan'
    tapMoved = true
    start = {
      startX: event.touches[0].clientX,
      startY: event.touches[0].clientY,
      x: zoom.x,
      y: zoom.y
    }
  }
}

function onDblClick(event) {
  cancelPendingBlankClose()
  toggleZoomAt(event.clientX, event.clientY)
}

function showPrev() {
  if (canGoPrev.value) commitSwipeSwitch(1)
}

function showNext() {
  if (canGoNext.value) commitSwipeSwitch(-1)
}

function close() {
  index.value = -1
  swipeX.value = 0
  show.value = false
  cancelPendingBlankClose()
  emit('update:index', -1)
  emit('update:show', false)
  emit('close')
}

function onKeydown(event) {
  if (!isOpen.value) return
  if (event.key === 'Escape') {
    close()
  } else if (event.key === 'ArrowLeft') {
    showPrev()
  } else if (event.key === 'ArrowRight') {
    showNext()
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  close()
})

defineExpose({ close, isOpen })
</script>

<style scoped>
.photo-preview-overlay {
  position: fixed;
  inset: 0;
  z-index: 2000;
  background: var(--app-bg);
  background: color-mix(in srgb, var(--app-bg) 80%, transparent);
  backdrop-filter: blur(40px) saturate(180%);
  -webkit-backdrop-filter: blur(40px) saturate(180%);
}

.photo-preview__close {
  position: absolute;
  top: calc(env(safe-area-inset-top) + 12px);
  right: 16px;
  z-index: 10;
  width: 40px;
  height: 40px;
  border: none;
  border-radius: 50%;
  background: color-mix(in srgb, var(--app-surface) 55%, transparent);
  color: var(--app-text);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  transition: background-color 200ms ease, transform 180ms ease, backdrop-filter 200ms ease;
}

.photo-preview__close:hover {
  background: color-mix(in srgb, var(--app-surface) 72%, transparent);
}

.photo-preview__close:active {
  transform: scale(0.88);
  background: color-mix(in srgb, var(--app-surface) 82%, transparent);
}

.photo-preview__close svg {
  width: 18px;
  height: 18px;
  stroke: currentColor;
  stroke-width: 2.2;
}

.photo-preview__nav {
  position: absolute;
  top: 50%;
  z-index: 10;
  width: 40px;
  height: 40px;
  transform: translateY(-50%);
  border: none;
  border-radius: 50%;
  background: color-mix(in srgb, var(--app-surface) 55%, transparent);
  color: var(--app-text);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  transition: background-color 200ms ease, transform 180ms ease, backdrop-filter 200ms ease;
}

.photo-preview__nav:hover {
  background: color-mix(in srgb, var(--app-surface) 72%, transparent);
}

.photo-preview__nav:active {
  transform: translateY(-50%) scale(0.88);
  background: color-mix(in srgb, var(--app-surface) 82%, transparent);
}

.photo-preview__nav--prev {
  left: 16px;
}

.photo-preview__nav--next {
  right: 16px;
}

.photo-preview__nav svg {
  width: 20px;
  height: 20px;
  stroke: currentColor;
  stroke-width: 2.2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.photo-preview__stage {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  touch-action: none;
}

.photo-preview__zoom {
  position: absolute;
  inset: 0;
  will-change: transform;
}

.photo-preview__track {
  position: absolute;
  inset: 0;
  display: flex;
  flex-wrap: nowrap;
  will-change: transform;
}

.photo-preview__cell {
  flex: 0 0 100%;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.photo-preview__zoom :deep(.lazy-image-element) {
  object-fit: contain;
}

.photo-preview-enter-active {
  transition: opacity 220ms ease;
}

.photo-preview-enter-active .photo-preview__stage {
  transition: transform 260ms var(--motion-ease-emphasis);
}

.photo-preview-leave-active {
  transition: opacity 180ms ease;
}

.photo-preview-leave-active .photo-preview__stage {
  transition: transform 180ms ease;
}

.photo-preview-enter-from,
.photo-preview-leave-to {
  opacity: 0;
}

.photo-preview-enter-from .photo-preview__stage {
  transform: scale(0.92);
}

.photo-preview-leave-to .photo-preview__stage {
  transform: scale(0.95);
}
</style>
