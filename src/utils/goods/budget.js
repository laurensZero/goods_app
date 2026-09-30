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

/** 预算用量分档（按 spent/budget 百分比）：safe <80% ≤ warn ≤100% < over ≤150% < critical */
export const BUDGET_LEVEL = Object.freeze({
  NONE: 'none',
  SAFE: 'safe',
  WARN: 'warn',
  OVER: 'over',
  CRITICAL: 'critical'
})

/** 预警阈值：达到该用量比例起进入下一档 */
export const BUDGET_WARN_RATIO = 0.8
export const BUDGET_OVER_RATIO = 1
export const BUDGET_CRITICAL_RATIO = 1.5

/**
 * 按已用百分比分档。未设预算 → none。
 * @param {number} percent 0–∞，spent/budget*100
 * @returns {'none'|'safe'|'warn'|'over'|'critical'}
 */
export function getBudgetLevelFromPercent(percent) {
  if (!Number.isFinite(percent) || percent < 0) return BUDGET_LEVEL.NONE
  if (percent > BUDGET_CRITICAL_RATIO * 100) return BUDGET_LEVEL.CRITICAL
  if (percent > BUDGET_OVER_RATIO * 100) return BUDGET_LEVEL.OVER
  if (percent >= BUDGET_WARN_RATIO * 100) return BUDGET_LEVEL.WARN
  return BUDGET_LEVEL.SAFE
}

/**
 * 按花费与预算金额分档。
 * @param {number} spent
 * @param {number} budget
 * @returns {'none'|'safe'|'warn'|'over'|'critical'}
 */
export function getBudgetLevel(spent, budget) {
  const safeBudget = Number.isFinite(budget) ? Math.max(0, budget) : 0
  if (safeBudget <= 0) return BUDGET_LEVEL.NONE
  const safeSpent = Number.isFinite(spent) ? Math.max(0, spent) : 0
  return getBudgetLevelFromPercent((safeSpent / safeBudget) * 100)
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
