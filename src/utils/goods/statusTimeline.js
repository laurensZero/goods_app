// @ts-check
import { formatDate } from '@/utils/format'

/** 购入语义状态:这些状态的时间线条目与 acquiredAt 关联,可随购入日期修正而更新 */
export const ACQUISITION_STATUSES = new Set(['已拥有', '待发货', '待补款', '待补邮'])

/**
 * 时间线为空时的兜底初始状态:购入语义状态原样保留,
 * 卖出/赠出/丢失等状态回落「已拥有」——避免造出「已出@购入日期」这类假卖出记录
 * @param {string} status
 * @returns {string}
 */
export function bootstrapAcquisitionStatus(status) {
  const normalized = String(status || '').trim()
  return ACQUISITION_STATUSES.has(normalized) ? normalized : '已拥有'
}

/**
 * 购入日期变更时更新时间线中的购入语义条目。
 * 只匹配无 unitIndex 的购入语义条目(优先命中日期恰为旧购入日期的那条),
 * 绝不触碰卖出/赠出条目和逐件条目——修复"改购入日期篡改成交日期"的问题。
 * @param {import('@/types/models').StatusTimelineEntry[]} timeline
 * @param {string} oldAcquiredAt
 * @param {string} newAcquiredAt
 * @returns {import('@/types/models').StatusTimelineEntry[]}
 */
export function applyAcquiredAtToTimeline(timeline, oldAcquiredAt, newAcquiredAt) {
  const list = Array.isArray(timeline) ? [...timeline] : []
  const next = String(newAcquiredAt || '').trim()
  const prev = String(oldAcquiredAt || '').trim()
  if (!next || next === prev || list.length === 0) return list

  let idx = list.findIndex(
    (e) => e && e.unitIndex == null && ACQUISITION_STATUSES.has(e.status) && e.at === prev
  )
  if (idx < 0) {
    idx = list.findIndex((e) => e && e.unitIndex == null && e.status === '已拥有')
  }
  if (idx < 0) return list

  list[idx] = { ...list[idx], at: next }
  return list.sort((a, b) => String(a?.at || '').localeCompare(String(b?.at || '')))
}

/**
 * 落库前为非愿望单商品补时间线初始条目——统一兜底所有添加路径(手动、批量、导入)。
 * 已有时间线的商品原样返回。
 * @param {object} item - 已经 normalizeGoodsInput 过的商品对象
 * @returns {object}
 */
export function ensureInitialTimeline(item) {
  if (!item || item.isWishlist) return item
  if (Array.isArray(item.statusTimeline) && item.statusTimeline.length > 0) return item
  const at = normalizeTimelineDate(item.acquiredAt) || formatDate(new Date(), 'YYYY-MM-DD')
  return { ...item, statusTimeline: [{ status: bootstrapAcquisitionStatus(item.collectStatus), at }] }
}

/**
 * 判断两份时间线快照是否不同(用于识别用户手动编辑)。
 * 覆盖全部可编辑字段:status/at/unitIndex/note 及卖出字段 price/platform/fee。
 * @param {import('@/types/models').StatusTimelineEntry[]} a
 * @param {import('@/types/models').StatusTimelineEntry[]} b
 * @returns {boolean}
 */
export function timelineSnapshotDiffers(a, b) {
  const snapshot = (list) =>
    JSON.stringify(
      (Array.isArray(list) ? list : []).map((e) => ({
        s: e?.status ?? '',
        a: e?.at ?? '',
        u: e?.unitIndex ?? null,
        n: e?.note ?? '',
        p: e?.price ?? '',
        pl: e?.platform ?? '',
        f: e?.fee ?? ''
      }))
    )
  return snapshot(a) !== snapshot(b)
}

/**
 * 向状态时间线追加一条新记录(纯状态历史,卖出金额数据存 goods 的 sell* 列)
 * @param {import('@/types/models').StatusTimelineEntry[]} timeline
 * @param {string} status - 新状态值
 * @param {{ at?: string, note?: string, unitIndex?: number }} [options]
 * @returns {import('@/types/models').StatusTimelineEntry[]}
 */
export function appendStatusTimelineEntry(timeline, status, options = {}) {
  const entry = {
    status,
    at: options.at || formatDate(new Date(), 'YYYY-MM-DD')
  }
  if (options.note) entry.note = options.note
  if (options.unitIndex != null) entry.unitIndex = options.unitIndex
  return [...(Array.isArray(timeline) ? timeline : []), entry]
}


const SALE_TIMELINE_STATUSES = new Set(['在售', '已出'])

/**
 * 出谷日期(sell* 列 / unitSaleInfoList[].date)变更后,把时间线上对应状态条目的日期对齐。
 * 幂等:每个 scope 最新的同状态条目 at 与出谷日期不同则更新,条目不存在则补一条。
 * @param {import('@/types/models').StatusTimelineEntry[]} timeline
 * @param {{ collectStatus?: string, sellDate?: string, unitStatuses?: string[], unitSaleInfoList?: Array<{date?: string}|null> }} params
 * @returns {import('@/types/models').StatusTimelineEntry[]}
 */
export function alignSaleTimelineDates(timeline, { collectStatus = '', sellDate = '', unitStatuses = [], unitSaleInfoList = [] } = {}) {
  let list = Array.isArray(timeline) ? [...timeline] : []
  let changed = false

  const align = (status, date, unitIndex) => {
    const normalizedDate = normalizeTimelineDate(date)
    const normalizedStatus = String(status || '').trim()
    if (!normalizedDate || !SALE_TIMELINE_STATUSES.has(normalizedStatus)) return
    let bestIndex = -1
    let bestAt = ''
    list.forEach((entry, i) => {
      if (!entry || String(entry.status || '').trim() !== normalizedStatus) return
      const scope = Number.isInteger(entry.unitIndex) ? entry.unitIndex : null
      if (scope !== unitIndex) return
      if (bestIndex < 0 || String(entry.at || '') >= bestAt) {
        bestIndex = i
        bestAt = String(entry.at || '')
      }
    })
    if (bestIndex >= 0) {
      if (list[bestIndex].at !== normalizedDate) {
        list[bestIndex] = { ...list[bestIndex], at: normalizedDate }
        changed = true
      }
    } else {
      const entry = { status: normalizedStatus, at: normalizedDate }
      if (unitIndex != null) entry.unitIndex = unitIndex
      list.push(entry)
      changed = true
    }
  }

  if (Array.isArray(unitStatuses) && unitStatuses.length > 0) {
    unitStatuses.forEach((status, i) => align(status, unitSaleInfoList?.[i]?.date, i))
  } else {
    align(collectStatus, sellDate, null)
  }

  return changed
    ? list.sort((a, b) => String(a?.at || '').localeCompare(String(b?.at || '')))
    : timeline
}

/**
 * 批量更新多件商品的状态时间线（unitCollectStatusList 变更时）
 * @param {import('@/types/models').StatusTimelineEntry[]} timeline
 * @param {string[]} oldStatuses
 * @param {string[]} newStatuses
 * @param {string} [at]
 * @returns {import('@/types/models').StatusTimelineEntry[]}
 */
export function syncUnitStatusTimeline(timeline, oldStatuses, newStatuses, at) {
  const date = at || formatDate(new Date(), 'YYYY-MM-DD')
  const existing = Array.isArray(timeline) ? [...timeline] : []
  /** @type {import('@/types/models').StatusTimelineEntry[]} */
  const additions = []

  for (let i = 0; i < newStatuses.length; i++) {
    const oldStatus = oldStatuses[i] || ''
    const newStatus = newStatuses[i] || ''
    if (oldStatus && newStatus && oldStatus !== newStatus) {
      additions.push({ status: newStatus, at: date, unitIndex: i })
    }
  }

  return additions.length > 0 ? [...existing, ...additions] : existing
}

/**
 * 批量同步逐份购入日期到时间线（unitAcquiredAtList 变更时）
 * @param {import('@/types/models').StatusTimelineEntry[]} timeline
 * @param {string[]} oldUnitDates
 * @param {string[]} newUnitDates
 * @param {string[]} unitStatuses - 每份对应的状态
 * @returns {import('@/types/models').StatusTimelineEntry[]}
 */
export function syncUnitAcquiredTimeline(timeline, oldUnitDates, newUnitDates, unitStatuses) {
  const existing = Array.isArray(timeline) ? [...timeline] : []
  /** @type {import('@/types/models').StatusTimelineEntry[]} */
  const additions = []

  for (let i = 0; i < newUnitDates.length; i++) {
    const oldDate = String(oldUnitDates[i] || '').trim()
    const newDate = String(newUnitDates[i] || '').trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate)) continue
    if (oldDate === newDate) continue

    const status = (unitStatuses && unitStatuses[i]) ? String(unitStatuses[i]).trim() : '已拥有'
    additions.push({ status, at: newDate, unitIndex: i })
  }

  if (additions.length === 0) return existing

  // 移除已有同 unitIndex 且同 status 的旧条目;
  // 仅匹配同 status,避免误删该件的其它状态条目（如带价格的'已出'卖出记录）
  const additionStatuses = new Set(additions.map((a) => a.status))
  const keptEntries = existing.filter((entry) => {
    if (entry.unitIndex == null) return true
    return !additions.some((a) => a.unitIndex === entry.unitIndex && a.status === entry.status)
  })

  // 汇总条目（无 unitIndex）只在该状态的逐份条目已覆盖全部件时才移除,
  // 否则保留——避免"只改第 0 件日期,其余件的记录随汇总条目一起消失"
  const unitCount = newUnitDates.length
  const coveredByStatus = new Map()
  for (const entry of [...keptEntries, ...additions]) {
    if (entry.unitIndex == null) continue
    if (!coveredByStatus.has(entry.status)) coveredByStatus.set(entry.status, new Set())
    coveredByStatus.get(entry.status).add(entry.unitIndex)
  }
  const isFullyCovered = (status) => {
    const covered = coveredByStatus.get(status)
    if (!covered) return false
    for (let i = 0; i < unitCount; i++) {
      if (!covered.has(i)) return false
    }
    return true
  }
  const filtered = keptEntries.filter((entry) => {
    if (entry.unitIndex != null) return true
    return !(additionStatuses.has(entry.status) && isFullyCovered(entry.status))
  })

  return [...filtered, ...additions].sort((a, b) => a.at.localeCompare(b.at))
}

/**
 * 标准化时间线日期字符串
 * @param {string} value
 * @returns {string}
 */
export function normalizeTimelineDate(value) {
  const normalized = String(value || '').trim()
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : ''
}

/**
 * 从时间线中获取某个状态的开始日期
 * @param {object} item
 * @param {string} status
 * @param {number|null} [unitIndex]
 * @returns {string}
 */
export function getTimelineStartDate(item, status, unitIndex = null) {
  const timeline = Array.isArray(item?.statusTimeline) ? item.statusTimeline : []
  const normalizedStatus = String(status || '').trim()
  const hasUnitIndex = Number.isInteger(unitIndex)

  let latestWithUnit = ''
  let latestWithUnitTimestamp = 0
  let latestWithoutUnit = ''
  let latestWithoutUnitTimestamp = 0

  for (const entry of timeline) {
    if (!entry || typeof entry !== 'object') continue
    if (normalizedStatus && String(entry.status || '').trim() !== normalizedStatus) continue

    const date = normalizeTimelineDate(entry.at)
    if (!date) continue
    const timestamp = Date.parse(date)
    if (!Number.isFinite(timestamp)) continue

    if (hasUnitIndex) {
      if (Number.isInteger(entry.unitIndex) && entry.unitIndex === unitIndex) {
        if (timestamp > latestWithUnitTimestamp) {
          latestWithUnit = date
          latestWithUnitTimestamp = timestamp
        }
        continue
      }

      if (!Number.isInteger(entry.unitIndex) && timestamp > latestWithoutUnitTimestamp) {
        latestWithoutUnit = date
        latestWithoutUnitTimestamp = timestamp
      }
      continue
    }

    if (timestamp > latestWithoutUnitTimestamp) {
      latestWithoutUnit = date
      latestWithoutUnitTimestamp = timestamp
    }
  }

  return latestWithUnit || latestWithoutUnit
}

/**
 * 从日期字符串计算持有天数。
 * 按本地时区解析(new Date('YYYY-MM-DD') 是 UTC 午夜,东八区当天早 8 点前会算出负值)
 * @param {string} date
 * @returns {number|null}
 */
export function getHoldingDaysFromDate(date) {
  const normalized = normalizeTimelineDate(date)
  if (!normalized) {
    if (!date) return null
    const diff = Date.now() - new Date(date).getTime()
    const days = Math.floor(diff / 86400000)
    return days >= 0 ? days : null
  }
  const [year, month, day] = normalized.split('-').map(Number)
  const start = new Date(year, month - 1, day)
  const diff = Date.now() - start.getTime()
  const days = Math.floor(diff / 86400000)
  return days >= 0 ? days : null
}

/**
 * 编辑保存时的时间线自动维护——唯一入口,集中原先散落在编辑器里的全部规则。
 *
 * 约定:oldUnitDates/newUnitDates/oldUnitStatuses/newUnitStatuses 必须由调用方
 * 按 quantity 填充对齐(空位用整条 acquiredAt/collectStatus 兜底),
 * 这样 diff 的两侧才是同一形态,不会因"表单填满 vs 落库剥空"的不对称产生假差异。
 *
 * @param {object} params
 * @param {import('@/types/models').StatusTimelineEntry[]} params.formTimeline - 表单当前时间线
 * @param {import('@/types/models').StatusTimelineEntry[]} params.originalTimeline - 加载时的原始时间线
 * @param {number} params.quantity
 * @param {string} params.oldStatus - 原 collectStatus
 * @param {string} params.newStatus - 新 collectStatus
 * @param {string} params.oldAcquiredAt
 * @param {string} params.newAcquiredAt
 * @param {string[]} params.oldUnitDates - 已填充对齐
 * @param {string[]} params.newUnitDates - 已填充对齐
 * @param {string[]} params.oldUnitStatuses - 已填充对齐
 * @param {string[]} params.newUnitStatuses - 已填充对齐
 * @param {boolean} params.isWishlistToCollection
 * @returns {import('@/types/models').StatusTimelineEntry[]}
 */
export function computeEditedTimeline({
  formTimeline,
  originalTimeline,
  quantity,
  oldStatus,
  newStatus,
  oldAcquiredAt,
  newAcquiredAt,
  oldUnitDates = [],
  newUnitDates = [],
  oldUnitStatuses = [],
  newUnitStatuses = [],
  isWishlistToCollection = false
}) {
  let timeline = Array.isArray(formTimeline) ? [...formTimeline] : []
  const qty = Math.max(1, Number(quantity) || 1)
  // 兜底日期必须是合法 YYYY-MM-DD:遗留数据的 acquiredAt 可能是 '2023-05' 之类,
  // 直接写入会被 normalizeStatusTimeline 静默丢弃,表现为时间线时有时无
  const bootstrapAt = normalizeTimelineDate(newAcquiredAt) || formatDate(new Date(), 'YYYY-MM-DD')

  // 心愿单转收藏:追加转换条目,保留既有历史(含卖出记录与用户手动编辑)
  if (isWishlistToCollection) {
    return appendStatusTimelineEntry(timeline, newStatus, { at: bootstrapAt })
  }

  // 用户手动编辑过时间线 → 完全尊重,不做任何自动追加/修改
  if (timelineSnapshotDiffers(formTimeline, originalTimeline)) {
    if (timeline.length === 0 && newAcquiredAt && (originalTimeline || []).length === 0) {
      timeline = [{ status: bootstrapAcquisitionStatus(oldStatus), at: bootstrapAt }]
    }
    return timeline
  }

  // 老数据没有时间线时,用购入日期创建初始条目(状态限购入语义,避免假卖出记录)
  if (timeline.length === 0 && newAcquiredAt) {
    timeline = [{ status: bootstrapAcquisitionStatus(oldStatus), at: bootstrapAt }]
  }

  // 购入日期变更 → 只更新购入语义条目
  timeline = applyAcquiredAtToTimeline(timeline, oldAcquiredAt, newAcquiredAt)

  // 逐件日期/状态变更:仅多件商品参与(qty=1 的逐件列表是表单预填,不代表用户输入)
  let unitStatusChanged = false
  if (qty >= 2) {
    if (newUnitDates.length > 0) {
      timeline = syncUnitAcquiredTimeline(timeline, oldUnitDates, newUnitDates, newUnitStatuses)
    }
    if (newUnitStatuses.length > 0) {
      unitStatusChanged = newUnitStatuses.some(
        (status, i) => (oldUnitStatuses[i] || '') !== '' && status !== '' && status !== oldUnitStatuses[i]
      )
      timeline = syncUnitStatusTimeline(timeline, oldUnitStatuses, newUnitStatuses)
    }
  }

  // 整条状态变更 → 追加汇总条目;逐件变更已记录时不再重复追加
  if (oldStatus !== newStatus && !unitStatusChanged) {
    timeline = appendStatusTimelineEntry(timeline, newStatus)
  }

  return timeline
}
