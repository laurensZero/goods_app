import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { fetchNeteasePlayableUrl } from '@/utils/neteaseMusic'

function getTrackIdentity(track = {}) {
  return String(track?.id || track?.neteaseSongId || '').trim()
}

function normalizeQueue(queue) {
  return (Array.isArray(queue) ? queue : []).filter((item) => getTrackIdentity(item))
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
  let audio = null
  let rafId = 0

  const currentTrack = computed(() => queue.value[currentIndex.value] || null)
  const currentTrackId = computed(() => getTrackIdentity(currentTrack.value))
  const progressRatio = computed(() => {
    if (!duration.value) return 0
    return Math.min(1, Math.max(0, currentTime.value / duration.value))
  })
  const progressPercent = computed(() => `${(progressRatio.value * 100).toFixed(3)}%`)
  const hasPrevious = computed(() => currentIndex.value > 0)
  const hasNext = computed(() => currentIndex.value >= 0 && currentIndex.value < queue.value.length - 1)

  function ensureAudio() {
    if (audio || typeof Audio === 'undefined') return audio

    audio = new Audio()
    audio.preload = 'metadata'

    audio.addEventListener('play', () => {
      isPlaying.value = true
      syncCurrentTime()
      startProgressLoop()
    })

    audio.addEventListener('pause', () => {
      isPlaying.value = false
      syncCurrentTime()
      stopProgressLoop()
    })

    audio.addEventListener('loadedmetadata', () => {
      duration.value = Number.isFinite(audio.duration) ? Math.max(0, audio.duration) : 0
      syncCurrentTime()
    })

    audio.addEventListener('timeupdate', syncCurrentTime)

    audio.addEventListener('ended', () => {
      syncCurrentTime()
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
      stopProgressLoop()
    })

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

  async function playAtIndex(index) {
    const targetAudio = ensureAudio()
    const track = queue.value[index]
    if (!targetAudio || !track) return

    isLoading.value = true
    lastError.value = ''

    try {
      const url = await resolvePlayableUrl(track)
      if (targetAudio.src !== url) {
        targetAudio.src = url
      }
      await targetAudio.play()
      currentIndex.value = index
      miniVisible.value = true
    } catch (error) {
      lastError.value = error?.message || '内嵌播放失败'
      throw error
    } finally {
      isLoading.value = false
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
  }

  function stopPlayback() {
    if (!audio) return
    audio.pause()
    audio.removeAttribute('src')
    audio.load()
    currentTime.value = 0
    duration.value = 0
    isPlaying.value = false
    isLoading.value = false
    stopProgressLoop()
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
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return
    if (!track) {
      navigator.mediaSession.metadata = null
      return
    }

    navigator.mediaSession.metadata = new MediaMetadata({
      title: String(track.title || '未命名曲目'),
      artist: String(track.artist || ''),
      album: String(track.album || '')
    })
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
