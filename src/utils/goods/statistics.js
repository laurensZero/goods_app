const EXCLUDED_VALUE_STATUSES = new Set(['已赠出', '已出', '丢失'])

function safeDate(str) {
  if (!str) return null
  const d = new Date(String(str).trim())
  return isNaN(d.getTime()) ? null : d
}

function toDateKey(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function toYearMonth(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

function parseYearMonth(dateStr) {
  const s = String(dateStr || '').trim()
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s.slice(0, 7) : ''
}

/**
 * 规范化运费事件列表。无效日期 / 空运费丢弃。
 * @param {unknown} list
 * @returns {{ date: string, fee: number }[]}
 */
export function parseShippingEvents(list) {
  if (!Array.isArray(list)) return []
  const result = []
  for (const raw of list) {
    if (!raw || typeof raw !== 'object') continue
    const date = String(raw.date || '').trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue
    const feeRaw = String(raw.fee ?? '').trim()
    if (feeRaw === '') continue
    const fee = Number(feeRaw)
    // 0 元运费事件无意义（线下件占位），直接丢弃
    if (!Number.isFinite(fee) || fee <= 0) continue
    result.push({ date, fee })
  }
  return result
}

/**
 * 商品总运费：shippingEvents 合计优先；否则 shippingFee。
 * @param {object} item
 * @returns {number}
 */
export function getTotalShippingFee(item) {
  const events = parseShippingEvents(item?.shippingEvents)
  if (events.length > 0) {
    return events.reduce((sum, e) => sum + e.fee, 0)
  }
  return Number(item?.shippingFee) || 0
}

/**
 * 无 shippingEvents 时，单笔运费归到哪个月（YYYY-MM）。
 * 优先最晚入手日；无法判定返回 ''。
 * @param {object} item
 * @param {Date[]} [unitDates]
 * @returns {string}
 */
function resolveLegacyShippingYearMonth(item, unitDates) {
  let latest = ''
  const consider = (value) => {
    const s = String(value || '').trim()
    if (/^\d{4}-\d{2}-\d{2}$/.test(s) && s > latest) latest = s
  }
  consider(item?.acquiredAt)
  if (Array.isArray(item?.unitAcquiredAtList)) {
    for (const value of item.unitAcquiredAtList) consider(value)
  }
  if (Array.isArray(unitDates)) {
    for (const date of unitDates) {
      if (date instanceof Date && !isNaN(date.getTime())) consider(toDateKey(date))
    }
  }
  return latest ? latest.slice(0, 7) : ''
}

function getItemEffectivePrice(item) {
  const actual = Number(item.actualPriceCNYNumber || item.actualPriceNumber || 0)
  if (actual > 0) return actual
  return Number(item.officialPriceCNYNumber || item.officialPriceNumber || 0)
}

/**
 * 把运费挂到对应月份的条目上。
 * - shippingEvents 多笔：每笔按各自 date 月份累加
 * - 无 events：整笔 shippingFee 挂最晚入手月
 * @param {{ date: Date, price: number }[]} goodsEntries
 * @param {object} item
 */
function attachShippingToEntries(goodsEntries, item) {
  if (goodsEntries.length === 0) return goodsEntries

  const events = parseShippingEvents(item?.shippingEvents)
  /** @type {Map<number, number>} attachIndex → fee sum */
  const adds = new Map()
  const addAtMonth = (yearMonth, fee) => {
    if (!(fee > 0) || !yearMonth) return
    let index = goodsEntries.findIndex((entry) => toYearMonth(entry.date) === yearMonth)
    if (index < 0) {
      let latestYM = ''
      index = 0
      goodsEntries.forEach((entry, i) => {
        const ym = toYearMonth(entry.date)
        if (ym >= latestYM) {
          latestYM = ym
          index = i
        }
      })
    }
    adds.set(index, (adds.get(index) || 0) + fee)
  }

  if (events.length > 0) {
    for (const event of events) {
      addAtMonth(parseYearMonth(event.date), event.fee)
    }
  } else {
    const shipping = Number(item?.shippingFee) || 0
    if (shipping > 0) {
      addAtMonth(resolveLegacyShippingYearMonth(item, goodsEntries.map((e) => e.date)), shipping)
    }
  }

  if (adds.size === 0) return goodsEntries
  return goodsEntries.map((entry, index) => ({
    date: entry.date,
    price: entry.price + (adds.get(index) || 0)
  }))
}

function getItemDatesAndPrices(item) {
  const qty = Math.max(1, Number(item.quantityNumber || item.quantity) || 1)
  const unitDates = Array.isArray(item.unitAcquiredAtList) ? item.unitAcquiredAtList : []
  // 优先视图层折算后的逐件 CNY 价,回退原始逐件价(与聚合字段口径一致)
  const unitPrices = Array.isArray(item.unitActualPriceCNYList)
    ? item.unitActualPriceCNYList
    : (Array.isArray(item.unitActualPriceList) ? item.unitActualPriceList : [])
  const rawUnitPrices = Array.isArray(item.unitActualPriceList) ? item.unitActualPriceList : []

  // 预算口径一致:实际价为 0 也按 0 计入(免费/白得的不算原价),未填实际价才按原价×数量
  const totalAmount = (item.actualPrice !== '' && item.actualPrice != null)
    ? (Number(item.actualPriceCNYNumber ?? item.actualPrice) || 0)
    : (Number(item.officialPriceCNYNumber ?? item.price) || 0) * qty

  // 逐份日期(跨月补货)各自计入对应日期。运费不均摊：
  // shippingEvents 每笔挂各自日期月；无 events 时整笔挂最晚入手月。
  let goodsEntries = []
  if (unitDates.length > 0) {
    const unitCount = Math.max(qty, unitDates.length)
    const resolved = []
    let filledSum = 0
    let holeCount = 0
    for (let i = 0; i < unitCount; i++) {
      const d = safeDate(unitDates[i] || item.acquiredAt)
      if (!d) {
        resolved.push(null)
        continue
      }
      const rawPrice = rawUnitPrices[i]
      const hasUnitPrice = rawPrice !== '' && rawPrice != null && Number.isFinite(Number(rawPrice))
      if (hasUnitPrice) {
        const price = Number.isFinite(Number(unitPrices[i])) ? Number(unitPrices[i]) : (Number(rawPrice) || 0)
        filledSum += price
        resolved.push({ date: d, price })
      } else {
        holeCount += 1
        resolved.push({ date: d, price: null })
      }
    }
    const perUnitShare = holeCount > 0 ? Math.max(0, (totalAmount - filledSum) / holeCount) : 0
    goodsEntries = resolved
      .filter(Boolean)
      .map(({ date, price }) => ({ date, price: price ?? perUnitShare }))
  } else {
    const d = safeDate(item.acquiredAt)
    goodsEntries = d ? [{ date: d, price: totalAmount }] : []
  }

  return attachShippingToEntries(goodsEntries, item)
}

/**
 * 官方花费明细（预算 / 时间线月合计 / 统计 / MCP 唯一口径）。
 * 排除愿望单与 已出/已赠出/丢失。
 * 运费：shippingEvents 每笔挂各自日期月；否则整笔挂最晚入手月。
 * @param {object} item
 * @returns {{ date: Date, price: number }[]}
 */
export function getItemSpendEntries(item) {
  if (item?.isWishlist) return []
  if (EXCLUDED_VALUE_STATUSES.has(String(item?.collectStatus || '').trim())) return []
  return getItemDatesAndPrices(item)
}

/**
 * 入手成本明细（出谷盈亏用）。不因「已出」排除。
 * @param {object} item
 * @returns {{ date: Date, price: number }[]}
 */
export function getItemCostEntries(item) {
  if (item?.isWishlist) return []
  return getItemDatesAndPrices(item)
}

/**
 * 按 YYYY-MM 汇总单件商品花费（时间线月合计用）。
 * @param {object} item
 * @param {{ excludeExited?: boolean }} [options]
 * @returns {Map<string, number>}
 */
export function getItemSpendByYearMonth(item, { excludeExited = true } = {}) {
  const entries = excludeExited ? getItemSpendEntries(item) : getItemCostEntries(item)
  const map = new Map()
  for (const { date, price } of entries) {
    const key = toYearMonth(date)
    map.set(key, (map.get(key) || 0) + price)
  }
  return map
}

export function calcPeriodSpend(goodsList, dateMatcher) {
  if (!Array.isArray(goodsList)) return 0
  let total = 0
  for (const item of goodsList) {
    for (const { date, price } of getItemSpendEntries(item)) {
      if (dateMatcher(date)) total += price
    }
  }
  return total
}

// ─── Heatmap ───

export function buildHeatmapData(list) {
  const map = new Map()

  for (const item of list) {
    if (item?.isWishlist) continue
    if (EXCLUDED_VALUE_STATUSES.has(String(item?.collectStatus || '').trim())) continue

    const pairs = getItemDatesAndPrices(item)
    for (const { date } of pairs) {
      const key = toDateKey(date)
      map.set(key, (map.get(key) || 0) + 1)
    }
  }

  return [...map.entries()].map(([date, count]) => [date, count])
}

export function getHeatmapYears(list) {
  const years = new Set()
  for (const item of list) {
    if (item?.isWishlist) continue
    const d = safeDate(item.acquiredAt)
    if (d) years.add(d.getFullYear())
    const unitDates = Array.isArray(item.unitAcquiredAtList) ? item.unitAcquiredAtList : []
    for (const ud of unitDates) {
      const dd = safeDate(ud)
      if (dd) years.add(dd.getFullYear())
    }
  }
  return [...years].sort((a, b) => b - a)
}

// ─── Spending Trend ───

export function buildSpendingTrendData(list, mode = 'year', options = {}) {
  const { startDate, endDate } = options
  const buckets = new Map()

  function inWindow(date) {
    if (startDate && date < startDate) return false
    if (endDate && date > endDate) return false
    return true
  }

  if (mode === 'year') {
    const years = new Set()
    for (const item of list) {
      if (item?.isWishlist) continue
      if (EXCLUDED_VALUE_STATUSES.has(String(item?.collectStatus || '').trim())) continue
      const pairs = getItemDatesAndPrices(item)
      for (const { date } of pairs) {
        years.add(date.getFullYear())
      }
    }
    for (const y of [...years].sort()) {
      buckets.set(String(y), { label: String(y), value: 0 })
    }
  } else if (mode === 'month') {
    if (startDate && endDate) {
      const sy = startDate.getFullYear()
      const sm = startDate.getMonth()
      const ey = endDate.getFullYear()
      const em = endDate.getMonth()
      let y = sy, m = sm
      while (y < ey || (y === ey && m <= em)) {
        const key = `${y}-${String(m + 1).padStart(2, '0')}`
        buckets.set(key, { label: key, value: 0 })
        m++
        if (m > 11) { m = 0; y++ }
      }
    }
  } else if (mode === 'week') {
    if (startDate && endDate) {
      const d = new Date(startDate)
      while (d <= endDate) {
        const key = toDateKey(d)
        const mm = d.getMonth() + 1
        const dd = d.getDate()
        buckets.set(key, { label: `${mm}/${dd}`, value: 0 })
        d.setDate(d.getDate() + 1)
      }
    }
  }

  for (const item of list) {
    if (item?.isWishlist) continue
    if (EXCLUDED_VALUE_STATUSES.has(String(item?.collectStatus || '').trim())) continue

    const pairs = getItemDatesAndPrices(item)
    for (const { date, price } of pairs) {
      let bucketKey = null

      if (mode === 'year') {
        bucketKey = String(date.getFullYear())
      } else if (mode === 'month') {
        bucketKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
      } else if (mode === 'week') {
        bucketKey = toDateKey(date)
      }

      if (bucketKey && buckets.has(bucketKey) && inWindow(date)) {
        buckets.get(bucketKey).value += price
      }
    }
  }

  return [...buckets.values()]
}

// ─── Goods Extremes ───

export function buildGoodsExtremes(list, t) {
  const items = list.filter((item) => {
    if (item?.isWishlist) return false
    if (EXCLUDED_VALUE_STATUSES.has(String(item?.collectStatus || '').trim())) return false
    return true
  })

  if (items.length === 0) return []

  let mostExpensive = null
  let earliest = null
  let latest = null
  let mostQuantity = null
  let maxQuantity = 0

  for (const item of items) {
    const price = getItemEffectivePrice(item)
    const d = safeDate(item.acquiredAt)
    const qty = Math.max(1, Number(item.quantityNumber || item.quantity) || 1)

    if (price > 0 && (!mostExpensive || price > getItemEffectivePrice(mostExpensive))) {
      mostExpensive = item
    }

    if (d) {
      if (!earliest || d < safeDate(earliest.acquiredAt)) {
        earliest = item
      }
      if (!latest || d > safeDate(latest.acquiredAt)) {
        latest = item
      }
    }

    if (qty > maxQuantity) {
      maxQuantity = qty
      mostQuantity = item
    }
  }

  const results = []

  if (mostExpensive) {
    results.push({
      key: 'most-expensive',
      icon: '💰',
      label: t('stats.extremes.mostExpensive'),
      name: mostExpensive.name,
      value: `¥${getItemEffectivePrice(mostExpensive).toFixed(2)}`,
      coverImage: mostExpensive.coverImage || ''
    })
  }

  if (earliest) {
    const d = safeDate(earliest.acquiredAt)
    results.push({
      key: 'earliest',
      icon: '🌅',
      label: t('stats.extremes.earliest'),
      name: earliest.name,
      value: d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : '',
      coverImage: earliest.coverImage || ''
    })
  }

  if (latest) {
    const d = safeDate(latest.acquiredAt)
    results.push({
      key: 'latest',
      icon: '🌙',
      label: t('stats.extremes.latest'),
      name: latest.name,
      value: d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : '',
      coverImage: latest.coverImage || ''
    })
  }

  if (mostQuantity && maxQuantity > 0) {
    results.push({
      key: 'most-quantity',
      icon: '📦',
      label: t('stats.extremes.mostQuantity'),
      name: mostQuantity.name,
      value: t('stats.extremes.items', { count: maxQuantity }, maxQuantity),
      coverImage: mostQuantity.coverImage || ''
    })
  }

  return results
}

// ─── Overview Stats ───

export function buildOverviewStats(list) {
  let totalQuantity = 0
  let totalSpent = 0
  let itemCount = 0
  let totalHoldingDays = 0
  let holdingCount = 0

  for (const item of list) {
    if (item?.isWishlist) continue
    if (EXCLUDED_VALUE_STATUSES.has(String(item?.collectStatus || '').trim())) continue

    const qty = Math.max(1, Number(item.quantityNumber || item.quantity) || 1)
    totalQuantity += qty
    itemCount += 1

    const pairs = getItemDatesAndPrices(item)
    for (const { price } of pairs) {
      totalSpent += price
    }

    const d = safeDate(item.acquiredAt)
    if (d) {
      const now = new Date()
      const days = Math.floor((now - d) / 86400000)
      totalHoldingDays += days
      holdingCount += 1
    }
  }

  const avgPrice = itemCount > 0 ? totalSpent / itemCount : 0
  const avgHoldingDays = holdingCount > 0 ? Math.round(totalHoldingDays / holdingCount) : 0

  return [
    { key: 'total-quantity', label: '总件数', value: String(totalQuantity) },
    { key: 'total-spent', label: '总花费', value: `¥${totalSpent.toFixed(0)}` },
    { key: 'avg-price', label: '平均价', value: `¥${avgPrice.toFixed(0)}` },
    { key: 'avg-holding', label: '平均持有天数', value: `${avgHoldingDays} 天` }
  ]
}
