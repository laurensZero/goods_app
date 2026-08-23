import { describe, expect, it, vi, beforeEach } from 'vitest'
import { nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: vi.fn(() => false),
    getPlatform: vi.fn(() => 'web')
  },
  CapacitorHttp: {
    get: vi.fn()
  }
}))

vi.mock('@/utils/neteaseMusic', () => ({
  fetchNeteaseLyrics: vi.fn(),
  fetchNeteasePlayableUrl: vi.fn(),
  formatTrackDuration: vi.fn((ms) => `${Math.round((Number(ms) || 0) / 1000)}s`)
}))

vi.mock('@/utils/qqMusic', () => ({
  fetchQQLyrics: vi.fn(),
  fetchQQPlayableUrl: vi.fn()
}))

vi.mock('@/utils/bilibiliMusic', () => ({
  fetchBilibiliPlayableUrl: vi.fn()
}))

vi.mock('@/utils/platform/bilibiliPlayer', () => ({
  addBilibiliPlayerListener: vi.fn(),
  bilibiliPlayer: {},
  isAndroidBilibiliPlayer: vi.fn(() => false),
  playBilibiliNative: vi.fn()
}))

vi.mock('@/utils/musicLyricMatch', () => ({
  matchLyricsByTitle: vi.fn()
}))

import { matchLyricsByTitle } from '@/utils/musicLyricMatch'
import { useMediaPlayerStore } from '@/stores/mediaPlayer'

const OFFSETS_KEY = 'goods_media_player_lyric_offsets'

function makeBilibiliTrack(overrides = {}) {
  return {
    id: 'bili_BV1xx411c7mD',
    title: '晴天',
    artist: '周杰伦',
    durationMs: 241000,
    source: 'bilibili',
    bilibiliVideoId: 'BV1xx411c7mD',
    neteaseSongId: '',
    qqSongId: '',
    ...overrides
  }
}

describe('mediaPlayer lyric offset', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    setActivePinia(createPinia())
  })

  it('seeds offset from duration diff after a successful bilibili title match', async () => {
    matchLyricsByTitle.mockResolvedValue({
      lines: [{ timeMs: 0, text: '故事的小黄花' }],
      source: 'qq',
      matchedTitle: '晴天',
      matchedArtist: '周杰伦',
      matchedDurationMs: 234000
    })

    const store = useMediaPlayerStore()
    const track = makeBilibiliTrack()
    store.queue = [track]
    store.currentIndex = 0

    await store.resolveLyrics(track)

    expect(store.lyricsOffsetMs).toBe(7000)
  })

  it('applies the offset to the active lyric line', async () => {
    matchLyricsByTitle.mockResolvedValue({
      lines: [
        { timeMs: 0, text: 'intro' },
        { timeMs: 10000, text: 'verse' }
      ],
      source: 'qq',
      matchedTitle: '晴天',
      matchedArtist: '周杰伦',
      matchedDurationMs: 234000
    })

    const store = useMediaPlayerStore()
    const track = makeBilibiliTrack()
    store.queue = [track]
    store.currentIndex = 0
    await store.resolveLyrics(track)

    store.currentTime = 12
    // +7s 偏移：12s 视频时间 → 5s 歌曲时间，仍显示 intro（verse 要到视频 17s）
    expect(store.currentLyricLine).toBe('intro')
    store.currentTime = 18
    // 18s - 7s = 11s ≥ 10s → verse
    expect(store.currentLyricLine).toBe('verse')
  })

  it('does not seed when the duration diff is too small or too large', async () => {
    matchLyricsByTitle.mockResolvedValue({
      lines: [{ timeMs: 0, text: 'a' }],
      source: 'qq',
      matchedTitle: '晴天',
      matchedArtist: '周杰伦',
      matchedDurationMs: 239500
    })

    const store = useMediaPlayerStore()
    const track = makeBilibiliTrack({ durationMs: 241000 })
    store.queue = [track]
    store.currentIndex = 0

    await store.resolveLyrics(track)

    expect(store.lyricsOffsetMs).toBe(0)
  })

  it('keeps a stored zero offset (manual reset wins over auto seed)', async () => {
    localStorage.setItem(OFFSETS_KEY, JSON.stringify({ bili_BV1xx411c7mD: 0 }))
    matchLyricsByTitle.mockResolvedValue({
      lines: [{ timeMs: 0, text: 'a' }],
      source: 'qq',
      matchedTitle: '晴天',
      matchedArtist: '周杰伦',
      matchedDurationMs: 234000
    })

    const store = useMediaPlayerStore()
    const track = makeBilibiliTrack()
    store.queue = [track]
    store.currentIndex = 0

    await store.resolveLyrics(track)

    expect(store.lyricsOffsetMs).toBe(0)
  })

  it('loads the persisted offset when switching to a track', async () => {
    localStorage.setItem(OFFSETS_KEY, JSON.stringify({ bili_BVother: -4000 }))

    const store = useMediaPlayerStore()
    store.queue = [makeBilibiliTrack({ id: 'bili_BVother', bilibiliVideoId: 'BVother' })]
    store.currentIndex = 0
    await nextTick()

    expect(store.lyricsOffsetMs).toBe(-4000)
  })

  it('cycles the offset 0 → -1s → +1s → 0 when not auto-seeded', () => {
    const store = useMediaPlayerStore()
    store.queue = [makeBilibiliTrack()]
    store.currentIndex = 0

    store.cycleLyricsOffset()
    expect(store.lyricsOffsetMs).toBe(-1000)
    store.cycleLyricsOffset()
    expect(store.lyricsOffsetMs).toBe(1000)
    store.cycleLyricsOffset()
    expect(store.lyricsOffsetMs).toBe(0)
  })

  it('cycles toward zero by 1s per tap when the offset was auto-seeded', async () => {
    matchLyricsByTitle.mockResolvedValue({
      lines: [{ timeMs: 0, text: 'a' }],
      source: 'qq',
      matchedTitle: '晴天',
      matchedArtist: '周杰伦',
      matchedDurationMs: 234000
    })

    const store = useMediaPlayerStore()
    const track = makeBilibiliTrack()
    store.queue = [track]
    store.currentIndex = 0

    await store.resolveLyrics(track)
    expect(store.lyricsOffsetMs).toBe(7000)
    store.cycleLyricsOffset()
    expect(store.lyricsOffsetMs).toBe(6000)
    store.cycleLyricsOffset()
    expect(store.lyricsOffsetMs).toBe(5000)
  })

  it('flags matched lyrics and clears the flag for native-source lyrics', async () => {
    const store = useMediaPlayerStore()

    // B 站曲目走标题匹配 → matched
    matchLyricsByTitle.mockResolvedValue({
      lines: [{ timeMs: 0, text: 'a' }],
      source: 'qq',
      matchedTitle: '晴天',
      matchedArtist: '周杰伦',
      matchedDurationMs: 234000
    })
    const biliTrack = makeBilibiliTrack()
    store.queue = [biliTrack]
    store.currentIndex = 0
    await store.resolveLyrics(biliTrack)
    expect(store.lyricsFromMatch).toBe(true)

    // 网易云原生歌词 → 非 matched
    const { fetchNeteaseLyrics } = vi.mocked(await import('@/utils/neteaseMusic'))
    fetchNeteaseLyrics.mockResolvedValue({ lines: [{ timeMs: 0, text: 'native' }] })
    const neteaseTrack = {
      id: 'netease_1', title: '晴天', artist: '周杰伦', durationMs: 269000,
      source: 'netease', neteaseSongId: '186016', qqSongId: '', bilibiliVideoId: ''
    }
    store.queue = [biliTrack, neteaseTrack]
    store.currentIndex = 1
    await nextTick()
    await store.resolveLyrics(neteaseTrack)
    expect(store.lyricsFromMatch).toBe(false)
    expect(store.lyricsOffsetMs).toBe(0)

    // 切回 B 站曲目（缓存命中）→ matched 标记恢复
    store.currentIndex = 0
    await nextTick()
    await store.resolveLyrics(biliTrack)
    expect(store.lyricsFromMatch).toBe(true)
  })

  it('persists manual adjustments and clamps them to ±30s', async () => {
    const store = useMediaPlayerStore()
    store.queue = [makeBilibiliTrack()]
    store.currentIndex = 0

    store.adjustLyricsOffset(40000)
    expect(store.lyricsOffsetMs).toBe(30000)
    expect(JSON.parse(localStorage.getItem(OFFSETS_KEY))['bili_BV1xx411c7mD']).toBe(30000)

    store.resetLyricsOffset()
    expect(store.lyricsOffsetMs).toBe(0)
    expect(JSON.parse(localStorage.getItem(OFFSETS_KEY))['bili_BV1xx411c7mD']).toBe(0)
  })
})
