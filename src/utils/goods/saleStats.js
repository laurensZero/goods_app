// @ts-check
/**
 * 出谷(卖出)统计工具。
 *
 * 卖出数据存在 goods 的独立列上,含义由当前状态决定:
 * - 整条:sellPrice/sellPlatform/sellFee/sellDate(collectStatus 在售=挂牌信息,已出=成交信息;
 *   price 语义为该条全部数量的总价)
 * - 逐件:unitSaleInfoList[i] = { price, platform, fee, date },含义由 unitCollectStatusList[i] 决定
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

/** 整条 count 件的入手总成本(与 getUnitCost 同口径,逐件回退) */
function getScopeCost(item, count) {
  let total = 0
  for (let i = 0; i < count; i++) total += getUnitCost(item, i)
  return total
}

function makeRecord(item, info, unitIndex, count, type, cost) {
  const price = toNumber(info?.price)
  const hasPrice = price > 0
  const fee = toNumber(info?.fee)
  return {
    type,
    unitIndex,
    count,
    at: String(info?.date || '').trim(),
    platform: String(info?.platform || '').trim(),
    price,
    fee,
    hasPrice,
    cost,
    profit: hasPrice ? price - fee - cost : null
  }
}

/**
 * 提取一条商品的卖出/挂牌记录(以当前状态为准)。
 * @param {object} item
 * @returns {{ sold: object[], listing: object[] }}
 */
export function extractSaleEntries(item) {
  if (!item || item.isWishlist) return { sold: [], listing: [] }
  const qty = getQuantity(item)
  const unitStatuses = Array.isArray(item.unitCollectStatusList) ? item.unitCollectStatusList : []
  const unitInfos = Array.isArray(item.unitSaleInfoList) ? item.unitSaleInfoList : []
  const sold = []
  const listing = []

  if (unitStatuses.length > 0) {
    for (let i = 0; i < qty; i++) {
      // 列表短于 quantity 时保守回退「已拥有」——聚合状态若是「已出」会把未卖的件虚增进账本
      const current = String(unitStatuses[i] || '已拥有').trim()
      if (current !== SOLD_STATUS && current !== LISTING_STATUS) continue
      const info = unitInfos[i] || null
      const record = makeRecord(item, info, i, 1, current === SOLD_STATUS ? 'sold' : 'listing', getUnitCost(item, i))
      ;(current === SOLD_STATUS ? sold : listing).push(record)
    }
  } else {
    const current = String(item.collectStatus || '').trim()
    if (current !== SOLD_STATUS && current !== LISTING_STATUS) return { sold, listing }
    const info = {
      price: item.sellPrice,
      platform: item.sellPlatform,
      fee: item.sellFee,
      date: item.sellDate
    }
    const record = makeRecord(item, info, null, qty, current === SOLD_STATUS ? 'sold' : 'listing', getScopeCost(item, qty))
    ;(current === SOLD_STATUS ? sold : listing).push(record)
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
