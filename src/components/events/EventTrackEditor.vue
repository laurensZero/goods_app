<template>
  <div class="track-editor">
    <div class="track-editor__hero">
      <div>
        <p class="track-editor__eyebrow">{{ eyebrow }}</p>
        <h3 class="track-editor__title">{{ title }}</h3>
      </div>
      <button type="button" class="track-editor__add" @click="addManualTrack">{{ t('events.tracks.manualAdd') }}</button>
    </div>

    <div class="track-editor__panel">
      <div class="track-editor__import-grid">
        <div class="track-editor__import-card">
          <div class="track-editor__card-header">
            <label class="track-editor__label">{{ t('events.tracks.searchImport') }}</label>
            <div class="track-editor__source-toggle">
              <button
                type="button"
                class="track-editor__source-btn"
                :class="{ 'track-editor__source-btn--active': searchSource === 'netease' }"
                @click="searchSource = 'netease'"
              >{{ t('events.tracks.netease') }}</button>
              <button
                type="button"
                class="track-editor__source-btn track-editor__source-btn--qq"
                :class="{ 'track-editor__source-btn--active': searchSource === 'qq' }"
                @click="searchSource = 'qq'"
              >{{ t('events.tracks.qqMusic') }}</button>
            </div>
          </div>
          <div class="track-editor__input-row">
            <input
              v-model="searchKeyword"
              type="text"
              :placeholder="searchSource === 'qq' ? t('events.tracks.searchPlaceholderQQ') : t('events.tracks.searchPlaceholder')"
              @keydown.enter.prevent="runSongSearch"
            />
            <button type="button" class="track-editor__action" :disabled="searchLoading" @click="runSongSearch">
              {{ searchLoading ? t('events.tracks.searching') : t('events.tracks.search') }}
            </button>
          </div>

          <p v-if="searchError" class="track-editor__hint track-editor__hint--error">{{ searchError }}</p>

          <div v-if="searchResults.length" ref="searchResultListRef" class="track-editor__result-list" @scroll="onSearchResultScroll">
            <article
              v-for="(item, idx) in searchResults"
              :key="`${item.neteaseSongId || item.qqSongId || ''}_${idx}`"
              class="track-editor__result-item"
            >
              <div class="track-editor__result-copy">
                <strong>{{ item.title }}</strong>
                <span>{{ item.artist || t('events.tracks.unknownArtist') }}</span>
                <span v-if="item.album">{{ item.album }}</span>
              </div>
              <button type="button" class="track-editor__result-btn" @click="appendTracks([item])">{{ t('events.tracks.importBtn') }}</button>
            </article>
            <p v-if="searchLoadingMore" class="track-editor__hint">{{ t('events.tracks.searching') }}...</p>
            <p v-else-if="searchHasMore" class="track-editor__load-more" @click="loadMoreSearch">{{ t('events.tracks.loadMore') }}</p>
            <p v-else-if="searchResults.length >= 10" class="track-editor__hint">{{ t('events.tracks.noMoreResults') }}</p>
          </div>
        </div>

        <div class="track-editor__import-card">
          <div class="track-editor__card-header">
            <label class="track-editor__label">{{ t('events.tracks.collectionImport') }}</label>
            <span v-if="importDetectedSource" class="track-editor__detected-badge" :class="{ 'track-editor__detected-badge--qq': importDetectedSource === 'qq' }">
              {{ importDetectedSource === 'qq' ? t('events.tracks.qqMusic') : t('events.tracks.netease') }}
            </span>
          </div>
          <div class="track-editor__input-row">
            <input
              v-model="playlistInput"
              type="text"
              :placeholder="t('events.tracks.collectionPlaceholder')"
              @keydown.enter.prevent="importPlaylist"
            />
            <button type="button" class="track-editor__action" :disabled="playlistLoading" @click="importPlaylist">
              {{ playlistLoading ? t('events.tracks.importing') : t('events.tracks.import') }}
            </button>
          </div>

          <p v-if="playlistMessage" class="track-editor__hint" :class="{ 'track-editor__hint--error': playlistError }">
            {{ playlistMessage }}
          </p>
        </div>
      </div>

      <div v-if="tracks.length" class="track-editor__list">
        <article v-for="(track, index) in tracks" :key="track.id || `${track.neteaseSongId || track.qqSongId || 'manual'}_${index}`" class="track-editor__item">
          <div class="track-editor__item-head">
            <span class="track-editor__item-index">#{{ index + 1 }}</span>
            <div class="track-editor__badges">
              <span v-if="track.source === 'netease'" class="track-editor__badge">{{ t('events.tracks.netease') }}</span>
              <span v-if="track.source === 'qq'" class="track-editor__badge track-editor__badge--qq">{{ t('events.tracks.qqMusic') }}</span>
              <span v-if="track.durationMs" class="track-editor__badge track-editor__badge--muted">{{ formatTrackDuration(track.durationMs) }}</span>
            </div>
            <button type="button" class="track-editor__remove" @click="removeTrack(index)">{{ t('events.tracks.delete') }}</button>
          </div>

          <div class="track-editor__field-grid">
            <label class="track-editor__field">
              <span>{{ t('events.tracks.trackName') }}</span>
              <input :value="track.title || ''" type="text" :placeholder="t('events.tracks.trackNamePlaceholder')" @input="updateField(index, 'title', $event.target.value)" />
            </label>

            <label class="track-editor__field">
              <span>{{ t('events.tracks.artist') }}</span>
              <input :value="track.artist || ''" type="text" :placeholder="t('events.tracks.artistPlaceholder')" @input="updateField(index, 'artist', $event.target.value)" />
            </label>

            <label class="track-editor__field">
              <span>{{ t('events.tracks.album') }}</span>
              <input :value="track.album || ''" type="text" :placeholder="t('events.tracks.albumPlaceholder')" @input="updateField(index, 'album', $event.target.value)" />
            </label>

            <label class="track-editor__field">
              <span>{{ t('events.tracks.duration') }}</span>
              <input :value="formatEditableDuration(track.durationMs)" type="text" :placeholder="t('events.tracks.durationPlaceholder')" @input="updateDuration(index, $event.target.value)" />
            </label>
          </div>
        </article>
      </div>

      <div v-else class="track-editor__empty">
        <p>{{ t('events.tracks.noTracks') }}</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { fetchNeteaseCollectionTracks, formatTrackDuration, searchNeteaseSongs } from '@/utils/neteaseMusic'
import { searchQQSongs, fetchQQCollectionTracks, extractQQAlbumMid, extractQQPlaylistId } from '@/utils/qqMusic'

const { t } = useI18n()

const props = defineProps({
  modelValue: {
    type: Array,
    default: () => []
  },
  eyebrow: {
    type: String,
    default: 'Concert Setlist'
  },
  title: {
    type: String,
    default: ''
  }
})

const emit = defineEmits(['update:modelValue'])

const searchSource = ref('netease')
const searchKeyword = ref('')
const playlistInput = ref('')
const searchLoading = ref(false)
const searchLoadingMore = ref(false)
const playlistLoading = ref(false)
const searchError = ref('')
const playlistError = ref(false)
const playlistMessage = ref('')
const searchResults = ref([])
const searchPage = ref(1)
const searchHasMore = ref(true)
const searchResultListRef = ref(null)

const resolvedTitle = computed(() => props.title || t('events.addEdit.concertSetlist'))

const tracks = computed(() => (Array.isArray(props.modelValue) ? props.modelValue : []))

const importDetectedSource = computed(() => {
  const raw = String(playlistInput.value || '').trim()
  if (!raw) return ''
  if (extractQQAlbumMid(raw)) return 'qq'
  if (/music\.163\.com/i.test(raw) || /^\d{3,}$/.test(raw)) return 'netease'
  return ''
})

watch(searchSource, () => {
  if (searchKeyword.value.trim() && searchResults.value.length) {
    void runSongSearch()
  }
})

function buildManualTrack() {
  return {
    id: `manual_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    title: '',
    artist: '',
    album: '',
    coverUrl: '',
    durationMs: 0,
    source: 'manual',
    neteaseSongId: '',
    qqSongId: ''
  }
}

function normalizeTrack(track = {}) {
  return {
    id: String(track.id || `track_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`),
    title: String(track.title || '').trim(),
    artist: String(track.artist || '').trim(),
    album: String(track.album || '').trim(),
    coverUrl: String(track.coverUrl || '').trim(),
    durationMs: Math.max(0, Number(track.durationMs) || 0),
    source: String(track.source || (track.neteaseSongId ? 'netease' : track.qqSongId ? 'qq' : 'manual')),
    neteaseSongId: String(track.neteaseSongId || '').trim(),
    qqSongId: String(track.qqSongId || '').trim()
  }
}

function updateTracks(nextTracks) {
  emit('update:modelValue', nextTracks.map(normalizeTrack))
}

function buildTrackDedupKey(track = {}) {
  if (track.neteaseSongId) return `netease:${track.neteaseSongId}`
  if (track.qqSongId) return `qq:${track.qqSongId}`
  return `manual:${String(track.title || '').trim().toLowerCase()}::${String(track.artist || '').trim().toLowerCase()}`
}

function appendTracks(items) {
  const merged = [...tracks.value]
  const existingKeys = new Set(merged.map(buildTrackDedupKey))

  for (const item of items || []) {
    const normalized = normalizeTrack(item)
    const dedupKey = buildTrackDedupKey(normalized)
    if (existingKeys.has(dedupKey)) continue
    merged.push(normalized)
    existingKeys.add(dedupKey)
  }

  updateTracks(merged)
}

function addManualTrack() {
  updateTracks([...tracks.value, buildManualTrack()])
}

function removeTrack(index) {
  updateTracks(tracks.value.filter((_, currentIndex) => currentIndex !== index))
}

function updateField(index, key, value) {
  const next = tracks.value.map((item, currentIndex) => (
    currentIndex === index
      ? { ...item, [key]: String(value || '') }
      : item
  ))
  updateTracks(next)
}

function formatEditableDuration(durationMs) {
  return formatTrackDuration(durationMs)
}

function parseDurationInput(value) {
  const normalized = String(value || '').trim()
  if (!normalized) return 0

  const minuteSecondMatch = normalized.match(/^(\d{1,3}):(\d{1,2})$/)
  if (minuteSecondMatch) {
    const minutes = Number(minuteSecondMatch[1]) || 0
    const seconds = Number(minuteSecondMatch[2]) || 0
    return ((minutes * 60) + Math.min(59, seconds)) * 1000
  }

  const asSeconds = Number(normalized)
  return Number.isFinite(asSeconds) && asSeconds > 0 ? Math.round(asSeconds * 1000) : 0
}

function updateDuration(index, value) {
  const next = tracks.value.map((item, currentIndex) => (
    currentIndex === index
      ? { ...item, durationMs: parseDurationInput(value) }
      : item
  ))
  updateTracks(next)
}

async function runSongSearch() {
  const keyword = String(searchKeyword.value || '').trim()
  if (!keyword) {
    searchError.value = t('events.tracks.searchPlaceholder')
    searchResults.value = []
    return
  }

  searchLoading.value = true
  searchError.value = ''
  searchPage.value = 1
  searchHasMore.value = true
  try {
    const limit = 20
    let results
    if (searchSource.value === 'qq') {
      results = await searchQQSongs(keyword, limit)
    } else {
      results = await searchNeteaseSongs(keyword, limit)
    }
    searchResults.value = results
    searchHasMore.value = results.length >= limit
    if (!results.length) {
      searchError.value = t('events.tracks.noResults')
    }
  } catch (error) {
    searchResults.value = []
    searchError.value = error?.message || t('events.tracks.searchFailed')
  } finally {
    searchLoading.value = false
  }
}

async function loadMoreSearch() {
  const keyword = String(searchKeyword.value || '').trim()
  if (!keyword || searchLoadingMore.value || !searchHasMore.value) return

  searchLoadingMore.value = true
  try {
    searchPage.value += 1
    const limit = 20
    const offset = (searchPage.value - 1) * limit
    let results
    if (searchSource.value === 'qq') {
      results = await searchQQSongs(keyword, limit, searchPage.value)
    } else {
      results = await searchNeteaseSongs(keyword, limit, offset)
    }
    if (results.length) {
      const existingKeys = new Set(searchResults.value.map((item) => item.neteaseSongId || item.qqSongId || item.title))
      const fresh = results.filter((item) => !existingKeys.has(item.neteaseSongId || item.qqSongId || item.title))
      searchResults.value = [...searchResults.value, ...fresh]
    }
    searchHasMore.value = results.length >= limit
  } catch {
    // ignore load more errors
  } finally {
    searchLoadingMore.value = false
  }
}

function onSearchResultScroll(event) {
  const el = event.target
  if (!el || searchLoadingMore.value || !searchHasMore.value) return
  if (el.scrollTop + el.clientHeight >= el.scrollHeight - 40) {
    void loadMoreSearch()
  }
}

async function importPlaylist() {
  const raw = String(playlistInput.value || '').trim()
  if (!raw) {
    playlistError.value = true
    playlistMessage.value = t('events.tracks.importEmpty')
    return
  }

  const isQQDomain = /y\.qq\.com/i.test(raw)
  const isQQ = !!extractQQAlbumMid(raw)

  if (isQQDomain && !isQQ) {
    playlistError.value = true
    playlistMessage.value = t('events.tracks.qqPlaylistNotSupported')
    return
  }

  playlistLoading.value = true
  playlistError.value = false
  playlistMessage.value = ''
  try {
    const result = isQQ
      ? await fetchQQCollectionTracks(raw)
      : await fetchNeteaseCollectionTracks(raw)
    appendTracks(result.tracks)
    const type = result.type === 'album' ? '专辑' : '歌单'
    playlistMessage.value = result.name
      ? t('events.tracks.importSuccess', { type, name: result.name, count: result.tracks.length })
      : t('events.tracks.importSuccessNoName', { count: result.tracks.length })
  } catch (error) {
    playlistError.value = true
    playlistMessage.value = error?.message || t('events.tracks.importFailed')
  } finally {
    playlistLoading.value = false
  }
}
</script>

<style scoped>
.track-editor {
  display: grid;
  gap: 14px;
}

.track-editor__hero {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.track-editor__eyebrow {
  color: var(--app-text-tertiary);
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.track-editor__title {
  margin-top: 4px;
  color: var(--app-text);
  font-size: 20px;
  font-weight: 700;
  letter-spacing: -0.03em;
}

.track-editor__add,
.track-editor__action,
.track-editor__result-btn,
.track-editor__remove {
  flex-shrink: 0;
  border: none;
  border-radius: 14px;
  font-weight: 600;
}

.track-editor__add,
.track-editor__action,
.track-editor__result-btn {
  height: 42px;
  padding: 0 14px;
  background: #141416;
  color: #fff;
}

.track-editor__panel {
  display: grid;
  gap: 14px;
}

.track-editor__import-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.track-editor__import-card,
.track-editor__item,
.track-editor__empty {
  min-width: 0;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--app-border) 86%, transparent);
  border-radius: 22px;
  background: color-mix(in srgb, var(--app-surface-soft) 76%, var(--app-surface));
}

.track-editor__import-card,
.track-editor__empty {
  padding: 16px;
}

.track-editor__card-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  min-height: 30px;
}

.track-editor__source-toggle {
  display: flex;
  gap: 4px;
  padding: 3px;
  border-radius: 12px;
  background: var(--app-surface);
}

.track-editor__source-btn {
  padding: 5px 10px;
  border: none;
  border-radius: 10px;
  background: transparent;
  color: var(--app-text-tertiary);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: background 160ms ease, color 160ms ease;
}

.track-editor__source-btn--active {
  background: #141416;
  color: #fff;
}

.track-editor__source-btn--qq.track-editor__source-btn--active {
  background: #1a9c54;
  color: #fff;
}

.track-editor__label,
.track-editor__field span {
  color: var(--app-text-secondary);
  font-size: 13px;
  font-weight: 600;
}

.track-editor__input-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
  margin-top: 10px;
}

.track-editor input {
  width: 100%;
  max-width: 100%;
  min-height: var(--input-height);
  padding: 0 14px;
  border: 1px solid color-mix(in srgb, var(--app-border) 88%, transparent);
  border-radius: 16px;
  background: var(--app-surface);
  color: var(--app-text);
  font-size: 14px;
}

.track-editor__hint {
  margin-top: 10px;
  color: var(--app-text-tertiary);
  font-size: 12px;
  line-height: 1.6;
}

.track-editor__hint--error {
  color: #c34a4a;
}

.track-editor__result-list,
.track-editor__list {
  display: grid;
  gap: 10px;
}

.track-editor__result-list {
  margin-top: 12px;
  max-height: 280px;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.track-editor__load-more {
  margin-top: 8px;
  color: var(--app-text-secondary);
  font-size: 13px;
  font-weight: 600;
  text-align: center;
  cursor: pointer;
  padding: 8px;
  border-radius: 12px;
  transition: background 160ms ease;
}

.track-editor__load-more:hover {
  background: var(--app-surface);
}

.track-editor__result-item {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  padding: 12px;
  border-radius: 18px;
  background: var(--app-surface);
}

.track-editor__result-copy {
  min-width: 0;
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 3px;
}

.track-editor__result-copy strong,
.track-editor__item-index {
  color: var(--app-text);
}

.track-editor__result-copy strong {
  font-size: 14px;
}

.track-editor__result-copy span {
  color: var(--app-text-tertiary);
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.track-editor__item {
  padding: 14px;
}

.track-editor__item-head {
  display: flex;
  align-items: center;
  gap: 10px;
}

.track-editor__item-index {
  font-size: 14px;
  font-weight: 700;
}

.track-editor__badges {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.track-editor__badge {
  padding: 4px 8px;
  border-radius: 999px;
  background: rgba(250, 149, 90, 0.14);
  color: #d26f20;
  font-size: 11px;
  font-weight: 700;
}

.track-editor__badge--muted {
  background: color-mix(in srgb, var(--app-surface-soft) 90%, transparent);
  color: var(--app-text-secondary);
}

.track-editor__badge--qq {
  background: rgba(49, 194, 124, 0.14);
  color: #1a9c54;
}

.track-editor__detected-badge {
  padding: 4px 10px;
  border-radius: 999px;
  background: rgba(250, 149, 90, 0.14);
  color: #d26f20;
  font-size: 11px;
  font-weight: 700;
}

.track-editor__detected-badge--qq {
  background: rgba(49, 194, 124, 0.14);
  color: #1a9c54;
}

.track-editor__remove {
  margin-left: auto;
  height: 34px;
  padding: 0 12px;
  background: color-mix(in srgb, #d15353 12%, var(--app-surface));
  color: #b63e3e;
}

.track-editor__field-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin-top: 12px;
}

.track-editor__field {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

.track-editor__empty {
  color: var(--app-text-tertiary);
  font-size: 14px;
  line-height: 1.7;
}

@media (max-width: 720px) {
  .track-editor__hero,
  .track-editor__item-head {
    align-items: flex-start;
    flex-direction: column;
  }

  .track-editor__add,
  .track-editor__remove {
    width: 100%;
  }

  .track-editor__import-grid,
  .track-editor__field-grid,
  .track-editor__input-row {
    grid-template-columns: 1fr;
  }
}
</style>
