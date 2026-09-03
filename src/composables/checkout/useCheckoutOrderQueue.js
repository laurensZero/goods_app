import { computed, ref } from 'vue'
import { preCreateOrder, createOrder, fetchGoodsDetailForCheckout, fetchMihoyoServerTime, fetchEdgeServerTime } from '@/utils/mihoyo/checkout'

const STORAGE_KEY = 'checkout-order-queue-v1'
const CONCURRENCY_MAX = 5
const RETRY_DELAY = 500
const PRE_CREATE_RETRY_DELAY = 100
// 缺货等回流的重试间隔：商品售罄后库存会陆续回补，间隔拉长以降低对服务器压力
const REBACK_DELAY = 3000
// 成功订单保留时长：供用户查看结果，超时后自动清除
const SUCCESS_RETENTION_MS = 24 * 60 * 60 * 1000
// 抢购窗口前先尝试预创建；若服务端尚未放行，预创建会快速重试。
const FIRE_LEAD_MS = 600
// 高频轮询只负责兜底，实际到点由精确唤醒定时器触发，减少客户端调度延迟。
const WATCH_INTERVAL = 100

const queue = ref([])
const hydrated = ref(false)
const processing = ref(false)
const clockOffsetMs = ref(0)
const clockSyncedAt = ref(0)
const clockSyncSource = ref('')
let clockSyncPromise = null
let clockBaseWallMs = 0
let clockBasePerfMs = 0

let queueWatcherId = 0
let queueWakeTimerId = 0
const cancelledQueueIds = new Set()
// 抢购成功的事件回调（供业务层订阅，如 QQ 提醒）。成功时刻触发一次，天然排除历史遗留项。
let checkoutSuccessHandler = null

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
    logs: Array.isArray(item?.logs)
      ? item.logs.map((log) => ({
        type: String(log?.type || ''),
        at: Number(log?.at) || 0,
        message: String(log?.message || ''),
      })).filter((log) => log.type && log.at)
      : [],
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

function appendQueueLog(entry, type, message = '') {
  if (!entry) return
  const logs = Array.isArray(entry.logs) ? entry.logs : []
  const at = clockSyncedAt.value ? getServerNow() : Date.now()
  entry.logs = [...logs, { type, at, message: String(message || '') }].slice(-30)
  persistQueue()
}

function getCountdownMarker(remainingMs) {
  const seconds = Math.ceil(Math.max(0, remainingMs) / 1000)
  if (seconds <= 0) return 0
  if (seconds <= 5) return seconds
  if (seconds <= 30) return Math.ceil(seconds / 10) * 10
  return Math.ceil(seconds / 60) * 60
}

function maybeLogCountdown(entry) {
  if (!entry || entry.status !== 'pending') return
  const remainingMs = Number(entry.nextAttemptAt || 0) - getServerNow()
  const marker = getCountdownMarker(remainingMs)
  if (!marker) return
  const alreadyLogged = (entry.logs || []).some(
    (log) => log.type === 'countdown' && log.message === String(marker),
  )
  if (!alreadyLogged) appendQueueLog(entry, 'countdown', String(marker))
}

function getServerNow() {
  if (clockBaseWallMs && typeof performance !== 'undefined') {
    return clockBaseWallMs + (performance.now() - clockBasePerfMs)
  }
  return Date.now() + Number(clockOffsetMs.value || 0)
}

async function syncServerClock(cookie, force = false) {
  if (!cookie || (!force && clockSyncedAt.value)) return getServerNow()
  if (clockSyncPromise) return clockSyncPromise

  const record = (source, offsetMs) => {
    if (!Number.isFinite(Number(offsetMs))) return null
    clockOffsetMs.value = Number(offsetMs)
    clockSyncedAt.value = Date.now()
    clockSyncSource.value = source
    clockBaseWallMs = Date.now() + clockOffsetMs.value
    clockBasePerfMs = typeof performance !== 'undefined' ? performance.now() : 0
    return Number(offsetMs)
  }

  clockSyncPromise = (async () => {
    let edgeOffset = null
    try {
      const edge = await fetchEdgeServerTime()
      edgeOffset = Number(edge.offsetMs)
      record('edge-ntp', edgeOffset)
    } catch (error) {
      console.warn('[checkoutQueue] edge clock unavailable', error?.message)
    }

    // 米游铺 Date 只有秒级精度，仅用于校验，不覆盖主校时结果，也不阻塞开抢调度。
    void fetchMihoyoServerTime(cookie).then((mihoyo) => {
      if (Number.isFinite(edgeOffset)) {
        console.info('[checkoutQueue] mihoyo clock check', {
          differenceMs: Math.round(Number(mihoyo.offsetMs) - edgeOffset),
          uncertaintyMs: 500,
        })
      }
    }).catch((error) => {
      console.warn('[checkoutQueue] mihoyo clock check unavailable', error?.message)
    })

    return getServerNow()
  })()

  try {
    return await clockSyncPromise
  } finally {
    clockSyncPromise = null
  }
}

function createQueueEntry({ scheduledAt, displayAt, retryCount, concurrency = 1, snapshot, summary }) {
  const createdAt = Date.now()
  return normalizeQueueItem({
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt,
    scheduledAt,
    displayAt: displayAt || scheduledAt,
    nextAttemptAt: scheduledAt,
    attempts: 0,
    maxAttempts: retryCount === Infinity ? Infinity : Math.max(1, Number(retryCount) || 1),
    status: 'pending',
    lastError: '',
    logs: [{ type: 'queue-added', at: createdAt }],
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
  // 按参考项目的方式：入队后立即完成一次校时，开抢时只使用已固定的结果。
  if (entry.snapshot.cookie) {
    appendQueueLog(entry, 'clock-sync-start')
    void syncServerClock(entry.snapshot.cookie, true)
      .then(() => appendQueueLog(
        entry,
        'clock-sync-done',
        `${clockSyncSource.value}，偏移 ${Math.round(Number(clockOffsetMs.value) || 0)}ms`,
      ))
      .catch((error) => {
        appendQueueLog(entry, 'clock-sync-failed', error?.message)
        console.warn('[checkoutQueue] initial clock sync failed', error?.message)
      })
  } else {
    appendQueueLog(entry, 'clock-sync-skipped', '未提供 Cookie')
  }
  scheduleQueueWake()
  void processQueue()
  return entry
}

function removeQueuedOrder(id) {
  ensureHydrated()
  const normalizedId = String(id)
  cancelledQueueIds.add(normalizedId)
  queue.value = queue.value.filter((item) => item.id !== normalizedId)
  persistQueue()
}

function retryQueuedOrder(id) {
  ensureHydrated()
  const now = getServerNow()
  const normalizedId = String(id)
  const next = queue.value.find((item) => item.id === normalizedId)
  if (!next) return false
  cancelledQueueIds.delete(normalizedId)
  next.status = 'pending'
  next.lastError = ''
  next.nextAttemptAt = Math.max(now + 1000, Number(next.scheduledAt) || now)
  persistQueue()
  startQueueWatcher()
  if (next.snapshot?.cookie) {
    appendQueueLog(next, 'clock-sync-start')
    void syncServerClock(next.snapshot.cookie, true)
      .then(() => appendQueueLog(next, 'clock-sync-done', clockSyncSource.value))
      .catch((error) => {
        appendQueueLog(next, 'clock-sync-failed', error?.message)
        console.warn('[checkoutQueue] retry clock sync failed', error?.message)
      })
  }
  scheduleQueueWake()
  void processQueue()
  return true
}

function clearQueue() {
  ensureHydrated()
  for (const item of queue.value) cancelledQueueIds.add(String(item.id))
  queue.value = []
  persistQueue()
}

function isQueueEntryCancelled(entry) {
  return cancelledQueueIds.has(String(entry?.id || ''))
    || !queue.value.some((item) => item.id === entry?.id)
}

function createQueueCancelledError() {
  const error = new Error('Queue task cancelled')
  error.queueCancelled = true
  return error
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// 固定 0.5s 重试，附加 ±0.2s 随机抖动，避免多线程同时发请求
function getRetryDelay() {
  return RETRY_DELAY + (Math.random() * 400 - 200)
}

function getPreCreateRetryDelay() {
  return PRE_CREATE_RETRY_DELAY
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

// 缺货检测：通过商品详情接口确认所选 SKU 是否缺货。
// 下单失败返回 -502 通用错误无法区分「缺货」与「瞬时错误」，因此单独查 detail 确认。
// 返回三态：
//   'out'       已确认缺货（所选 SKU 实时库存为 0）→ 等回流
//   'unknown'   detail 查询失败 / 无法确认 → 也继续抢（可能瞬时错误或正在回流，不放弃）
//   'available' 确认仍有货 → 瞬时错误，标失败即可
async function isGoodsOutOfStock(cookie, items) {
  if (!Array.isArray(items) || !items.length) return 'available'
  const checks = items.map(async (item) => {
    try {
      const detail = await fetchGoodsDetailForCheckout(item.goodsId, cookie)
      const sku = (detail.skus || []).find((s) => String(s.id) === String(item.skuId))
      // 找不到对应 SKU 时无法确认库存，视为 unknown
      if (!sku) return 'unknown'
      return sku.soldOut || sku.stock === 0 ? 'out' : 'available'
    } catch (error) {
      console.warn('[checkoutQueue] out-of-stock check failed', error?.message)
      return 'unknown'
    }
  })
  try {
    const results = await Promise.all(checks)
    // 任一缺货即缺货；全部确认有货才 available；否则有失败/无法确认 → unknown（继续抢）
    if (results.includes('out')) return 'out'
    if (results.every((r) => r === 'available')) return 'available'
    return 'unknown'
  } catch (error) {
    return 'unknown'
  }
}

// 阶段一：预创建拿 code（可重试）。返回 { code, totalFee, orderPoints, shopOrders, respGifts }
async function preCreateWithRetry(cookie, payload, maxAttempts, isCancelled = () => false, entry = null) {
  let attempt = 0
  for (;;) {
    if (isCancelled()) throw createQueueCancelledError()
    appendQueueLog(entry, 'pre-create-start', `第 ${attempt + 1} 次`)
    try {
      return await preCreateOrder(cookie, payload)
    } catch (error) {
      if (isCancelled()) throw createQueueCancelledError()
      const message = String(error?.message || '预创建订单失败')
      const retriable = !/cookie|token|login|auth|401|403|过期|失效|鉴权|认证/i.test(message)
      attempt += 1
      appendQueueLog(entry, retriable && (maxAttempts === Infinity || attempt < maxAttempts) ? 'retry' : 'request-failed', `预创建第 ${attempt} 次失败：${message}`)
      if (!retriable) throw error
      if (maxAttempts !== Infinity && attempt >= maxAttempts) throw error
      await sleep(getPreCreateRetryDelay())
    }
  }
}

// 阶段二：用同一 code 创建订单。code 幂等——重复提交报「已创建/重复」时视为成功。
// 单个提交单元：按重试次数自行重试，直到成功、重复（=成功）、或耗尽次数
async function createOrderWithRetry(cookie, { addressId, code, remark, items }, maxAttempts, isCancelled = () => false, entry = null) {
  let attempt = 0
  for (;;) {
    if (isCancelled()) throw createQueueCancelledError()
    appendQueueLog(entry, 'create-start', `第 ${attempt + 1} 次`)
    try {
      return await createOrder(cookie, { addressId, code, remark, items })
    } catch (error) {
      if (isCancelled()) throw createQueueCancelledError()
      if (isDuplicateOrderError(error)) {
        return { duplicate: true, message: String(error?.message || '订单已存在') }
      }
      const message = String(error?.message || '创建订单失败')
      const retriable = !/cookie|token|login|auth|401|403|过期|失效|鉴权|认证/i.test(message)
      attempt += 1
      appendQueueLog(entry, retriable && (maxAttempts === Infinity || attempt < maxAttempts) ? 'retry' : 'request-failed', `创建第 ${attempt} 次失败：${message}`)
      if (!retriable) throw error
      if (maxAttempts !== Infinity && attempt >= maxAttempts) throw error
      await sleep(getRetryDelay())
    }
  }
}

// 单个提交单元：preCreate 拿自己的 code → createOrder 串行重试（B站单 token 模式）。
// 返回 { ...preCreated, ...orderResult }，orderResult 可能是成功或 { duplicate: true }
async function submitOrderUnit(cookie, payload, maxAttempts, isCancelled = () => false, entry = null) {
  const preCreated = await preCreateWithRetry(cookie, payload, maxAttempts, isCancelled, entry)
  const orderResult = await createOrderWithRetry(cookie, {
    addressId: payload.addressId,
    code: preCreated.code,
    remark: payload.remark,
    items: payload.items,
  }, maxAttempts, isCancelled, entry)
  return { ...preCreated, ...orderResult }
}

// 一笔订单的提交策略：
//   concurrency=1：单个单元，preCreate 一次拿单 code → createOrder 串行重试（与 B站一致）
//   concurrency>1：并发 n 个独立单元，每个都走「自己的 preCreate → 自己的 createOrder」，
//                  各自拿独立 code、各自建单 → 可能产生多笔订单（重复下单可接受，目标是抢到）
// 任一单元真实成功（拿到 order_no）即立即返回；否则等全部结束，有「重复/已存在」也算成功
async function runConcurrentSubmits(cookie, payload, n, maxAttempts, isCancelled = () => false, entry = null) {
  return new Promise((resolve) => {
    let settled = false
    let finished = 0
    let lastError = null
    let duplicate = null

    if (isCancelled()) {
      resolve({ ok: false, cancelled: true, error: createQueueCancelledError() })
      return
    }

    const finish = () => {
      if (settled || finished < n) return
      if (duplicate) {
        resolve({ ok: true, result: duplicate })
      } else {
        resolve({ ok: false, error: lastError || new Error('下单失败') })
      }
    }

    for (let i = 0; i < n; i++) {
      submitOrderUnit(cookie, payload, maxAttempts, isCancelled, entry)
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
          if (error?.queueCancelled && !settled) {
            settled = true
            resolve({ ok: false, cancelled: true, error })
            return
          }
          lastError = error
          finished += 1
          finish()
        })
    }
  })
}

async function executeQueuedOrder(entry) {
  if (isQueueEntryCancelled(entry)) return { ok: false, cancelled: true }
  // 校时在入队时开始；若尚未完成，首次执行前等待它结束。
  // 校准完成后固定结果，倒计时由 performance.now() 驱动，不再动态改偏移。
  if (!clockSyncedAt.value) {
    await syncServerClock(entry.snapshot.cookie)
  }

  const serverNow = getServerNow()
  if (serverNow < entry.nextAttemptAt - FIRE_LEAD_MS) return false
  if (isQueueEntryCancelled(entry)) return { ok: false, cancelled: true }

  entry.status = 'running'
  entry.lastError = ''
  appendQueueLog(entry, 'submit-start')
  persistQueue()

  const n = clampConcurrency(entry.concurrency)
  // 抢购与缺货预检并行：同时发起下单与 detail 库存查询。
  // 下单失败时预检通常已返回，直接消费结论决定「等回流」还是「标失败」，避免串行补查的额外 RTT
  const stockCheck = isGoodsOutOfStock(entry.snapshot.cookie, entry.snapshot.items)
  const result = await runConcurrentSubmits(
    entry.snapshot.cookie,
    buildOrderPayload(entry),
    n,
    entry.maxAttempts,
    () => isQueueEntryCancelled(entry),
    entry,
  )

  if (result.cancelled || isQueueEntryCancelled(entry)) return { ok: false, cancelled: true }

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
    appendQueueLog(entry, 'success')
    persistQueue()
    // 抢购成功这一刻通知订阅者（如 QQ 提醒），与「队列里既有」的成功项无关
    try {
      checkoutSuccessHandler?.(entry)
    } catch (error) {
      console.warn('[checkoutQueue] checkout success handler error', error?.message)
    }
    return { ok: true, result: result.result }
  }

  // 下单失败：消费并行预检的库存结论，决定继续抢的节奏。
  //   缺货(out)         → 等回流慢节奏，3 秒后重试
  //   有货/无法确认      → 按原节奏继续抢（0.5s±0.2s 抖动）——有货仍失败多是限流/服务端瞬时故障，更该继续
  //   仅鉴权类错误       → 标 failed，等待用户重新登录/处理，不无限重试
  const authError = /cookie|token|login|auth|401|403|过期|失效|鉴权|认证/i.test(String(result.error?.message || ''))
  if (!authError) {
    const stockStatus = await stockCheck
    entry.status = 'pending'
    if (stockStatus === 'out') {
      entry.lastError = '商品缺货，等待回流，3 秒后重试'
      entry.nextAttemptAt = getServerNow() + REBACK_DELAY
      appendQueueLog(entry, 'retry', entry.lastError)
    } else {
      entry.lastError = '下单失败，稍后自动重试'
      entry.nextAttemptAt = getServerNow() + getRetryDelay()
      appendQueueLog(entry, 'retry', `${entry.lastError}：${result.error?.message || ''}`)
    }
    persistQueue()
    return { ok: false, retriable: true }
  }

  entry.lastError = String(result.error?.message || '下单失败')
  entry.status = 'failed'
  appendQueueLog(entry, 'failed', entry.lastError)
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
    scheduleQueueWake()
  }
}

function scheduleQueueWake() {
  if (typeof window === 'undefined') return
  if (queueWakeTimerId) clearTimeout(queueWakeTimerId)
  const next = queue.value
    .filter((item) => item.status === 'pending')
    .sort((a, b) => Number(a.nextAttemptAt) - Number(b.nextAttemptAt))[0]
  if (!next) {
    queueWakeTimerId = 0
    return
  }
  const delay = Math.max(0, Number(next.nextAttemptAt || 0) - getServerNow() - FIRE_LEAD_MS)
  queueWakeTimerId = window.setTimeout(() => {
    queueWakeTimerId = 0
    void processQueue()
  }, Math.min(delay, WATCH_INTERVAL))
}

function startQueueWatcher() {
  if (!canUseStorage() || queueWatcherId) return
  queueWatcherId = window.setInterval(() => {
    pruneExpiredSuccess()
    for (const entry of queue.value) maybeLogCountdown(entry)
    scheduleQueueWake()
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
  if (queueWakeTimerId) clearTimeout(queueWakeTimerId)
  queueWakeTimerId = 0
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
    // 订阅「抢购成功」事件：回调参数为成功项 entry（含 result/summary），
    // 每次真正抢到都触发，不含历史遗留的 success 项
    onCheckoutSuccess(handler) {
      checkoutSuccessHandler = handler
      return () => { if (checkoutSuccessHandler === handler) checkoutSuccessHandler = null }
    },
  }
}
