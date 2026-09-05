import { computed, ref, watch } from 'vue'
import { readPersisted, writePersisted } from '@/utils/platform/storage'
import { MONTHLY_BUDGET_STORAGE_KEY, YEARLY_BUDGET_STORAGE_KEY } from '@/constants/budgetConstants'
import { calcPeriodSpend } from '@/utils/goods/statistics'
import { useGoodsStore } from '@/stores/goods'
import { useSyncStore } from '@/stores/sync'
import { useI18n } from 'vue-i18n'

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
    return calcPeriodSpend(goodsStore.viewList, (d) => d.getFullYear() === cy && d.getMonth() === cm)
  })

  const currentYearSpent = computed(() => {
    const cy = new Date().getFullYear()
    return calcPeriodSpend(goodsStore.viewList, (d) => d.getFullYear() === cy)
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
    useSyncStore().autoPushGoods('budget')
  })

  watch(yearlyBudgetInput, (value) => {
    const normalized = normalizeBudgetInput(value)
    if (normalized !== value) {
      yearlyBudgetInput.value = normalized
      return
    }
    writePersisted(YEARLY_BUDGET_STORAGE_KEY, normalized)
    useSyncStore().autoPushGoods('budget')
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
