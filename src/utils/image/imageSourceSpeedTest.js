import { fetchWithPlatformBridge } from '@/utils/platform/http'
import {
  IMAGE_SOURCE_OPTIONS,
  buildImageSourceUrl,
  getImageSourceMode,
  isImageSourceMode
} from '@/config/mediaProxy'

const DEFAULT_TIMEOUT_MS = 12000
const LATENCY_ROUNDS = 3
const LATENCY_SAMPLE_BYTES = 8 * 1024
const THROUGHPUT_SAMPLE_BYTES = 256 * 1024
const SUPABASE_HOST = 'zvqzicimowfqshgjsrri.supabase.co'
const SUPABASE_PUBLIC_STORAGE_PREFIX = '/storage/v1/object/public/'

/**
 * 从任意 URL 提取本项目 Supabase 公开 Storage path（如 goods-images/uid/a.jpg）。
 * 非匹配返回 ''。
 */
export function extractSupabasePublicStoragePath(rawUrl) {
  const value = String(rawUrl || '').trim()
  if (!value) return ''

  try {
    const parsed = new URL(value)
    if (parsed.protocol !== 'https:') return ''
    if (parsed.hostname !== SUPABASE_HOST) return ''
    if (!parsed.pathname.startsWith(SUPABASE_PUBLIC_STORAGE_PREFIX)) return ''

    const path = decodeURIComponent(parsed.pathname.slice(SUPABASE_PUBLIC_STORAGE_PREFIX.length))
    if (!path || path.includes('..')) return ''
    return path
  } catch {
    return ''
  }
}

/**
 * 仅首轮加 cache-bust，确保测的是网络路径而不是浏览器本地缓存；
 * 后续轮走真实缓存策略，更接近用户实际加载体验。
 */
function withCacheBust(url, enabled) {
  const value = String(url || '').trim()
  if (!value || !enabled) return value
  try {
    const parsed = new URL(value, typeof window !== 'undefined' ? window.location.href : 'http://localhost')
    parsed.searchParams.set('_st', String(Date.now()))
    parsed.searchParams.set('_r', String(Math.random().slice(2, 8)))
    return parsed.toString()
  } catch {
    return value
  }
}

function nowMs() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now()
}

async function readLimitedBody(response, limitBytes) {
  const body = response?.body
  if (!body || typeof body.getReader !== 'function') {
    const blob = await response.blob()
    const size = Number(blob?.size) || 0
    return { bytes: Math.min(size, limitBytes), firstByteAt: null }
  }

  const reader = body.getReader()
  let received = 0
  let firstByteAt = null
  try {
    while (received < limitBytes) {
      const { done, value } = await reader.read()
      if (done) break
      if (firstByteAt == null) firstByteAt = nowMs()
      received += Number(value?.length) || 0
    }
  } finally {
    try {
      await reader.cancel()
    } catch {
      // ignore cancel errors
    }
  }
  return { bytes: received, firstByteAt }
}

/** bytes/sec → 友好速率文案（偏业界 Mbps/Kbps） */
export function formatThroughputBps(bytesPerSec) {
  const bps = Number(bytesPerSec)
  if (!Number.isFinite(bps) || bps <= 0) return ''
  const mbps = (bps * 8) / 1_000_000
  if (mbps >= 1) return `${mbps.toFixed(1)} Mbps`
  const kbps = (bps * 8) / 1000
  if (kbps >= 1) return `${kbps.toFixed(0)} Kbps`
  return `${Math.round(bps)} B/s`
}

/**
 * 延迟：到响应头 + 读满前 8KB（行业里接近 TTFB + 首段下载）。
 * @returns {Promise<{ ok: boolean, ms: number, status: number, bytes: number, aborted?: boolean }>}
 */
export async function measureImageSourceOnce(url, {
  timeoutMs = DEFAULT_TIMEOUT_MS,
  cacheBust = false,
  sampleBytes = LATENCY_SAMPLE_BYTES
} = {}) {
  const target = withCacheBust(url, cacheBust)
  const started = nowMs()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetchWithPlatformBridge(target, {
      signal: controller.signal,
      cache: 'no-store'
    })
    const { bytes } = await readLimitedBody(response, sampleBytes)
    const ended = nowMs()
    return {
      ok: !!response.ok,
      ms: Math.max(0, Math.round(ended - started)),
      status: Number(response.status) || 0,
      bytes
    }
  } catch (error) {
    const ended = nowMs()
    return {
      ok: false,
      ms: Math.max(0, Math.round(ended - started)),
      status: 0,
      bytes: 0,
      aborted: error?.name === 'AbortError' || String(error?.message || '').includes('aborted')
    }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * 吞吐量：到响应头后继续拉约 256KB，按 (bytes - 0) / (end - firstByte) 估速率。
 * 若图更小，用实际下载字节算。
 * @returns {Promise<{ ok: boolean, bps: number | null, status: number, bytes: number, ms: number, aborted?: boolean }>}
 */
export async function measureThroughputOnce(url, {
  timeoutMs = DEFAULT_TIMEOUT_MS,
  cacheBust = true,
  sampleBytes = THROUGHPUT_SAMPLE_BYTES
} = {}) {
  const target = withCacheBust(url, cacheBust)
  const started = nowMs()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetchWithPlatformBridge(target, {
      signal: controller.signal,
      cache: 'no-store'
    })
    const { bytes, firstByteAt } = await readLimitedBody(response, sampleBytes)
    const ended = nowMs()
    const transferStarted = firstByteAt ?? started
    const transferMs = Math.max(1, ended - transferStarted)
    const bps = bytes > 0 ? (bytes * 1000) / transferMs : null
    return {
      ok: !!response.ok && bytes > 0,
      bps: bps != null && Number.isFinite(bps) ? bps : null,
      status: Number(response.status) || 0,
      bytes,
      ms: Math.max(0, Math.round(ended - started))
    }
  } catch (error) {
    const ended = nowMs()
    return {
      ok: false,
      bps: null,
      status: 0,
      bytes: 0,
      ms: Math.max(0, Math.round(ended - started)),
      aborted: error?.name === 'AbortError' || String(error?.message || '').includes('aborted')
    }
  } finally {
    clearTimeout(timer)
  }
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b)
  if (sorted.length === 0) return null
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[mid]
  return Math.round((sorted[mid - 1] + sorted[mid]) / 2)
}

/**
 * 对单个源做延迟多轮 + 吞吐量一轮。
 * @param {{ sourceId: string, storagePath: string, timeoutMs?: number, rounds?: number }} options
 */
export async function testImageSource({
  sourceId,
  storagePath,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  rounds = LATENCY_ROUNDS
}) {
  const id = String(sourceId || '')
  const sampleUrl = buildImageSourceUrl(storagePath, isImageSourceMode(id) ? id : getImageSourceMode())
  if (!sampleUrl) {
    return {
      sourceId: id,
      ok: false,
      ms: null,
      bps: null,
      status: 0,
      bytes: 0,
      error: 'no-sample'
    }
  }

  const samples = []
  for (let i = 0; i < rounds; i += 1) {
    // 顺序多轮：避免并行抢带宽导致互相拖慢；首轮 bust 缓存，后两轮看真实路径
    samples.push(await measureImageSourceOnce(sampleUrl, {
      timeoutMs,
      cacheBust: i === 0
    }))
  }

  const throughput = await measureThroughputOnce(sampleUrl, { timeoutMs, cacheBust: true })

  const okSamples = samples.filter((item) => item.ok)
  if (okSamples.length === 0) {
    const last = samples[samples.length - 1]
    return {
      sourceId: id,
      ok: false,
      ms: last?.ms ?? null,
      bps: null,
      status: last?.status ?? throughput?.status ?? 0,
      bytes: 0,
      error: last?.aborted || throughput?.aborted ? 'timeout' : 'failed'
    }
  }

  return {
    sourceId: id,
    ok: true,
    ms: median(okSamples.map((item) => item.ms)),
    bps: throughput.ok ? throughput.bps : null,
    status: okSamples[0].status,
    bytes: okSamples[0].bytes
  }
}

/**
 * 并行测速全部图片源。
 * @param {{ storagePath: string, timeoutMs?: number, rounds?: number }} options
 */
export async function runImageSourceSpeedTest({ storagePath, timeoutMs, rounds } = {}) {
  const path = String(storagePath || '').trim()
  if (!path) {
    return {
      storagePath: '',
      results: IMAGE_SOURCE_OPTIONS.map((option) => ({
        sourceId: option.id,
        ok: false,
        ms: null,
        bps: null,
        status: 0,
        bytes: 0,
        error: 'no-sample'
      })),
      fastestSourceId: null
    }
  }

  const results = await Promise.all(
    IMAGE_SOURCE_OPTIONS.map((option) =>
      testImageSource({
        sourceId: option.id,
        storagePath: path,
        timeoutMs,
        rounds
      })
    )
  )

  // 优先延迟（更贴近列表缩略图体验）；延迟接近时再看吞吐量
  const okResults = results.filter((item) => item.ok && Number.isFinite(item.ms))
  const fastest = okResults.sort((a, b) => {
    const msDiff = a.ms - b.ms
    if (Math.abs(msDiff) > 30) return msDiff
    const aBps = Number.isFinite(a.bps) ? a.bps : 0
    const bBps = Number.isFinite(b.bps) ? b.bps : 0
    return bBps - aBps
  })[0]

  return {
    storagePath: path,
    results,
    fastestSourceId: fastest?.sourceId || null
  }
}
