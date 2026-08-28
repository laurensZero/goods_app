import { searchNeteaseSongs, fetchNeteaseLyrics } from '@/utils/neteaseMusic'
import { searchQQSongs, fetchQQLyrics } from '@/utils/qqMusic'

const BRACKET_BLOCK_RE = /【[^】]*】|〔[^〕]*〕|\[[^\]]*\]/g
const TITLE_SEPARATOR_RE = /(?:\s*[-–—|/]\s*)|(?:\s+by\s+)/i
const NORMALIZE_RE = /[\s'"`~·・!@#$%^&*()_+=\[\]{}\\|,.<>/?;:'"（）《》「」『』〔〕，。！？：；、～—–…·]+/g
const NOISE_HINT_TOKENS = new Set([
  'mv', 'pv', 'official', 'video', 'hd', '4k', '8k', '60fps', '120fps',
  'live', 'ver', 'version', 'full', 'lyric', 'lyrics', 'mv版',
  '高清', '完整版', '字幕版', '歌词版', '纯享', '现场版', '饭制', '官方'
])

function normalizeText(text) {
  return String(text || '').toLowerCase().replace(NORMALIZE_RE, '')
}

export function extractCoreTitle(rawTitle) {
  const raw = String(rawTitle || '').trim()
  if (!raw) return ''

  const guillemet = raw.match(/《([^《》]{1,160})》/)
  if (guillemet?.[1]?.trim()) return guillemet[1].trim()

  return raw.replace(BRACKET_BLOCK_RE, ' ').replace(/\s+/g, ' ').trim()
}

function collectArtistHints(rawTitle, artist) {
  const hints = []
  const push = (value) => {
    const text = String(value || '').trim()
    if (text && !hints.includes(text)) hints.push(text)
  }

  push(artist)

  const cleaned = String(rawTitle || '').replace(BRACKET_BLOCK_RE, ' ')
  for (const segment of cleaned.split(TITLE_SEPARATOR_RE)) {
    const text = segment.trim()
    if (!text || text.length < 2) continue
    if (/^\d+$/.test(text)) continue
    if (NOISE_HINT_TOKENS.has(normalizeText(text))) continue
    push(text)
  }

  return hints
}

function resolveCandidateSongId(candidate) {
  return String(candidate?.neteaseSongId || candidate?.qqSongId || '').trim()
}

function evaluateCandidate(candidate, context) {
  const candidateTitle = normalizeText(candidate?.title)
  const coreTitle = normalizeText(context.coreTitle)
  if (!candidateTitle || !coreTitle) return null

  const titleMatched = candidateTitle.includes(coreTitle) || coreTitle.includes(candidateTitle)
  if (!titleMatched) return null

  const candidateArtist = normalizeText(candidate?.artist)
  const artistMatched = !!candidateArtist && context.artistHints.some((hint) => {
    const normalizedHint = normalizeText(hint)
    if (!normalizedHint || normalizedHint.length < 2) return false
    return candidateArtist.includes(normalizedHint) || normalizedHint.includes(candidateArtist)
  })
  if (!artistMatched) return null

  let score = 100
  const durationDiff = Math.abs((Number(candidate?.durationMs) || 0) - context.durationMs)
  if (context.durationMs > 0 && (Number(candidate.durationMs) || 0) > 0) {
    if (durationDiff <= 3000) score += 30
    else if (durationDiff <= 8000) score += 15
  }

  return {
    songId: resolveCandidateSongId(candidate),
    title: candidate.title,
    artist: candidate.artist,
    durationMs: Number(candidate.durationMs) || 0,
    score
  }
}

function rankCandidates(candidates, context) {
  return (Array.isArray(candidates) ? candidates : [])
    .map((candidate, index) => {
      if (!resolveCandidateSongId(candidate)) return null
      const evaluated = evaluateCandidate(candidate, context)
      return evaluated ? { ...evaluated, score: evaluated.score - index } : null
    })
    .filter(Boolean)
    .sort((left, right) => right.score - left.score)
}

async function searchCandidates(source, keyword) {
  const limit = 10
  return source === 'netease'
    ? searchNeteaseSongs(keyword, limit)
    : searchQQSongs(keyword, limit)
}

async function fetchLyrics(source, songId) {
  return source === 'netease'
    ? fetchNeteaseLyrics(songId)
    : fetchQQLyrics(songId)
}

export async function matchLyricsByTitle({ title, artist, durationMs } = {}) {
  const coreTitle = extractCoreTitle(title)
  if (!coreTitle) return null

  const artistHints = collectArtistHints(title, artist)
  const context = { coreTitle, artistHints, durationMs: Number(durationMs) || 0 }
  const primaryArtist = String(artist || '').trim()

  const keywords = [`${coreTitle} ${primaryArtist}`.trim(), coreTitle]
    .filter((keyword, index, list) => keyword && list.indexOf(keyword) === index)

  const fetchedKeys = new Set()
  let searchSucceeded = false
  let searchFailed = false

  for (const source of ['qq', 'netease']) {
    for (const keyword of keywords) {
      let candidates = []
      try {
        candidates = await searchCandidates(source, keyword)
        searchSucceeded = true
      } catch {
        // 典型场景：后台切歌时请求被挂起/失败、接口风控
        searchFailed = true
        continue
      }

      for (const candidate of rankCandidates(candidates, context).slice(0, 3)) {
        const key = `${source}:${candidate.songId}`
        if (fetchedKeys.has(key)) continue
        fetchedKeys.add(key)

        try {
          const lyric = await fetchLyrics(source, candidate.songId)
          if (Array.isArray(lyric?.lines) && lyric.lines.length) {
            return {
              lines: lyric.lines,
              source,
              songId: candidate.songId,
              matchedTitle: candidate.title,
              matchedArtist: candidate.artist,
              matchedDurationMs: candidate.durationMs
            }
          }
        } catch {
          // try next candidate / source
        }
      }
    }
  }

  // 有搜索请求失败（典型场景：后台切歌时请求被挂起/失败）时抛错，
  // 让调用方进入可重试的 error 态，而不是把"无歌词"错误地缓存下来。
  // 部分源失败同样抛错：歌曲可能只上架在失败的源（例如仅 QQ 音乐有的歌，
  // 网易云上只有翻唱），此时"没匹配到"只是网络问题的假象。
  if (!searchSucceeded || searchFailed) {
    throw new Error('歌词匹配服务暂不可用')
  }

  return null
}
