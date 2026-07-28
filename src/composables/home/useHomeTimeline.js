import { computed } from 'vue'

function normalizeTimelineDate(value) {
  const normalized = String(value || '').trim()
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : ''
}

function parseTimelineDateTimestamp(value) {
  const normalized = normalizeTimelineDate(value)
  if (!normalized) return 0
  const timestamp = Date.parse(normalized)
  return Number.isFinite(timestamp) ? timestamp : 0
}

function getLatestTimelineDateTimestamp(list) {
  if (!Array.isArray(list) || list.length === 0) return 0
  return list.reduce((latest, value) => Math.max(latest, parseTimelineDateTimestamp(value)), 0)
}

function getTimelineSourceDates(item) {
  const quantityNumber = Math.max(1, Number(item?.quantity) || 1)
  const acquiredAt = normalizeTimelineDate(item?.acquiredAt)
  const explicitDates = Array.isArray(item?.unitAcquiredAtList)
    ? item.unitAcquiredAtList.map((value) => normalizeTimelineDate(value)).filter(Boolean)
    : []

  if (explicitDates.length === 0) {
    if (!acquiredAt) return []
    return Array.from({ length: quantityNumber }, () => acquiredAt)
  }

  const fallbackDate = acquiredAt || explicitDates[0]
  return Array.from({ length: quantityNumber }, (_, index) => explicitDates[index] || fallbackDate)
}

function buildTimelineEntries(goodsList) {
  const entries = []

  const EXCLUDED_VALUE_STATUSES = new Set(['已赠出', '已出', '丢失'])
  for (const item of goodsList) {
    const dates = getTimelineSourceDates(item)
    const quantityNumber = Math.max(1, Number(item?.quantity) || 1)
    const collectionTotalNumber = Number(item?.totalValueNumber) || 0
    const perUnitShareNumber = quantityNumber > 0 ? collectionTotalNumber / quantityNumber : collectionTotalNumber

    // Build per-copy statuses aligned with dates
    const unitStatuses = Array.isArray(item?.unitCollectStatusList) ? item.unitCollectStatusList : []

    // Determine if the whole item is excluded (no per-copy statuses or all copies excluded)
    let itemIsExcluded = false
    if (unitStatuses.length > 0) {
      itemIsExcluded = unitStatuses.every((s) => EXCLUDED_VALUE_STATUSES.has(String(s || '').trim()))
    } else {
      itemIsExcluded = EXCLUDED_VALUE_STATUSES.has(String(item?.collectStatus || '').trim())
    }

    if (dates.length === 0) {
      entries.push({
        ...item,
        id: item.id,
        sourceId: item.id,
        quantity: quantityNumber,
        timelineQuantity: quantityNumber,
        unitAcquiredAtList: [],
        acquiredAt: '',
        timelineYearMonth: '',
        timelineSortTime: 0,
        isExcludedFromValue: itemIsExcluded,
        priceNumber: itemIsExcluded ? 0 : perUnitShareNumber,
        totalValueNumber: itemIsExcluded ? 0 : collectionTotalNumber,
        originalTotalValueNumber: collectionTotalNumber
      })
      continue
    }

    // Build (date, status) pairs aligned by copy index
    const dateStatusPairs = dates.map((date, i) => ({
      date,
      status: unitStatuses[i] || ''
    }))

    const monthMap = new Map()
    for (const pair of dateStatusPairs) {
      const yearMonth = pair.date.slice(0, 7)
      if (!monthMap.has(yearMonth)) {
        monthMap.set(yearMonth, [])
      }
      monthMap.get(yearMonth).push(pair)
    }

    const monthEntries = Array.from(monthMap.entries()).map(([yearMonth, monthPairs], index) => {
      const id = monthMap.size === 1 ? item.id : `${item.id}::${yearMonth}`
      const monthDates = monthPairs.map((p) => p.date)
      const latestDate = monthPairs.reduce((latest, pair) => {
        const timestamp = parseTimelineDateTimestamp(pair.date)
        return timestamp > latest.timestamp ? { value: normalizeTimelineDate(pair.date), timestamp } : latest
      }, { value: '', timestamp: 0 })
      const acquiredAt = latestDate.value || normalizeTimelineDate(item.acquiredAt)
      const monthTotal = perUnitShareNumber * monthDates.length

      // Per-copy status graying: only exclude if ALL copies in this month group have exited statuses
      let monthIsExcluded = false
      const monthStatuses = monthPairs.map((p) => String(p.status || '').trim()).filter(Boolean)
      if (monthStatuses.length > 0) {
        monthIsExcluded = monthStatuses.every((s) => EXCLUDED_VALUE_STATUSES.has(s))
      } else {
        monthIsExcluded = itemIsExcluded
      }

      return {
        ...item,
        id,
        sourceId: item.id,
        acquiredAt,
        unitAcquiredAtList: [...monthDates],
        quantity: monthDates.length,
        timelineYearMonth: yearMonth,
        timelineQuantity: monthDates.length,
        isExcludedFromValue: monthIsExcluded,
        priceNumber: monthIsExcluded ? 0 : perUnitShareNumber,
        totalValueNumber: monthIsExcluded ? 0 : monthTotal,
        originalTotalValueNumber: monthTotal,
        timelineSortTime: getLatestTimelineDateTimestamp(monthDates) || parseTimelineDateTimestamp(acquiredAt) || index
      }
    })

    entries.push(...monthEntries)
  }

  return entries
}

function compareTimelineEntries(a, b, sortDirection) {
  const directionFactor = sortDirection === 'asc' ? 1 : -1
  const timeDelta = (Number(a.timelineSortTime) || 0) - (Number(b.timelineSortTime) || 0)
  if (timeDelta !== 0) return timeDelta * directionFactor

  const monthDelta = String(a.timelineYearMonth || '').localeCompare(String(b.timelineYearMonth || ''))
  if (monthDelta !== 0) return monthDelta * directionFactor

  const sourceDelta = String(a.sourceId || a.id || '').localeCompare(String(b.sourceId || b.id || ''))
  if (sourceDelta !== 0) return sourceDelta * directionFactor

  return String(a.id || '').localeCompare(String(b.id || '')) * directionFactor
}

export function useHomeTimeline({
  goodsList,
  displayDensity,
  sortDirection,
  visibleTimelineMonthStart,
  visibleTimelineMonthCount,
  getInitialVisibleTimelineMonths,
  offsetOfMonth
}) {
  const timelineEntries = computed(() => {
    if (displayDensity.value !== 'timeline') return []
    return buildTimelineEntries(goodsList.value).sort((a, b) => compareTimelineEntries(a, b, sortDirection.value))
  })

  // Flat month list — single source of truth for month ordering
  const allTimelineMonthList = computed(() => {
    const months = []
    const monthMap = new Map()

    for (const item of timelineEntries.value) {
      if (!item.timelineYearMonth) continue
      const yearMonth = item.timelineYearMonth

      let monthGroup = monthMap.get(yearMonth)
      if (!monthGroup) {
        monthGroup = {
          yearMonth,
          year: yearMonth.slice(0, 4),
          month: String(parseInt(yearMonth.slice(5, 7), 10)),
          count: 0,
          totalSpend: 0,
          items: []
        }
        monthMap.set(yearMonth, monthGroup)
        months.push(monthGroup)
      }

      monthGroup.items.push(item)
      monthGroup.count += Number(item.quantity) || 1
      monthGroup.totalSpend += Number(item.totalValueNumber) || 0
    }

    return months
  })

  const timelineYearGroups = computed(() => {
    const yearGroups = []
    const yearMap = new Map()

    for (const monthGroup of allTimelineMonthList.value) {
      const { year } = monthGroup
      let yearGroup = yearMap.get(year)

      if (!yearGroup) {
        yearGroup = { year, months: [], yearTotal: 0, yearCount: 0 }
        yearMap.set(year, yearGroup)
        yearGroups.push(yearGroup)
      }

      yearGroup.months.push(monthGroup)
      yearGroup.yearCount += monthGroup.count
      yearGroup.yearTotal += monthGroup.totalSpend
    }

    return yearGroups
  })

  const allTimelineMonthCount = computed(() => allTimelineMonthList.value.length)

  const timelineMonthIndexByItemId = computed(() => {
    const map = new Map()
    let monthIndex = 0

    for (const yearGroup of timelineYearGroups.value) {
      for (const monthGroup of yearGroup.months) {
        for (const item of monthGroup.items) {
          map.set(item.id, monthIndex)
        }
        monthIndex += 1
      }
    }

    return map
  })

  // Merged: build itemIndexById and entryById in a single pass over timelineEntries
  const _timelineMaps = computed(() => {
    const itemIndexById = new Map()
    const entryById = new Map()

    timelineEntries.value.forEach((item, index) => {
      itemIndexById.set(item.id, index)
      entryById.set(item.id, item)
    })

    return { itemIndexById, entryById }
  })

  const timelineItemIndexById = computed(() => _timelineMaps.value.itemIndexById)
  const timelineEntryById = computed(() => _timelineMaps.value.entryById)

  const timelineUnknownItemIds = computed(() =>
    new Set(
      timelineEntries.value
        .filter((item) => !item.timelineYearMonth)
        .map((item) => item.id)
    )
  )

  // Visible window: slice allTimelineMonthList[start .. start+count)
  const visibleTimelineYearGroups = computed(() => {
    if (displayDensity.value !== 'timeline') return timelineYearGroups.value

    const start = visibleTimelineMonthStart.value || 0
    const count = visibleTimelineMonthCount.value || getInitialVisibleTimelineMonths()
    const end = start + count
    const allMonths = allTimelineMonthList.value
    const visibleMonths = allMonths.slice(start, end)

    if (visibleMonths.length === 0) return []

    // Rebuild year groups from the sliced month list
    const yearGroups = []
    const yearMap = new Map()

    for (const monthGroup of visibleMonths) {
      const { year } = monthGroup
      let yearGroup = yearMap.get(year)

      if (!yearGroup) {
        yearGroup = { year, months: [], yearTotal: 0, yearCount: 0 }
        yearMap.set(year, yearGroup)
        yearGroups.push(yearGroup)
      }

      yearGroup.months.push(monthGroup)
      yearGroup.yearCount += monthGroup.count
      yearGroup.yearTotal += monthGroup.totalSpend
    }

    return yearGroups
  })

  // Height of pruned months before the visible window (for head spacer).
  // Uses per-month measured heights (offsetOfMonth) so that months which
  // were previously visible contribute their exact DOM height; unmeasured
  // months fall back to the measured average. This eliminates the cumulative
  // error that caused scroll-position jumps on prune/restore.
  const prunedTimelineHeadHeight = computed(() => {
    if (displayDensity.value !== 'timeline') return 0
    const start = visibleTimelineMonthStart.value || 0
    if (start <= 0) return 0
    return offsetOfMonth ? offsetOfMonth(start, allTimelineMonthList.value) : (start * 360)
  })

  const timelineUnknown = computed(() =>
    timelineEntries.value.filter((item) => !item.timelineYearMonth)
  )

  const showVisibleTimelineUnknown = computed(() => {
    if (timelineUnknown.value.length === 0) return false
    const start = visibleTimelineMonthStart.value || 0
    const count = visibleTimelineMonthCount.value || getInitialVisibleTimelineMonths()
    return (start + count) >= allTimelineMonthCount.value
  })

  return {
    timelineYearGroups,
    allTimelineMonthCount,
    allTimelineMonthList,
    timelineMonthIndexByItemId,
    timelineItemIndexById,
    timelineEntryById,
    timelineUnknownItemIds,
    visibleTimelineYearGroups,
    prunedTimelineHeadHeight,
    timelineUnknown,
    showVisibleTimelineUnknown
  }
}
