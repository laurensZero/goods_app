const VALID_COLLECT_STATUSES = new Set(['待发货', '待补款', '待补邮', '已拥有', '丢失', '已赠出', '想出', '已出', '在售'])

const STATUS_SHORT_MAP = {
  '待发货': '待发',
  '待补款': '补款',
  '待补邮': '补邮',
  '已拥有': '已拥',
  '丢失': '丢失',
  '已赠出': '已赠',
  '想出': '想出',
  '已出': '已出',
  '在售': '在售'
}

function normalizeCollectStatus(value) {
  const status = String(value || '').trim()
  return VALID_COLLECT_STATUSES.has(status) ? status : '已拥有'
}

function getCollectStatusEntries(item) {
  const unitList = Array.isArray(item?.unitCollectStatusList) ? item.unitCollectStatusList : []
  const normalizedUnitList = unitList.map((value) => normalizeCollectStatus(value)).filter(Boolean)

  if (normalizedUnitList.length === 0) {
    return [{ status: normalizeCollectStatus(item?.collectStatus), count: 1 }]
  }

  const counts = new Map()
  for (const status of normalizedUnitList) {
    counts.set(status, (counts.get(status) || 0) + 1)
  }

  return [...counts.entries()].map(([status, count]) => ({ status, count }))
}

function resolvePrimaryCollectStatus(item) {
  const entries = getCollectStatusEntries(item)
  if (entries.length === 0) return '已拥有'

  let winner = entries[0].status
  let winnerCount = entries[0].count

  for (const entry of entries) {
    if (entry.count > winnerCount) {
      winner = entry.status
      winnerCount = entry.count
    }
  }

  return winner || normalizeCollectStatus(item?.collectStatus)
}

function formatCollectStatusSummary(item, { compact = false } = {}) {
  const entries = getCollectStatusEntries(item)
  return entries
    .map(({ status, count }) => {
      const label = compact ? (STATUS_SHORT_MAP[status] || status) : status
      return count > 1 ? `${label}×${count}` : label
    })
    .join(' / ')
}

function hasCollectStatusMatch(item, statuses) {
  const statusSet = new Set(statuses)
  return getCollectStatusEntries(item).some(({ status }) => statusSet.has(status))
}

export {
  normalizeCollectStatus,
  getCollectStatusEntries,
  resolvePrimaryCollectStatus,
  formatCollectStatusSummary,
  hasCollectStatusMatch
}