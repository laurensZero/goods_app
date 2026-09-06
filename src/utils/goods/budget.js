// @ts-check
/**
 * 吃谷预算（月度/年度）的持久化读写。
 * 与 MyView 的 useBudgetCalculation 用同一组存储键与口径（>0 才有效，0/空 = 未设置），
 * MCP budget_overview / budget_set 通过这里读写，保证 AI 改完设置页立即生效。
 */

import { readPersisted, writePersisted } from '@/utils/platform/storage'
import { MONTHLY_BUDGET_STORAGE_KEY, YEARLY_BUDGET_STORAGE_KEY } from '@/constants/budgetConstants'

/** @param {unknown} value 非正数/非法输入都归一为 0（未设置） */
export function parseBudgetAmount(value) {
  const normalized = Number(String(value ?? '').trim())
  if (!Number.isFinite(normalized) || normalized <= 0) return 0
  return normalized
}

/**
 * @returns {Promise<{ monthly: number, yearly: number }>}
 */
export async function readBudgetSettings() {
  const [monthly, yearly] = await Promise.all([
    readPersisted(MONTHLY_BUDGET_STORAGE_KEY, ''),
    readPersisted(YEARLY_BUDGET_STORAGE_KEY, '')
  ])
  return {
    monthly: parseBudgetAmount(monthly),
    yearly: parseBudgetAmount(yearly)
  }
}

/**
 * 部分更新预算（只写传入的字段）。autoPush 由调用方负责（与设置页一致）。
 * @param {{ monthly?: number, yearly?: number }} patch
 * @returns {Promise<{ monthly: number, yearly: number }>} 更新后的完整预算
 */
export async function writeBudgetSettings(patch) {
  const current = await readBudgetSettings()
  /** @type {{ monthly?: string, yearly?: string }} */
  const writes = {}
  if (patch?.monthly !== undefined) {
    const value = parseBudgetAmount(patch.monthly)
    current.monthly = value
    writes[MONTHLY_BUDGET_STORAGE_KEY] = value > 0 ? String(value) : ''
  }
  if (patch?.yearly !== undefined) {
    const value = parseBudgetAmount(patch.yearly)
    current.yearly = value
    writes[YEARLY_BUDGET_STORAGE_KEY] = value > 0 ? String(value) : ''
  }
  await Promise.all(Object.entries(writes).map(([key, value]) => writePersisted(key, value)))
  return current
}
