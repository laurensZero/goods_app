import i18n from '@/locales'

const VALID_COLLECT_STATUSES = new Set(['待发货', '待补款', '待补邮', '已拥有', '丢失', '已赠出', '想出', '已出', '在售'])

const STATUS_I18N_MAP = {
  '待发货': 'status.pendingShipment',
  '待补款': 'status.pendingPayment',
  '待补邮': 'status.pendingPostage',
  '已拥有': 'status.owned',
  '丢失': 'status.lost',
  '已赠出': 'status.gifted',
  '想出': 'status.wantToSell',
  '已出': 'status.sold',
  '在售': 'status.forSale'
}

const STATUS_SHORT_I18N_MAP = {
  '待发货': 'status.short.pendingShipment',
  '待补款': 'status.short.pendingPayment',
  '待补邮': 'status.short.pendingPostage',
  '已拥有': 'status.short.owned',
  '丢失': 'status.short.lost',
  '已赠出': 'status.short.gifted',
  '想出': 'status.short.wantToSell',
  '已出': 'status.short.sold',
  '在售': 'status.short.forSale'
}

export function getStatusLabel(statusValue) {
  const { t } = i18n.global
  const key = STATUS_I18N_MAP[statusValue]
  return key ? t(key) : statusValue
}

export function getStatusShortLabel(statusValue) {
  const { t } = i18n.global
  const key = STATUS_SHORT_I18N_MAP[statusValue]
  return key ? t(key) : statusValue
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
      const label = compact ? getStatusShortLabel(status) : getStatusLabel(status)
      return count > 1 ? `${label}×${count}` : label
    })
    .join(' / ')
}

// 部分在途的商品若按主状态展示会读成“已拥有”，角标只汇总在途部件，如“待发货×3”
function formatPendingStatusSummary(item) {
  const entries = getCollectStatusEntries(item)
  const pendingEntries = entries.filter(({ status }) => PENDING_COLLECT_STATUSES.has(status))
  if (pendingEntries.length === 0) return ''

  // 整件都是同一在途状态时沿用整件文案，如“待发货”
  if (entries.length === 1) return getStatusLabel(entries[0].status)

  return pendingEntries
    .map(({ status, count }) => {
      const label = pendingEntries.length > 1 ? getStatusShortLabel(status) : getStatusLabel(status)
      return count > 1 ? `${label}×${count}` : label
    })
    .join(' / ')
}

function hasCollectStatusMatch(item, statuses) {
  const statusSet = new Set(statuses)
  return getCollectStatusEntries(item).some(({ status }) => statusSet.has(status))
}

const PENDING_COLLECT_STATUSES = new Set(['待发货', '待补款', '待补邮'])

const EXITED_COLLECT_STATUSES = new Set(['已出', '已赠出', '丢失'])

function areAllCopiesExited(item) {
  if (!item || item.isWishlist) return false
  const entries = getCollectStatusEntries(item)
  if (entries.length === 0) return false
  return entries.every(({ status }) => EXITED_COLLECT_STATUSES.has(status))
}

export {
  normalizeCollectStatus,
  getCollectStatusEntries,
  resolvePrimaryCollectStatus,
  formatCollectStatusSummary,
  formatPendingStatusSummary,
  hasCollectStatusMatch,
  PENDING_COLLECT_STATUSES,
  EXITED_COLLECT_STATUSES,
  areAllCopiesExited
}
