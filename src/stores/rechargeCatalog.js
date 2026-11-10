// @ts-check
// 充值档位目录：云端可控（Supabase recharge_options 表）+ 本地缓存兜底 + 增量拉取。
//
// 缓存策略（仿 birthdayService）：
// - 云端是唯一数据源。无缓存时目录为空，由添加对话框展示 loading；
//   拉取失败且无缓存时展示错误态，不阻塞手动添加
// - 有缓存时首屏直接用缓存（秒开），最短间隔（60s）后在后台增量刷新
// - 60s 内不重复拉取；之后按 lastPulledAt 增量拉取（updated_at > lastPulledAt）
// - 网络失败：静默降级为旧缓存，syncedAt 不推进（下次打开仍会重试）
// - 调用方不 await（fire-and-forget），对话框用 loading/loadError 渲染首次加载状态
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { getSupabaseClient } from '@/utils/sync/supabaseClient'
import { buildRechargePresetImageMap } from '@/utils/recharge/rechargeImages'
import { createLogger } from '@/utils/logger'

const CACHE_KEY = 'goods_recharge_options_cache'
// 两次自动同步的最小间隔：短到 Dashboard 改行后重开对话框就能拿到，
// 又能挡住连续打开/页面挂载造成的重复请求（增量查询在无变更时只会返回空数组）。
const MIN_REFRESH_INTERVAL_MS = 60 * 1000
// 固定游戏展示顺序（原神 → 星穹铁道 → 崩坏3 → 绝区零），未列出的按 id 排序
const GAME_ORDER = ['hk4e_cn', 'hkrpg_cn', 'bh3_cn', 'nap_cn']
const log = createLogger('recharge-catalog')

function emptyCache() {
  return { rows: {}, lastPulledAt: '', syncedAt: 0 }
}

function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return emptyCache()
    const parsed = JSON.parse(raw)
    return {
      rows: parsed?.rows && typeof parsed.rows === 'object' ? parsed.rows : {},
      lastPulledAt: String(parsed?.lastPulledAt || ''),
      syncedAt: Number(parsed?.syncedAt) || 0
    }
  } catch {
    return emptyCache()
  }
}

function persistCache(cache) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache))
  } catch {
    // 缓存写失败不影响使用，下次同步会重写
  }
}

function normalizeRow(row) {
  const id = String(row?.id || '').trim()
  const gameBiz = String(row?.game_biz || '').trim()
  const region = String(row?.region || '').trim()
  if (!id || !gameBiz) return null
  const options = Array.isArray(row?.options)
    ? row.options.filter((option) => option && typeof option === 'object')
    : []
  return {
    id,
    gameBiz,
    region,
    label: String(row?.label || '').trim(),
    options,
    deleted: Boolean(row?.deleted),
    updatedAt: String(row?.updated_at || '')
  }
}

// 取较晚的时间戳；timestamptz 可能带不同时区偏移，必须按时间解析而不是字符串比较
function laterIso(left, right) {
  const a = Date.parse(left)
  const b = Date.parse(right)
  if (Number.isNaN(b)) return left
  if (Number.isNaN(a)) return right
  return b > a ? right : left
}

function sortKey(id) {
  const gameBiz = String(id || '').split('::')[0]
  const order = GAME_ORDER.indexOf(gameBiz)
  return order >= 0 ? `${String(order).padStart(2, '0')}::${id}` : `99::${id}`
}

export const useRechargeCatalogStore = defineStore('rechargeCatalog', () => {
  const cache = ref(readCache())
  let inflight = null

  const hasCache = () => (
    cache.value.syncedAt > 0 || Object.keys(cache.value.rows).length > 0
  )

  // idle = 从未加载；loading = 首次加载中；ready = 有缓存或已同步；error = 无缓存且拉取失败
  const status = ref(hasCache() ? 'ready' : 'idle')
  // 任意一次网络拉取进行中（含手动刷新），供刷新按钮转圈/禁用
  const refreshing = ref(false)
  const loading = computed(() => status.value === 'loading')
  const loadError = computed(() => status.value === 'error')
  // 诊断用：上次成功同步的本机时间 / 云端 updated_at 水位线
  const lastSyncedAt = computed(() => cache.value.syncedAt)
  const lastPulledAt = computed(() => cache.value.lastPulledAt)

  // 输出形状与打包 JSON 时代一致：{ 'gameBiz::region': { gameBiz, region, updatedAt, options } }
  // 只来自云端缓存：deleted 行是墓碑，直接剔除；空 options 分组不输出
  const distribution = computed(() => {
    const entries = Object.entries(cache.value.rows)
      .filter(([, row]) => !row.deleted && Array.isArray(row.options) && row.options.length > 0)
      .sort(([a], [b]) => sortKey(a).localeCompare(sortKey(b)))

    const result = {}
    for (const [id, row] of entries) {
      result[id] = {
        gameBiz: row.gameBiz,
        region: row.region,
        label: row.label || '',
        updatedAt: row.updatedAt,
        options: row.options
      }
    }
    return result
  })

  const presetImageMap = computed(() => buildRechargePresetImageMap(distribution.value))

  async function doFetch() {
    try {
      // getSupabaseClient 在未配置时会 throw，必须放在 try 内，否则 fire-and-forget 调用会冒泡成 unhandled rejection
      const client = getSupabaseClient()
      if (!client) return false

      const lastPulledAt = String(cache.value.lastPulledAt || '')

      let query = client
        .from('recharge_options')
        .select('id,game_biz,region,label,options,deleted,updated_at')
      if (lastPulledAt) query = query.gt('updated_at', lastPulledAt)

      const { data, error } = await query
      if (error) throw error

      const rows = lastPulledAt ? { ...cache.value.rows } : {}
      // 水位线用服务端返回的最大 updated_at，避免本机时钟偏差导致漏行
      let watermark = lastPulledAt
      for (const raw of data || []) {
        const row = normalizeRow(raw)
        if (!row) continue
        rows[row.id] = row
        watermark = laterIso(watermark, row.updatedAt)
      }

      cache.value = { rows, lastPulledAt: watermark, syncedAt: Date.now() }
      persistCache(cache.value)
      log.debug('catalog:refreshed', {
        incremental: Boolean(lastPulledAt),
        fetched: Array.isArray(data) ? data.length : 0,
        total: Object.keys(rows).length
      })
      return true
    } catch (e) {
      log.debug('catalog:refresh:failed', { message: e?.message || String(e) })
      return false
    }
  }

  /**
   * 后台刷新目录。不阻塞调用方；失败静默保留旧缓存。
   * @param {{ force?: boolean }} [options]
   * @returns {Promise<boolean>} 是否执行了拉取且成功
   */
  async function refresh({ force = false } = {}) {
    const now = Date.now()
    if (!force && cache.value.syncedAt > 0 && now - cache.value.syncedAt < MIN_REFRESH_INTERVAL_MS) {
      return true
    }
    if (inflight) return inflight

    // 只有「完全没有缓存」才展示 loading；有缓存时后台刷新，界面继续用旧数据
    if (!hasCache()) status.value = 'loading'
    refreshing.value = true

    inflight = doFetch()
      .then((ok) => {
        if (ok) status.value = 'ready'
        else status.value = hasCache() ? 'ready' : 'error'
        return ok
      })
      .finally(() => {
        inflight = null
        refreshing.value = false
      })
    return inflight
  }

  /** 首次加载失败后的手动重试 */
  function retry() {
    return refresh({ force: true })
  }

  return {
    distribution,
    presetImageMap,
    loading,
    loadError,
    refreshing,
    lastSyncedAt,
    lastPulledAt,
    refresh,
    retry
  }
})
