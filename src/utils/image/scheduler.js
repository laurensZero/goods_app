/**
 * Global Image Scheduler
 *
 * Priority-based image loading with viewport awareness, concurrency control,
 * scroll-speed adaptation, and preemption for visible images.
 */

import { normalizeCacheUrl } from '@/utils/image/cache'

const IS_NATIVE = (() => {
  try {
    return typeof window !== 'undefined' && window.Capacitor?.isNativePlatform?.() === true
  } catch {
    return false
  }
})()

export const MAX_CONCURRENT = IS_NATIVE ? 3 : 6
export const PRELOAD_MAX_CONCURRENT = IS_NATIVE ? 1 : 2
export const BACKGROUND_DEMOTE_THRESHOLD = 800

let nextTaskId = 0
const taskMap = new Map()
const fgQueue = []
const bgQueue = []
let activeCount = 0
let drainScheduled = false
let preloadPaused = false

// --- URL normalization ---

function normalizeUrl(url) {
  if (!url) return ''
  const raw = String(url).trim()
  if (!raw) return ''
  if (/^(blob:|data:|file:|content:|capacitor:)/i.test(raw)) return raw
  try {
    const base = typeof window !== 'undefined' ? window.location.href : 'http://localhost'
    const parsed = new URL(raw, base)
    parsed.hash = ''
    if (parsed.searchParams?.sort) parsed.searchParams.sort()
    return parsed.toString()
  } catch {
    return raw
  }
}

function getCacheKey(url) {
  const raw = String(url || '').trim()
  const normalized = normalizeUrl(raw)
  if (!raw) return ''
  return normalized && normalized !== raw ? normalized : raw
}

// --- Priority Queue ---

function priorityOf(task) {
  const isBg = task.priority >= BACKGROUND_DEMOTE_THRESHOLD ? 1 : 0
  return isBg * 1e9 + task.distance + (task.fgSeq || 0) * 0.001
}

function insertSorted(queue, task) {
  const p = priorityOf(task)
  let lo = 0
  let hi = queue.length
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (priorityOf(queue[mid]) <= p) lo = mid + 1
    else hi = mid
  }
  queue.splice(lo, 0, task)
}

// --- Drain ---

function scheduleDrain() {
  if (drainScheduled) return
  drainScheduled = true
  const hasFg = fgQueue.length > 0
  const hasBg = !preloadPaused && bgQueue.length > 0
  if (hasFg) {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(runDrain)
    } else {
      setTimeout(runDrain, 0)
    }
  } else if (hasBg && typeof requestIdleCallback === 'function') {
    requestIdleCallback(runDrain, { timeout: 160 })
  } else {
    setTimeout(runDrain, 24)
  }
}

function runDrain() {
  drainScheduled = false
  drain()
}

function drain() {
  while (activeCount < MAX_CONCURRENT) {
    let task = null
    if (fgQueue.length > 0) {
      task = fgQueue.shift()
    } else if (!preloadPaused && bgQueue.length > 0) {
      if (activeCount >= PRELOAD_MAX_CONCURRENT) break
      task = bgQueue.shift()
    } else {
      break
    }
    if (!task) break
    if (task.aborted) {
      taskMap.delete(task.id)
      continue
    }
    activeCount++
    Promise.resolve(task.run())
      .then(task.resolve)
      .catch((err) => {
        if (err?.name === 'AbortError' || String(err?.message || '').includes('aborted')) {
          task.resolve('')
        } else {
          task.resolve('')
        }
      })
      .finally(() => {
        activeCount = Math.max(0, activeCount - 1)
        taskMap.delete(task.id)
        if (fgQueue.length > 0 || (!preloadPaused && bgQueue.length > 0)) {
          scheduleDrain()
        }
      })
  }
}

// --- Public API ---

/**
 * Register an image for scheduled loading.
 * @param {string} url - Image URL
 * @param {object} options
 * @param {number} options.distance - Viewport distance in pixels (0 = at viewport edge)
 * @param {'fg'|'bg'} options.zone - 'fg' = viewport/near, 'bg' = far/preload
 * @param {AbortSignal} [options.signal] - Abort signal for cancellation
 * @param {'high'|'auto'|'low'} [options.fetchPriority] - Browser fetch priority hint
 * @returns {Promise<string>} Resolves to the loaded image URL
 */
export function registerImage(url, { distance = 0, zone = 'fg', signal, fetchPriority } = {}) {
  if (!url) return Promise.resolve('')

  const normalizedUrl = normalizeUrl(url)
  const cacheKey = getCacheKey(url)

  // Deduplicate by cache key
  if (taskMap.has(cacheKey)) {
    const existing = taskMap.get(cacheKey)
    if (zone === 'fg' && existing.priority >= BACKGROUND_DEMOTE_THRESHOLD) {
      updatePriority(cacheKey, distance, 'fg')
    }
    if (signal) {
      signal.addEventListener('abort', () => {
        existing.resolve('')
      }, { once: true })
    }
    return existing.promise
  }

  const isBg = zone === 'bg'
  const basePriority = isBg ? BACKGROUND_DEMOTE_THRESHOLD : 0
  let resolvePromise
  const promise = new Promise((resolve) => { resolvePromise = resolve })

  const task = {
    id: nextTaskId++,
    url,
    normalizedUrl,
    cacheKey,
    distance: Math.max(0, distance),
    priority: basePriority,
    fetchPriority: fetchPriority || (isBg ? 'low' : distance < 100 ? 'high' : 'auto'),
    fgSeq: isBg ? 0 : nextTaskId,
    aborted: false,
    promise,
    resolve: (value) => {
      taskMap.delete(cacheKey)
      resolvePromise?.(value)
    }
  }

  if (signal) {
    if (signal.aborted) {
      task.aborted = true
      return Promise.resolve('')
    }
    signal.addEventListener('abort', () => {
      task.aborted = true
      task.resolve('')
    }, { once: true })
  }

  taskMap.set(cacheKey, task)
  const queue = isBg ? bgQueue : fgQueue
  insertSorted(queue, task)
  scheduleDrain()
  return promise
}

/**
 * Promote a background task to foreground with updated distance.
 */
export function updatePriority(cacheKey, distance, zone) {
  const task = taskMap.get(cacheKey)
  if (!task) return

  // Remove from current queue
  const oldQueue = task.priority >= BACKGROUND_DEMOTE_THRESHOLD ? bgQueue : fgQueue
  const idx = oldQueue.indexOf(task)
  if (idx >= 0) oldQueue.splice(idx, 1)

  // Update and re-insert
  const isBg = zone === 'bg'
  task.distance = Math.max(0, distance)
  task.priority = isBg ? BACKGROUND_DEMOTE_THRESHOLD : 0
  task.fetchPriority = isBg ? 'low' : distance < 100 ? 'high' : 'auto'
  if (!isBg) task.fgSeq = nextTaskId++

  const newQueue = isBg ? bgQueue : fgQueue
  insertSorted(newQueue, task)
  scheduleDrain()
}

/**
 * Remove a task from the scheduler.
 */
export function unregisterImage(url) {
  const cacheKey = getCacheKey(url)
  const task = taskMap.get(cacheKey)
  if (!task) return
  task.aborted = true
  const queue = task.priority >= BACKGROUND_DEMOTE_THRESHOLD ? bgQueue : fgQueue
  const idx = queue.indexOf(task)
  if (idx >= 0) queue.splice(idx, 1)
  taskMap.delete(cacheKey)
}

export function setPreloadPaused(paused) {
  preloadPaused = !!paused
  if (!preloadPaused) scheduleDrain()
}

export function isPreloadPaused() {
  return preloadPaused
}

export function getSchedulerState() {
  return {
    fgQueueLength: fgQueue.length,
    bgQueueLength: bgQueue.length,
    activeCount,
    preloadPaused
  }
}

export function clearSchedulerQueues() {
  for (const task of fgQueue) {
    task.aborted = true
    task.resolve('')
  }
  for (const task of bgQueue) {
    task.aborted = true
    task.resolve('')
  }
  fgQueue.length = 0
  bgQueue.length = 0
  taskMap.clear()
}
