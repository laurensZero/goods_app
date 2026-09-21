// @ts-check

/**
 * 按标价×数量比例把优惠券金额分摊到各件商品。
 * 权重为 0 的商品不参与分摊（不写入手价）。
 */

function toCents(value) {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return 0
  return Math.round(n * 100)
}

function toYuan(cents) {
  return (Math.round(cents) / 100).toFixed(2)
}

/**
 * 把 totalCents 按 weights（非负整数，单位分）比例分摊，保证合计精确等于 totalCents。
 * @param {number[]} weights
 * @param {number} totalCents
 * @returns {number[]}
 */
export function allocateCentsByWeights(weights, totalCents) {
  const totalWeight = weights.reduce((sum, w) => sum + Math.max(0, w), 0)
  if (totalWeight <= 0 || totalCents <= 0) return weights.map(() => 0)

  const exact = weights.map((w) => (totalCents * Math.max(0, w)) / totalWeight)
  const floors = exact.map((e) => Math.floor(e))
  let remainder = totalCents - floors.reduce((sum, f) => sum + f, 0)
  const order = exact
    .map((e, i) => ({ i, frac: e - Math.floor(e) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i)

  const result = [...floors]
  for (let k = 0; k < remainder; k++) {
    const idx = order[k % order.length].i
    result[idx] += 1
  }
  return result
}

/**
 * 整件入手价按份数均摊到 unitActualPriceList，末份吸收分位余数。
 * @param {number} totalCents
 * @param {number} quantity
 * @returns {string[]}
 */
export function splitUnitPrices(totalCents, quantity) {
  const qty = Math.max(1, Math.floor(Number(quantity) || 1))
  if (qty < 2) return []
  const base = Math.floor(totalCents / qty)
  let rest = totalCents - base * qty
  return Array.from({ length: qty }, (_, i) => {
    const extra = rest > 0 ? 1 : 0
    if (rest > 0) rest -= 1
    void i
    return toYuan(base + extra)
  })
}

/**
 * @param {Array<{ id: string, name?: string, price?: string|number, quantity?: number, currency?: string }>} items
 * @param {number|string} couponAmount - 优惠总额（元）
 * @returns {{
 *   ok: boolean,
 *   reason?: string,
 *   couponAmount: number,
 *   totalListed: number,
 *   totalAllocated: number,
 *   rows: Array<{
 *     id: string,
 *     name: string,
 *     price: number,
 *     quantity: number,
 *     listedTotal: number,
 *     discount: number,
 *     actualTotal: number,
 *     actualPrice: string,
 *     unitActualPriceList: string[],
 *     eligible: boolean
 *   }>
 * }}
 */
export function allocateCouponByListedPrice(items, couponAmount) {
  const amountCents = toCents(couponAmount)
  const list = Array.isArray(items) ? items : []

  const rows = list.map((item) => {
    const priceCents = toCents(item?.price)
    const qty = Math.max(1, Math.floor(Number(item?.quantity) || 1))
    const listedCents = priceCents * qty
    return {
      id: String(item?.id || ''),
      name: String(item?.name || ''),
      price: priceCents / 100,
      quantity: qty,
      listedCents,
      listedTotal: listedCents / 100,
      discount: 0,
      actualTotal: listedCents / 100,
      actualPrice: toYuan(listedCents),
      unitActualPriceList: splitUnitPrices(listedCents, qty),
      eligible: priceCents > 0,
      discountCents: 0,
      actualCents: listedCents
    }
  })

  const eligibleIndexes = rows.map((r, i) => (r.eligible ? i : -1)).filter((i) => i >= 0)
  const weights = eligibleIndexes.map((i) => rows[i].listedCents)
  const totalListedCents = weights.reduce((s, w) => s + w, 0)

  if (amountCents <= 0) {
    return {
      ok: false,
      reason: 'invalidAmount',
      couponAmount: 0,
      totalListed: totalListedCents / 100,
      totalAllocated: 0,
      rows: rows.map(publicRow)
    }
  }
  if (eligibleIndexes.length === 0 || totalListedCents <= 0) {
    return {
      ok: false,
      reason: 'noEligiblePrice',
      couponAmount: amountCents / 100,
      totalListed: 0,
      totalAllocated: 0,
      rows: rows.map(publicRow)
    }
  }

  // 优惠不能超过参与分摊的标价合计
  const applyCents = Math.min(amountCents, totalListedCents)
  const discounts = allocateCentsByWeights(weights, applyCents)

  eligibleIndexes.forEach((rowIndex, k) => {
    const row = rows[rowIndex]
    const discountCents = discounts[k]
    const actualCents = row.listedCents - discountCents
    row.discountCents = discountCents
    row.actualCents = actualCents
    row.discount = discountCents / 100
    row.actualTotal = actualCents / 100
    row.actualPrice = toYuan(actualCents)
    row.unitActualPriceList = splitUnitPrices(actualCents, row.quantity)
  })

  const totalAllocated = rows.reduce((s, r) => s + r.discountCents, 0)

  return {
    ok: true,
    couponAmount: amountCents / 100,
    totalListed: totalListedCents / 100,
    totalAllocated: totalAllocated / 100,
    rows: rows.map(publicRow)
  }
}

function publicRow(row) {
  return {
    id: row.id,
    name: row.name,
    price: row.price,
    quantity: row.quantity,
    listedTotal: row.listedTotal,
    discount: row.discount,
    actualTotal: row.actualTotal,
    actualPrice: row.actualPrice,
    unitActualPriceList: row.unitActualPriceList,
    eligible: row.eligible
  }
}
