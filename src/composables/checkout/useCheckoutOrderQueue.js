import { computed, ref } from 'vue'
import { preCreateOrder, createOrder, fetchGoodsDetailForCheckout, fetchMihoyoServerTime, fetchEdgeServerTime } from '@/utils/mihoyo/checkout'

const STORAGE_KEY = 'checkout-order-queue-v1'
const CONCURRENCY_MAX = 5
const CLOCK_CACHE_TTL = 60 * 1000
// 时钟刷新周期：队列存在时每 ~30s 重新校准一次偏移
const CLOCK_REFRESH_INTERVAL_MS = 30 * 1000
// 开抢前冻结窗口：距开抢 ≤10s 不再刷新时钟，避免校时抖动/网络占用影响开抢时机
const CLOCK_FREEZE_BEFORE_MS = 10 * 1000
const RETRY_DELAY = 500
// 缺货等回流的重试间隔：商品售罄后库存会陆续回补，间隔拉长以降低对服务器压力
const REBACK_DELAY = 3000
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

  // 两个时钟源并行请求，总时延受最慢者约束（edge 5s / mihoyo 8s），互不阻塞
  const [edgeResult, mihoyoResult] = await Promise.allSettled([
    fetchEdgeServerTime(),
    fetchMihoyoServerTime(cookie),
  ])

  if (edgeResult.status === 'fulfilled') {
    edgeOffset = Number(edgeResult.value.offsetMs)
    if (Number.isFinite(edgeOffset)) record('edge', edgeOffset)
  } else {
    console.warn('[checkoutQueue] edge clock unavailable', edgeResult.reason?.message)
  }

  if (mihoyoResult.status === 'fulfilled') {
    mihoyoOffset = Number(mihoyoResult.value.offsetMs)
    if (Number.isFinite(mihoyoOffset)) record('mihoyo', mihoyoOffset)
  } else {
    console.warn('[checkoutQueue] mihoyo clock unavailable', mihoyoResult.reason?.message)
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
  // 入队即刻校准时钟：开抢前几分钟窗口内由 maybeRefreshClock 周期刷新，T0 前 10s 冻结
  if (entry.snapshot.cookie) {
    void syncServerClock(entry.snapshot.cookie, true).catch((error) => {
      console.warn('[checkoutQueue] initial clock sync failed', error?.message)
    })
  }
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
    void syncServerClock(next.snapshot.cookie, true).catch((error) => {
      console.warn('[checkoutQueue] initial clock sync failed', error?.message)
    })
  }
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
  return DUPLICATE_ORDER_RE.test(message) && !/cookie|token|login|auth|鉴权|认证/i.test(message)
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
async function preCreateWithRetry(cookie, payload, maxAttempts, isCancelled = () => false) {
  let attempt = 0
  for (;;) {
    if (isCancelled()) throw createQueueCancelledError()
    try {
      return await preCreateOrder(cookie, payload)
    } catch (error) {
      if (isCancelled()) throw createQueueCancelledError()
      const message = String(error?.message || '预创建订单失败')
      const retriable = !/cookie|token|login|auth|过期|失效|鉴权|认证/i.test(message)
      attempt += 1
      if (!retriable) throw error
      if (maxAttempts !== Infinity && attempt >= maxAttempts) throw error
      await sleep(getRetryDelay())
    }
  }
}

// 阶段二：用同一 code 创建订单。code 幂等——重复提交报「已创建/重复」时视为成功。
// 单个提交单元：按重试次数自行重试，直到成功、重复（=成功）、或耗尽次数
async function createOrderWithRetry(cookie, { addressId, code, remark, items }, maxAttempts, isCancelled = () => false) {
  let attempt = 0
  for (;;) {
    if (isCancelled()) throw createQueueCancelledError()
    try {
      return await createOrder(cookie, { addressId, code, remark, items })
    } catch (error) {
      if (isCancelled()) throw createQueueCancelledError()
      if (isDuplicateOrderError(error)) {
        return { duplicate: true, message: String(error?.message || '订单已存在') }
      }
      const message = String(error?.message || '创建订单失败')
      const retriable = !/cookie|token|login|auth|过期|失效|鉴权|认证/i.test(message)
      attempt += 1
      if (!retriable) throw error
      if (maxAttempts !== Infinity && attempt >= maxAttempts) throw error
      await sleep(getRetryDelay())
    }
  }
}

// 单个提交单元：preCreate 拿自己的 code → createOrder 串行重试（B站单 token 模式）。
// 返回 { ...preCreated, ...orderResult }，orderResult 可能是成功或 { duplicate: true }
async function submitOrderUnit(cookie, payload, maxAttempts, isCancelled = () => false) {
  const preCreated = await preCreateWithRetry(cookie, payload, maxAttempts, isCancelled)
  const orderResult = await createOrderWithRetry(cookie, {
    addressId: payload.addressId,
    code: preCreated.code,
    remark: payload.remark,
    items: payload.items,
  }, maxAttempts, isCancelled)
  return { ...preCreated, ...orderResult }
}

// 一笔订单的提交策略：
//   concurrency=1：单个单元，preCreate 一次拿单 code → createOrder 串行重试（与 B站一致）
//   concurrency>1：并发 n 个独立单元，每个都走「自己的 preCreate → 自己的 createOrder」，
//                  各自拿独立 code、各自建单 → 可能产生多笔订单（重复下单可接受，目标是抢到）
// 任一单元真实成功（拿到 order_no）即立即返回；否则等全部结束，有「重复/已存在」也算成功
async function runConcurrentSubmits(cookie, payload, n, maxAttempts, isCancelled = () => false) {
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
      submitOrderUnit(cookie, payload, maxAttempts, isCancelled)
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
  // 开抢时机判断绝不阻塞于时钟同步：
  //   - 偏移已校准 → 直接用 getServerNow() 判断；TTL 过期且距开抢 >10s 时后台刷新供后续重试
  //   - 从未校准（offset 为 0）→ 后台尝试同步但不等待，用本地时间开火，靠重试兜住开售点
  //   - 距开抢 ≤10s 冻结校时：使用已冻结的偏移，避免校时抖动/网络占用影响开抢时机
  const nowForClock = Date.now()
  const msToFire = Number(entry.nextAttemptAt || entry.scheduledAt || 0) - nowForClock
  if (msToFire > CLOCK_FREEZE_BEFORE_MS) {
    if (clockOffsetMs.value === 0 || nowForClock - clockSyncedAt.value > CLOCK_CACHE_TTL) {
      void syncServerClock(entry.snapshot.cookie, true).catch((error) => {
        console.warn('[checkoutQueue] background clock refresh failed', error?.message)
      })
    }
  }

  const serverNow = getServerNow()
  if (serverNow < entry.nextAttemptAt - FIRE_LEAD_MS) return false
  if (isQueueEntryCancelled(entry)) return { ok: false, cancelled: true }

  entry.status = 'running'
  entry.lastError = ''
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
  const authError = /cookie|token|login|auth|过期|失效|鉴权|认证/i.test(String(result.error?.message || ''))
  if (!authError) {
    const stockStatus = await stockCheck
    entry.status = 'pending'
    if (stockStatus === 'out') {
      entry.lastError = '商品缺货，等待回流，3 秒后重试'
      entry.nextAttemptAt = getServerNow() + REBACK_DELAY
    } else {
      entry.lastError = '下单失败，稍后自动重试'
      entry.nextAttemptAt = getServerNow() + getRetryDelay()
    }
    persistQueue()
    return { ok: false, retriable: true }
  }

  entry.lastError = String(result.error?.message || '下单失败')
  entry.status = 'failed'
  persistQueue()
  return { ok: false, retriable: false, error: result.error }
}

// 队列存在期间周期校准时钟：距最近一个待下单项开抢 >10s 时每 ~30s 刷新一次，
// 进入最后 10s 冻结窗口即停止，保证开抢瞬间用的是稳定偏移。
function getEarliestPendingScheduledAt() {
  let min = Infinity
  for (const item of queue.value) {
    if (item.status !== 'pending') continue
    const t = Number(item.scheduledAt) || Number(item.nextAttemptAt) || 0
    if (t && t < min) min = t
  }
  return min === Infinity ? 0 : min
}

function maybeRefreshClock() {
  if (!queue.value.length) return
  const now = Date.now()
  const earliest = getEarliestPendingScheduledAt()
  // 最后 10s 冻结：不再刷新，避免校时抖动占用开抢瞬间的网络/CPU
  if (earliest && earliest - now <= CLOCK_FREEZE_BEFORE_MS) return
  // 已有偏移且未超过刷新周期则不重复请求
  if (clockOffsetMs.value !== 0 && now - clockSyncedAt.value <= CLOCK_REFRESH_INTERVAL_MS) return
  const pending = queue.value.find((item) => item.status === 'pending' && item.snapshot?.cookie)
  if (!pending) return
  void syncServerClock(pending.snapshot.cookie, true).catch((error) => {
    console.warn('[checkoutQueue] clock refresh failed', error?.message)
  })
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
    maybeRefreshClock()
    void processQueue()
  }, WATCH_INTERVAL)

  window.addEventListener('focus', onQueueFocus, { passive: true })
  document.addEventListener('visibilitychange', onQueueVisibilityChange)
}

function onQueueFocus() {
  maybeRefreshClock()
  void processQueue()
}

function onQueueVisibilityChange() {
  if (document.visibilityState === 'visible') {
    maybeRefreshClock()
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
    // 订阅「抢购成功」事件：回调参数为成功项 entry（含 result/summary），
    // 每次真正抢到都触发，不含历史遗留的 success 项
    onCheckoutSuccess(handler) {
      checkoutSuccessHandler = handler
      return () => { if (checkoutSuccessHandler === handler) checkoutSuccessHandler = null }
    },
  }
}
