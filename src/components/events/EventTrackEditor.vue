<template>
  <div class="track-editor">
    <div class="track-editor__hero">
      <div>
        <p class="track-editor__eyebrow">{{ eyebrow }}</p>
        <h3 class="track-editor__title">{{ title }}</h3>
      </div>
      <button type="button" class="track-editor__add" @click="addManualTrack">{{ addButtonText }}</button>
    </div>

    <div class="track-editor__panel">
      <div class="track-editor__import-grid">
        <div class="track-editor__import-card">
          <label class="track-editor__label">网易云搜索导入</label>
          <div class="track-editor__input-row">
            <input
              v-model="searchKeyword"
              type="text"
              placeholder="输入歌曲名 / 歌手名"
              @keydown.enter.prevent="runSongSearch"
            />
            <button type="button" class="track-editor__action" :disabled="searchLoading" @click="runSongSearch">
              {{ searchLoading ? '搜索中' : '搜索' }}
            </button>
          </div>

          <p v-if="searchError" class="track-editor__hint track-editor__hint--error">{{ searchError }}</p>

          <div v-if="searchResults.length" class="track-editor__result-list">
            <article v-for="item in searchResults" :key="`${item.neteaseSongId}_${item.title}`" class="track-editor__result-item">
              <div class="track-editor__result-copy">
                <strong>{{ item.title }}</strong>
                <span>{{ item.artist || '未知歌手' }}</span>
                <span v-if="item.album">{{ item.album }}</span>
              </div>
              <button type="button" class="track-editor__result-btn" @click="appendTracks([item])">导入</button>
            </article>
          </div>
        </div>

        <div class="track-editor__import-card">
          <label class="track-editor__label">网易云歌单/专辑导入</label>
          <div class="track-editor__input-row">
            <input
              v-model="playlistInput"
              type="text"
              placeholder="粘贴歌单/专辑链接或对应 ID"
              @keydown.enter.prevent="importPlaylist"
            />
            <button type="button" class="track-editor__action" :disabled="playlistLoading" @click="importPlaylist">
              {{ playlistLoading ? '导入中' : '导入' }}
            </button>
          </div>

          <p v-if="playlistMessage" class="track-editor__hint" :class="{ 'track-editor__hint--error': playlistError }">
            {{ playlistMessage }}
          </p>
        </div>
      </div>

      <div v-if="tracks.length" class="track-editor__list">
        <article v-for="(track, index) in tracks" :key="track.id || `${track.neteaseSongId || 'manual'}_${index}`" class="track-editor__item">
          <div class="track-editor__item-head">
            <span class="track-editor__item-index">#{{ index + 1 }}</span>
            <div class="track-editor__badges">
              <span v-if="track.source === 'netease'" class="track-editor__badge">网易云</span>
              <span v-if="track.durationMs" class="track-editor__badge track-editor__badge--muted">{{ formatTrackDuration(track.durationMs) }}</span>
            </div>
            <button type="button" class="track-editor__remove" @click="removeTrack(index)">删除</button>
          </div>

          <div class="track-editor__field-grid">
            <label class="track-editor__field">
              <span>曲名</span>
              <input :value="track.title || ''" type="text" placeholder="请输入曲名" @input="updateField(index, 'title', $event.target.value)" />
            </label>

            <label class="track-editor__field">
              <span>歌手</span>
              <input :value="track.artist || ''" type="text" placeholder="请输入歌手" @input="updateField(index, 'artist', $event.target.value)" />
            </label>

            <label class="track-editor__field">
              <span>专辑</span>
              <input :value="track.album || ''" type="text" placeholder="可选" @input="updateField(index, 'album', $event.target.value)" />
            </label>

            <label class="track-editor__field">
              <span>时长</span>
              <input :value="formatEditableDuration(track.durationMs)" type="text" placeholder="如 04:36" @input="updateDuration(index, $event.target.value)" />
            </label>
          </div>
        </article>
      </div>

      <div v-else class="track-editor__empty">
        <p>{{ emptyText }}</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { fetchNeteaseCollectionTracks, formatTrackDuration, searchNeteaseSongs } from '@/utils/neteaseMusic'

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
    default: '演唱会曲目'
  },
  addButtonText: {
    type: String,
    default: '手动添加曲目'
  },
  emptyText: {
    type: String,
    default: '还没有曲目。可以手动添加，也可以从网易云搜索或导入歌单、专辑。'
  }
})

const emit = defineEmits(['update:modelValue'])

const searchKeyword = ref('')
const playlistInput = ref('')
const searchLoading = ref(false)
const playlistLoading = ref(false)
const searchError = ref('')
const playlistError = ref(false)
const playlistMessage = ref('')
const searchResults = ref([])

const tracks = computed(() => (Array.isArray(props.modelValue) ? props.modelValue : []))

function buildManualTrack() {
  return {
    id: `manual_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    title: '',
    artist: '',
    album: '',
    coverUrl: '',
    durationMs: 0,
    source: 'manual',
    neteaseSongId: ''
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
    source: String(track.source || (track.neteaseSongId ? 'netease' : 'manual')),
    neteaseSongId: String(track.neteaseSongId || '').trim()
  }
}

function updateTracks(nextTracks) {
  emit('update:modelValue', nextTracks.map(normalizeTrack))
}

function buildTrackDedupKey(track = {}) {
  if (track.neteaseSongId) return `netease:${track.neteaseSongId}`
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
    searchError.value = '请输入关键词'
    searchResults.value = []
    return
  }

  searchLoading.value = true
  searchError.value = ''
  try {
    searchResults.value = await searchNeteaseSongs(keyword, 30)
    if (!searchResults.value.length) {
      searchError.value = '没有找到可导入的歌曲'
    }
  } catch (error) {
    searchResults.value = []
    searchError.value = error?.message || '搜索失败'
  } finally {
    searchLoading.value = false
  }
}

async function importPlaylist() {
  const raw = String(playlistInput.value || '').trim()
  if (!raw) {
    playlistError.value = true
    playlistMessage.value = '请输入网易云歌单/专辑链接或对应 ID'
    return
  }

  playlistLoading.value = true
  playlistError.value = false
  playlistMessage.value = ''
  try {
    const result = await fetchNeteaseCollectionTracks(raw)
    appendTracks(result.tracks)
    const collectionLabel = result.type === 'album' ? '专辑' : '歌单'
    playlistMessage.value = result.name
      ? `已从${collectionLabel}《${result.name}》导入 ${result.tracks.length} 首`
      : `已导入 ${result.tracks.length} 首曲目`
  } catch (error) {
    playlistError.value = true
    playlistMessage.value = error?.message || '导入失败'
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
  border: 1px solid color-mix(in srgb, var(--app-border) 86%, transparent);
  border-radius: 22px;
  background: color-mix(in srgb, var(--app-surface-soft) 76%, var(--app-surface));
}

.track-editor__import-card,
.track-editor__empty {
  padding: 16px;
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
}

.track-editor__result-item {
  display: flex;
  align-items: center;
  gap: 12px;
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
