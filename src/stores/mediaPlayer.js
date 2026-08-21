import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { fetchNeteaseLyrics, fetchNeteasePlayableUrl } from '@/utils/neteaseMusic'
import { fetchQQPlayableUrl, fetchQQLyrics } from '@/utils/qqMusic'
import { fetchBilibiliPlayableUrl } from '@/utils/bilibiliMusic'
import { addBilibiliPlayerListener, bilibiliPlayer, isAndroidBilibiliPlayer, playBilibiliNative } from '@/utils/platform/bilibiliPlayer'

function getTrackIdentity(track = {}) {
  return String(track?.id || track?.neteaseSongId || track?.qqSongId || track?.bilibiliVideoId || '').trim()
}

function normalizeQueue(queue) {
  return (Array.isArray(queue) ? queue : []).filter((item) => getTrackIdentity(item))
}

const MAX_CACHE_SIZE = 50

function lruSet(map, key, value) {
  if (map.size >= MAX_CACHE_SIZE) {
    map.delete(map.keys().next().value)
  }
  map.set(key, value)
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

function getInitialVolume() {
  const fallbackVolume = 0.8

  try {
    const raw = localStorage.getItem('goods_media_player_volume')
    if (raw == null || raw === '') return fallbackVolume

    const parsed = Number(raw)
    if (!Number.isFinite(parsed)) return fallbackVolume

    return Math.min(1, Math.max(0, parsed))
  } catch {
    return fallbackVolume
  }
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
  const volume = ref(getInitialVolume())
  const isMuted = ref(false)
  const previousVolumeBeforeMute = ref(volume.value || 0.8)
  let audio = null
  let rafId = 0
  let playRequestToken = 0
  let nativeListenersReady = false
  let nativeListenerPromise = null

  function isNativeBilibiliTrack(track = currentTrack.value) {
    return isAndroidBilibiliPlayer() && Boolean(String(track?.bilibiliVideoId || '').trim())
  }

  async function ensureNativeListeners() {
    if (!isAndroidBilibiliPlayer() || nativeListenersReady) return
    if (nativeListenerPromise) return nativeListenerPromise
    nativeListenerPromise = Promise.all([
      addBilibiliPlayerListener('state', (event = {}) => {
        currentTime.value = Math.max(0, Number(event.positionMs || 0) / 1000)
        duration.value = Math.max(0, Number(event.durationMs || 0) / 1000)
        if (event.state === 'buffering') isLoading.value = true
        if (event.state === 'playing') {
          isLoading.value = false
          isPlaying.value = true
        }
        if (event.state === 'paused' || event.state === 'ended') isPlaying.value = false
        if (event.state === 'ended') {
          isPlaying.value = false
          if (hasNext.value) void handleAutoAdvance()
        }
        syncMediaSessionPlaybackState()
        syncMediaSessionPositionState()
      }),
      addBilibiliPlayerListener('error', (event = {}) => {
        lastError.value = `${event.type || 'playback'}: ${event.message || 'Bilibili 原生播放失败'}`
        isLoading.value = false
        isPlaying.value = false
        syncMediaSessionPlaybackState()
      })
    ]).then(() => { nativeListenersReady = true }).finally(() => { nativeListenerPromise = null })
    return nativeListenerPromise
  }

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

  const volumePercent = computed(() => Math.round((volume.value || 0) * 100))
  const volumeStateLabel = computed(() => (isMuted.value || volumePercent.value <= 0 ? '静音' : `${volumePercent.value}%`))

  function resetLyrics() {
    lyricsStatus.value = 'idle'
    lyricsLines.value = []
  }

  function persistVolume(nextVolume) {
    try {
      localStorage.setItem('goods_media_player_volume', String(nextVolume))
    } catch {
      // ignore persistence errors
    }
  }

  function applyVolume(nextVolume) {
    const normalized = Math.min(1, Math.max(0, Number(nextVolume) || 0))
    volume.value = normalized

    if (normalized > 0) {
      previousVolumeBeforeMute.value = normalized
      isMuted.value = false
      if (audio) {
        audio.muted = false
      }
    }

    if (audio) {
      audio.volume = normalized
    }
    if (isNativeBilibiliTrack()) {
      void bilibiliPlayer.setVolume(isMuted.value ? 0 : normalized)
    }

    persistVolume(normalized)
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

    // Bilibili 的普通 durl 是带视频轨的 MP4 容器；部分 WebView 用 Audio
    // 加载它会报 no supported sources。用隐藏 video 元素只播放其音轨。
    audio = document.createElement('video')
    audio.setAttribute('playsinline', '')
    audio.playsInline = true
    audio.controls = false
    audio.setAttribute('aria-hidden', 'true')
    // 不使用 display:none；部分 WebView 会因此继续播放但不输出音频。
    Object.assign(audio.style, {
      position: 'fixed',
      width: '1px',
      height: '1px',
      opacity: '0',
      pointerEvents: 'none',
      left: '-2px',
      top: '-2px'
    })
    audio.preload = 'metadata'
    audio.volume = volume.value
    audio.muted = isMuted.value

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
        void handleAutoAdvance()
        return
      }
      isPlaying.value = false
      stopProgressLoop()
    })

    audio.addEventListener('error', () => {
      const failedTrackId = getTrackIdentity(currentTrack.value)
      if (failedTrackId) playableUrlCache.delete(failedTrackId)
      lastError.value = '音频播放失败'
      isLoading.value = false
      isPlaying.value = false
      syncMediaSessionPlaybackState()
      stopProgressLoop()
    })

    audio.addEventListener('volumechange', () => {
      const nextVolume = Number.isFinite(audio.volume) ? Math.min(1, Math.max(0, audio.volume)) : volume.value
      if (volume.value !== nextVolume) {
        volume.value = nextVolume
      }
      isMuted.value = Boolean(audio.muted)
      if (!audio.muted && nextVolume > 0) {
        previousVolumeBeforeMute.value = nextVolume
      }
      persistVolume(nextVolume)
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

  function replaceQueue(nextQueue) {
    queue.value = normalizeQueue(nextQueue)
  }

  function isTransientNetworkError(error) {
    const msg = String(error?.message || '').toLowerCase()
    return (
      error?.name === 'TypeError' ||
      msg.includes('unable to resolve host') ||
      msg.includes('no address associated with hostname') ||
      msg.includes('failed to fetch') ||
      msg.includes('timeout') ||
      msg.includes('econnrefused') ||
      msg.includes('econnreset') ||
      msg.includes('network')
    )
  }

  async function resolvePlayableUrlWithRetry(track) {
    const trackId = getTrackIdentity(track)
    if (playableUrlCache.has(trackId)) {
      return playableUrlCache.get(trackId)
    }

    const maxRetries = 2
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      try {
        return await resolvePlayableUrl(track)
      } catch (error) {
        if (!isTransientNetworkError(error) || attempt >= maxRetries) throw error
        const jitter = Math.random() * 200 + 300
        const delay = jitter * Math.pow(2, attempt)
        console.warn(`[mediaPlayer] URL 解析失败，第 ${attempt + 1} 次重试，等待 ${Math.round(delay)}ms:`, error.message)
        await new Promise((resolve) => setTimeout(resolve, delay))
      }
    }
  }

  async function resolvePlayableUrl(track) {
    const trackId = getTrackIdentity(track)
    if (!trackId) {
      throw new Error('缺少可播放曲目')
    }

    if (playableUrlCache.has(trackId)) {
      return playableUrlCache.get(trackId)
    }

    const source = String(track?.source || '').trim()
    const qqSongId = String(track?.qqSongId || '').trim()
    const bilibiliVideoId = String(track?.bilibiliVideoId || '').trim()
    const neteaseSongId = String(track?.neteaseSongId || '').trim()

    let playable = ''
    if (bilibiliVideoId && (source === 'bilibili' || (!neteaseSongId && !qqSongId))) {
      const result = await fetchBilibiliPlayableUrl(bilibiliVideoId)
      playable = result
    } else if (source === 'qq' && qqSongId) {
      const result = await fetchQQPlayableUrl(qqSongId)
      playable = result.url
    } else if (neteaseSongId) {
      const result = await fetchNeteasePlayableUrl(neteaseSongId)
      playable = result.url
    } else if (qqSongId) {
      const result = await fetchQQPlayableUrl(qqSongId)
      playable = result.url
    } else {
      throw new Error('缺少歌曲 ID，无法播放')
    }

    lruSet(playableUrlCache, trackId, playable)
    return playable
  }

  async function preloadNextTrackUrl() {
    if (!hasNext.value) return
    const nextTrack = queue.value[currentIndex.value + 1]
    if (!nextTrack) return
    const nextTrackId = getTrackIdentity(nextTrack)
    if (playableUrlCache.has(nextTrackId)) return
    void resolvePlayableUrlWithRetry(nextTrack).catch((error) => {
      console.warn('[mediaPlayer] 预解析下一首失败（将在播放结束时重试）:', error.message)
    })
  }

  async function resolveLyrics(track) {
    const trackId = getTrackIdentity(track)
    const source = String(track?.source || '').trim()
    const qqSongId = String(track?.qqSongId || '').trim()
    const bilibiliVideoId = String(track?.bilibiliVideoId || '').trim()
    const neteaseSongId = String(track?.neteaseSongId || '').trim()

    if (!trackId || (!neteaseSongId && !qqSongId && !bilibiliVideoId)) {
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
      let result
      if (source === 'qq' && qqSongId) {
        result = await fetchQQLyrics(qqSongId)
      } else if (neteaseSongId) {
        result = await fetchNeteaseLyrics(neteaseSongId)
      } else if (qqSongId) {
        result = await fetchQQLyrics(qqSongId)
      } else {
        resetLyrics()
        return
      }

      const nextLines = Array.isArray(result?.lines) ? result.lines : []
      lruSet(lyricsCache, trackId, nextLines)
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
    const previousTrack = currentTrack.value
    const track = queue.value[index]
    const nativeBilibili = isNativeBilibiliTrack(track)
    const targetAudio = nativeBilibili ? null : ensureAudio()
    if ((!targetAudio && !nativeBilibili) || !track) return
    const trackId = getTrackIdentity(track)
    const requestToken = ++playRequestToken

    isLoading.value = true
    lastError.value = ''
    resetLyrics()
    currentIndex.value = index

    try {
      if (isNativeBilibiliTrack(previousTrack) && getTrackIdentity(previousTrack) !== trackId) {
        await bilibiliPlayer.stop()
      }
      if (nativeBilibili && audio && getTrackIdentity(previousTrack) !== trackId) {
        audio.pause()
        audio.removeAttribute('src')
        audio.load()
      }
      if (nativeBilibili) await ensureNativeListeners()
      const playable = await resolvePlayableUrlWithRetry(track)
      const url = typeof playable === 'string' ? playable : playable.url
      if (requestToken !== playRequestToken || getTrackIdentity(queue.value[index]) !== trackId) return
      if (nativeBilibili) {
        await playBilibiliNative({
          url,
          fallbackUrls: playable?.fallbackUrls,
          title: track.title,
          artist: track.artist
        })
        miniVisible.value = true
        void resolveLyrics(track)
        void preloadNextTrackUrl()
        return
      }
      if (targetAudio.src !== url) {
        targetAudio.src = url
      }
      targetAudio.muted = isMuted.value
      targetAudio.volume = volume.value
      await targetAudio.play()
      if (requestToken !== playRequestToken) return
      miniVisible.value = true
      void resolveLyrics(track)
      void preloadNextTrackUrl()
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
    if (isNativeBilibiliTrack(track)) {
      const identity = getTrackIdentity(track)
      if (currentTrackId.value === identity && isPlaying.value) {
        await bilibiliPlayer.pause()
        return
      }
      if (currentTrackId.value === identity && !isLoading.value && duration.value > 0) {
        await bilibiliPlayer.resume()
        return
      }
      await playTrack(track, nextQueue)
      return
    }
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
    if (isNativeBilibiliTrack()) {
      if (isPlaying.value) await bilibiliPlayer.pause()
      else await bilibiliPlayer.resume()
      return
    }
    const targetAudio = ensureAudio()
    if (!targetAudio || !currentTrack.value) return

    if (targetAudio.paused) {
      await targetAudio.play()
      miniVisible.value = true
    } else {
      targetAudio.pause()
    }
  }

  async function handleAutoAdvance() {
    let nextIndex = currentIndex.value + 1
    while (nextIndex < queue.value.length) {
      try {
        await playAtIndex(nextIndex)
        return true
      } catch (error) {
        const trackId = getTrackIdentity(queue.value[nextIndex])
        if (trackId) playableUrlCache.delete(trackId)
        console.warn(`[mediaPlayer] 自动播放下一首失败（索引 ${nextIndex}），尝试下一曲:`, error.message)
        nextIndex += 1
      }
    }
    isPlaying.value = false
    lastError.value = '网络异常，无法播放下一首'
    return false
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
    if (isNativeBilibiliTrack()) {
      const bounded = Math.min(Math.max(0, Number(nextTime) || 0), duration.value || 0)
      currentTime.value = bounded
      void bilibiliPlayer.seekTo(Math.round(bounded * 1000))
      syncMediaSessionPositionState()
      return
    }
    const targetAudio = ensureAudio()
    if (!targetAudio) return

    const bounded = Math.min(Math.max(0, Number(nextTime) || 0), duration.value || 0)
    targetAudio.currentTime = bounded
    currentTime.value = bounded
    syncMediaSessionPositionState()
  }

  function setVolume(nextVolume) {
    applyVolume(nextVolume)
  }

  function adjustVolume(delta) {
    setVolume((volume.value || 0) + delta)
  }

  function toggleMute() {
    if (isNativeBilibiliTrack()) {
      if (isMuted.value) {
        isMuted.value = false
        applyVolume(volume.value > 0 ? volume.value : (previousVolumeBeforeMute.value || 0.8))
      } else {
        if (volume.value > 0) previousVolumeBeforeMute.value = volume.value
        isMuted.value = true
        void bilibiliPlayer.setVolume(0)
      }
      return
    }
    const targetAudio = ensureAudio()
    if (!targetAudio) return

    if (targetAudio.muted || isMuted.value) {
      targetAudio.muted = false
      isMuted.value = false
      const nextVolume = volume.value > 0 ? volume.value : (previousVolumeBeforeMute.value || 0.8)
      applyVolume(nextVolume)
      return
    }

    if (volume.value > 0) {
      previousVolumeBeforeMute.value = volume.value
    }

    targetAudio.muted = true
    isMuted.value = true
  }

  function stopPlayback() {
    if (isNativeBilibiliTrack()) {
      playRequestToken += 1
      void bilibiliPlayer.stop()
      currentTime.value = 0
      duration.value = 0
      isPlaying.value = false
      isLoading.value = false
      resetLyrics()
      syncMediaSessionMetadata(null)
      return
    }
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
    volume,
    volumePercent,
    volumeStateLabel,
    isMuted,
    hasPrevious,
    hasNext,
    playTrack,
    toggleTrackPlayback,
    togglePlayPause,
    playNext,
    playPrevious,
    seekTo,
    setVolume,
    adjustVolume,
    toggleMute,
    closeMiniPlayer,
    showMiniPlayer,
    stopPlayback
  }
})
