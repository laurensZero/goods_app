<template>
  <section class="track-list">
    <article
      v-for="(track, index) in normalizedTracks"
      :key="track.id || `${track.neteaseSongId || 'manual'}_${index}`"
      class="track-list__item"
      :class="{ 'track-list__item--active': activeTrackId === track.identity }"
      @click="handleTrackClick(track, $event)"
    >
      <div class="track-list__cover-shell">
        <img
          v-if="track.coverUrl"
          class="track-list__cover"
          :src="track.displayCoverUrl"
          :alt="track.title || '曲目封面'"
          loading="lazy"
          decoding="async"
          referrerpolicy="no-referrer"
        />
        <div v-else class="track-list__cover track-list__cover--placeholder" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none">
            <path d="M7 7H17V17H7V7Z" />
            <path d="M9 9H15V15H9V9Z" />
          </svg>
        </div>
      </div>

      <div class="track-list__copy">
        <div class="track-list__meta">
          <span class="track-list__index">#{{ index + 1 }}</span>
          <span v-if="track.source === 'netease'" class="track-list__badge">网易云</span>
          <span v-if="track.durationText" class="track-list__duration">{{ track.durationText }}</span>
        </div>
        <strong class="track-list__title">{{ track.title || '未命名曲目' }}</strong>
      </div>

      <div class="track-list__details">
        <p class="track-list__desc">
          <span v-if="track.artist">{{ track.artist }}</span>
          <span v-if="track.artist && track.album"> · </span>
          <span v-if="track.album">{{ track.album }}</span>
        </p>
        <div v-if="activeTrackId === track.identity" class="track-list__inline-progress">
          <span class="track-list__inline-progress-bar" :style="{ width: progressPercent }" />
        </div>
      </div>

      <div class="track-list__actions">
        <button
          type="button"
          class="track-list__action"
          :title="playButtonLabel(track)"
          :aria-label="playButtonLabel(track)"
          :disabled="!track.neteaseSongId || (isLoading && activeTrackId === track.identity)"
          @click="handlePlay(track)"
        >
          <span class="track-list__action-icon track-list__action-icon--dark" aria-hidden="true">
            <svg v-if="isPlaying && activeTrackId === track.identity" viewBox="0 0 24 24" fill="none">
              <path d="M9 6V18" />
              <path d="M15 6V18" />
            </svg>
            <svg v-else-if="isLoading && activeTrackId === track.identity" viewBox="0 0 24 24" fill="none">
              <path d="M12 4V7" />
              <path d="M12 17V20" />
              <path d="M4 12H7" />
              <path d="M17 12H20" />
              <path d="M6.35 6.35L8.47 8.47" />
              <path d="M15.53 15.53L17.65 17.65" />
              <path d="M17.65 6.35L15.53 8.47" />
              <path d="M8.47 15.53L6.35 17.65" />
            </svg>
            <svg v-else viewBox="0 0 24 24" fill="none">
              <path d="M8 6V18L18 12L8 6Z" />
            </svg>
          </span>
        </button>

        <button
          type="button"
          class="track-list__action"
          title="网易云打开"
          aria-label="网易云打开"
          :disabled="!track.neteaseSongId || openingSongId === track.neteaseSongId"
          @click="handleOpen(track)"
        >
          <span class="track-list__action-icon track-list__action-icon--light" aria-hidden="true">
            <svg v-if="openingSongId === track.neteaseSongId" viewBox="0 0 24 24" fill="none">
              <path d="M12 4V7" />
              <path d="M12 17V20" />
              <path d="M4 12H7" />
              <path d="M17 12H20" />
              <path d="M6.35 6.35L8.47 8.47" />
              <path d="M15.53 15.53L17.65 17.65" />
              <path d="M17.65 6.35L15.53 8.47" />
              <path d="M8.47 15.53L6.35 17.65" />
            </svg>
            <svg v-else viewBox="0 0 24 24" fill="none">
              <path d="M14 5H19V10" />
              <path d="M10 14L19 5" />
              <path d="M19 14V17C19 18.1046 18.1046 19 17 19H7C5.89543 19 5 18.1046 5 17V7C5 5.89543 5.89543 5 7 5H10" />
            </svg>
          </span>
        </button>
      </div>
    </article>

    <p v-if="errorMessage" class="track-list__error">{{ errorMessage }}</p>
  </section>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { fetchNeteaseSongCoverMap, formatTrackDuration, openNeteaseSong } from '@/utils/neteaseMusic'
import { useMediaPlayerStore } from '@/stores/mediaPlayer'
import { getCachedImage, peekCachedImage, preloadImages } from '@/utils/imageCache'

const props = defineProps({
  tracks: {
    type: Array,
    default: () => []
  }
})

const openingSongId = ref('')
const errorMessage = ref('')
const playerStore = useMediaPlayerStore()
const coverMap = ref({})
const cachedCoverMap = ref({})
const trackTapState = ref({
  identity: '',
  timerId: 0
})

const normalizedTracks = computed(() =>
  (Array.isArray(props.tracks) ? props.tracks : []).map((item) => {
    const songId = String(item?.neteaseSongId || '').trim()
    const coverUrl = String(item?.coverUrl || coverMap.value[songId] || '').trim()
    return {
      ...item,
      identity: String(item?.id || songId || ''),
      coverUrl,
      displayCoverUrl: String(cachedCoverMap.value[coverUrl] || peekCachedImage(coverUrl) || coverUrl).trim(),
      durationText: formatTrackDuration(item?.durationMs)
    }
  })
)
const activeTrackId = computed(() => playerStore.currentTrackId)
const isLoading = computed(() => playerStore.isLoading)
const isPlaying = computed(() => playerStore.isPlaying)
const progressPercent = computed(() => playerStore.progressPercent)

watch(
  () => playerStore.lastError,
  (message) => {
    errorMessage.value = message || ''
  },
  { immediate: true }
)

watch(
  () => props.tracks,
  async (tracks) => {
    const missingCoverIds = Array.from(new Set(
      (Array.isArray(tracks) ? tracks : [])
        .filter((item) => item?.neteaseSongId && !String(item?.coverUrl || '').trim())
        .map((item) => String(item.neteaseSongId).trim())
        .filter((songId) => songId && !coverMap.value[songId])
    ))

    if (!missingCoverIds.length) return

    try {
      const nextMap = await fetchNeteaseSongCoverMap(missingCoverIds)
      coverMap.value = { ...coverMap.value, ...nextMap }
    } catch {
      // ignore cover lookup failures
    }
  },
  { immediate: true, deep: true }
)

watch(normalizedTracks, (tracks) => {
  const coverUrls = tracks
    .map((item) => String(item?.coverUrl || '').trim())
    .filter(Boolean)

  if (!coverUrls.length) return

  preloadImages(coverUrls)

  coverUrls.forEach(async (coverUrl) => {
    if (cachedCoverMap.value[coverUrl]) return

    const memoryHit = peekCachedImage(coverUrl)
    if (memoryHit) {
      cachedCoverMap.value = {
        ...cachedCoverMap.value,
        [coverUrl]: memoryHit
      }
      return
    }

    try {
      const cachedUrl = await getCachedImage(coverUrl)
      cachedCoverMap.value = {
        ...cachedCoverMap.value,
        [coverUrl]: cachedUrl
      }
    } catch {
      // ignore image cache failures
    }
  })
}, { immediate: true })

async function handleOpen(track) {
  const songId = String(track?.neteaseSongId || '').trim()
  if (!songId) return

  openingSongId.value = songId
  errorMessage.value = ''
  try {
    await openNeteaseSong(songId)
  } catch (error) {
    errorMessage.value = error?.message || '打开网易云失败'
  } finally {
    window.setTimeout(() => {
      if (openingSongId.value === songId) {
        openingSongId.value = ''
      }
    }, 900)
  }
}

function playButtonLabel(track) {
  const identity = String(track?.id || track?.neteaseSongId || '').trim()
  if (isLoading.value && activeTrackId.value === identity) return '加载中'
  if (isPlaying.value && activeTrackId.value === identity) return '暂停播放'
  if (!isPlaying.value && activeTrackId.value === identity) return '继续播放'
  return '内嵌播放'
}

async function handlePlay(track) {
  if (!track?.neteaseSongId) return
  const identity = String(track?.id || track?.neteaseSongId || '').trim()
  if (isLoading.value && activeTrackId.value === identity) return
  errorMessage.value = ''
  try {
    await playerStore.toggleTrackPlayback(track, props.tracks)
    playerStore.showMiniPlayer()
  } catch (error) {
    errorMessage.value = error?.message || '内嵌播放失败'
  }
}

function isActionTarget(event) {
  return event?.target instanceof HTMLElement && !!event.target.closest('button, a, input, label')
}

function clearTrackTapTimer() {
  if (trackTapState.value.timerId) {
    window.clearTimeout(trackTapState.value.timerId)
  }
  trackTapState.value = {
    identity: '',
    timerId: 0
  }
}

function handleTrackActivate(track, event) {
  if (isActionTarget(event)) return
  clearTrackTapTimer()
  void handlePlay(track)
}

function handleTrackClick(track, event) {
  if (isActionTarget(event)) return

  const identity = String(track?.id || track?.neteaseSongId || '').trim()
  if (!identity) return

  if (trackTapState.value.identity === identity && trackTapState.value.timerId) {
    clearTrackTapTimer()
    void handlePlay(track)
    return
  }

  clearTrackTapTimer()
  trackTapState.value = {
    identity,
    timerId: window.setTimeout(() => {
      clearTrackTapTimer()
    }, 260)
  }
}
</script>

<style scoped>
.track-list {
  display: grid;
  gap: 12px;
}

.track-list__item {
  display: grid;
  grid-template-columns: 84px minmax(0, 1fr) auto;
  grid-template-areas:
    "cover copy actions"
    "cover details details";
  gap: 14px;
  padding: 16px;
  border-radius: 20px;
  background: var(--app-surface-soft);
  border: 1px solid transparent;
  transition: border-color 160ms ease, background 160ms ease, box-shadow 160ms ease;
}

.track-list__item--active {
  border-color: color-mix(in srgb, #141416 18%, transparent);
  background: color-mix(in srgb, var(--app-surface-soft) 76%, var(--app-surface));
  box-shadow: inset 0 0 0 1px color-mix(in srgb, #141416 6%, transparent);
}

.track-list__cover-shell {
  grid-area: cover;
  width: 84px;
  flex-shrink: 0;
  aspect-ratio: 1 / 1;
}

.track-list__cover {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 18px;
  background: color-mix(in srgb, var(--app-surface-soft) 84%, var(--app-surface));
}

.track-list__cover--placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--app-text-tertiary);
}

.track-list__cover--placeholder svg {
  width: 22px;
  height: 22px;
  stroke: currentColor;
  stroke-width: 1.8;
}

.track-list__copy {
  grid-area: copy;
  min-width: 0;
}

.track-list__details {
  grid-area: details;
  min-width: 0;
}

.track-list__meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.track-list__index,
.track-list__duration {
  color: var(--app-text-tertiary);
  font-size: 12px;
}

.track-list__badge {
  padding: 4px 8px;
  border-radius: 999px;
  background: rgba(250, 149, 90, 0.14);
  color: #d26f20;
  font-size: 11px;
  font-weight: 700;
}

.track-list__title {
  display: block;
  margin-top: 6px;
  color: var(--app-text);
  font-size: 15px;
  font-weight: 700;
  line-height: 1.5;
}

.track-list__desc {
  margin-top: 4px;
  color: var(--app-text-secondary);
  font-size: 13px;
  line-height: 1.6;
}

.track-list__inline-progress {
  position: relative;
  margin-top: 10px;
  height: 4px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--app-border) 74%, transparent);
  overflow: hidden;
}

.track-list__inline-progress-bar {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: #141416;
}

.track-list__actions {
  grid-area: actions;
  display: flex;
  gap: 8px;
  flex-shrink: 0;
  align-self: start;
}

.track-list__action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  padding: 0;
  border: none;
  border-radius: 16px;
  background: transparent;
}

.track-list__action-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 16px;
  border: 1px solid color-mix(in srgb, var(--app-border) 78%, transparent);
  box-shadow: 0 10px 20px rgba(20, 20, 22, 0.08);
}

.track-list__action-icon--dark {
  background: #141416;
  color: #fff;
  border-color: transparent;
}

.track-list__action-icon--light {
  background: color-mix(in srgb, #ffffff 88%, var(--app-surface));
  color: #141416;
}

.track-list__action-icon svg {
  width: 18px;
  height: 18px;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.track-list__action:disabled {
  opacity: 0.5;
}

.track-list__error {
  color: #c34a4a;
  font-size: 12px;
}

@media (max-width: 1024px) {
  .track-list__item {
    align-items: flex-start;
    gap: 12px;
    grid-template-columns: 56px minmax(0, 1fr) auto;
  }

  .track-list__cover-shell {
    width: 56px;
  }

  .track-list__cover {
    border-radius: 16px;
  }

  .track-list__title {
    margin-top: 0;
  }
}
</style>
