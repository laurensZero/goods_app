import { computed, ref } from 'vue'
import { submitCheckoutOrder, fetchMihoyoServerTime } from '@/utils/mihoyo/checkout'

const STORAGE_KEY = 'checkout-order-queue-v1'
const CONCURRENCY_MAX = 5
const CLOCK_CACHE_TTL = 60 * 1000
const RETRY_DELAY = 500

const queue = ref([])
const hydrated = ref(false)
const processing = ref(false)
const clockOffsetMs = ref(0)
const clockSyncedAt = ref(0)

let queueWatcherId = 0

function canUseStorage() {
  return typeof window !== 'undefined' && typeof localStorage !== 'undefined'
}

function clampConcurrency(n) {
  return Math.min(CONCURRENCY_MAX, Math.max(1, Number(n) || 1))
}

function readStorageQueue() {
  if (!canUseStorage()) return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const data = JSON.parse(raw)
    return Array.isArray(data) ? data : []
  } catch (error) {
    console.warn('[checkoutQueue] restore failed', error)
    return []
  }
}

function persistQueue() {
  if (!canUseStorage()) return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(queue.value))
  } catch (error) {
    console.warn('[checkoutQueue] save failed', error)
  }
}

function normalizeQueueItem(item) {
  const snapshot = item?.snapshot || {}
  const items = Array.isArray(snapshot.items) ? snapshot.items : []
  return {
    id: String(item?.id || `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`),
    createdAt: Number(item?.createdAt) || Date.now(),
    scheduledAt: Number(item?.scheduledAt) || Date.now(),
    displayAt: Number(item?.displayAt) || Number(item?.scheduledAt) || Date.now(),
    nextAttemptAt: Number(item?.nextAttemptAt) || Number(item?.scheduledAt) || Date.now(),
    attempts: Number(item?.attempts) || 0,
    maxAttempts: item?.maxAttempts === Infinity ? Infinity : Math.max(1, Number(item?.maxAttempts) || 3),
    // 同一笔订单的并发提交数：入队时快照，到点同时发起多份提交
    concurrency: clampConcurrency(snapshot.concurrency),
    status: ['pending', 'running', 'failed'].includes(item?.status) ? item.status : 'pending',
    lastError: String(item?.lastError || ''),
    snapshot: {
      cookie: String(snapshot.cookie || ''),
      addressId: String(snapshot.addressId || ''),
      remark: String(snapshot.remark || ''),
      isFromShopCar: Boolean(snapshot.isFromShopCar),
      displayAt: Number(snapshot.displayAt) || 0,
      items,
      giftActivities: Array.isArray(snapshot.giftActivities) ? snapshot.giftActivities : [],
    },
    summary: {
      goodsText: String(item?.summary?.goodsText || items.map((entry) => entry.name || entry.goodsId).filter(Boolean).slice(0, 3).join('、') || '订单').trim(),
      giftText: String(item?.summary?.giftText || '').trim(),
    },
  }
}

function loadQueue() {
  queue.value = readStorageQueue().map(normalizeQueueItem)
  hydrated.value = true
}

function ensureHydrated() {
  if (!hydrated.value) loadQueue()
}

function getServerNow() {
  return Date.now() + Number(clockOffsetMs.value || 0)
}

async function syncServerClock(cookie, force = false) {
  const shouldRefresh = force || !clockSyncedAt.value || (Date.now() - clockSyncedAt.value) > CLOCK_CACHE_TTL
  if (!cookie || !shouldRefresh) return getServerNow()
  try {
    const { offsetMs } = await fetchMihoyoServerTime(cookie)
    clockOffsetMs.value = Number(offsetMs) || 0
    clockSyncedAt.value = Date.now()
  } catch (error) {
    console.warn('[checkoutQueue] clock sync failed', error)
  }
  return getServerNow()
}

function createQueueEntry({ scheduledAt, displayAt, retryCount, concurrency = 1, snapshot, summary }) {
  return normalizeQueueItem({
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: Date.now(),
    scheduledAt,
    displayAt: displayAt || scheduledAt,
    nextAttemptAt: scheduledAt,
    attempts: 0,
    maxAttempts: retryCount === Infinity ? Infinity : Math.max(1, Number(retryCount) || 1),
    status: 'pending',
    lastError: '',
    snapshot: {
      ...snapshot,
      concurrency: clampConcurrency(concurrency),
    },
    summary,
  })
}

function enqueueOrder(payload) {
  ensureHydrated()
  const entry = createQueueEntry(payload)
  queue.value = [...queue.value, entry]
  persistQueue()
  startQueueWatcher()
  void processQueue()
  return entry
}

function removeQueuedOrder(id) {
  ensureHydrated()
  queue.value = queue.value.filter((item) => item.id !== id)
  persistQueue()
}

function retryQueuedOrder(id) {
  ensureHydrated()
  const now = getServerNow()
  const next = queue.value.find((item) => item.id === id)
  if (!next) return false
  next.status = 'pending'
  next.lastError = ''
  next.nextAttemptAt = Math.max(now + 1000, Number(next.scheduledAt) || now)
  persistQueue()
  startQueueWatcher()
  void processQueue()
  return true
}

function clearQueue() {
  ensureHydrated()
  queue.value = []
  persistQueue()
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// 固定 0.5s 重试，附加 ±0.2s 随机抖动，避免多线程同时发请求
function getRetryDelay() {
  return RETRY_DELAY + (Math.random() * 400 - 200)
}

function buildOrderPayload(entry) {
  return {
    addressId: entry.snapshot.addressId,
    items: entry.snapshot.items,
    giftActivities: entry.snapshot.giftActivities,
    isFromShopCar: Boolean(entry.snapshot.isFromShopCar),
    remark: entry.snapshot.remark,
  }
}

// 单个并发线程：按重试次数自行重试（非重试类错误立即抛出不等待），直到成功或耗尽次数
async function submitWithRetry(cookie, payload, maxAttempts) {
  let attempt = 0
  for (;;) {
    try {
      return await submitCheckoutOrder(cookie, payload)
    } catch (error) {
      const message = String(error?.message || '下单失败')
      const retriable = !/cookie|token|login|auth|401|403|过期|失效|鉴权|认证/i.test(message)
      attempt += 1
      if (!retriable) throw error
      if (maxAttempts !== Infinity && attempt >= maxAttempts) throw error
      await sleep(getRetryDelay())
    }
  }
}

// 同一笔订单并发 n 个线程：任一线程成功即返回成功（其余线程继续跑完，结果忽略）；
// 全部线程耗尽重试次数仍失败才返回失败
function runConcurrentSubmits(cookie, payload, n, maxAttempts) {
  return new Promise((resolve) => {
    let settled = false
    let rejected = 0
    let lastError = null
    for (let i = 0; i < n; i++) {
      submitWithRetry(cookie, payload, maxAttempts)
        .then((result) => {
          if (!settled) {
            settled = true
            resolve({ ok: true, result })
          }
        })
        .catch((error) => {
          lastError = error
          rejected += 1
          if (!settled && rejected >= n) {
            settled = true
            resolve({ ok: false, error: lastError })
          }
        })
    }
  })
}

async function executeQueuedOrder(entry) {
  const serverNow = await syncServerClock(entry.snapshot.cookie)
  if (serverNow < entry.nextAttemptAt) return false

  entry.status = 'running'
  entry.lastError = ''
  persistQueue()

  const n = clampConcurrency(entry.concurrency)
  const result = await runConcurrentSubmits(
    entry.snapshot.cookie,
    buildOrderPayload(entry),
    n,
    entry.maxAttempts,
  )

  if (result.ok) {
    queue.value = queue.value.filter((item) => item.id !== entry.id)
    persistQueue()
    return { ok: true, result: result.result }
  }

  entry.lastError = String(result.error?.message || '下单失败')
  entry.status = 'failed'
  persistQueue()
  return { ok: false, retriable: false, error: result.error }
}

async function processQueue() {
  ensureHydrated()
  if (processing.value || !queue.value.length) return

  processing.value = true
  try {
    while (true) {
      const pending = queue.value
        .filter((item) => item.status !== 'failed')
        .sort((a, b) => Number(a.nextAttemptAt) - Number(b.nextAttemptAt))

      const next = pending.find((item) => getServerNow() >= Number(item.nextAttemptAt || 0))
      if (!next) break

      const result = await executeQueuedOrder(next)
      if (result?.ok === false && !result.retriable) break
    }
  } finally {
    processing.value = false
  }
}

function startQueueWatcher() {
  if (!canUseStorage() || queueWatcherId) return
  queueWatcherId = window.setInterval(() => {
    void processQueue()
  }, 1000)

  window.addEventListener('focus', onQueueFocus, { passive: true })
  document.addEventListener('visibilitychange', onQueueVisibilityChange)
}

function onQueueFocus() {
  void processQueue()
}

function onQueueVisibilityChange() {
  if (document.visibilityState === 'visible') {
    void processQueue()
  }
}

function stopQueueWatcher() {
  if (!queueWatcherId) return
  clearInterval(queueWatcherId)
  queueWatcherId = 0
  window.removeEventListener('focus', onQueueFocus)
  document.removeEventListener('visibilitychange', onQueueVisibilityChange)
}

const pendingQueueItems = computed(() => queue.value.filter((item) => item.status !== 'failed'))
const failedQueueItems = computed(() => queue.value.filter((item) => item.status === 'failed'))

export function useCheckoutOrderQueue() {
  ensureHydrated()
  startQueueWatcher()

  return {
    queue,
    pendingQueueItems,
    failedQueueItems,
    processing,
    hydrated,
    enqueueOrder,
    removeQueuedOrder,
    retryQueuedOrder,
    clearQueue,
    processQueue,
    syncServerClock,
    getServerNow,
    startQueueWatcher,
    stopQueueWatcher,
  }
}
