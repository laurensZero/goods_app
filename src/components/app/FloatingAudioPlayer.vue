<template>
  <Transition name="floating-player">
    <section
      v-if="currentTrack && miniVisible"
      ref="playerRef"
      class="floating-player"
      :class="{ 'floating-player--with-tabbar': withTabBar }"
      :style="floatingStyle"
    >
      <div class="floating-player__surface">
        <div class="floating-player__head" @pointerdown="startDrag">
          <div class="floating-player__copy">
            <p class="floating-player__eyebrow">Now Playing</p>
            <strong class="floating-player__title">{{ currentTrack.title || '未命名曲目' }}</strong>
            <p class="floating-player__meta">
              <span>{{ currentTrack.artist || '未知歌手' }}</span>
              <span v-if="currentTrack.album"> · {{ currentTrack.album }}</span>
            </p>
          </div>

          <button type="button" class="floating-player__close" aria-label="收起播放器" @click="closeMiniPlayer">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M18 6L6 18" />
              <path d="M6 6L18 18" />
            </svg>
          </button>
        </div>

        <div class="floating-player__progress">
          <input
            class="floating-player__slider"
            type="range"
            min="0"
            :max="sliderMax"
            step="0.01"
            :value="sliderValue"
            :style="{ '--player-progress': progressPercent }"
            @input="handleSeekInput"
            @change="commitSeek"
            @pointerup="commitSeek"
            @touchend="commitSeek"
            @blur="cancelSeek"
          />
          <div class="floating-player__time">
            <span>{{ currentTimeLabel }}</span>
            <span>{{ durationLabel }}</span>
          </div>
        </div>

        <div class="floating-player__actions">
          <button type="button" class="floating-player__btn" :disabled="!hasPrevious" @click="playPrevious">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M11 7L6 12L11 17" />
              <path d="M18 7L13 12L18 17" />
            </svg>
          </button>

          <button type="button" class="floating-player__btn floating-player__btn--primary" :disabled="isLoading" @click="togglePlayPause">
            <svg v-if="isPlaying" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M9 6V18" />
              <path d="M15 6V18" />
            </svg>
            <svg v-else viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M8 6V18L18 12L8 6Z" />
            </svg>
          </button>

          <button type="button" class="floating-player__btn" :disabled="!hasNext" @click="playNext">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M13 7L18 12L13 17" />
              <path d="M6 7L11 12L6 17" />
            </svg>
          </button>
        </div>

        <p v-if="lastError" class="floating-player__error">{{ lastError }}</p>
      </div>
    </section>
  </Transition>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useMediaPlayerStore } from '@/stores/mediaPlayer'
import { formatTrackDuration } from '@/utils/neteaseMusic'

const props = defineProps({
  withTabBar: { type: Boolean, default: false }
})

const PLAYER_POSITION_KEY = 'floating-audio-player-position'
const PLAYER_MARGIN = 10

const playerStore = useMediaPlayerStore()
const playerRef = ref(null)
const isDragging = ref(false)
const previewTime = ref(0)
const floatingPosition = ref({ x: null, y: null })
const dragState = ref({
  pointerId: null,
  offsetX: 0,
  offsetY: 0
})

const currentTrack = computed(() => playerStore.currentTrack)
const miniVisible = computed(() => playerStore.miniVisible)
const isPlaying = computed(() => playerStore.isPlaying)
const isLoading = computed(() => playerStore.isLoading)
const lastError = computed(() => playerStore.lastError)
const hasPrevious = computed(() => playerStore.hasPrevious)
const hasNext = computed(() => playerStore.hasNext)
const effectiveCurrentTime = computed(() => (isDragging.value ? previewTime.value : (playerStore.currentTime || 0)))
const progressPercent = computed(() => {
  const total = Number(playerStore.duration) || 0
  if (total <= 0) return '0%'
  return `${(Math.min(1, Math.max(0, effectiveCurrentTime.value / total)) * 100).toFixed(3)}%`
})
const sliderMax = computed(() => Math.max(0.1, Number(playerStore.duration || 0)))
const sliderValue = computed(() => Math.min(sliderMax.value, effectiveCurrentTime.value))
const currentTimeLabel = computed(() => formatTrackDuration(effectiveCurrentTime.value * 1000) || '0:00')
const durationLabel = computed(() => formatTrackDuration((playerStore.duration || 0) * 1000) || '0:00')
const floatingStyle = computed(() => {
  if (floatingPosition.value.x == null || floatingPosition.value.y == null) {
    return null
  }

  return {
    left: `${floatingPosition.value.x}px`,
    top: `${floatingPosition.value.y}px`,
    right: 'auto',
    bottom: 'auto'
  }
})

watch(
  () => playerStore.currentTime,
  (value) => {
    if (!isDragging.value) {
      previewTime.value = Number(value) || 0
    }
  },
  { immediate: true }
)

watch(
  () => [currentTrack.value?.id || currentTrack.value?.neteaseSongId || '', miniVisible.value],
  async ([trackIdentity, visible]) => {
    if (!trackIdentity || !visible) return
    await nextTick()
    ensureFloatingPosition()
  },
  { immediate: true }
)

function handleSeekInput(event) {
  isDragging.value = true
  previewTime.value = Number(event?.target?.value) || 0
}

function commitSeek(event) {
  const nextTime = Number(event?.target?.value) || previewTime.value || 0
  previewTime.value = nextTime
  playerStore.seekTo(nextTime)
  window.setTimeout(() => {
    isDragging.value = false
  }, 0)
}

function cancelSeek() {
  isDragging.value = false
  previewTime.value = Number(playerStore.currentTime) || 0
}

function togglePlayPause() {
  void playerStore.togglePlayPause()
}

function playPrevious() {
  void playerStore.playPrevious()
}

function playNext() {
  void playerStore.playNext()
}

function closeMiniPlayer() {
  playerStore.closeMiniPlayer()
}

function getViewportBounds() {
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0
  return {
    maxX: Math.max(PLAYER_MARGIN, viewportWidth - getPlayerWidth() - PLAYER_MARGIN),
    maxY: Math.max(PLAYER_MARGIN, viewportHeight - getPlayerHeight() - PLAYER_MARGIN)
  }
}

function getPlayerWidth() {
  return playerRef.value?.offsetWidth || 280
}

function getPlayerHeight() {
  return playerRef.value?.offsetHeight || 190
}

function clampPosition(position) {
  const { maxX, maxY } = getViewportBounds()
  return {
    x: Math.min(Math.max(PLAYER_MARGIN, Number(position?.x) || 0), maxX),
    y: Math.min(Math.max(PLAYER_MARGIN, Number(position?.y) || 0), maxY)
  }
}

function persistFloatingPosition(position) {
  try {
    localStorage.setItem(PLAYER_POSITION_KEY, JSON.stringify(position))
  } catch {
    // ignore persistence errors
  }
}

function readPersistedPosition() {
  try {
    const raw = localStorage.getItem(PLAYER_POSITION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!Number.isFinite(parsed?.x) || !Number.isFinite(parsed?.y)) return null
    return parsed
  } catch {
    return null
  }
}

function ensureFloatingPosition() {
  if (!playerRef.value) return

  const persisted = readPersistedPosition()
  if (persisted) {
    floatingPosition.value = clampPosition(persisted)
    return
  }

  const rect = playerRef.value.getBoundingClientRect()
  floatingPosition.value = clampPosition({ x: rect.left, y: rect.top })
}

function handlePointerMove(event) {
  if (dragState.value.pointerId == null || dragState.value.pointerId !== event.pointerId) return

  floatingPosition.value = clampPosition({
    x: event.clientX - dragState.value.offsetX,
    y: event.clientY - dragState.value.offsetY
  })
}

function clearDrag(pointerId = null) {
  if (pointerId != null && dragState.value.pointerId !== pointerId) return
  dragState.value = {
    pointerId: null,
    offsetX: 0,
    offsetY: 0
  }
}

function handlePointerUp(event) {
  if (dragState.value.pointerId == null || dragState.value.pointerId !== event.pointerId) return
  if (floatingPosition.value.x != null && floatingPosition.value.y != null) {
    persistFloatingPosition(floatingPosition.value)
  }
  clearDrag(event.pointerId)
}

function startDrag(event) {
  if (event.button !== undefined && event.button !== 0) return
  if (event.target instanceof HTMLElement && event.target.closest('button, input, a, label')) return
  if (!playerRef.value) return

  const rect = playerRef.value.getBoundingClientRect()
  floatingPosition.value = clampPosition({ x: rect.left, y: rect.top })
  dragState.value = {
    pointerId: event.pointerId,
    offsetX: event.clientX - rect.left,
    offsetY: event.clientY - rect.top
  }
}

function handleResize() {
  if (floatingPosition.value.x == null || floatingPosition.value.y == null) return
  floatingPosition.value = clampPosition(floatingPosition.value)
  persistFloatingPosition(floatingPosition.value)
}

if (typeof window !== 'undefined') {
  window.addEventListener('pointermove', handlePointerMove)
  window.addEventListener('pointerup', handlePointerUp)
  window.addEventListener('pointercancel', handlePointerUp)
  window.addEventListener('resize', handleResize)
}

onBeforeUnmount(() => {
  if (typeof window === 'undefined') return
  window.removeEventListener('pointermove', handlePointerMove)
  window.removeEventListener('pointerup', handlePointerUp)
  window.removeEventListener('pointercancel', handlePointerUp)
  window.removeEventListener('resize', handleResize)
})
</script>

<style scoped>
.floating-player {
  position: fixed;
  right: 12px;
  bottom: max(12px, env(safe-area-inset-bottom));
  width: min(calc(100vw - 24px), 280px);
  z-index: 90;
}

.floating-player__surface {
  padding: 12px;
  border-radius: 20px;
  background: color-mix(in srgb, var(--app-glass-strong) 90%, var(--app-surface));
  border: 1px solid var(--app-glass-border);
  box-shadow: var(--app-shadow);
  backdrop-filter: blur(24px) saturate(135%);
  -webkit-backdrop-filter: blur(24px) saturate(135%);
}

.floating-player__head {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: grab;
  touch-action: none;
}

.floating-player__copy {
  min-width: 0;
  flex: 1;
}

.floating-player__eyebrow {
  color: var(--app-text-tertiary);
  font-size: 10px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.floating-player__title {
  display: block;
  margin-top: 2px;
  color: var(--app-text);
  font-size: 13px;
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.floating-player__meta {
  margin-top: 2px;
  color: var(--app-text-secondary);
  font-size: 11px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.floating-player__close,
.floating-player__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 14px;
  background: color-mix(in srgb, var(--app-surface-soft) 88%, var(--app-surface));
  color: var(--app-text);
  line-height: 0;
}

.floating-player__close {
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  cursor: pointer;
}

.floating-player__progress {
  margin-top: 10px;
}

.floating-player__slider {
  width: 100%;
  margin: 0;
  appearance: none;
  height: 5px;
  border-radius: 999px;
  outline: none;
  background:
    linear-gradient(to right, #141416 0%, #141416 var(--player-progress, 0%), color-mix(in srgb, var(--app-border) 70%, transparent) var(--player-progress, 0%), color-mix(in srgb, var(--app-border) 70%, transparent) 100%);
}

.floating-player__slider::-webkit-slider-thumb {
  appearance: none;
  width: 15px;
  height: 15px;
  border-radius: 50%;
  background: #141416;
  border: 2px solid #ffffff;
  box-shadow: 0 3px 10px rgba(20, 20, 22, 0.24);
}

.floating-player__slider::-moz-range-thumb {
  width: 15px;
  height: 15px;
  border-radius: 50%;
  background: #141416;
  border: 2px solid #ffffff;
  box-shadow: 0 3px 10px rgba(20, 20, 22, 0.24);
}

.floating-player__time {
  display: flex;
  justify-content: space-between;
  margin-top: 5px;
  color: var(--app-text-tertiary);
  font-size: 10px;
}

.floating-player__actions {
  display: flex;
  justify-content: center;
  gap: 8px;
  margin-top: 10px;
}

.floating-player__btn {
  width: 34px;
  height: 34px;
}

.floating-player__btn--primary {
  width: 42px;
  background: #141416;
  color: #fff;
}

.floating-player__close svg,
.floating-player__btn svg {
  display: block;
  width: 18px;
  height: 18px;
  stroke: currentColor;
  stroke-width: 2.8;
  stroke-linecap: round;
  stroke-linejoin: round;
  overflow: visible;
}

.floating-player__error {
  margin-top: 10px;
  color: #c34a4a;
  font-size: 12px;
}

.floating-player-enter-active,
.floating-player-leave-active {
  transition: opacity 180ms ease, transform 180ms ease;
}

.floating-player-enter-from,
.floating-player-leave-to {
  opacity: 0;
  transform: translateY(12px) scale(0.98);
}

@media (max-width: 720px) {
  .floating-player {
    width: min(calc(100vw - 20px), 256px);
  }
}
</style>
