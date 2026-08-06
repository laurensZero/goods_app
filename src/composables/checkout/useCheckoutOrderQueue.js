import { computed, ref } from 'vue'
import { preCreateOrder, createOrder, fetchMihoyoServerTime, fetchEdgeServerTime } from '@/utils/mihoyo/checkout'

const STORAGE_KEY = 'checkout-order-queue-v1'
const CONCURRENCY_MAX = 5
const CLOCK_CACHE_TTL = 60 * 1000
const RETRY_DELAY = 500
// 成功订单保留时长：供用户查看结果，超时后自动清除
const SUCCESS_RETENTION_MS = 24 * 60 * 60 * 1000
// 提前量：时钟偏移已做 RTT 中点 + 秒中点校准，这里只需补偿提交请求自身的网络时延，
// 让下单请求尽量在开售瞬间到达（提前到未开售时由重试兜底）
const FIRE_LEAD_MS = 800
const WATCH_INTERVAL = 250

const queue = ref([])
const hydrated = ref(false)
const processing = ref(false)
const clockOffsetMs = ref(0)
const clockSyncedAt = ref(0)
const clockSyncSource = ref('')
// 米游铺时钟相对 UTC 的偏差均值：用于把边缘 UTC 换算成米游铺时钟
let mihoyoDeltaMean = 0

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
    // 并发提交数：到点同时发起 n 个独立 preCreate（各拿 code、各建一单，可能重复）
    concurrency: clampConcurrency(snapshot.concurrency),
    status: ['pending', 'running', 'success', 'failed'].includes(item?.status) ? item.status : 'pending',
    lastError: String(item?.lastError || ''),
    completedAt: Number(item?.completedAt) || 0,
    result: item?.result
      ? {
        orderNo: String(item.result.orderNo || ''),
        amount: Number(item.result.amount) || 0,
        productName: String(item.result.productName || ''),
        duplicate: Boolean(item.result.duplicate),
        duplicateMessage: String(item.result.duplicateMessage || ''),
      }
      : null,
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
  pruneExpiredSuccess()
  hydrated.value = true
}

// 成功订单保留 24 小时后自动清除
function pruneExpiredSuccess() {
  const now = Date.now()
  const kept = queue.value.filter(
    (item) => item.status !== 'success' || (Number(item.completedAt) || 0) + SUCCESS_RETENTION_MS > now
  )
  if (kept.length !== queue.value.length) {
    queue.value = kept
    persistQueue()
  }
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

  const record = (source, offsetMs) => {
    if (offsetMs === null || offsetMs === undefined || Number.isNaN(offsetMs)) return null
    clockOffsetMs.value = Number(offsetMs)
    clockSyncedAt.value = Date.now()
    clockSyncSource.value = source
    return Number(offsetMs)
  }

  // 双锚互相校验：
  //   1. 边缘函数（毫秒级 NTP，单次即准）做主参考，给出 offset_edge
  //   2. 米游铺 Date 头（+500ms 秒中点补偿，多采样平均）测 offset_mihoyo
  //   3. delta = offset_mihoyo − offset_edge = 「米游铺时钟 − 边缘时钟」，逐次累积平均；
  //      用它把边缘的毫秒级时间换算回米游铺时钟域（与 sale_time 同一时钟，偏移互相抵消）
  //   若任一层不可用，退到另一层；都不可用则保留上次已知偏移。绝不因时钟同步失败阻塞下单。

  let edgeOffset = null
  let mihoyoOffset = null

  try {
    const edge = await fetchEdgeServerTime()
    edgeOffset = Number(edge.offsetMs)
    if (Number.isFinite(edgeOffset)) record('edge', edgeOffset)
  } catch (edgeError) {
    console.warn('[checkoutQueue] edge clock unavailable', edgeError?.message)
  }

  try {
    const mihoyo = await fetchMihoyoServerTime(cookie)
    mihoyoOffset = Number(mihoyo.offsetMs)
    if (Number.isFinite(mihoyoOffset)) record('mihoyo', mihoyoOffset)
  } catch (mihoyoError) {
    console.warn('[checkoutQueue] mihoyo clock unavailable', mihoyoError?.message)
  }

  // 双源都拿到时：累积 delta，用「边缘毫秒时间 + delta 均值」得到米游铺时钟域时间
  if (Number.isFinite(edgeOffset) && Number.isFinite(mihoyoOffset)) {
    const delta = mihoyoOffset - edgeOffset
    mihoyoDeltaMean = mihoyoDeltaMean === 0 ? delta : mihoyoDeltaMean * 0.7 + delta * 0.3
    const combined = edgeOffset + mihoyoDeltaMean
    if (Number.isFinite(combined)) {
      clockOffsetMs.value = combined
      clockSyncedAt.value = Date.now()
      clockSyncSource.value = 'edge+mihoyo'
    }
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

// 「重复/已存在」类错误：说明 code 已被消费、订单已建 → 视为成功（抢到即达目标）
const DUPLICATE_ORDER_RE = /重复|已存在|已下单|已购买|已创建|订单已创建|已经.*(订单|下单)|already.*order|order.*exist|duplicate/i

function isDuplicateOrderError(error) {
  const message = String(error?.message || error || '')
  if (!message) return false
  // 注意：不能命中鉴权类词（如「登录已过期」），避免误判
  return DUPLICATE_ORDER_RE.test(message) && !/cookie|token|login|auth|401|403|鉴权|认证/i.test(message)
}

// 阶段一：预创建拿 code（可重试）。返回 { code, totalFee, orderPoints, shopOrders, respGifts }
async function preCreateWithRetry(cookie, payload, maxAttempts) {
  let attempt = 0
  for (;;) {
    try {
      return await preCreateOrder(cookie, payload)
    } catch (error) {
      const message = String(error?.message || '预创建订单失败')
      const retriable = !/cookie|token|login|auth|401|403|过期|失效|鉴权|认证/i.test(message)
      attempt += 1
      if (!retriable) throw error
      if (maxAttempts !== Infinity && attempt >= maxAttempts) throw error
      await sleep(getRetryDelay())
    }
  }
}

// 阶段二：用同一 code 创建订单。code 幂等——重复提交报「已创建/重复」时视为成功。
// 单个提交单元：按重试次数自行重试，直到成功、重复（=成功）、或耗尽次数
async function createOrderWithRetry(cookie, { addressId, code, remark, items }, maxAttempts) {
  let attempt = 0
  for (;;) {
    try {
      return await createOrder(cookie, { addressId, code, remark, items })
    } catch (error) {
      if (isDuplicateOrderError(error)) {
        return { duplicate: true, message: String(error?.message || '订单已存在') }
      }
      const message = String(error?.message || '创建订单失败')
      const retriable = !/cookie|token|login|auth|401|403|过期|失效|鉴权|认证/i.test(message)
      attempt += 1
      if (!retriable) throw error
      if (maxAttempts !== Infinity && attempt >= maxAttempts) throw error
      await sleep(getRetryDelay())
    }
  }
}

// 单个提交单元：preCreate 拿自己的 code → createOrder 串行重试（B站单 token 模式）。
// 返回 { ...preCreated, ...orderResult }，orderResult 可能是成功或 { duplicate: true }
async function submitOrderUnit(cookie, payload, maxAttempts) {
  const preCreated = await preCreateWithRetry(cookie, payload, maxAttempts)
  const orderResult = await createOrderWithRetry(cookie, {
    addressId: payload.addressId,
    code: preCreated.code,
    remark: payload.remark,
    items: payload.items,
  }, maxAttempts)
  return { ...preCreated, ...orderResult }
}

// 一笔订单的提交策略：
//   concurrency=1：单个单元，preCreate 一次拿单 code → createOrder 串行重试（与 B站一致）
//   concurrency>1：并发 n 个独立单元，每个都走「自己的 preCreate → 自己的 createOrder」，
//                  各自拿独立 code、各自建单 → 可能产生多笔订单（重复下单可接受，目标是抢到）
// 任一单元真实成功（拿到 order_no）即立即返回；否则等全部结束，有「重复/已存在」也算成功
async function runConcurrentSubmits(cookie, payload, n, maxAttempts) {
  return new Promise((resolve) => {
    let settled = false
    let finished = 0
    let lastError = null
    let duplicate = null

    const finish = () => {
      if (settled || finished < n) return
      if (duplicate) {
        resolve({ ok: true, result: duplicate })
      } else {
        resolve({ ok: false, error: lastError || new Error('下单失败') })
      }
    }

    for (let i = 0; i < n; i++) {
      submitOrderUnit(cookie, payload, maxAttempts)
        .then((result) => {
          finished += 1
          if (result.orderNo && !settled) {
            settled = true
            resolve({ ok: true, result })
            return
          }
          if (result.duplicate && !duplicate) {
            duplicate = result
          }
          finish()
        })
        .catch((error) => {
          lastError = error
          finished += 1
          finish()
        })
    }
  })
}

async function executeQueuedOrder(entry) {
  const serverNow = await syncServerClock(entry.snapshot.cookie)
  if (serverNow < entry.nextAttemptAt - FIRE_LEAD_MS) return false

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
    // 成功订单保留在队列中供查看，标记为 success 并记录结果，不再从队列移除
    entry.status = 'success'
    entry.result = {
      orderNo: String(result.result.orderNo || ''),
      amount: Number(result.result.amount) || 0,
      productName: String(result.result.productName || ''),
      // 复用 code 收到「订单已存在/重复」→ 订单已建但无订单号，标记 duplicate 供 UI 提示
      duplicate: Boolean(result.result.duplicate),
      duplicateMessage: String(result.result.message || ''),
    }
    entry.completedAt = getServerNow()
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
        .filter((item) => item.status === 'pending')
        .sort((a, b) => Number(a.nextAttemptAt) - Number(b.nextAttemptAt))

      const next = pending.find((item) => getServerNow() >= Number(item.nextAttemptAt || 0) - FIRE_LEAD_MS)
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
    pruneExpiredSuccess()
    void processQueue()
  }, WATCH_INTERVAL)

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

const pendingQueueItems = computed(() => queue.value.filter((item) => item.status === 'pending' || item.status === 'running'))
const failedQueueItems = computed(() => queue.value.filter((item) => item.status === 'failed'))
// 仍需要处理/失败的项（不含成功项），用于角标与“我的”页计数
const activeQueueItems = computed(() => queue.value.filter((item) => item.status !== 'success'))
// 列表展示：待处理/进行中优先，其次失败，成功项沉底
const displayQueueItems = computed(() => {
  const rank = { pending: 0, running: 0, failed: 1, success: 2 }
  return [...queue.value].sort(
    (a, b) => (rank[a.status] ?? 0) - (rank[b.status] ?? 0) || Number(a.nextAttemptAt) - Number(b.nextAttemptAt)
  )
})

export function useCheckoutOrderQueue() {
  ensureHydrated()
  startQueueWatcher()

  return {
    queue,
    pendingQueueItems,
    failedQueueItems,
    activeQueueItems,
    displayQueueItems,
    processing,
    hydrated,
    enqueueOrder,
    removeQueuedOrder,
    retryQueuedOrder,
    clearQueue,
    processQueue,
    syncServerClock,
    getServerNow,
    clockOffsetMs,
    clockSyncSource,
    startQueueWatcher,
    stopQueueWatcher,
  }
}
