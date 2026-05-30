import { computed, ref, watch } from 'vue'
import { readPersisted, writePersisted } from '@/utils/platform/storage'
import { MONTHLY_BUDGET_STORAGE_KEY, YEARLY_BUDGET_STORAGE_KEY } from '@/constants/budgetConstants'
import { useGoodsStore } from '@/stores/goods'
import { useI18n } from 'vue-i18n'

const EXCLUDED_VALUE_STATUSES = new Set(['已赠出', '已出', '丢失'])

function calcPeriodSpent(goodsList, dateMatcher) {
  return goodsList.reduce((sum, item) => {
    if (item?.isWishlist) return sum
    if (EXCLUDED_VALUE_STATUSES.has(String(item?.collectStatus || '').trim())) return sum

    const qty = Math.max(1, Number(item.quantity) || 1)
    const unitDates = Array.isArray(item.unitAcquiredAtList) ? item.unitAcquiredAtList : []
    const unitPrices = Array.isArray(item.unitActualPriceList) ? item.unitActualPriceList : []
    let units = 0
    let amount = 0

    if (unitDates.length > 0 && unitPrices.length > 0) {
      const len = Math.min(unitDates.length, unitPrices.length)
      for (let i = 0; i < len; i++) {
        const d = unitDates[i] ? new Date(String(unitDates[i]).trim()) : null
        const ts = d && !isNaN(d.getTime()) ? d : null
        if (!ts || !dateMatcher(ts)) continue
        units += 1
        amount += Number(unitPrices[i] || 0)
      }
    } else {
      const d = item?.acquiredAt ? new Date(String(item.acquiredAt).trim()) : null
      if (d && !isNaN(d.getTime()) && dateMatcher(d)) {
        const base = (item.actualPrice !== '' && item.actualPrice != null)
          ? (Number(item.actualPrice) || 0)
          : (Number(item.price) || 0)
        units = qty
        amount = base * qty
      }
    }

    if (units === 0) return sum

    const shipping = Number(item.shippingFee) || 0
    const shippingPerUnit = shipping / Math.max(1, qty)
    return sum + amount + (shippingPerUnit * units)
  }, 0)
}

function buildBudgetProgress(spent, budget) {
  const safeSpent = Number.isFinite(spent) ? Math.max(0, spent) : 0
  const safeBudget = Number.isFinite(budget) ? Math.max(0, budget) : 0

  if (safeBudget <= 0) {
    return {
      hasBudget: false,
      spent: safeSpent,
      budget: safeBudget,
      percent: 0,
      clampedPercent: 0,
      overPercent: 0,
      remaining: 0,
      isOverBudget: false
    }
  }

  const percent = (safeSpent / safeBudget) * 100
  return {
    hasBudget: true,
    spent: safeSpent,
    budget: safeBudget,
    percent,
    clampedPercent: Math.min(100, Math.max(0, percent)),
    overPercent: Math.min(100, Math.max(0, percent - 100)),
    remaining: safeBudget - safeSpent,
    isOverBudget: percent > 100
  }
}

function parseBudgetValue(value) {
  const normalized = Number(String(value || '').trim())
  if (!Number.isFinite(normalized) || normalized <= 0) return 0
  return normalized
}

function normalizeBudgetInput(value) {
  const normalized = parseBudgetValue(value)
  if (normalized <= 0) return ''
  return String(normalized)
}

export function useBudgetCalculation() {
  const { t } = useI18n()
  const goodsStore = useGoodsStore()

  const monthlyBudgetInput = ref('')
  const yearlyBudgetInput = ref('')

  const currentPeriodLabel = computed(() => {
    const now = new Date()
    return t('my.periodLabel', { year: now.getFullYear(), month: String(now.getMonth() + 1).padStart(2, '0') })
  })

  const currentYearLabel = computed(() => t('my.yearLabel', { year: new Date().getFullYear() }))

  const monthlyBudget = computed(() => parseBudgetValue(monthlyBudgetInput.value))
  const yearlyBudget = computed(() => parseBudgetValue(yearlyBudgetInput.value))

  const currentMonthSpent = computed(() => {
    const now = new Date()
    const cy = now.getFullYear()
    const cm = now.getMonth()
    return calcPeriodSpent(goodsStore.list, (d) => d.getFullYear() === cy && d.getMonth() === cm)
  })

  const currentYearSpent = computed(() => {
    const cy = new Date().getFullYear()
    return calcPeriodSpent(goodsStore.list, (d) => d.getFullYear() === cy)
  })

  const monthlyBudgetProgress = computed(() => buildBudgetProgress(currentMonthSpent.value, monthlyBudget.value))
  const yearlyBudgetProgress = computed(() => buildBudgetProgress(currentYearSpent.value, yearlyBudget.value))

  async function loadBudgetSettings() {
    const [savedMonthly, savedYearly] = await Promise.all([
      readPersisted(MONTHLY_BUDGET_STORAGE_KEY, ''),
      readPersisted(YEARLY_BUDGET_STORAGE_KEY, '')
    ])

    monthlyBudgetInput.value = normalizeBudgetInput(savedMonthly)
    yearlyBudgetInput.value = normalizeBudgetInput(savedYearly)
  }

  watch(monthlyBudgetInput, (value) => {
    const normalized = normalizeBudgetInput(value)
    if (normalized !== value) {
      monthlyBudgetInput.value = normalized
      return
    }
    writePersisted(MONTHLY_BUDGET_STORAGE_KEY, normalized)
  })

  watch(yearlyBudgetInput, (value) => {
    const normalized = normalizeBudgetInput(value)
    if (normalized !== value) {
      yearlyBudgetInput.value = normalized
      return
    }
    writePersisted(YEARLY_BUDGET_STORAGE_KEY, normalized)
  })

  return {
    monthlyBudgetInput,
    yearlyBudgetInput,
    currentPeriodLabel,
    currentYearLabel,
    monthlyBudget,
    yearlyBudget,
    monthlyBudgetProgress,
    yearlyBudgetProgress,
    loadBudgetSettings
  }
}
