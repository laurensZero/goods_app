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

  // 运费与预算口径一致:按份数摊到每份消费上
  const shipping = Number(item.shippingFee) || 0
  const shippingPerUnit = shipping / Math.max(1, qty)

  if (unitDates.length > 0 && unitPrices.length > 0) {
    const len = Math.min(unitDates.length, unitPrices.length)
    const pairs = []
    for (let i = 0; i < len; i++) {
      const d = safeDate(unitDates[i])
      if (!d) continue
      const price = Number(unitPrices[i] || 0)
      pairs.push({ date: d, price: price + shippingPerUnit })
    }
    return pairs
  }

  const d = safeDate(item.acquiredAt)
  if (!d) return []
  // 预算口径一致:实际价为 0 也按 0 计入(免费/白得的不算原价),未填实际价才按原价×数量
  const amount = (item.actualPrice !== '' && item.actualPrice != null)
    ? (Number(item.actualPriceCNYNumber ?? item.actualPrice) || 0)
    : (Number(item.officialPriceCNYNumber ?? item.price) || 0) * qty
  return [{ date: d, price: amount + shipping }]
}

export function getItemSpendEntries(item) {
  if (item?.isWishlist) return []
  if (EXCLUDED_VALUE_STATUSES.has(String(item?.collectStatus || '').trim())) return []
  return getItemDatesAndPrices(item)
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
