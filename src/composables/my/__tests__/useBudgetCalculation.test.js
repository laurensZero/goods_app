import { describe, it, expect, vi, beforeEach } from 'vitest'
import { nextTick } from 'vue'

const readPersisted = vi.fn()
const writePersisted = vi.fn()
const autoPushGoods = vi.fn()
const buildSpendingAverages = vi.fn(() => ({ total: 0, monthCount: 0, monthlyAverage: 0, yearlyAverage: 0 }))

vi.mock('@/utils/platform/storage', () => ({
  readPersisted: (...args) => readPersisted(...args),
  writePersisted: (...args) => writePersisted(...args)
}))
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key) => key }) }))
vi.mock('@/stores/goods', () => ({
  useGoodsStore: () => ({ viewList: [] })
}))
vi.mock('@/stores/sync', () => ({
  useSyncStore: () => ({ autoPushGoods })
}))
vi.mock('@/utils/goods/statistics', () => ({
  calcPeriodSpend: () => 0,
  buildSpendingAverages: (...args) => buildSpendingAverages(...args)
}))

import { useBudgetCalculation } from '../useBudgetCalculation'
import { MONTHLY_BUDGET_STORAGE_KEY, YEARLY_BUDGET_STORAGE_KEY } from '@/constants/budgetConstants'

describe('useBudgetCalculation 预算回填', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('loadBudgetSettings 回填只更新输入，不写存储、不触发推送', async () => {
    readPersisted.mockImplementation(async (key) => (
      key === MONTHLY_BUDGET_STORAGE_KEY ? '500' : key === YEARLY_BUDGET_STORAGE_KEY ? '6000' : ''
    ))
    const { loadBudgetSettings, monthlyBudgetInput, yearlyBudgetInput } = useBudgetCalculation()

    await loadBudgetSettings()
    await nextTick()

    expect(monthlyBudgetInput.value).toBe('500')
    expect(yearlyBudgetInput.value).toBe('6000')
    expect(writePersisted).not.toHaveBeenCalled()
    expect(autoPushGoods).not.toHaveBeenCalled()
  })

  it('用户修改预算仍会落盘并触发预算域自动推送', async () => {
    readPersisted.mockResolvedValue('')
    const { monthlyBudgetInput } = useBudgetCalculation()

    monthlyBudgetInput.value = '800'
    await nextTick()

    expect(writePersisted).toHaveBeenCalledWith(MONTHLY_BUDGET_STORAGE_KEY, '800')
    expect(autoPushGoods).toHaveBeenCalledWith('budget')
  })

  it('按月均/年均消费填入建议预算并触发落盘', async () => {
    buildSpendingAverages.mockReturnValue({
      total: 1200,
      monthCount: 4,
      monthlyAverage: 300,
      yearlyAverage: 3600
    })
    readPersisted.mockResolvedValue('')
    const { applySuggestedBudget, monthlyBudgetInput, yearlyBudgetInput } = useBudgetCalculation()

    applySuggestedBudget()
    await nextTick()

    expect(monthlyBudgetInput.value).toBe('300')
    expect(yearlyBudgetInput.value).toBe('3600')
    expect(writePersisted).toHaveBeenCalledWith(MONTHLY_BUDGET_STORAGE_KEY, '300')
    expect(writePersisted).toHaveBeenCalledWith(YEARLY_BUDGET_STORAGE_KEY, '3600')
  })
})
