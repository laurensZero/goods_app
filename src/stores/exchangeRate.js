import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { DEFAULT_CURRENCY } from '@/constants/currencies'
import { createLogger } from '@/utils/logger'
import { getSupabaseClient } from '@/utils/sync/supabaseClient'

const STORAGE_KEY = 'goods_exchange_rates'
const CACHE_DURATION = 24 * 60 * 60 * 1000
// 权威源快照超过该年龄视为不可用（Edge Function 偶发未跑时自举直连 Frankfurter）
const SUPABASE_MAX_AGE = 48 * 60 * 60 * 1000
const log = createLogger('exchangeRate')

// 内置兜底汇率(1 外币 ≈ ? CNY,2026 年近似值):离线首启/汇率接口失败时避免
// 外币金额按 1:1 计入统计(如 5000 JPY 被记成 ¥5000)
const FALLBACK_RATES = {
  CNY: 1,
  USD: 7.1,
  JPY: 0.048,
  EUR: 7.8,
  GBP: 9.0,
  HKD: 0.91,
  TWD: 0.22,
  KRW: 0.0052
}

// 每个币种只警告一次,convertToCNY 在列表渲染中会被高频调用
const warnedMissingRates = new Set()

export const useExchangeRateStore = defineStore('exchangeRate', () => {
  const rates = ref({})
  const lastUpdated = ref(0)
  const loading = ref(false)
  const error = ref('')
  // 当前汇率来源：supabase（权威源）| direct（直连第三方自举）| cache（本地缓存）
  const source = ref('')

  const isStale = computed(() => {
    if (!lastUpdated.value) return true
    return Date.now() - lastUpdated.value > CACHE_DURATION
  })

  function saveToStorage() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        rates: rates.value,
        lastUpdated: lastUpdated.value
      }))
    } catch { /* quota exceeded or private browsing */ }
  }

  function loadFromStorage() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const data = JSON.parse(stored)
        if (data.rates && typeof data.rates === 'object') {
          rates.value = data.rates
        }
        lastUpdated.value = Number(data.lastUpdated) || 0
      }
    } catch { /* malformed data */ }
  }

  // 从 Supabase 权威源读取共享快照；返回 null 表示不可用/不适用（自建实例无此表等）
  async function fetchSupabaseSnapshot() {
    let client
    try {
      client = getSupabaseClient()
    } catch {
      return null
    }
    try {
      const { data, error: queryError } = await client
        .from('exchange_rates')
        .select('rates, updated_at')
        .eq('id', 1)
        .maybeSingle()
      if (queryError) throw queryError
      if (!data?.rates || typeof data.rates !== 'object') return null
      const updatedAt = new Date(String(data.updated_at || '')).getTime()
      if (!Number.isFinite(updatedAt) || updatedAt <= 0) return null
      const newRates = { CNY: 1 }
      for (const [code, rate] of Object.entries(data.rates)) {
        if (code === 'CNY') continue
        const n = Number(rate)
        if (Number.isFinite(n) && n > 0) newRates[code] = n
      }
      if (Object.keys(newRates).length <= 1) return null
      return { rates: newRates, updatedAt }
    } catch (e) {
      log.warn('supabase snapshot unavailable', e.message)
      return null
    }
  }

  // 直连 Frankfurter 自举（首次部署 Edge Function 未跑/自建实例无权威表时兜底）
  async function fetchDirectRates() {
    const apiBase = import.meta.env.DEV ? '/exchange-rate-api' : 'https://api.frankfurter.app'
    const response = await fetch(`${apiBase}/latest?from=CNY`)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const data = await response.json()
    if (!data.rates) return null
    const newRates = { CNY: 1 }
    for (const [code, rate] of Object.entries(data.rates)) {
      if (typeof rate === 'number' && rate > 0) {
        newRates[code] = 1 / rate
      }
    }
    if (Object.keys(newRates).length <= 1) return null
    return { rates: newRates, updatedAt: Date.now() }
  }

  function applySnapshot(snapshot, sourceName) {
    if (!snapshot) return false
    rates.value = snapshot.rates
    lastUpdated.value = snapshot.updatedAt
    source.value = sourceName
    saveToStorage()
    return true
  }

  async function fetchRates() {
    loading.value = true
    error.value = ''
    try {
      // 1. 权威源：Supabase 共享快照（全设备读同一份，消除跨设备偏差）
      const snapshot = await fetchSupabaseSnapshot()
      if (snapshot) {
        if (Date.now() - snapshot.updatedAt < SUPABASE_MAX_AGE) {
          applySnapshot(snapshot, 'supabase')
          return
        }
        log.warn('supabase snapshot too old, falling back to direct fetch')
      }
      // 2. 自举/兼容自建实例：直连 Frankfurter
      const direct = await fetchDirectRates()
      if (direct) {
        applySnapshot(direct, 'direct')
        return
      }
      // 3. 全失败 → 回退本地缓存/兜底汇率
      loadFromStorage()
    } catch (e) {
      error.value = e.message || '汇率获取失败'
      loadFromStorage()
    } finally {
      loading.value = false
    }
  }

  function convertToCNY(amount, currency = DEFAULT_CURRENCY) {
    if (!currency || currency === 'CNY') return amount
    const rate = rates.value[currency]
    if (rate > 0) return amount * rate
    // 实时汇率缺失时用内置兜底值,仍无匹配才回退原值
    const fallback = FALLBACK_RATES[currency]
    if (fallback > 0) return amount * fallback
    if (!warnedMissingRates.has(currency)) {
      warnedMissingRates.add(currency)
      log.warn('convert:missing-rate', { currency })
    }
    return amount
  }

  function getRate(currency) {
    if (!currency || currency === 'CNY') return 1
    return rates.value[currency] || 0
  }

  function hasRate(currency) {
    if (!currency || currency === 'CNY') return true
    return rates.value[currency] > 0
  }

  async function init() {
    loadFromStorage()
    if (isStale.value || Object.keys(rates.value).length <= 1) {
      await fetchRates()
      return
    }
    // 缓存未过期也轻量核对一次权威源：服务端快照更新则采纳，
    // 让各设备尽快收敛到同一份汇率，缩窄 24h 缓存窗口内的跨设备偏差。
    // 失败（离线/自建实例无表）时静默保留本地缓存。
    const snapshot = await fetchSupabaseSnapshot()
    if (snapshot && snapshot.updatedAt > lastUpdated.value) {
      applySnapshot(snapshot, 'supabase')
    }
  }

  return {
    rates,
    lastUpdated,
    loading,
    error,
    source,
    isStale,
    fetchRates,
    convertToCNY,
    getRate,
    hasRate,
    init
  }
})
