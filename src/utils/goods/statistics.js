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

function getItemEffectivePrice(item) {
  const actual = Number(item.actualPriceCNYNumber || item.actualPriceNumber || 0)
  if (actual > 0) return actual
  return Number(item.officialPriceCNYNumber || item.officialPriceNumber || 0)
}

function getItemDatesAndPrices(item) {
  const qty = Math.max(1, Number(item.quantityNumber || item.quantity) || 1)
  const unitDates = Array.isArray(item.unitAcquiredAtList) ? item.unitAcquiredAtList : []
  // 优先视图层折算后的逐件 CNY 价,回退原始逐件价(与聚合字段口径一致)
  const unitPrices = Array.isArray(item.unitActualPriceCNYList)
    ? item.unitActualPriceCNYList
    : (Array.isArray(item.unitActualPriceList) ? item.unitActualPriceList : [])
  const rawUnitPrices = Array.isArray(item.unitActualPriceList) ? item.unitActualPriceList : []

  // 运费与预算口径一致:按份数摊到每份消费上
  const shipping = Number(item.shippingFee) || 0
  const shippingPerUnit = shipping / Math.max(1, qty)
  // 预算口径一致:实际价为 0 也按 0 计入(免费/白得的不算原价),未填实际价才按原价×数量
  const totalAmount = (item.actualPrice !== '' && item.actualPrice != null)
    ? (Number(item.actualPriceCNYNumber ?? item.actualPrice) || 0)
    : (Number(item.officialPriceCNYNumber ?? item.price) || 0) * qty

  // 逐份日期(跨月补货)各自计入对应日期,而不是整体挂在商品级购入日期上。
  // 已填的逐件价按实计入;空缺份数分摊"总价 − 已填部分"的余额,保证商品总花费
  // 不变——空缺不等于免费,显式填 0 的份数仍按 0 计。
  if (unitDates.length > 0) {
    const unitCount = Math.max(qty, unitDates.length)
    const resolved = []
    let filledSum = 0
    let holeCount = 0
    for (let i = 0; i < unitCount; i++) {
      // 尾部/中间缺省的逐份日期回落到商品级购入日期
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
    return resolved
      .filter(Boolean)
      .map(({ date, price }) => ({ date, price: (price ?? perUnitShare) + shippingPerUnit }))
  }

  const d = safeDate(item.acquiredAt)
  if (!d) return []
  return [{ date: d, price: totalAmount + shipping }]
}

export function getItemSpendEntries(item) {
  if (item?.isWishlist) return []
  if (EXCLUDED_VALUE_STATUSES.has(String(item?.collectStatus || '').trim())) return []
  return getItemDatesAndPrices(item)
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
