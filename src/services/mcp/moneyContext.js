// @ts-check
/**
 * MCP 工具的「官方计费口径」注入器。
 *
 * App 的金额口径依赖视图层折算字段（actualPriceCNYNumber / totalValueNumber 等，
 * 见 goodsViewList.computePriceFields）与汇率换算（exchangeRate store）。这里把
 * 两者包装成 tools.js 可用的 enrichItems / convertToCNY，使 MCP 工具的数字与
 * 首页总金额、消费趋势完全一致。
 *
 * 仅页面侧可用（依赖 Pinia）；单测不传时工具回退到原始字段估算。
 */

import { useExchangeRateStore } from '@/stores/exchangeRate'
import { computePriceFields } from '@/stores/goodsViewList'

export function createMoneyEnrichers() {
  const exchangeRate = useExchangeRateStore()
  return {
    /** 给原始条目补齐 CNY 折算字段 */
    enrichItems: (/** @type {any[]} */ items) =>
      items.map((item) => ({ ...item, ...computePriceFields(item, exchangeRate) })),
    /** 任意币种金额 → CNY */
    convertToCNY: (/** @type {number} */ amount, /** @type {string} */ currency) =>
      exchangeRate.convertToCNY(amount, currency)
  }
}
