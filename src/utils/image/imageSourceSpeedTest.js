import { fetchWithPlatformBridge } from '@/utils/platform/http'
import {
  IMAGE_SOURCE_OPTIONS,
  buildImageSourceUrl,
  getImageSourceMode,
  isImageSourceMode
} from '@/config/mediaProxy'

const DEFAULT_TIMEOUT_MS = 8000
const SAMPLE_ROUNDS = 3
const HEAD_SAMPLE_BYTES = 8 * 1024
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

async function readLimitedBody(response, limitBytes) {
  const body = response?.body
  if (!body || typeof body.getReader !== 'function') {
    // 兼容无 stream 的环境：仍避免整图读完可选；无 stream 时退回 blob
    const blob = await response.blob()
    return Number(blob?.size) || 0
  }

  const reader = body.getReader()
  let received = 0
  try {
    while (received < limitBytes) {
      const { done, value } = await reader.read()
      if (done) break
      received += Number(value?.length) || 0
    }
  } finally {
    // 读满即取消，避免继续下完整图
    try {
      await reader.cancel()
    } catch {
      // ignore cancel errors
    }
  }
  return received
}

/**
 * 测量单次延迟：到响应头 + 读取前 N 字节（默认 8KB），不下载整图。
 * @returns {Promise<{ ok: boolean, ms: number, status: number, bytes: number, aborted?: boolean }>}
 */
export async function measureImageSourceOnce(url, {
  timeoutMs = DEFAULT_TIMEOUT_MS,
  cacheBust = false,
  sampleBytes = HEAD_SAMPLE_BYTES
} = {}) {
  const target = withCacheBust(url, cacheBust)
  const started = typeof performance !== 'undefined' ? performance.now() : Date.now()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetchWithPlatformBridge(target, {
      signal: controller.signal,
      cache: 'no-store'
    })
    const bytes = await readLimitedBody(response, sampleBytes)
    const ended = typeof performance !== 'undefined' ? performance.now() : Date.now()
    return {
      ok: !!response.ok,
      ms: Math.max(0, Math.round(ended - started)),
      status: Number(response.status) || 0,
      bytes
    }
  } catch (error) {
    const ended = typeof performance !== 'undefined' ? performance.now() : Date.now()
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

function median(values) {
  const sorted = [...values].sort((a, b) => a - b)
  if (sorted.length === 0) return null
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[mid]
  return Math.round((sorted[mid - 1] + sorted[mid]) / 2)
}

/**
 * 对单个图片源做多轮测速。
 * @param {{ sourceId: string, storagePath: string, timeoutMs?: number, rounds?: number }} options
 */
export async function testImageSource({ sourceId, storagePath, timeoutMs = DEFAULT_TIMEOUT_MS, rounds = SAMPLE_ROUNDS }) {
  const id = String(sourceId || '')
  const sampleUrl = buildImageSourceUrl(storagePath, isImageSourceMode(id) ? id : getImageSourceMode())
  if (!sampleUrl) {
    return {
      sourceId: id,
      ok: false,
      ms: null,
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

  const okSamples = samples.filter((item) => item.ok)
  if (okSamples.length === 0) {
    const last = samples[samples.length - 1]
    return {
      sourceId: id,
      ok: false,
      ms: last?.ms ?? null,
      status: last?.status ?? 0,
      bytes: 0,
      error: last?.aborted ? 'timeout' : 'failed'
    }
  }

  return {
    sourceId: id,
    ok: true,
    ms: median(okSamples.map((item) => item.ms)),
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

  const fastest = results
    .filter((item) => item.ok && Number.isFinite(item.ms))
    .sort((a, b) => a.ms - b.ms)[0]

  return {
    storagePath: path,
    results,
    fastestSourceId: fastest?.sourceId || null
  }
}
