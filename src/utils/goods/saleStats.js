// @ts-check
/**
 * 出谷(卖出)统计工具。
 *
 * 卖出数据存放在 statusTimeline 条目的 price/platform/fee 字段上:
 * - '在售' 条目的 price = 挂牌价
 * - '已出' 条目的 price = 成交价,fee = 手续费
 * 逐件卖出时条目带 unitIndex;整条商品卖出时条目不带 unitIndex,
 * 此时 price 视为该批(count 件)的成交总价。
 *
 * 输入兼容原始 store item(actualPrice 字符串)和视图层 item
 * (带 actualPriceCNYNumber 等折算字段,口径与 statistics.js 一致)。
 */

const SOLD_STATUS = '已出'
const LISTING_STATUS = '在售'

function toNumber(value) {
  if (value == null || value === '') return 0
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function getQuantity(item) {
  return Math.max(1, Number(item?.quantityNumber || item?.quantity) || 1)
}

/** 单件实付价(优先汇率折算字段,回退原始字符串,再回退官方价) */
function getItemUnitPriceNumber(item) {
  const actualConverted = toNumber(item?.actualPriceCNYNumber ?? item?.actualPriceNumber)
  if (actualConverted > 0) return actualConverted
  const actualRaw = toNumber(item?.actualPrice)
  if (actualRaw > 0) return actualRaw
  const officialConverted = toNumber(item?.officialPriceCNYNumber ?? item?.officialPriceNumber)
  if (officialConverted > 0) return officialConverted
  return toNumber(item?.price)
}

/**
 * 某一件的入手成本 = 该件实付价(unitActualPriceList 优先) + 邮费均摊
 * @param {object} item
 * @param {number|null} [unitIndex]
 * @returns {number}
 */
export function getUnitCost(item, unitIndex = null) {
  const qty = getQuantity(item)
  const shippingShare = toNumber(item?.shippingFee) / qty
  if (unitIndex != null && Number.isInteger(unitIndex)) {
    const unitPrices = Array.isArray(item?.unitActualPriceList) ? item.unitActualPriceList : []
    const unitPrice = toNumber(unitPrices[unitIndex])
    if (unitPrice > 0) return unitPrice + shippingShare
  }
  return getItemUnitPriceNumber(item) + shippingShare
}

/** 某个记录 scope(单件或整条 count 件)的入手总成本 */
function getScopeCost(item, unitIndex, count) {
  if (unitIndex != null && Number.isInteger(unitIndex)) {
    return getUnitCost(item, unitIndex)
  }
  const qty = getQuantity(item)
  const unitPrices = Array.isArray(item?.unitActualPriceList) ? item.unitActualPriceList : []
  const hasCompleteUnitPrices =
    unitPrices.length >= qty && unitPrices.slice(0, qty).every((p) => toNumber(p) > 0)
  if (hasCompleteUnitPrices) {
    let total = toNumber(item?.shippingFee)
    for (let i = 0; i < count; i++) total += toNumber(unitPrices[i])
    return total
  }
  return getItemUnitPriceNumber(item) * count + toNumber(item?.shippingFee)
}

function findLatestEntry(timeline, status, unitIndex) {
  let best = null
  for (const entry of timeline) {
    if (!entry || typeof entry !== 'object') continue
    if (String(entry.status || '').trim() !== status) continue
    if (unitIndex == null) {
      if (Number.isInteger(entry.unitIndex)) continue
    } else if (entry.unitIndex !== unitIndex) {
      continue
    }
    if (!best || String(entry.at || '') >= String(best.at || '')) best = entry
  }
  return best
}

function makeRecord(item, entry, unitIndex, count, type, cost) {
  const price = toNumber(entry?.price)
  const hasPrice = price > 0
  const fee = toNumber(entry?.fee)
  return {
    type,
    unitIndex,
    count,
    at: String(entry?.at || '').trim(),
    platform: String(entry?.platform || '').trim(),
    note: String(entry?.note || '').trim(),
    price,
    fee,
    hasPrice,
    cost,
    profit: hasPrice ? price - fee - cost : null
  }
}

/**
 * 提取一条商品的卖出/挂牌记录。
 * 当前状态为准(时间线条目只是记录来源):逐件状态列表存在时逐件判断,
 * 否则整条按 collectStatus 判断。撤回状态后残留的时间线条目不会计入。
 * @param {object} item
 * @returns {{ sold: object[], listing: object[] }}
 */
export function extractSaleEntries(item) {
  if (!item || item.isWishlist) return { sold: [], listing: [] }
  const timeline = Array.isArray(item.statusTimeline) ? item.statusTimeline : []
  const qty = getQuantity(item)
  const unitStatuses = Array.isArray(item.unitCollectStatusList) ? item.unitCollectStatusList : []
  const sold = []
  const listing = []

  if (unitStatuses.length > 0) {
    const missingByStatus = new Map([[SOLD_STATUS, []], [LISTING_STATUS, []]])
    for (let i = 0; i < qty; i++) {
      // 列表短于 quantity 时保守回退「已拥有」——聚合状态若是「已出」会把未卖的件虚增进账本
      const current = String(unitStatuses[i] || '已拥有').trim()
      if (current !== SOLD_STATUS && current !== LISTING_STATUS) continue
      const entry = findLatestEntry(timeline, current, i)
      if (entry) {
        const record = makeRecord(item, entry, i, 1, current === SOLD_STATUS ? 'sold' : 'listing', getUnitCost(item, i))
        ;(current === SOLD_STATUS ? sold : listing).push(record)
      } else {
        missingByStatus.get(current).push(i)
      }
    }
    // 没有逐件条目的件(如整条卖出后才启用逐件状态):合并为一条记录,
    // 回退到无 unitIndex 的汇总条目(price 语义为该批总价),成本按实际缺失件求和
    for (const [status, indexes] of missingByStatus) {
      if (indexes.length === 0) continue
      const entry = findLatestEntry(timeline, status, null)
      const cost = indexes.reduce((sum, i) => sum + getUnitCost(item, i), 0)
      const record = makeRecord(item, entry, null, indexes.length, status === SOLD_STATUS ? 'sold' : 'listing', cost)
      ;(status === SOLD_STATUS ? sold : listing).push(record)
    }
  } else {
    const current = String(item.collectStatus || '').trim()
    if (current === SOLD_STATUS) {
      sold.push(makeRecord(item, findLatestEntry(timeline, SOLD_STATUS, null), null, qty, 'sold', getScopeCost(item, null, qty)))
    } else if (current === LISTING_STATUS) {
      listing.push(makeRecord(item, findLatestEntry(timeline, LISTING_STATUS, null), null, qty, 'listing', getScopeCost(item, null, qty)))
    }
  }

  return { sold, listing }
}

/**
 * 全量商品列表 → 出谷账本行。
 * @param {object[]} list
 * @returns {{ soldRows: object[], listingRows: object[] }}
 */
export function buildSaleLedger(list) {
  const soldRows = []
  const listingRows = []
  for (const item of Array.isArray(list) ? list : []) {
    const { sold, listing } = extractSaleEntries(item)
    for (const record of sold) soldRows.push({ item, ...record })
    for (const record of listing) listingRows.push({ item, ...record })
  }
  const byDateDesc = (a, b) => String(b.at || '').localeCompare(String(a.at || ''))
  soldRows.sort(byDateDesc)
  listingRows.sort(byDateDesc)
  return { soldRows, listingRows }
}

/**
 * 出谷汇总:已回血(成交价-手续费)、挂牌中金额、总盈亏、件数。
 * @param {object[]} list
 * @returns {{ recoveredTotal: number, listingTotal: number, profitTotal: number, soldCount: number, listingCount: number, hasAny: boolean }}
 */
export function buildSaleSummary(list) {
  const { soldRows, listingRows } = buildSaleLedger(list)
  let recoveredTotal = 0
  let profitTotal = 0
  let soldCount = 0
  for (const row of soldRows) {
    soldCount += row.count
    if (row.hasPrice) {
      recoveredTotal += row.price - row.fee
      profitTotal += row.profit
    }
  }
  let listingTotal = 0
  let listingCount = 0
  for (const row of listingRows) {
    listingCount += row.count
    if (row.hasPrice) listingTotal += row.price
  }
  return {
    recoveredTotal,
    listingTotal,
    profitTotal,
    soldCount,
    listingCount,
    hasAny: soldRows.length > 0 || listingRows.length > 0
  }
}
