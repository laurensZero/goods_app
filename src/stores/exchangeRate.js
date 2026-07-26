import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { DEFAULT_CURRENCY } from '@/constants/currencies'
import { createLogger } from '@/utils/logger'

const STORAGE_KEY = 'goods_exchange_rates'
const CACHE_DURATION = 24 * 60 * 60 * 1000
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

  async function fetchRates() {
    loading.value = true
    error.value = ''
    try {
      const apiBase = import.meta.env.DEV ? '/exchange-rate-api' : 'https://api.frankfurter.app'
      const response = await fetch(`${apiBase}/latest?from=CNY`)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const data = await response.json()
      if (data.rates) {
        const newRates = { CNY: 1 }
        for (const [code, rate] of Object.entries(data.rates)) {
          if (typeof rate === 'number' && rate > 0) {
            newRates[code] = 1 / rate
          }
        }
        rates.value = newRates
        lastUpdated.value = Date.now()
        saveToStorage()
      }
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
    }
  }

  return {
    rates,
    lastUpdated,
    loading,
    error,
    isStale,
    fetchRates,
    convertToCNY,
    getRate,
    hasRate,
    init
  }
})
