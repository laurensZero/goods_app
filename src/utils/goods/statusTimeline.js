// @ts-check
import { formatDate } from '@/utils/format'

/** 购入语义状态:这些状态的时间线条目与 acquiredAt 关联,可随购入日期修正而更新 */
export const ACQUISITION_STATUSES = new Set(['已拥有', '待发货', '待补款', '待补邮'])

/**
 * 读取条目的归属件集合。
 * 兼容两种形态:legacy 单件 `unitIndex`,多件 `unitIndexes`(升序去重后的非负整数数组)。
 * @param {import('@/types/models').StatusTimelineEntry|null|undefined} entry
 * @returns {number[]|null} null 表示「整批」(无归属);非空数组表示归属件(0-based)
 */
export function getEntryUnitIndexes(entry) {
  if (!entry || typeof entry !== 'object') return null
  if (Array.isArray(entry.unitIndexes)) {
    const uniq = [...new Set(
      entry.unitIndexes
        .map((n) => Number(n))
        .filter((n) => Number.isInteger(n) && n >= 0)
    )].sort((a, b) => a - b)
    return uniq.length > 0 ? uniq : null
  }
  if (Number.isInteger(entry.unitIndex) && entry.unitIndex >= 0) return [entry.unitIndex]
  return null
}

/** 是否为「整批」条目(无任何逐件归属) */
export function isGlobalTimelineEntry(entry) {
  return getEntryUnitIndexes(entry) === null
}

/**
 * 构造条目的归属字段(规范形态):0 件→整批;1 件→unitIndex;多件→unitIndexes
 * @param {number[]} unitIndexes
 * @returns {{ unitIndex?: number, unitIndexes?: number[] }}
 */
export function makeUnitScopeFields(unitIndexes) {
  const uniq = [...new Set(
    (Array.isArray(unitIndexes) ? unitIndexes : [])
      .map((n) => Number(n))
      .filter((n) => Number.isInteger(n) && n >= 0)
  )].sort((a, b) => a - b)
  if (uniq.length === 0) return {}
  if (uniq.length === 1) return { unitIndex: uniq[0] }
  return { unitIndexes: uniq }
}

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
 * 只匹配无归属的购入语义条目(优先命中日期恰为旧购入日期的那条),
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
    (e) => e && isGlobalTimelineEntry(e) && ACQUISITION_STATUSES.has(e.status) && e.at === prev
  )
  if (idx < 0) {
    idx = list.findIndex((e) => e && isGlobalTimelineEntry(e) && e.status === '已拥有')
  }
  if (idx < 0) return list

  list[idx] = { ...list[idx], at: next }
  return list.sort((a, b) => String(a?.at || '').localeCompare(String(b?.at || '')))
}

/**
 * 落库前为非愿望单商品补时间线初始条目——统一兜底所有添加路径(手动、批量、导入)。
 * 已有时间线的商品原样返回。多件且带逐份购入日期时按同日归批生成。
 * @param {object} item - 已经 normalizeGoodsInput 过的商品对象
 * @returns {object}
 */
export function ensureInitialTimeline(item) {
  if (!item || item.isWishlist) return item
  if (Array.isArray(item.statusTimeline) && item.statusTimeline.length > 0) return item
  const status = bootstrapAcquisitionStatus(item.collectStatus)
  const qty = Math.max(1, Number(item.quantity) || 1)
  if (qty >= 2) {
    return {
      ...item,
      statusTimeline: buildAcquisitionTimelineEntries({
        status,
        unitDates: Array.isArray(item.unitAcquiredAtList) ? item.unitAcquiredAtList : [],
        fallbackDate: item.acquiredAt
      })
    }
  }
  const at = normalizeTimelineDate(item.acquiredAt) || formatDate(new Date(), 'YYYY-MM-DD')
  return { ...item, statusTimeline: [{ status, at }] }
}

/**
 * 按逐份购入日期生成购入语义时间线条目:同一天的件合并为一条多件条目。
 * 全部件同一天(或无逐份日期)时返回一条整批汇总条目。
 * @param {{ status: string, unitDates: string[], fallbackDate?: string }} params
 * @returns {import('@/types/models').StatusTimelineEntry[]}
 */
export function buildAcquisitionTimelineEntries({ status, unitDates, fallbackDate = '' }) {
  const safeStatus = bootstrapAcquisitionStatus(status)
  const at = normalizeTimelineDate(fallbackDate) || formatDate(new Date(), 'YYYY-MM-DD')
  const list = Array.isArray(unitDates) ? unitDates : []
  const qty = Math.max(1, list.length)

  /** @type {Array<{ date: string, index: number }>} */
  const valid = []
  list.forEach((raw, index) => {
    const date = normalizeTimelineDate(raw)
    if (date) valid.push({ date, index })
  })

  if (valid.length === 0) return [{ status: safeStatus, at }]
  if (valid.length === qty && valid.every((v) => v.date === valid[0].date)) {
    return [{ status: safeStatus, at: valid[0].date }]
  }

  /** @type {Map<string, number[]>} */
  const byDate = new Map()
  for (const { date, index } of valid) {
    if (!byDate.has(date)) byDate.set(date, [])
    byDate.get(date).push(index)
  }
  const entries = [...byDate.entries()].map(([date, units]) => ({
    status: safeStatus,
    at: date,
    ...makeUnitScopeFields(units)
  }))
  if (valid.length < qty) {
    entries.push({ status: safeStatus, at })
  }
  return entries.sort((a, b) => a.at.localeCompare(b.at))
}

/**
 * 判断两份时间线快照是否不同(用于识别用户手动编辑)。
 * 归属按 getEntryUnitIndexes 规范化后比较,legacy unitIndex 与 unitIndexes:[n] 视为等价。
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
        u: getEntryUnitIndexes(e),
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
 * @param {{ at?: string, note?: string, unitIndex?: number, unitIndexes?: number[] }} [options]
 * @returns {import('@/types/models').StatusTimelineEntry[]}
 */
export function appendStatusTimelineEntry(timeline, status, options = {}) {
  const entry = {
    status,
    at: options.at || formatDate(new Date(), 'YYYY-MM-DD')
  }
  if (options.note) entry.note = options.note
  Object.assign(entry, makeUnitScopeFields([
    ...(Array.isArray(options.unitIndexes) ? options.unitIndexes : []),
    ...(Number.isInteger(options.unitIndex) ? [options.unitIndex] : [])
  ]))
  return [...(Array.isArray(timeline) ? timeline : []), entry]
}


const SALE_TIMELINE_STATUSES = new Set(['在售', '已出'])

/**
 * 出谷日期(sell* 列 / unitSaleInfoList[].date)变更后,把时间线上对应状态条目的日期对齐。
 * 幂等:命中条目的 at 与出谷日期不同则更新,条目不存在则补一条。
 * 归属匹配:整条 scope 对齐整批条目;逐件 scope 对齐覆盖该件的条目——
 * 精确单件命中优先更新;仅被多件条目覆盖时不改其日期(避免牵连同批其它件),也不再补重复条目。
 * @param {import('@/types/models').StatusTimelineEntry[]} timeline
 * @param {{ collectStatus?: string, sellDate?: string, unitStatuses?: string[], unitSaleInfoList?: Array<{date?: string}|null> }} params
 * @returns {import('@/types/models').StatusTimelineEntry[]}
 */
export function alignSaleTimelineDates(timeline, { collectStatus = '', sellDate = '', unitStatuses = [], unitSaleInfoList = [] } = {}) {
  let list = Array.isArray(timeline) ? [...timeline] : []
  let changed = false
  /** @type {Array<{ status: string, at: string, unitIndex: number|null }>} */
  const pendingAppends = []

  const align = (status, date, unitIndex) => {
    const normalizedDate = normalizeTimelineDate(date)
    const normalizedStatus = String(status || '').trim()
    if (!normalizedDate || !SALE_TIMELINE_STATUSES.has(normalizedStatus)) return

    const coversTarget = (entry) => {
      if (String(entry.status || '').trim() !== normalizedStatus) return false
      const scope = getEntryUnitIndexes(entry)
      if (unitIndex == null) return scope === null
      return scope !== null && scope.includes(unitIndex)
    }
    const isExactScope = (entry) => {
      const scope = getEntryUnitIndexes(entry)
      if (unitIndex == null) return scope === null
      return scope !== null && scope.length === 1 && scope[0] === unitIndex
    }

    let exactIndex = -1
    let exactAt = ''
    let coverIndex = -1
    let coverAt = ''
    list.forEach((entry, i) => {
      if (!coversTarget(entry)) return
      const at = String(entry.at || '')
      if (isExactScope(entry)) {
        if (exactIndex < 0 || at >= exactAt) {
          exactIndex = i
          exactAt = at
        }
      } else if (coverIndex < 0 || at >= coverAt) {
        coverIndex = i
        coverAt = at
      }
    })

    if (exactIndex >= 0) {
      if (list[exactIndex].at !== normalizedDate) {
        list[exactIndex] = { ...list[exactIndex], at: normalizedDate }
        changed = true
      }
      return
    }
    if (coverIndex >= 0) return

    pendingAppends.push({ status: normalizedStatus, at: normalizedDate, unitIndex })
  }

  if (Array.isArray(unitStatuses) && unitStatuses.length > 0) {
    unitStatuses.forEach((status, i) => align(status, unitSaleInfoList?.[i]?.date, i))
  } else {
    align(collectStatus, sellDate, null)
  }

  // 同日同状态的追加合并为一条多件条目
  if (pendingAppends.length > 0) {
    /** @type {Map<string, { status: string, at: string, units: number[] }>} */
    const grouped = new Map()
    for (const pending of pendingAppends) {
      if (pending.unitIndex == null) {
        list.push({ status: pending.status, at: pending.at })
        changed = true
        continue
      }
      const key = `${pending.status}|${pending.at}`
      if (!grouped.has(key)) grouped.set(key, { status: pending.status, at: pending.at, units: [] })
      grouped.get(key).units.push(pending.unitIndex)
    }
    for (const group of grouped.values()) {
      list.push({ status: group.status, at: group.at, ...makeUnitScopeFields(group.units) })
      changed = true
    }
  }

  return changed
    ? list.sort((a, b) => String(a?.at || '').localeCompare(String(b?.at || '')))
    : timeline
}

/**
 * 批量更新多件商品的状态时间线（unitCollectStatusList 变更时）。
 * 同一次保存里变更到同一状态的件合并为一条多件条目(如 1-11 件同日改「已拥有」)。
 * @param {import('@/types/models').StatusTimelineEntry[]} timeline
 * @param {string[]} oldStatuses
 * @param {string[]} newStatuses
 * @param {string} [at]
 * @returns {import('@/types/models').StatusTimelineEntry[]}
 */
export function syncUnitStatusTimeline(timeline, oldStatuses, newStatuses, at) {
  const date = at || formatDate(new Date(), 'YYYY-MM-DD')
  const existing = Array.isArray(timeline) ? [...timeline] : []
  /** @type {Map<string, number[]>} */
  const unitsByStatus = new Map()

  for (let i = 0; i < newStatuses.length; i++) {
    const oldStatus = oldStatuses[i] || ''
    const newStatus = newStatuses[i] || ''
    if (oldStatus && newStatus && oldStatus !== newStatus) {
      if (!unitsByStatus.has(newStatus)) unitsByStatus.set(newStatus, [])
      unitsByStatus.get(newStatus).push(i)
    }
  }

  /** @type {import('@/types/models').StatusTimelineEntry[]} */
  const additions = [...unitsByStatus.entries()].map(([status, units]) => ({
    status,
    at: date,
    ...makeUnitScopeFields(units)
  }))

  return additions.length > 0 ? [...existing, ...additions] : existing
}

/**
 * 批量同步逐份购入日期到时间线（unitAcquiredAtList 变更时）。
 * 同一天的件合并为一条多件条目——「按同一天下单的件数」自动归批。
 * @param {import('@/types/models').StatusTimelineEntry[]} timeline
 * @param {string[]} oldUnitDates
 * @param {string[]} newUnitDates
 * @param {string[]} unitStatuses - 每份对应的状态
 * @returns {import('@/types/models').StatusTimelineEntry[]}
 */
export function syncUnitAcquiredTimeline(timeline, oldUnitDates, newUnitDates, unitStatuses) {
  const existing = Array.isArray(timeline) ? [...timeline] : []

  /** @type {Map<string, { date: string, status: string, units: number[] }>} */
  const groups = new Map()
  for (let i = 0; i < newUnitDates.length; i++) {
    const oldDate = String(oldUnitDates[i] || '').trim()
    const newDate = String(newUnitDates[i] || '').trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate)) continue
    if (oldDate === newDate) continue

    const status = (unitStatuses && unitStatuses[i]) ? String(unitStatuses[i]).trim() : '已拥有'
    const key = `${newDate}|${status}`
    if (!groups.has(key)) groups.set(key, { date: newDate, status, units: [] })
    groups.get(key).units.push(i)
  }

  /** @type {import('@/types/models').StatusTimelineEntry[]} */
  const additions = [...groups.values()].map((g) => ({
    status: g.status,
    at: g.date,
    ...makeUnitScopeFields(g.units)
  }))

  if (additions.length === 0) return existing

  // 被本次更新触达的「状态 → 件」集合:旧的同状态逐件/多件条目若与之相交,
  // 缩小到未触达的件继续保留(避免"改第1件日期,同批第0/2件的记录一起消失");
  // 仅匹配同 status,避免误删该件的其它状态条目（如带价格的'已出'卖出记录）
  /** @type {Map<string, Set<number>>} */
  const touchedByStatus = new Map()
  for (const addition of additions) {
    const scope = getEntryUnitIndexes(addition) || []
    if (!touchedByStatus.has(addition.status)) touchedByStatus.set(addition.status, new Set())
    for (const u of scope) touchedByStatus.get(addition.status).add(u)
  }

  const keptEntries = []
  for (const entry of existing) {
    const scope = getEntryUnitIndexes(entry)
    if (scope === null) {
      keptEntries.push(entry)
      continue
    }
    const touched = touchedByStatus.get(entry.status)
    if (!touched || !scope.some((u) => touched.has(u))) {
      keptEntries.push(entry)
      continue
    }
    const remaining = scope.filter((u) => !touched.has(u))
    if (remaining.length > 0) {
      keptEntries.push({ ...entry, ...makeUnitScopeFields(remaining) })
    }
  }

  // 汇总条目（无归属）只在该状态的逐件条目已覆盖全部件时才移除,
  // 否则保留——避免"只改第 0 件日期,其余件的记录随汇总条目一起消失"
  const unitCount = newUnitDates.length
  const coveredByStatus = new Map()
  for (const entry of [...keptEntries, ...additions]) {
    const scope = getEntryUnitIndexes(entry)
    if (scope === null) continue
    if (!coveredByStatus.has(entry.status)) coveredByStatus.set(entry.status, new Set())
    for (const u of scope) coveredByStatus.get(entry.status).add(u)
  }
  const isFullyCovered = (status) => {
    const covered = coveredByStatus.get(status)
    if (!covered) return false
    for (let i = 0; i < unitCount; i++) {
      if (!covered.has(i)) return false
    }
    return true
  }
  const additionStatuses = new Set(additions.map((a) => a.status))
  const filtered = keptEntries.filter((entry) => {
    if (getEntryUnitIndexes(entry) !== null) return true
    return !(additionStatuses.has(entry.status) && isFullyCovered(entry.status))
  })

  return [...filtered, ...additions].sort((a, b) => a.at.localeCompare(b.at))
}

/**
 * 将时间线条目按归属件展开分组:无归属的归入「整批」,多件条目同时进入其覆盖的每个件的组。
 * 组内保持传入顺序(数据已按日期升序);unitGroups 按 unitIndex 升序。
 * @param {import('@/types/models').StatusTimelineEntry[]} timeline
 * @returns {{ hasUnitEntries: boolean, globalEntries: import('@/types/models').StatusTimelineEntry[], unitGroups: Array<{ unitIndex: number, entries: import('@/types/models').StatusTimelineEntry[] }> }}
 */
export function groupTimelineEntriesByUnit(timeline) {
  const list = Array.isArray(timeline) ? timeline : []
  /** @type {import('@/types/models').StatusTimelineEntry[]} */
  const globalEntries = []
  const byUnit = new Map()

  for (const entry of list) {
    if (!entry || typeof entry !== 'object') continue
    const scope = getEntryUnitIndexes(entry)
    if (scope === null) {
      globalEntries.push(entry)
      continue
    }
    for (const unitIndex of scope) {
      if (!byUnit.has(unitIndex)) byUnit.set(unitIndex, [])
      byUnit.get(unitIndex).push(entry)
    }
  }

  const unitGroups = [...byUnit.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([unitIndex, entries]) => ({ unitIndex, entries }))

  return { hasUnitEntries: unitGroups.length > 0, globalEntries, unitGroups }
}

function sameEntrySequence(a, b) {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
}

/**
 * 详情页展示分段:整批 + 按件;相邻且轨迹完全相同的件自动合并为「第 A-B 件」区间。
 * 同一天下单的件通常共享同一批多件条目,轨迹一致 → 自动合并,无需用户手选区间。
 * @param {import('@/types/models').StatusTimelineEntry[]} timeline
 * @returns {Array<{ key: string, unitStart: number|null, unitEnd: number|null, entries: import('@/types/models').StatusTimelineEntry[] }>|null} null 表示无逐件条目,走平铺
 */
export function buildTimelineUnitSections(timeline) {
  const { hasUnitEntries, globalEntries, unitGroups } = groupTimelineEntriesByUnit(timeline)
  if (!hasUnitEntries) return null

  /** @type {Array<{ key: string, unitStart: number|null, unitEnd: number|null, entries: import('@/types/models').StatusTimelineEntry[] }>} */
  const sections = []
  if (globalEntries.length > 0) {
    sections.push({
      key: 'global',
      unitStart: null,
      unitEnd: null,
      entries: [...globalEntries].reverse()
    })
  }

  let i = 0
  while (i < unitGroups.length) {
    const runEntries = unitGroups[i].entries
    let j = i
    while (
      j + 1 < unitGroups.length &&
      unitGroups[j + 1].unitIndex - unitGroups[j].unitIndex === 1 &&
      sameEntrySequence(unitGroups[j + 1].entries, runEntries)
    ) {
      j++
    }

    const start = unitGroups[i].unitIndex
    const end = unitGroups[j].unitIndex
    if (j > i) {
      sections.push({
        key: `unit-${start}-${end}`,
        unitStart: start,
        unitEnd: end,
        entries: [...runEntries].reverse()
      })
    } else {
      sections.push({
        key: `unit-${start}`,
        unitStart: start,
        unitEnd: start,
        entries: [...runEntries].reverse()
      })
    }
    i = j + 1
  }

  return sections
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
      const scope = getEntryUnitIndexes(entry)
      if (scope !== null && scope.includes(unitIndex)) {
        if (timestamp > latestWithUnitTimestamp) {
          latestWithUnit = date
          latestWithUnitTimestamp = timestamp
        }
        continue
      }

      if (scope === null && timestamp > latestWithoutUnitTimestamp) {
        latestWithoutUnit = date
        latestWithoutUnitTimestamp = timestamp
      }
      continue
    }

    if (getEntryUnitIndexes(entry) === null && timestamp > latestWithoutUnitTimestamp) {
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

function normalizeUnitDateValue(value) {
  return normalizeTimelineDate(value)
}

function normalizeUnitStatusValue(value) {
  return String(value || '').trim()
}

/**
 * store.updateGoods 的时间线自动维护——编辑器已显式传入 statusTimeline 时跳过;
 * MCP/AI/其它只改字段的调用方由这里补齐(改状态、改逐份状态/日期、出谷、购入日期)。
 * @param {object} previous - 更新前的商品
 * @param {object} data - 本次 update 的字段补丁
 * @returns {object} 原样返回 data,或带上计算好的 statusTimeline
 */
export function maintainTimelineOnGoodsUpdate(previous, data) {
  if (!previous || !data || data.statusTimeline !== undefined) return data
  if (previous.isWishlist && (data.isWishlist ?? previous.isWishlist) !== false) return data

  const touchesTimeline =
    data.collectStatus !== undefined ||
    data.acquiredAt !== undefined ||
    data.sellDate !== undefined ||
    data.unitCollectStatusList !== undefined ||
    data.unitAcquiredAtList !== undefined ||
    data.unitSaleInfoList !== undefined ||
    data.quantity !== undefined ||
    (previous.isWishlist === true && data.isWishlist === false)
  if (!touchesTimeline) return data

  const qty = Math.max(1, Number(data.quantity ?? previous.quantity) || 1)
  const oldStatus = normalizeUnitStatusValue(previous.collectStatus) || '已拥有'
  const newStatus = normalizeUnitStatusValue(data.collectStatus ?? previous.collectStatus) || '已拥有'
  const oldAcquiredAt = String(previous.acquiredAt || '')
  const newAcquiredAt = String(data.acquiredAt ?? (previous.acquiredAt || ''))

  const padDates = (list, fallback) =>
    Array.from({ length: qty }, (_, i) => normalizeUnitDateValue(list?.[i]) || normalizeTimelineDate(fallback))
  const padStatuses = (list, fallback) =>
    Array.from({ length: qty }, (_, i) => normalizeUnitStatusValue(list?.[i]) || normalizeUnitStatusValue(fallback))

  const oldStatusFallback = normalizeUnitStatusValue(previous.collectStatus) || '已拥有'
  const newStatusFallback = newStatus

  let timeline = computeEditedTimeline({
    formTimeline: previous.statusTimeline || [],
    originalTimeline: previous.statusTimeline || [],
    quantity: qty,
    oldStatus,
    newStatus,
    oldAcquiredAt,
    newAcquiredAt,
    oldUnitDates: qty >= 2 ? padDates(previous.unitAcquiredAtList, previous.acquiredAt) : [],
    newUnitDates: qty >= 2 ? padDates(data.unitAcquiredAtList ?? previous.unitAcquiredAtList, newAcquiredAt) : [],
    oldUnitStatuses: qty >= 2 ? padStatuses(previous.unitCollectStatusList, oldStatusFallback) : [],
    newUnitStatuses: qty >= 2 ? padStatuses(data.unitCollectStatusList ?? previous.unitCollectStatusList, newStatusFallback) : [],
    isWishlistToCollection: previous.isWishlist === true && data.isWishlist === false
  })

  timeline = alignSaleTimelineDates(timeline, {
    collectStatus: newStatus,
    sellDate: String(data.sellDate ?? (previous.sellDate || '')),
    unitStatuses: qty >= 2 ? padStatuses(data.unitCollectStatusList ?? previous.unitCollectStatusList, newStatusFallback) : [],
    unitSaleInfoList: data.unitSaleInfoList ?? previous.unitSaleInfoList ?? []
  })

  return { ...data, statusTimeline: timeline }
}
