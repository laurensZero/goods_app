import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { fetchNeteaseLyrics, fetchNeteasePlayableUrl, fetchNeteaseSongCoverMap } from '@/utils/neteaseMusic'
import { fetchQQPlayableUrl, fetchQQLyrics, fetchQQSongCoverMap } from '@/utils/qqMusic'
import { fetchBilibiliPlayableUrl } from '@/utils/bilibiliMusic'
import { matchLyricsByTitle } from '@/utils/musicLyricMatch'
import { addBilibiliPlayerListener, bilibiliPlayer, isAndroidBilibiliPlayer, playBilibiliNative } from '@/utils/platform/bilibiliPlayer'
import {
  addBackgroundAudioActionListener,
  startBackgroundAudio,
  stopBackgroundAudio,
  updateBackgroundAudio
} from '@/utils/platform/backgroundAudio'

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

const LYRIC_OFFSETS_STORAGE_KEY = 'goods_media_player_lyric_offsets'
const LYRIC_OFFSETS_MAX_ENTRIES = 100
const LYRIC_OFFSET_LIMIT_MS = 30000

function clampLyricsOffset(value) {
  const ms = Math.round(Number(value) || 0)
  return Math.min(LYRIC_OFFSET_LIMIT_MS, Math.max(-LYRIC_OFFSET_LIMIT_MS, ms))
}

function loadStoredLyricOffsets() {
  try {
    const raw = localStorage.getItem(LYRIC_OFFSETS_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    const offsets = {}
    for (const [key, value] of Object.entries(parsed && typeof parsed === 'object' ? parsed : {})) {
      const ms = Math.round(Number(value))
      if (key && Number.isFinite(ms)) offsets[key] = ms
    }
    return offsets
  } catch {
    return {}
  }
}

function persistLyricOffsets(offsets) {
  try {
    const keys = Object.keys(offsets)
    while (keys.length > LYRIC_OFFSETS_MAX_ENTRIES) {
      delete offsets[keys.shift()]
    }
    localStorage.setItem(LYRIC_OFFSETS_STORAGE_KEY, JSON.stringify(offsets))
  } catch {
    // ignore persistence errors
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
  const trackCoverCache = new Map()
  const lyricsStatus = ref('idle')
  const lyricsLines = ref([])
  const lyricOffsetStore = loadStoredLyricOffsets()
  const lyricsOffsetMs = ref(0)
  const lyricsFromMatch = ref(false)
  const volume = ref(getInitialVolume())
  const isMuted = ref(false)
  const previousVolumeBeforeMute = ref(volume.value || 0.8)
  let audio = null
  let rafId = 0
  let playRequestToken = 0
  let nativeListenersReady = false
  let nativeListenerPromise = null
  let autoAdvanceRecoveryTimer = 0
  let autoAdvanceRecoveryAttempts = 0
  let backgroundAudioListenerAdded = false
  let lyricsResumeRetryBound = false
  let lastLyricsRequestAt = 0

  const AUTO_ADVANCE_RETRY_DELAY_MS = 1500
  const AUTO_ADVANCE_RECOVERY_DELAY_MS = 10000
  const AUTO_ADVANCE_RECOVERY_MAX_ATTEMPTS = 3

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
          if (hasNext.value) {
            void handleAutoAdvance()
          } else {
            void stopBackgroundAudio()
          }
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
    const nowMs = Math.max(0, Math.round((currentTime.value || 0) * 1000) - (lyricsOffsetMs.value || 0))
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
    lyricsFromMatch.value = false
  }

  function applyStoredLyricsOffset(trackId) {
    const stored = lyricOffsetStore[trackId]
    lyricsOffsetMs.value = Number.isFinite(stored) ? clampLyricsOffset(stored) : 0
  }

  function saveCurrentLyricsOffset(ms) {
    lyricsOffsetMs.value = clampLyricsOffset(ms)
    const trackId = currentTrackId.value
    if (!trackId) return
    lyricOffsetStore[trackId] = lyricsOffsetMs.value
    persistLyricOffsets(lyricOffsetStore)
  }

  function adjustLyricsOffset(delta) {
    saveCurrentLyricsOffset((Number(lyricsOffsetMs.value) || 0) + Math.round(Number(delta) || 0))
  }

  function resetLyricsOffset() {
    saveCurrentLyricsOffset(0)
  }

  function seedLyricsOffsetFromMatch(trackId, trackDurationMs, matchedDurationMs) {
    if (!trackId || lyricOffsetStore[trackId] != null) return
    const diff = Math.round((Number(trackDurationMs) || 0) - (Number(matchedDurationMs) || 0))
    if (Math.abs(diff) < 3000 || Math.abs(diff) > 20000) return
    const clamped = clampLyricsOffset(diff)
    lyricOffsetStore[trackId] = clamped
    persistLyricOffsets(lyricOffsetStore)
    if (currentTrackId.value === trackId) {
      lyricsOffsetMs.value = clamped
    }
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
      void stopBackgroundAudio()
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
    lastLyricsRequestAt = Date.now()
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
      const cached = lyricsCache.get(trackId)
      lyricsLines.value = Array.isArray(cached?.lines) ? cached.lines : []
      lyricsFromMatch.value = !!cached?.matched
      lyricsStatus.value = lyricsLines.value.length ? 'ready' : 'empty'
      return
    }

    lyricsStatus.value = 'loading'
    try {
      let result
      let matched = false
      if (source === 'qq' && qqSongId) {
        result = await fetchQQLyrics(qqSongId)
      } else if (neteaseSongId) {
        result = await fetchNeteaseLyrics(neteaseSongId)
      } else if (qqSongId) {
        result = await fetchQQLyrics(qqSongId)
      } else if (bilibiliVideoId) {
        result = await matchLyricsByTitle({
          title: track.title,
          artist: track.artist,
          durationMs: Number(track.durationMs) || 0
        })
        seedLyricsOffsetFromMatch(trackId, track.durationMs, result?.matchedDurationMs)
        matched = !!result
      } else {
        resetLyrics()
        return
      }

      const nextLines = Array.isArray(result?.lines) ? result.lines : []
      // B 站曲目靠标题跨源匹配：空结果往往只是搜索源临时失败/风控
      // （歌曲可能只上架在其中一个源），不缓存，下次播放或回前台时重试。
      // QQ/网易云直连 ID 的空歌词是稳定事实（歌存在但没词），照常缓存。
      if (!bilibiliVideoId || nextLines.length) {
        lruSet(lyricsCache, trackId, { lines: nextLines, matched })
      }
      if (currentTrackId.value !== trackId) return
      lyricsFromMatch.value = matched
      lyricsLines.value = nextLines
      lyricsStatus.value = nextLines.length ? 'ready' : 'empty'
    } catch {
      if (currentTrackId.value !== trackId) return
      lyricsLines.value = []
      lyricsStatus.value = 'error'
    }
  }

  // 事件等入口存的曲目不带封面（封面是列表 UI 懒加载的），播放时补齐供通知栏显示
  async function ensureTrackCover(track) {
    const trackId = getTrackIdentity(track)
    if (!trackId) return
    const neteaseSongId = String(track?.neteaseSongId || '').trim()
    const qqSongId = String(track?.qqSongId || '').trim()
    if (!neteaseSongId && !qqSongId) return

    const cacheKey = neteaseSongId ? `netease:${neteaseSongId}` : `qq:${qqSongId}`
    let coverUrl = trackCoverCache.get(cacheKey)
    if (coverUrl === undefined) {
      try {
        const map = neteaseSongId
          ? await fetchNeteaseSongCoverMap([neteaseSongId])
          : await fetchQQSongCoverMap([qqSongId])
        coverUrl = String(map?.[neteaseSongId || qqSongId] || '').trim()
      } catch {
        coverUrl = ''
      }
      trackCoverCache.set(cacheKey, coverUrl)
    }
    if (!coverUrl) return

    const index = queue.value.findIndex((item) => getTrackIdentity(item) === trackId)
    if (index < 0 || String(queue.value[index]?.coverUrl || '').trim()) return
    queue.value[index] = { ...queue.value[index], coverUrl }
    syncBackgroundAudioState()
  }

  function buildBackgroundAudioMeta() {
    const track = currentTrack.value
    return {
      title: track?.title,
      artist: track?.artist,
      coverUrl: track?.coverUrl,
      isPlaying: isPlaying.value,
      durationMs: Math.round((Number(duration.value) || 0) * 1000),
      positionMs: Math.round((Number(currentTime.value) || 0) * 1000)
    }
  }

  function syncBackgroundAudioState() {
    // 避免无曲目时（如 store 初始化的 immediate watch）误启动前台服务
    if (!currentTrack.value) return
    void updateBackgroundAudio(buildBackgroundAudioMeta())
  }

  // 播放真正开始后启动前台服务，保证息屏时 CPU/网络不被限制（切歌需要联网解析地址）
  function activatePlaybackKeepAlive() {
    autoAdvanceRecoveryAttempts = 0
    cancelAutoAdvanceRecovery()
    registerBackgroundAudioActions()
    void startBackgroundAudio(buildBackgroundAudioMeta())
    const track = currentTrack.value
    if (track && !String(track?.coverUrl || '').trim()) {
      void ensureTrackCover(track)
    }
  }

  // 通知栏/锁屏媒体按钮 → 原生事件 → 播放器操作
  function registerBackgroundAudioActions() {
    if (backgroundAudioListenerAdded) return
    backgroundAudioListenerAdded = true
    addBackgroundAudioActionListener((event = {}) => {
      const action = String(event.action || '')
      if (action === 'toggle') {
        void togglePlayPause()
        return
      }
      if (action === 'play') {
        if (!isPlaying.value) void togglePlayPause()
        return
      }
      if (action === 'pause') {
        if (isPlaying.value) void togglePlayPause()
        return
      }
      if (action === 'next') {
        void playNext()
        return
      }
      if (action === 'previous') {
        void playPrevious()
        return
      }
      if (action === 'seek') {
        seekTo(Math.max(0, Number(event.positionMs) || 0) / 1000)
      }
    })
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
        activatePlaybackKeepAlive()
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
      activatePlaybackKeepAlive()
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

  function waitDelay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  function cancelAutoAdvanceRecovery() {
    if (autoAdvanceRecoveryTimer) {
      clearTimeout(autoAdvanceRecoveryTimer)
      autoAdvanceRecoveryTimer = 0
    }
  }

  // 息屏/弱网下整条队列切歌失败后的兜底：等网络恢复再试几轮
  function scheduleAutoAdvanceRecovery() {
    if (currentIndex.value < 0 || !hasNext.value) return
    if (autoAdvanceRecoveryAttempts >= AUTO_ADVANCE_RECOVERY_MAX_ATTEMPTS) return
    cancelAutoAdvanceRecovery()
    autoAdvanceRecoveryAttempts += 1
    console.warn(`[mediaPlayer] 将在 ${AUTO_ADVANCE_RECOVERY_DELAY_MS / 1000}s 后重试自动切歌（第 ${autoAdvanceRecoveryAttempts}/${AUTO_ADVANCE_RECOVERY_MAX_ATTEMPTS} 次）`)
    autoAdvanceRecoveryTimer = setTimeout(() => {
      autoAdvanceRecoveryTimer = 0
      if (isPlaying.value || isLoading.value) return
      if (currentIndex.value < 0 || !hasNext.value) return
      void handleAutoAdvance()
    }, AUTO_ADVANCE_RECOVERY_DELAY_MS)
  }

  // 从 startIndex 沿 step 方向找第一首能播的曲目；VIP/版权/瞬时网络错误逐个跳过
  async function playNearestPlayable(startIndex, step) {
    let index = startIndex
    while (index >= 0 && index < queue.value.length) {
      try {
        await playAtIndex(index)
        autoAdvanceRecoveryAttempts = 0
        return true
      } catch (error) {
        const trackId = getTrackIdentity(queue.value[index])
        if (trackId) playableUrlCache.delete(trackId)
        console.warn(`[mediaPlayer] 播放失败（索引 ${index}），跳过该曲:`, error.message)
        if (isTransientNetworkError(error)) {
          // 息屏后网络可能只是短暂不可达（DNS/无线唤醒），稍候重试同一首再跳过
          await waitDelay(AUTO_ADVANCE_RETRY_DELAY_MS)
          try {
            await playAtIndex(index)
            autoAdvanceRecoveryAttempts = 0
            return true
          } catch (retryError) {
            const retryTrackId = getTrackIdentity(queue.value[index])
            if (retryTrackId) playableUrlCache.delete(retryTrackId)
            console.warn(`[mediaPlayer] 重试失败（索引 ${index}），跳过该曲:`, retryError.message)
          }
        }
        index += step
      }
    }
    return false
  }

  async function handleAutoAdvance() {
    const played = await playNearestPlayable(currentIndex.value + 1, 1)
    if (played) return true
    isPlaying.value = false
    lastError.value = '网络异常，无法播放下一首'
    void stopBackgroundAudio()
    scheduleAutoAdvanceRecovery()
    return false
  }

  async function playNext() {
    if (!hasNext.value) return
    const played = await playNearestPlayable(currentIndex.value + 1, 1)
    if (!played && !lastError.value) lastError.value = '下一首暂不可播放'
  }

  async function playPrevious() {
    if (!hasPrevious.value) return
    const played = await playNearestPlayable(currentIndex.value - 1, -1)
    if (!played && !lastError.value) lastError.value = '上一首暂不可播放'
  }

  function seekTo(nextTime) {
    if (isNativeBilibiliTrack()) {
      const bounded = Math.min(Math.max(0, Number(nextTime) || 0), duration.value || 0)
      currentTime.value = bounded
      void bilibiliPlayer.seekTo(Math.round(bounded * 1000))
      syncMediaSessionPositionState()
      syncBackgroundAudioState()
      return
    }
    const targetAudio = ensureAudio()
    if (!targetAudio) return

    const bounded = Math.min(Math.max(0, Number(nextTime) || 0), duration.value || 0)
    targetAudio.currentTime = bounded
    currentTime.value = bounded
    syncMediaSessionPositionState()
    syncBackgroundAudioState()
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
    cancelAutoAdvanceRecovery()
    void stopBackgroundAudio()
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

  // 后台切歌时歌词请求可能被挂起/失败，回到前台后自动补载一次
  function registerLyricsResumeRetry() {
    if (lyricsResumeRetryBound || typeof document === 'undefined') return
    lyricsResumeRetryBound = true
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') return
      const track = currentTrack.value
      if (!track) return
      const status = lyricsStatus.value
      // B 站曲目的 empty 是"标题匹配没结果"，可能只是搜索源临时失败，同样值得重试
      const retryable = status === 'error' || status === 'loading'
        || (status === 'empty' && String(track?.bilibiliVideoId || '').trim())
      if (retryable && Date.now() - lastLyricsRequestAt > 3000) {
        void resolveLyrics(track)
      }
    })
  }

  registerLyricsResumeRetry()

  watch(currentTrack, (track) => {
    syncMediaSessionMetadata(track)
  }, { immediate: true })

  watch(isPlaying, () => {
    syncMediaSessionPlaybackState()
    syncBackgroundAudioState()
  }, { immediate: true })

  watch(duration, () => {
    // 新曲目元数据加载完成后刷新通知栏进度
    if (currentTrack.value) syncBackgroundAudioState()
  })

  watch(currentTrackId, (trackId) => {
    applyStoredLyricsOffset(trackId)
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
    lyricsFromMatch,
    lyricsOffsetMs,
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
    stopPlayback,
    resolveLyrics,
    adjustLyricsOffset,
    resetLyricsOffset
  }
})
