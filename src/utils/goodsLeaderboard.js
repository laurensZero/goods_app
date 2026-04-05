export const LEADERBOARD_DIMENSION_OPTIONS = [
  { label: '角色', value: 'character' },
  { label: 'IP', value: 'ip' },
  { label: '分类', value: 'category' },
  { label: '存放位置', value: 'storageLocation' },
  { label: '月度购入', value: 'month' }
]

export const LEADERBOARD_METRIC_OPTIONS = [
  { label: '总件数', value: 'quantity' },
  { label: '总花费', value: 'totalValue' },
  { label: '均价', value: 'averageUnitPrice' }
]

const DIMENSION_CONFIG = {
  character: {
    emptyLabel: '未设置角色',
    title: '角色排行',
    heroLabel: 'Character Ranking',
    getValues(item) {
      return Array.isArray(item.characters) ? item.characters : []
    },
    getMeta(item, presetCharacterIpMap) {
      return String(item.ip || '').trim() || presetCharacterIpMap.get(String(item.label || '').trim()) || ''
    }
  },
  ip: {
    emptyLabel: '未设置 IP',
    title: 'IP 排行',
    heroLabel: 'IP Ranking',
    description: '快速看哪个 IP 收藏最多、投入最高。',
    getValues(item) {
      return item.ip ? [item.ip] : []
    }
  },
  category: {
    emptyLabel: '未分类',
    title: '分类排行',
    heroLabel: 'Category Ranking',
    description: '看各品类占比，适合判断收藏结构。',
    getValues(item) {
      return item.category ? [item.category] : []
    }
  },
  storageLocation: {
    emptyLabel: '未设置位置',
    title: '存放位置排行',
    heroLabel: 'Storage Ranking',
    description: '统计每个收纳位置的承载量，方便整理收纳。',
    getValues(item) {
      return item.storageLocation ? [item.storageLocation] : []
    }
  },
  month: {
    emptyLabel: '未记录日期',
    title: '月度购入排行',
    heroLabel: 'Monthly Ranking',
    description: '按购入月份看件数和花费变化，方便回看入谷节奏。',
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

export function getLeaderboardDimensionMeta(dimension) {
  return getDimensionConfig(dimension)
}

export function buildLeaderboardEntries(list, dimension, presetCharacterIpMap = new Map()) {
  const config = getDimensionConfig(dimension)
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
      const seenLabels = new Set()

      for (const label of unitCharacters) {
        const current = map.get(label) || {
          key: label,
          label,
          meta: '',
          quantity: 0,
          totalValue: 0,
          itemCount: 0,
          averageUnitPrice: 0,
          latestAcquiredTime: 0,
          isEmpty: false
        }

        current.quantity += 1
        current.totalValue += unitValueShare
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
      const emptyEntry = map.get(config.emptyLabel) || {
        key: config.emptyLabel,
        label: config.emptyLabel,
        meta: '',
        quantity: 0,
        totalValue: 0,
        itemCount: 0,
        averageUnitPrice: 0,
        latestAcquiredTime: 0,
        isEmpty: true
      }

      emptyEntry.quantity += Number(item.quantityNumber || 0)
      emptyEntry.totalValue += Number(item.totalValueNumber || 0)
      emptyEntry.itemCount += 1
      emptyEntry.latestAcquiredTime = Math.max(emptyEntry.latestAcquiredTime, Number(item.acquiredTime || 0))
      map.set(emptyEntry.key, emptyEntry)
      continue
    }

    const shareFactor = dimension === 'character' && values.length > 1 ? 1 / values.length : 1
    const quantityShare = quantityNumber * shareFactor
    const totalValueShare = totalValueNumber * shareFactor

    for (const label of values) {
      const current = map.get(label) || {
        key: label,
        label,
        meta: '',
        quantity: 0,
        totalValue: 0,
        itemCount: 0,
        averageUnitPrice: 0,
        latestAcquiredTime: 0,
        isEmpty: false
      }

      current.quantity += quantityShare
      current.totalValue += totalValueShare
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
      averageUnitPrice: entry.quantity > 0 ? entry.totalValue / entry.quantity : 0
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

    if (b.totalValue !== a.totalValue) return b.totalValue - a.totalValue
    if (b.quantity !== a.quantity) return b.quantity - a.quantity
    if (b.itemCount !== a.itemCount) return b.itemCount - a.itemCount

    if (dimension === 'month') {
      return String(b.label).localeCompare(String(a.label), 'zh-Hans-CN')
    }

    return String(a.label).localeCompare(String(b.label), 'zh-Hans-CN')
  })
}

export function formatLeaderboardMetricValue(entry, metric) {
  switch (metric) {
    case 'totalValue':
      return `¥ ${Number(entry.totalValue || 0).toFixed(2)}`
    case 'averageUnitPrice':
      return `¥ ${Number(entry.averageUnitPrice || 0).toFixed(2)}`
    case 'quantity':
    default:
      return `${formatQuantityValue(entry.quantity)} 件`
  }
}
