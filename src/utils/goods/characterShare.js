// @ts-check
import { GOODS_FILTER_SPECIAL_VALUES } from './filters'

function parseQuantityNumber(item) {
  return Math.max(1, Math.floor(Number(item?.quantityNumber ?? item?.quantity) || 1))
}

function parseUnitPriceNumber(value) {
  if (value === '' || value == null) return null
  const numeric = Number(value)
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : null
}

function createUniformValues(total, quantity) {
  return new Array(quantity).fill(total / quantity)
}

/**
 * 按份数展开的逐份角色标签（空串 = 该份未标角色）。
 * @param {object} item
 * @param {number} [quantity]
 * @returns {string[]}
 */
export function getUnitCharacterLabels(item, quantity = parseQuantityNumber(item)) {
  const list = Array.isArray(item?.unitCharacterList) ? item.unitCharacterList : []
  return Array.from({ length: quantity }, (_, index) => String(list[index] || '').trim())
}

/**
 * 逐份金额（CNY），数组长度 = 份数，且恒等于 `totalValueNumber`。
 * @param {object} item 视图层条目（totalValueNumber / unitActualPriceCNYList / shippingFeeCNYNumber）
 * @returns {number[]}
 */
export function resolveUnitValuesCNY(item) {
  const quantity = parseQuantityNumber(item)
  const total = Number(item?.totalValueNumber) || 0
  if (quantity === 1) return [total]

  const shippingCNY = item?.isWishlist ? 0 : Number(item?.shippingFeeCNYNumber) || 0
  const goodsTotal = total - shippingCNY
  const shippingPerUnit = shippingCNY / quantity
  const unitRaw = Array.isArray(item?.unitActualPriceCNYList) ? item.unitActualPriceCNYList : []

  const unitValues = new Array(quantity).fill(null)
  let filledSum = 0
  let holeCount = 0
  for (let i = 0; i < quantity; i++) {
    const price = parseUnitPriceNumber(unitRaw[i])
    if (price === null) {
      holeCount += 1
      continue
    }
    unitValues[i] = price
    filledSum += price
  }

  if (holeCount > 0) {
    const remainder = goodsTotal - filledSum
    if (remainder < -0.005) return createUniformValues(total, quantity)
    const perHole = remainder / holeCount
    for (let i = 0; i < quantity; i++) {
      unitValues[i] = (unitValues[i] ?? perHole) + shippingPerUnit
    }
    return unitValues
  }

  if (Math.abs(filledSum - goodsTotal) > 0.01 * quantity) return createUniformValues(total, quantity)

  for (let i = 0; i < quantity; i++) {
    unitValues[i] = Number(unitValues[i] || 0) + shippingPerUnit
  }
  return unitValues
}

/**
 * 角色筛选下的命中份额。未启用逐份角色 / 未选角色时整件计入。
 * @param {object} item 视图层条目
 * @param {string[]} selectedCharacters 已选筛选角色（可含 noCharacter 特殊值）
 * @returns {{ units: number, value: number }}
 */
export function resolveCharacterFilterShare(item, selectedCharacters) {
  const quantity = parseQuantityNumber(item)
  const total = Number(item?.totalValueNumber) || 0
  const selected = Array.isArray(selectedCharacters)
    ? selectedCharacters.map((value) => String(value || '').trim()).filter(Boolean)
    : []

  if (!selected.length || quantity < 2) return { units: quantity, value: total }

  const labels = getUnitCharacterLabels(item, quantity)
  if (!labels.some(Boolean)) return { units: quantity, value: total }

  const noCharacterToken = GOODS_FILTER_SPECIAL_VALUES.noCharacter
  const matchedIndexes = []
  for (let i = 0; i < quantity; i++) {
    const label = labels[i]
    const hit = label ? selected.includes(label) : selected.includes(noCharacterToken)
    if (hit) matchedIndexes.push(i)
  }

  if (matchedIndexes.length === 0) return { units: 0, value: 0 }
  if (matchedIndexes.length === quantity) return { units: quantity, value: total }

  const unitValues = resolveUnitValuesCNY(item)
  let value = 0
  for (const index of matchedIndexes) {
    value += unitValues[index] || 0
  }
  return { units: matchedIndexes.length, value }
}

/**
 * 列表汇总份额（Home / 心愿单）：角色筛选优先；未勾角色时，若关键词恰好等于
 * 某个角色名，按该角色折算（搜索是 searchText 全字段子串匹配，只有精确等于
 * 角色名才归属份数，避免把备注/名称命中的条目误折算）。其余情况整件计入。
 * @param {object} item 视图层条目
 * @param {{ characters?: string[], keyword?: string }} [filters]
 * @returns {{ units: number, value: number }}
 */
export function resolveGoodsShare(item, filters) {
  const selected = Array.isArray(filters?.characters)
    ? filters.characters.map((value) => String(value || '').trim()).filter(Boolean)
    : []
  if (selected.length) return resolveCharacterFilterShare(item, selected)

  const keyword = String(filters?.keyword || '').trim()
  if (keyword && Array.isArray(item?.characters) && item.characters.includes(keyword)) {
    return resolveCharacterFilterShare(item, [keyword])
  }
  return resolveCharacterFilterShare(item, [])
}
