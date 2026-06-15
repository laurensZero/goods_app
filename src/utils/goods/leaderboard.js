export const LEADERBOARD_DIMENSION_OPTIONS = [
  { label: '角色', value: 'character' },
  { label: 'IP', value: 'ip' },
  { label: '分类', value: 'category' },
  { label: '存放位置', value: 'storageLocation' },
  { label: '月度购入', value: 'month' }
]

export const LEADERBOARD_METRIC_OPTIONS = [
  { label: '总件数', value: 'quantity' },
  { label: '原价总价', value: 'officialTotalValue' },
  { label: '入手价总价', value: 'actualTotalValue' },
  { label: '原价均价', value: 'officialAvgPrice' },
  { label: '入手价均价', value: 'actualAvgPrice' }
]

export function createLeaderboardDimensionOptions(t) {
  return [
    { label: t('leaderboard.dimension.character'), value: 'character' },
    { label: t('leaderboard.dimension.ip'), value: 'ip' },
    { label: t('leaderboard.dimension.category'), value: 'category' },
    { label: t('leaderboard.dimension.storageLocation'), value: 'storageLocation' },
    { label: t('leaderboard.dimension.month'), value: 'month' }
  ]
}

export function createLeaderboardMetricOptions(t) {
  return [
    { label: t('leaderboard.metric.quantity'), value: 'quantity' },
    { label: t('leaderboard.metric.officialTotalValue'), value: 'officialTotalValue' },
    { label: t('leaderboard.metric.actualTotalValue'), value: 'actualTotalValue' },
    { label: t('leaderboard.metric.officialAvgPrice'), value: 'officialAvgPrice' },
    { label: t('leaderboard.metric.actualAvgPrice'), value: 'actualAvgPrice' }
  ]
}

const DIMENSION_CONFIG = {
  character: {
    getValues(item) {
      return Array.isArray(item.characters) ? item.characters : []
    }
  },
  ip: {
    getValues(item) {
      return item.ip ? [item.ip] : []
    }
  },
  category: {
    getValues(item) {
      return item.category ? [item.category] : []
    }
  },
  storageLocation: {
    getValues(item) {
      return item.storageLocation ? [item.storageLocation] : []
    }
  },
  month: {
    getValues(item) {
      return item.timelineYearMonth ? [item.timelineYearMonth] : []
    }
  }
}

function getDimensionConfig(dimension) {
  return DIMENSION_CONFIG[dimension] || DIMENSION_CONFIG.character
}

function getEntrySortLabel(entry, dimension) {
  if (dimension === 'month') {
    return entry.label
  }

  return entry.label.localeCompare ? entry.label.localeCompare(entry.label, 'zh-Hans-CN') : 0
}

export function getLeaderboardDimensionMeta(dimension, t) {
  const config = getDimensionConfig(dimension)
  if (t) {
    return {
      ...config,
      emptyLabel: t(`leaderboard.empty.${dimension}`),
      title: t(`leaderboard.title.${dimension}`),
      heroLabel: t(`leaderboard.title.${dimension}`)
    }
  }
  return {
    ...config,
    emptyLabel: '',
    title: '',
    heroLabel: ''
  }
}

export function buildLeaderboardEntries(list, dimension, presetCharacterIpMap = new Map(), t) {
  const config = getDimensionConfig(dimension)
  const emptyLabel = t ? t(`leaderboard.empty.${dimension}`) : ''
  const map = new Map()
  let emptyCount = 0

  for (const item of list) {
    const rawValues = config.getValues(item) || []
    const values = rawValues
      .map((value) => String(value || '').trim())
      .filter(Boolean)
    const quantityNumber = Number(item.quantityNumber || 0)
    const totalValueNumber = Number(item.totalValueNumber || 0)
    const unitCharacters = Array.isArray(item.unitCharacterList)
      ? item.unitCharacterList
          .slice(0, quantityNumber)
          .map((value) => String(value || '').trim())
      : []
    const allowedCharacterSet = values.length > 0 ? new Set(values) : null
    const hasExactUnitCharacters = dimension === 'character'
      && quantityNumber > 0
      && unitCharacters.length === quantityNumber
      && unitCharacters.every((label) => label && (!allowedCharacterSet || allowedCharacterSet.has(label)))

    if (hasExactUnitCharacters) {
      const unitValueShare = quantityNumber > 0 ? totalValueNumber / quantityNumber : 0
      const officialPrice = Number(item.officialPriceCNYNumber || item.officialPriceNumber || 0)
      const actualPrice = Number(item.actualPriceCNYNumber || item.actualPriceNumber || 0) > 0
        ? Number(item.actualPriceCNYNumber || item.actualPriceNumber || 0)
        : Number(item.officialPriceCNYNumber || item.officialPriceNumber || 0)
      const seenLabels = new Set()

      for (const label of unitCharacters) {
        const current = map.get(label) || {
          key: label,
          label,
          meta: '',
          quantity: 0,
          totalValue: 0,
          officialTotalValue: 0,
          actualTotalValue: 0,
          itemCount: 0,
          averageUnitPrice: 0,
          latestAcquiredTime: 0,
          isEmpty: false
        }

        current.quantity += 1
        current.totalValue += unitValueShare
        current.officialTotalValue += officialPrice
        current.actualTotalValue += actualPrice
        if (!seenLabels.has(label)) {
          current.itemCount += 1
          seenLabels.add(label)
        }
        current.latestAcquiredTime = Math.max(current.latestAcquiredTime, Number(item.acquiredTime || 0))

        if (!current.meta && dimension === 'character') {
          current.meta = String(item.ip || '').trim() || presetCharacterIpMap.get(label) || ''
        }

        map.set(label, current)
      }

      continue
    }

    if (values.length === 0) {
      emptyCount += 1
      const emptyEntry = map.get(emptyLabel) || {
        key: emptyLabel,
        label: emptyLabel,
        meta: '',
        quantity: 0,
        totalValue: 0,
        officialTotalValue: 0,
        actualTotalValue: 0,
        itemCount: 0,
        averageUnitPrice: 0,
        latestAcquiredTime: 0,
        isEmpty: true
      }

      const itemOfficialTotal = Number(item.officialPriceCNYNumber || item.officialPriceNumber || 0) * Number(item.quantityNumber || 0)
      const itemActualPrice = Number(item.actualPriceCNYNumber || item.actualPriceNumber || 0) > 0
        ? Number(item.actualPriceCNYNumber || item.actualPriceNumber || 0)
        : Number(item.officialPriceCNYNumber || item.officialPriceNumber || 0)
      const itemActualTotal = itemActualPrice * Number(item.quantityNumber || 0)

      emptyEntry.quantity += Number(item.quantityNumber || 0)
      emptyEntry.totalValue += Number(item.totalValueNumber || 0)
      emptyEntry.officialTotalValue += itemOfficialTotal
      emptyEntry.actualTotalValue += itemActualTotal
      emptyEntry.itemCount += 1
      emptyEntry.latestAcquiredTime = Math.max(emptyEntry.latestAcquiredTime, Number(item.acquiredTime || 0))
      map.set(emptyEntry.key, emptyEntry)
      continue
    }

    const shareFactor = dimension === 'character' && values.length > 1 ? 1 / values.length : 1
    const quantityShare = quantityNumber * shareFactor
    const totalValueShare = totalValueNumber * shareFactor
    const officialPrice = Number(item.officialPriceCNYNumber || item.officialPriceNumber || 0)
    const actualPrice = Number(item.actualPriceCNYNumber || item.actualPriceNumber || 0) > 0
      ? Number(item.actualPriceCNYNumber || item.actualPriceNumber || 0)
      : Number(item.officialPriceCNYNumber || item.officialPriceNumber || 0)
    const officialTotalShare = officialPrice * quantityNumber * shareFactor
    const actualTotalShare = actualPrice * quantityNumber * shareFactor

    for (const label of values) {
      const current = map.get(label) || {
        key: label,
        label,
        meta: '',
        quantity: 0,
        totalValue: 0,
        officialTotalValue: 0,
        actualTotalValue: 0,
        itemCount: 0,
        averageUnitPrice: 0,
        latestAcquiredTime: 0,
        isEmpty: false
      }

      current.quantity += quantityShare
      current.totalValue += totalValueShare
      current.officialTotalValue += officialTotalShare
      current.actualTotalValue += actualTotalShare
      current.itemCount += 1
      current.latestAcquiredTime = Math.max(current.latestAcquiredTime, Number(item.acquiredTime || 0))

      if (!current.meta && dimension === 'character') {
        current.meta = String(item.ip || '').trim() || presetCharacterIpMap.get(label) || ''
      }

      map.set(label, current)
    }
  }

  const entries = [...map.values()]
    .filter((entry) => !entry.isEmpty)
    .map((entry) => ({
      ...entry,
      averageUnitPrice: entry.quantity > 0 ? entry.totalValue / entry.quantity : 0,
      officialAvgPrice: entry.quantity > 0 ? entry.officialTotalValue / entry.quantity : 0,
      actualAvgPrice: entry.quantity > 0 ? entry.actualTotalValue / entry.quantity : 0
    }))

  return {
    entries,
    emptyCount
  }
}

function formatQuantityValue(value) {
  const numeric = Number(value || 0)
  if (!Number.isFinite(numeric)) return '0'

  const text = numeric
    .toFixed(2)
    .replace(/\.00$/, '')
    .replace(/(\.[0-9]*?)0+$/, '$1')

  return text === '-0' ? '0' : text
}

export function sortLeaderboardEntries(entries, metric, dimension) {
  return [...entries].sort((a, b) => {
    const diff = Number(b[metric] || 0) - Number(a[metric] || 0)
    if (diff !== 0) return diff

    if (b.officialTotalValue !== a.officialTotalValue) return b.officialTotalValue - a.officialTotalValue
    if (b.quantity !== a.quantity) return b.quantity - a.quantity
    if (b.itemCount !== a.itemCount) return b.itemCount - a.itemCount

    if (dimension === 'month') {
      return String(b.label).localeCompare(String(a.label), 'zh-Hans-CN')
    }

    return String(a.label).localeCompare(String(b.label), 'zh-Hans-CN')
  })
}

export function formatLeaderboardMetricValue(entry, metric, t) {
  switch (metric) {
    case 'officialTotalValue':
      return `¥ ${Number(entry.officialTotalValue || 0).toFixed(2)}`
    case 'actualTotalValue':
      return `¥ ${Number(entry.actualTotalValue || 0).toFixed(2)}`
    case 'officialAvgPrice':
      return `¥ ${Number(entry.officialAvgPrice || 0).toFixed(2)}`
    case 'actualAvgPrice':
      return `¥ ${Number(entry.actualAvgPrice || 0).toFixed(2)}`
    case 'quantity':
    default:
      return t ? t('leaderboard.items', { count: formatQuantityValue(entry.quantity) }) : `${formatQuantityValue(entry.quantity)} 件`
  }
}
