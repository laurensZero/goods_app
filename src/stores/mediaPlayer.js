import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { fetchNeteaseLyrics, fetchNeteasePlayableUrl } from '@/utils/neteaseMusic'

function getTrackIdentity(track = {}) {
  return String(track?.id || track?.neteaseSongId || '').trim()
}

function normalizeQueue(queue) {
  return (Array.isArray(queue) ? queue : []).filter((item) => getTrackIdentity(item))
}

function supportsMediaSession() {
  return typeof navigator !== 'undefined' && 'mediaSession' in navigator
}

function buildArtworkList(track = {}) {
  const coverUrl = String(track?.coverUrl || '').trim()
  if (!coverUrl) return []

  return [96, 128, 192, 256, 384, 512].map((size) => ({
    src: coverUrl,
    sizes: `${size}x${size}`,
    type: 'image/jpeg'
  }))
}

export const useMediaPlayerStore = defineStore('mediaPlayer', () => {
  const queue = ref([])
  const currentIndex = ref(-1)
  const isLoading = ref(false)
  const isPlaying = ref(false)
  const currentTime = ref(0)
  const duration = ref(0)
  const lastError = ref('')
  const miniVisible = ref(true)
  const playableUrlCache = new Map()
  const lyricsCache = new Map()
  const lyricsStatus = ref('idle')
  const lyricsLines = ref([])
  let audio = null
  let rafId = 0
  let playRequestToken = 0

  const currentTrack = computed(() => queue.value[currentIndex.value] || null)
  const currentTrackId = computed(() => getTrackIdentity(currentTrack.value))
  const progressRatio = computed(() => {
    if (!duration.value) return 0
    return Math.min(1, Math.max(0, currentTime.value / duration.value))
  })
  const progressPercent = computed(() => `${(progressRatio.value * 100).toFixed(3)}%`)
  const hasPrevious = computed(() => currentIndex.value > 0)
  const hasNext = computed(() => currentIndex.value >= 0 && currentIndex.value < queue.value.length - 1)
  const currentLyricLine = computed(() => {
    const nowMs = Math.max(0, Math.round((currentTime.value || 0) * 1000))
    const lines = Array.isArray(lyricsLines.value) ? lyricsLines.value : []
    if (!lines.length) {
      return lyricsStatus.value === 'loading' ? '歌词加载中...' : ''
    }

    let activeText = ''
    for (const line of lines) {
      if ((Number(line?.timeMs) || 0) > nowMs) break
      activeText = String(line?.text || '').trim()
    }

    return activeText || String(lines[0]?.text || '').trim()
  })

  function resetLyrics() {
    lyricsStatus.value = 'idle'
    lyricsLines.value = []
  }

  function syncMediaSessionPlaybackState() {
    if (!supportsMediaSession()) return
    navigator.mediaSession.playbackState = isPlaying.value ? 'playing' : 'paused'
  }

  function syncMediaSessionPositionState() {
    if (!supportsMediaSession() || !audio || typeof navigator.mediaSession.setPositionState !== 'function') return

    const playbackDuration = Number.isFinite(audio.duration) ? Math.max(0, audio.duration) : 0
    if (playbackDuration <= 0) return

    navigator.mediaSession.setPositionState({
      duration: playbackDuration,
      playbackRate: Number(audio.playbackRate) > 0 ? Number(audio.playbackRate) : 1,
      position: Math.min(playbackDuration, Math.max(0, Number(audio.currentTime) || 0))
    })
  }

  function clearMediaSessionPositionState() {
    if (!supportsMediaSession() || typeof navigator.mediaSession.setPositionState !== 'function') return

    try {
      navigator.mediaSession.setPositionState()
    } catch {
      // ignore unsupported reset behavior
    }
  }

  function syncMediaSessionMetadata(track = currentTrack.value) {
    if (!supportsMediaSession()) return

    if (!track) {
      navigator.mediaSession.metadata = null
      clearMediaSessionPositionState()
      syncMediaSessionPlaybackState()
      return
    }

    navigator.mediaSession.metadata = new MediaMetadata({
      title: String(track.title || '未命名曲目'),
      artist: String(track.artist || ''),
      album: String(track.album || ''),
      artwork: buildArtworkList(track)
    })
    syncMediaSessionPlaybackState()
    syncMediaSessionPositionState()
  }

  function bindMediaSessionActions() {
    if (!supportsMediaSession()) return

    const handlers = {
      play: () => { void togglePlayPause() },
      pause: () => { void togglePlayPause() },
      previoustrack: () => { void playPrevious() },
      nexttrack: () => { void playNext() },
      seekbackward: (details = {}) => {
        const offset = Number(details.seekOffset) || 10
        seekTo((audio?.currentTime || currentTime.value || 0) - offset)
      },
      seekforward: (details = {}) => {
        const offset = Number(details.seekOffset) || 10
        seekTo((audio?.currentTime || currentTime.value || 0) + offset)
      },
      seekto: (details = {}) => {
        if (details.fastSeek && audio && typeof audio.fastSeek === 'function' && Number.isFinite(details.seekTime)) {
          audio.fastSeek(details.seekTime)
          syncCurrentTime()
          syncMediaSessionPositionState()
          return
        }

        seekTo(details.seekTime)
      }
    }

    for (const [action, handler] of Object.entries(handlers)) {
      try {
        navigator.mediaSession.setActionHandler(action, handler)
      } catch {
        // ignore unsupported actions
      }
    }
  }

  function ensureAudio() {
    if (audio || typeof Audio === 'undefined') return audio

    audio = new Audio()
    audio.preload = 'metadata'

    audio.addEventListener('play', () => {
      isPlaying.value = true
      syncCurrentTime()
      syncMediaSessionPlaybackState()
      syncMediaSessionPositionState()
      startProgressLoop()
    })

    audio.addEventListener('pause', () => {
      isPlaying.value = false
      syncCurrentTime()
      syncMediaSessionPlaybackState()
      syncMediaSessionPositionState()
      stopProgressLoop()
    })

    audio.addEventListener('loadedmetadata', () => {
      duration.value = Number.isFinite(audio.duration) ? Math.max(0, audio.duration) : 0
      syncCurrentTime()
      syncMediaSessionPositionState()
    })

    audio.addEventListener('timeupdate', () => {
      syncCurrentTime()
      syncMediaSessionPositionState()
    })

    audio.addEventListener('ended', () => {
      syncCurrentTime()
      syncMediaSessionPlaybackState()
      syncMediaSessionPositionState()
      if (hasNext.value) {
        void playAtIndex(currentIndex.value + 1)
        return
      }
      isPlaying.value = false
      stopProgressLoop()
    })

    audio.addEventListener('error', () => {
      lastError.value = '音频播放失败'
      isLoading.value = false
      isPlaying.value = false
      syncMediaSessionPlaybackState()
      stopProgressLoop()
    })

    bindMediaSessionActions()

    return audio
  }

  function syncCurrentTime() {
    if (!audio) return
    currentTime.value = Number.isFinite(audio.currentTime) ? Math.max(0, audio.currentTime) : 0
    duration.value = Number.isFinite(audio.duration) ? Math.max(0, audio.duration) : duration.value
  }

  function stopProgressLoop() {
    if (!rafId) return
    window.cancelAnimationFrame(rafId)
    rafId = 0
  }

  function startProgressLoop() {
    stopProgressLoop()
    const loop = () => {
      if (!audio || audio.paused) {
        rafId = 0
        return
      }
      syncCurrentTime()
      rafId = window.requestAnimationFrame(loop)
    }
    rafId = window.requestAnimationFrame(loop)
  }

  function setQueue(nextQueue, startIndex = 0) {
    queue.value = normalizeQueue(nextQueue)
    currentIndex.value = queue.value.length ? Math.min(Math.max(0, startIndex), queue.value.length - 1) : -1
  }

  function replaceQueue(nextQueue) {
    queue.value = normalizeQueue(nextQueue)
  }

  async function resolvePlayableUrl(track) {
    const trackId = getTrackIdentity(track)
    if (!trackId) {
      throw new Error('缺少可播放曲目')
    }

    if (playableUrlCache.has(trackId)) {
      return playableUrlCache.get(trackId)
    }

    const result = await fetchNeteasePlayableUrl(track.neteaseSongId)
    playableUrlCache.set(trackId, result.url)
    return result.url
  }

  async function resolveLyrics(track) {
    const trackId = getTrackIdentity(track)
    const songId = String(track?.neteaseSongId || '').trim()
    if (!trackId || !songId) {
      resetLyrics()
      return
    }

    if (lyricsCache.has(trackId)) {
      lyricsLines.value = lyricsCache.get(trackId)
      lyricsStatus.value = lyricsLines.value.length ? 'ready' : 'empty'
      return
    }

    lyricsStatus.value = 'loading'
    try {
      const result = await fetchNeteaseLyrics(songId)
      const nextLines = Array.isArray(result?.lines) ? result.lines : []
      lyricsCache.set(trackId, nextLines)
      if (currentTrackId.value !== trackId) return
      lyricsLines.value = nextLines
      lyricsStatus.value = nextLines.length ? 'ready' : 'empty'
    } catch {
      if (currentTrackId.value !== trackId) return
      lyricsLines.value = []
      lyricsStatus.value = 'error'
    }
  }

  async function playAtIndex(index) {
    const targetAudio = ensureAudio()
    const track = queue.value[index]
    if (!targetAudio || !track) return
    const trackId = getTrackIdentity(track)
    const requestToken = ++playRequestToken

    isLoading.value = true
    lastError.value = ''
    resetLyrics()
    currentIndex.value = index

    try {
      const url = await resolvePlayableUrl(track)
      if (requestToken !== playRequestToken || getTrackIdentity(queue.value[index]) !== trackId) return
      if (targetAudio.src !== url) {
        targetAudio.src = url
      }
      await targetAudio.play()
      if (requestToken !== playRequestToken) return
      miniVisible.value = true
      void resolveLyrics(track)
    } catch (error) {
      if (requestToken !== playRequestToken) return
      lastError.value = error?.message || '内嵌播放失败'
      throw error
    } finally {
      if (requestToken === playRequestToken) {
        isLoading.value = false
      }
    }
  }

  async function playTrack(track, nextQueue = []) {
    const identity = getTrackIdentity(track)
    if (!identity) return

    const previousQueue = [...queue.value]
    const previousIndex = currentIndex.value

    const normalizedQueue = normalizeQueue(nextQueue)
    const matchedIndex = normalizedQueue.findIndex((item) => getTrackIdentity(item) === identity)
    if (matchedIndex >= 0) {
      replaceQueue(normalizedQueue)
      try {
        await playAtIndex(matchedIndex)
      } catch (error) {
        queue.value = previousQueue
        currentIndex.value = previousIndex
        throw error
      }
      return
    }

    replaceQueue([track])
    try {
      await playAtIndex(0)
    } catch (error) {
      queue.value = previousQueue
      currentIndex.value = previousIndex
      throw error
    }
  }

  async function toggleTrackPlayback(track, nextQueue = []) {
    const targetAudio = ensureAudio()
    const identity = getTrackIdentity(track)
    if (!targetAudio || !identity) return

    if (isLoading.value && currentTrackId.value === identity) {
      return
    }

    if (currentTrackId.value === identity && !targetAudio.paused) {
      targetAudio.pause()
      return
    }

    if (currentTrackId.value === identity && targetAudio.paused && targetAudio.src) {
      await targetAudio.play()
      miniVisible.value = true
      return
    }

    await playTrack(track, nextQueue)
  }

  async function togglePlayPause() {
    const targetAudio = ensureAudio()
    if (!targetAudio || !currentTrack.value) return

    if (targetAudio.paused) {
      await targetAudio.play()
      miniVisible.value = true
    } else {
      targetAudio.pause()
    }
  }

  async function playNext() {
    if (!hasNext.value) return
    await playTrack(queue.value[currentIndex.value + 1], queue.value)
  }

  async function playPrevious() {
    if (!hasPrevious.value) return
    await playTrack(queue.value[currentIndex.value - 1], queue.value)
  }

  function seekTo(nextTime) {
    const targetAudio = ensureAudio()
    if (!targetAudio) return

    const bounded = Math.min(Math.max(0, Number(nextTime) || 0), duration.value || 0)
    targetAudio.currentTime = bounded
    currentTime.value = bounded
    syncMediaSessionPositionState()
  }

  function stopPlayback() {
    if (!audio) return
    playRequestToken += 1
    audio.pause()
    audio.removeAttribute('src')
    audio.load()
    currentTime.value = 0
    duration.value = 0
    isPlaying.value = false
    isLoading.value = false
    stopProgressLoop()
    resetLyrics()
    syncMediaSessionMetadata(null)
  }

  function closeMiniPlayer() {
    stopPlayback()
    queue.value = []
    currentIndex.value = -1
    lastError.value = ''
    miniVisible.value = false
  }

  function showMiniPlayer() {
    miniVisible.value = true
  }

  watch(currentTrack, (track) => {
    syncMediaSessionMetadata(track)
  }, { immediate: true })

  watch(isPlaying, () => {
    syncMediaSessionPlaybackState()
  }, { immediate: true })

  return {
    queue,
    currentIndex,
    currentTrack,
    currentTrackId,
    isLoading,
    isPlaying,
    currentTime,
    duration,
    progressRatio,
    progressPercent,
    lyricsStatus,
    lyricsLines,
    currentLyricLine,
    lastError,
    miniVisible,
    hasPrevious,
    hasNext,
    playTrack,
    toggleTrackPlayback,
    togglePlayPause,
    playNext,
    playPrevious,
    seekTo,
    closeMiniPlayer,
    showMiniPlayer,
    stopPlayback
  }
})
