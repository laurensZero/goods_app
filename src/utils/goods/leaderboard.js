import { getItemSpendEntries } from './statistics'
import { resolveUnitValuesCNY } from './characterShare'

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

const EXCLUDED_VALUE_STATUSES = new Set(['已赠出', '已出', '丢失'])

export function buildLeaderboardEntries(list, dimension, presetCharacterIpMap = new Map(), t) {
  const config = getDimensionConfig(dimension)
  const emptyLabel = t ? t(`leaderboard.empty.${dimension}`) : ''
  const map = new Map()
  let emptyCount = 0
  const isCharacter = dimension === 'character'

  // 角色身份是 (ip, name)：同名角色在不同 IP 下必须是两条独立的榜，
  // 否则会被合并成一条、meta 里只剩其中一个 IP（重名就分不清了）。
  // 商品的 ip 是权威值；商品没填 ip 时退回预设里该角色的 ip（重名时只能取到其中一个，尽力而为）。
  const entryIpOf = (item, label) => String(item?.ip || '').trim() || presetCharacterIpMap.get(label) || ''
  const entryKeyOf = (item, label) => (isCharacter ? `${entryIpOf(item, label)}\u0000${label}` : label)
  const entryMetaOf = (item, label) => (isCharacter ? entryIpOf(item, label) : '')

  for (const item of list) {
    if (item?.isWishlist) continue
    if (EXCLUDED_VALUE_STATUSES.has(String(item?.collectStatus || '').trim())) continue
    const rawValues = config.getValues(item) || []
    const values = rawValues
      .map((value) => String(value || '').trim())
      .filter(Boolean)
    const quantityNumber = Number(item.quantityNumber || 0)
    const totalValueNumber = Number(item.totalValueNumber || 0)
    // 入手价总价与预算/时间线同口径
    const spendEntries = getItemSpendEntries(item)
    const spendTotal = spendEntries.reduce((sum, entry) => sum + entry.price, 0)
    const spendUnitShare = quantityNumber > 0 ? spendTotal / quantityNumber : 0
    const unitCharacters = Array.isArray(item.unitCharacterList)
      ? item.unitCharacterList
          .slice(0, quantityNumber)
          .map((value) => String(value || '').trim())
      : []
    const allowedCharacterSet = values.length > 0 ? new Set(values) : null
    const hasUnitCharacters = dimension === 'character'
      && quantityNumber > 0
      && values.length > 0
      && unitCharacters.some((label) => Boolean(label))
      && unitCharacters.every((label) => !label || allowedCharacterSet.has(label))

    if (hasUnitCharacters) {
      const unitValues = resolveUnitValuesCNY(item)
      const officialPrice = Number(item.officialPriceCNYNumber || item.officialPriceNumber || 0)
      const emptyUnitShare = 1 / values.length
      const touchedLabels = new Set()

      const upsert = (label) => {
        const key = entryKeyOf(item, label)
        let current = map.get(key)
        if (!current) {
          current = {
            key,
            label,
            meta: entryMetaOf(item, label),
            quantity: 0,
            totalValue: 0,
            officialTotalValue: 0,
            actualTotalValue: 0,
            itemCount: 0,
            averageUnitPrice: 0,
            latestAcquiredTime: 0,
            isEmpty: false
          }
          map.set(key, current)
        }
        touchedLabels.add(label)
        return current
      }

      for (let unitIndex = 0; unitIndex < quantityNumber; unitIndex++) {
        const label = unitCharacters[unitIndex] || ''
        const unitValue = unitValues[unitIndex] ?? 0
        // 入手价：官方花费明细与份数对齐时按份取价，否则均摊
        const unitSpend = spendEntries.length === quantityNumber ? spendEntries[unitIndex]?.price : undefined
        const unitActual = unitSpend ?? spendUnitShare

        if (label) {
          const current = upsert(label)
          current.quantity += 1
          current.totalValue += unitValue
          current.officialTotalValue += officialPrice
          current.actualTotalValue += unitActual
        } else {
          for (const fallbackLabel of values) {
            const current = upsert(fallbackLabel)
            current.quantity += emptyUnitShare
            current.totalValue += unitValue * emptyUnitShare
            current.officialTotalValue += officialPrice * emptyUnitShare
            current.actualTotalValue += unitActual * emptyUnitShare
          }
        }
      }

      for (const label of touchedLabels) {
        const current = map.get(entryKeyOf(item, label))
        if (!current) continue
        current.itemCount += 1
        current.latestAcquiredTime = Math.max(current.latestAcquiredTime, Number(item.acquiredTime || 0))
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

      emptyEntry.quantity += Number(item.quantityNumber || 0)
      emptyEntry.totalValue += Number(item.totalValueNumber || 0)
      emptyEntry.officialTotalValue += itemOfficialTotal
      emptyEntry.actualTotalValue += spendTotal
      emptyEntry.itemCount += 1
      emptyEntry.latestAcquiredTime = Math.max(emptyEntry.latestAcquiredTime, Number(item.acquiredTime || 0))
      map.set(emptyEntry.key, emptyEntry)
      continue
    }

    const shareFactor = dimension === 'character' && values.length > 1 ? 1 / values.length : 1
    const quantityShare = quantityNumber * shareFactor
    const totalValueShare = totalValueNumber * shareFactor
    const officialPrice = Number(item.officialPriceCNYNumber || item.officialPriceNumber || 0)
    const officialTotalShare = officialPrice * quantityNumber * shareFactor

    for (const label of values) {
      const key = entryKeyOf(item, label)
      const current = map.get(key) || {
        key,
        label,
        meta: entryMetaOf(item, label),
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
      current.actualTotalValue += spendTotal * shareFactor
      current.itemCount += 1
      current.latestAcquiredTime = Math.max(current.latestAcquiredTime, Number(item.acquiredTime || 0))

      map.set(key, current)
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

    const byLabel = String(a.label).localeCompare(String(b.label), 'zh-Hans-CN')
    if (byLabel !== 0) return byLabel
    // 角色按 (ip,name) 拆行后，同名同分时再按 IP 稳定排序
    return String(a.meta || '').localeCompare(String(b.meta || ''), 'zh-Hans-CN')
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
