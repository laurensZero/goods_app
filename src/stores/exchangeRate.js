import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { DEFAULT_CURRENCY } from '@/constants/currencies'

const STORAGE_KEY = 'goods_exchange_rates'
const CACHE_DURATION = 24 * 60 * 60 * 1000

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
    if (!rate || rate <= 0) return amount
    return amount * rate
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
