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

        <p v-if="currentLyricLine" class="floating-player__lyric">{{ currentLyricLine }}</p>

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
          <div ref="queuePanelRef" class="floating-player__queue">
            <button
              ref="queueTriggerRef"
              type="button"
              class="floating-player__queue-trigger"
              :class="{ 'floating-player__queue-trigger--active': isQueuePanelOpen }"
              aria-label="打开播放列表"
              :title="`播放列表 · ${queueItems.length}`"
              @click.stop="toggleQueuePanel"
            >
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M6 7H18" />
                <path d="M6 12H18" />
                <path d="M6 17H14" />
                <path d="M17 17H18" />
              </svg>
              <span v-if="queueItems.length" class="floating-player__queue-badge">{{ queueItems.length }}</span>
            </button>

          </div>

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

          <div ref="volumePanelRef" class="floating-player__volume">
            <button
              type="button"
              class="floating-player__volume-trigger"
              :class="{ 'floating-player__volume-trigger--active': isVolumePanelOpen }"
              :aria-label="isVolumePanelOpen ? '收起音量调节' : '打开音量调节'"
              :title="volumeStateLabel"
              @click.stop="toggleVolumePanel"
            >
              <svg v-if="isMuted || volumePercent <= 0" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M5 9V15H9L14 19V5L9 9H5Z" />
                <path d="M17 9L21 15" />
                <path d="M21 9L17 15" />
              </svg>
              <svg v-else-if="volumePercent < 60" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M5 9V15H9L14 19V5L9 9H5Z" />
                <path d="M17 9C18.1 10.1 18.1 13.9 17 15" />
              </svg>
              <svg v-else viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M5 9V15H9L14 19V5L9 9H5Z" />
                <path d="M17 9C18.1 10.1 18.1 13.9 17 15" />
                <path d="M19.5 6.5C21.7 8.7 21.7 15.3 19.5 17.5" />
              </svg>
            </button>

            <Transition name="volume-popover">
              <div v-if="isVolumePanelOpen" class="floating-player__volume-popover" @click.stop>
                <div class="floating-player__volume-head">
                  <strong class="floating-player__volume-value">{{ volumeStateLabel }}</strong>
                </div>
                <div class="floating-player__volume-rail">
                  <input
                    class="floating-player__volume-slider"
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    :value="volumeValue"
                    :style="{ '--player-progress': volumeProgressPercent }"
                    aria-label="调节播放器音量"
                    @input="handleVolumeInput"
                    @change="commitVolume"
                    @pointerup="commitVolume"
                    @touchend="commitVolume"
                    @blur="commitVolume"
                  />
                </div>
              </div>
            </Transition>
          </div>
        </div>

        <p v-if="lastError" class="floating-player__error">{{ lastError }}</p>
      </div>
    </section>
  </Transition>

  <Teleport to="body">
    <Transition name="queue-popover">
      <div
        v-if="isQueuePanelOpen"
        ref="queuePopoverRef"
        class="floating-player__queue-popover"
        :style="queuePopoverStyle"
        @click.stop
      >
        <div class="floating-player__queue-head">
          <div class="floating-player__queue-head-copy">
            <strong>播放列表</strong>
            <span>当前播放队列</span>
          </div>
          <span class="floating-player__queue-total">{{ queueItems.length }} 首</span>
        </div>

        <div ref="queueListRef" class="floating-player__queue-list">
          <button
            v-for="(track, index) in queueItems"
            :key="track.id || track.neteaseSongId || index"
            type="button"
            class="floating-player__queue-item"
            :class="{ 'floating-player__queue-item--active': index === playerStore.currentIndex }"
            :data-queue-index="index"
            @click="playQueueItem(track)"
          >
            <span class="floating-player__queue-index">{{ index + 1 }}</span>
            <span class="floating-player__queue-copy">
              <strong>{{ track.title || '未命名曲目' }}</strong>
              <span>{{ track.artist || '未知歌手' }}</span>
            </span>
            <span v-if="index === playerStore.currentIndex" class="floating-player__queue-now">播放中</span>
          </button>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
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
const currentLyricLine = computed(() => playerStore.currentLyricLine)
const volumePercent = computed(() => playerStore.volumePercent)
const volumeStateLabel = computed(() => playerStore.volumeStateLabel)
const isMuted = computed(() => playerStore.isMuted)
const queueItems = computed(() => (Array.isArray(playerStore.queue) ? playerStore.queue : []))
const volumeValue = computed(() => playerStore.volume)
const volumeProgressPercent = computed(() => {
  const nextVolume = Number(playerStore.volume) || 0
  return `${(Math.min(1, Math.max(0, nextVolume)) * 100).toFixed(3)}%`
})
const isVolumePanelOpen = ref(false)
const volumePanelRef = ref(null)
const isQueuePanelOpen = ref(false)
const queuePanelRef = ref(null)
const queueTriggerRef = ref(null)
const queuePopoverRef = ref(null)
const queueListRef = ref(null)
const queuePopoverStyle = ref(null)
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

function toggleMute() {
  playerStore.toggleMute()
}

function toggleQueuePanel() {
  isQueuePanelOpen.value = !isQueuePanelOpen.value
}

function closeQueuePanel() {
  isQueuePanelOpen.value = false
}

function updateQueuePopoverPosition() {
  if (!isQueuePanelOpen.value || !queueTriggerRef.value) return

  const triggerRect = queueTriggerRef.value.getBoundingClientRect()
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0
  const popoverWidth = Math.min(312, Math.max(220, viewportWidth - 24))
  const left = Math.min(
    viewportWidth - 12 - popoverWidth,
    Math.max(12, triggerRect.left + (triggerRect.width / 2) - (popoverWidth / 2))
  )
  const maxHeight = Math.min(320, Math.max(180, viewportHeight - 120))

  queuePopoverStyle.value = {
    left: `${left}px`,
    bottom: `${Math.max(80, viewportHeight - triggerRect.top + 10)}px`,
    width: `${popoverWidth}px`,
    maxHeight: `${maxHeight}px`
  }
}

function scrollActiveQueueItemIntoView() {
  if (!isQueuePanelOpen.value || !queueListRef.value) return
  const activeIndex = Number(playerStore.currentIndex)
  if (!Number.isFinite(activeIndex) || activeIndex < 0) return
  const activeItem = queueListRef.value.querySelector(`[data-queue-index="${activeIndex}"]`)
  if (!(activeItem instanceof HTMLElement)) return
  activeItem.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' })
}

function toggleVolumePanel() {
  isVolumePanelOpen.value = !isVolumePanelOpen.value
}

function closeVolumePanel() {
  isVolumePanelOpen.value = false
}

function handleVolumeInput(event) {
  const nextVolume = Number(event?.target?.value)
  playerStore.setVolume(nextVolume)
  isVolumePanelOpen.value = true
}

function commitVolume(event) {
  handleVolumeInput(event)
}

function handleGlobalPointerDown(event) {
  const target = event?.target
  if (!(target instanceof HTMLElement)) return

  if (isVolumePanelOpen.value && volumePanelRef.value && !volumePanelRef.value.contains(target)) {
    closeVolumePanel()
  }

  if (!isQueuePanelOpen.value) return
  if (queuePanelRef.value && queuePanelRef.value.contains(target)) return
  if (queuePopoverRef.value && queuePopoverRef.value.contains(target)) return
  closeQueuePanel()
}

function playQueueItem(track) {
  if (!track) return
  void playerStore.toggleTrackPlayback(track, queueItems.value)
  closeQueuePanel()
}

watch(
  () => isQueuePanelOpen.value,
  async (open) => {
    if (!open) {
      queuePopoverStyle.value = null
      return
    }
    await nextTick()
    updateQueuePopoverPosition()
    scrollActiveQueueItemIntoView()
  }
)

watch(
  () => [playerStore.currentIndex, queueItems.value.length],
  async () => {
    if (!isQueuePanelOpen.value) return
    await nextTick()
    updateQueuePopoverPosition()
    scrollActiveQueueItemIntoView()
  }
)

onMounted(() => {
  window.addEventListener('pointerdown', handleGlobalPointerDown, true)
})

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
  if (isQueuePanelOpen.value) {
    updateQueuePopoverPosition()
  }
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
  window.removeEventListener('pointerdown', handleGlobalPointerDown, true)
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

.floating-player__lyric {
  margin-top: 10px;
  color: var(--app-text-secondary);
  font-size: 11px;
  line-height: 1.45;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
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
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-top: 10px;
}

.floating-player__queue {
  position: relative;
  display: flex;
  justify-content: center;
}

.floating-player__queue-trigger {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border: none;
  border-radius: 14px;
  background: color-mix(in srgb, var(--app-surface-soft) 88%, var(--app-surface));
  color: var(--app-text);
  cursor: pointer;
  transition: transform 140ms ease, background-color 140ms ease, opacity 140ms ease;
}

.floating-player__queue-trigger--active {
  background: color-mix(in srgb, var(--app-text) 12%, var(--app-surface-soft));
}

.floating-player__queue-trigger:active {
  transform: scale(var(--press-scale-button, 0.96));
}

.floating-player__queue-trigger svg {
  display: block;
  width: 18px;
  height: 18px;
  stroke: currentColor;
  stroke-width: 2.4;
  stroke-linecap: round;
  stroke-linejoin: round;
  overflow: visible;
}

.floating-player__queue-badge {
  position: absolute;
  right: -4px;
  top: -4px;
  min-width: 14px;
  height: 14px;
  padding: 0 3px;
  border-radius: 999px;
  background: var(--app-text);
  color: var(--app-surface);
  font-size: 9px;
  line-height: 14px;
  text-align: center;
}

.floating-player__queue-popover {
  position: fixed;
  padding: 12px;
  border-radius: 24px;
  background:
    linear-gradient(180deg, color-mix(in srgb, white 18%, transparent), transparent 28%),
    color-mix(in srgb, var(--app-glass-strong) 94%, var(--app-surface));
  border: 1px solid var(--app-glass-border);
  box-shadow:
    0 18px 40px rgba(15, 18, 28, 0.18),
    inset 0 1px 0 color-mix(in srgb, white 24%, transparent);
  backdrop-filter: blur(26px) saturate(140%);
  -webkit-backdrop-filter: blur(26px) saturate(140%);
  overflow: hidden;
  z-index: 96;
}

.floating-player__queue-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
  padding: 2px 4px 8px;
  color: var(--app-text-secondary);
  border-bottom: 1px solid color-mix(in srgb, var(--app-glass-border) 56%, transparent);
}

.floating-player__queue-head-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.floating-player__queue-head strong {
  color: var(--app-text);
  font-size: 15px;
  line-height: 1.1;
}

.floating-player__queue-head-copy span,
.floating-player__queue-total {
  color: var(--app-text-secondary);
  font-size: 11px;
}

.floating-player__queue-total {
  flex-shrink: 0;
  padding: 4px 10px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--app-surface) 56%, transparent);
  box-shadow: inset 0 1px 0 color-mix(in srgb, white 26%, transparent);
}

.floating-player__queue-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: min(276px, calc(100vh - 180px));
  padding: 0 2px;
  overflow: auto;
  scrollbar-width: thin;
  scrollbar-color: color-mix(in srgb, var(--app-text) 24%, transparent) transparent;
}

.floating-player__queue-list::-webkit-scrollbar {
  width: 6px;
}

.floating-player__queue-list::-webkit-scrollbar-thumb {
  border-radius: 999px;
  background: color-mix(in srgb, var(--app-text) 22%, transparent);
}

.floating-player__queue-item {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-height: 56px;
  padding: 10px 12px;
  border: none;
  border-radius: 18px;
  background: transparent;
  color: var(--app-text);
  text-align: left;
  transition: background-color 140ms ease, transform 140ms ease, box-shadow 140ms ease, opacity 140ms ease;
}

.floating-player__queue-item--active {
  background: color-mix(in srgb, var(--app-surface) 82%, transparent);
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, white 36%, transparent),
    0 0 0 1px color-mix(in srgb, var(--app-glass-border) 40%, transparent);
  backdrop-filter: blur(14px) saturate(122%);
  -webkit-backdrop-filter: blur(14px) saturate(122%);
}

.floating-player__queue-item:not(.floating-player__queue-item--active) {
  opacity: 0.94;
}

.floating-player__queue-item:hover {
  background: color-mix(in srgb, var(--app-surface) 32%, transparent);
}

.floating-player__queue-item:active {
  transform: scale(var(--press-scale-button, 0.98));
}

.floating-player__queue-index {
  flex-shrink: 0;
  width: 24px;
  color: var(--app-text-tertiary);
  font-size: 12px;
  font-weight: 700;
  text-align: center;
}

.floating-player__queue-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  flex: 1;
  gap: 3px;
}

.floating-player__queue-copy strong,
.floating-player__queue-copy span {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.floating-player__queue-copy strong {
  font-size: 15px;
  font-weight: 700;
  line-height: 1.2;
}

.floating-player__queue-copy span {
  color: var(--app-text-secondary);
  font-size: 12px;
  line-height: 1.2;
}

.floating-player__queue-now {
  flex-shrink: 0;
  padding: 4px 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--app-text) 10%, transparent);
  color: var(--app-text-secondary);
  font-size: 10px;
  font-weight: 700;
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

.floating-player__volume {
  position: relative;
  display: flex;
  justify-content: center;
  margin-left: 2px;
}

.floating-player__volume-trigger {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  border: none;
  border-radius: 14px;
  background: color-mix(in srgb, var(--app-surface-soft) 88%, var(--app-surface));
  color: var(--app-text);
  cursor: pointer;
  transition: transform 140ms ease, background-color 140ms ease, opacity 140ms ease;
}

.floating-player__volume-trigger--active {
  background: color-mix(in srgb, var(--app-text) 12%, var(--app-surface-soft));
}

.floating-player__volume-trigger:active {
  transform: scale(var(--press-scale-button, 0.96));
}

.floating-player__volume-trigger svg {
  display: block;
  width: 18px;
  height: 18px;
  stroke: currentColor;
  stroke-width: 2.4;
  stroke-linecap: round;
  stroke-linejoin: round;
  overflow: visible;
}

.floating-player__volume-popover {
  position: absolute;
  right: 50%;
  bottom: calc(100% + 10px);
  transform: translateX(50%);
  width: 52px;
  padding: 8px 8px 10px;
  border-radius: 18px;
  background: color-mix(in srgb, var(--app-glass-strong) 92%, var(--app-surface));
  border: 1px solid var(--app-glass-border);
  box-shadow: var(--app-shadow);
  backdrop-filter: blur(24px) saturate(135%);
  -webkit-backdrop-filter: blur(24px) saturate(135%);
  overflow: hidden;
  z-index: 2;
}

.floating-player__volume-head {
  display: flex;
  justify-content: center;
  margin-bottom: 8px;
}

.floating-player__volume-value {
  color: var(--app-text-secondary);
  font-size: 11px;
  font-weight: 700;
  white-space: nowrap;
}

.floating-player__volume-rail {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 112px;
}

.floating-player__volume-slider {
  width: 112px;
  margin: 0;
  appearance: none;
  height: 5px;
  border-radius: 999px;
  outline: none;
  background:
    linear-gradient(to right, color-mix(in srgb, var(--app-text) 86%, white) 0%, color-mix(in srgb, var(--app-text) 86%, white) var(--player-progress, 0%), color-mix(in srgb, var(--app-border) 70%, transparent) var(--player-progress, 0%), color-mix(in srgb, var(--app-border) 70%, transparent) 100%);
  transform: rotate(-90deg);
}

.floating-player__volume-slider::-webkit-slider-thumb {
  appearance: none;
  width: 15px;
  height: 15px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--app-text) 86%, white);
  border: 2px solid var(--app-surface);
  box-shadow: 0 3px 10px rgba(20, 20, 22, 0.24);
}

.floating-player__volume-slider::-moz-range-thumb {
  width: 15px;
  height: 15px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--app-text) 86%, white);
  border: 2px solid var(--app-surface);
  box-shadow: 0 3px 10px rgba(20, 20, 22, 0.24);
}

.volume-popover-enter-active,
.volume-popover-leave-active {
  transition: opacity 140ms ease, transform 140ms ease;
}

.volume-popover-enter-from,
.volume-popover-leave-to {
  opacity: 0;
  transform: translateX(50%) translateY(8px) scale(0.98);
}

.queue-popover-enter-active,
.queue-popover-leave-active {
  transition: opacity 140ms ease, transform 140ms ease;
}

.queue-popover-enter-from,
.queue-popover-leave-to {
  opacity: 0;
  transform: translateY(8px) scale(0.98);
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

  .floating-player__volume-popover {
    right: 50%;
  }
}
</style>
