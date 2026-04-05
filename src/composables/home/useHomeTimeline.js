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

  for (const item of goodsList) {
    const dates = getTimelineSourceDates(item)
    const quantityNumber = Math.max(1, Number(item?.quantity) || 1)
    const priceNumber = Number(item?.priceNumber) || 0

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
        priceNumber,
        totalValueNumber: priceNumber * quantityNumber
      })
      continue
    }

    const monthMap = new Map()
    for (const date of dates) {
      const yearMonth = date.slice(0, 7)
      if (!monthMap.has(yearMonth)) {
        monthMap.set(yearMonth, [])
      }
      monthMap.get(yearMonth).push(date)
    }

    const monthEntries = Array.from(monthMap.entries()).map(([yearMonth, monthDates], index) => {
      const id = monthMap.size === 1 ? item.id : `${item.id}::${yearMonth}`
      const latestDate = monthDates.reduce((latest, value) => {
        const timestamp = parseTimelineDateTimestamp(value)
        return timestamp > latest.timestamp ? { value: normalizeTimelineDate(value), timestamp } : latest
      }, { value: '', timestamp: 0 })
      const acquiredAt = latestDate.value || normalizeTimelineDate(item.acquiredAt)

      return {
        ...item,
        id,
        sourceId: item.id,
        acquiredAt,
        unitAcquiredAtList: [...monthDates],
        quantity: monthDates.length,
        timelineYearMonth: yearMonth,
        timelineQuantity: monthDates.length,
        priceNumber,
        totalValueNumber: priceNumber * monthDates.length,
        timelineSortTime: getLatestTimelineDateTimestamp(monthDates) || parseTimelineDateTimestamp(acquiredAt) || index
      }
    })

    entries.push(...monthEntries)
  }

  return entries
}

export function useHomeTimeline({
  goodsList,
  displayDensity,
  visibleTimelineMonthCount,
  getInitialVisibleTimelineMonths
}) {
  const timelineEntries = computed(() => (
    buildTimelineEntries(goodsList.value).sort((a, b) => {
      const timeDelta = (Number(b.timelineSortTime) || 0) - (Number(a.timelineSortTime) || 0)
      if (timeDelta !== 0) return timeDelta

      const monthDelta = String(b.timelineYearMonth || '').localeCompare(String(a.timelineYearMonth || ''))
      if (monthDelta !== 0) return monthDelta

      const sourceDelta = String(a.sourceId || a.id || '').localeCompare(String(b.sourceId || b.id || ''))
      if (sourceDelta !== 0) return sourceDelta

      return String(a.id || '').localeCompare(String(b.id || ''))
    })
  ))

  const timelineYearGroups = computed(() => {
    const yearGroups = []
    const yearMap = new Map()

    for (const item of timelineEntries.value) {
      if (!item.timelineYearMonth) continue
      const yearMonth = item.timelineYearMonth
      const year = yearMonth.slice(0, 4)
      let yearGroup = yearMap.get(year)

      if (!yearGroup) {
        yearGroup = {
          year,
          months: [],
          yearTotal: 0,
          yearCount: 0,
          monthMap: new Map()
        }
        yearMap.set(year, yearGroup)
        yearGroups.push(yearGroup)
      }

      let monthGroup = yearGroup.monthMap.get(yearMonth)
      if (!monthGroup) {
        monthGroup = {
          yearMonth,
          month: String(parseInt(yearMonth.slice(5, 7), 10)),
          count: 0,
          totalSpend: 0,
          items: []
        }
        yearGroup.monthMap.set(yearMonth, monthGroup)
        yearGroup.months.push(monthGroup)
      }

      monthGroup.items.push(item)
      monthGroup.count += Number(item.quantity) || 1
      monthGroup.totalSpend += (Number(item.priceNumber) || 0) * (Number(item.quantity) || 1)
      yearGroup.yearCount += Number(item.quantity) || 1
      yearGroup.yearTotal += (Number(item.priceNumber) || 0) * (Number(item.quantity) || 1)
    }

    return yearGroups.map(({ monthMap, ...yearGroup }) => yearGroup)
  })

  const allTimelineMonthCount = computed(() =>
    timelineYearGroups.value.reduce((sum, yearGroup) => sum + yearGroup.months.length, 0)
  )

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

  const timelineItemIndexById = computed(() => {
    const map = new Map()

    timelineEntries.value.forEach((item, index) => {
      map.set(item.id, index)
    })

    return map
  })

  const timelineEntryById = computed(() => {
    const map = new Map()

    timelineEntries.value.forEach((item) => {
      map.set(item.id, item)
    })

    return map
  })

  const timelineUnknownItemIds = computed(() =>
    new Set(
      timelineEntries.value
        .filter((item) => !item.timelineYearMonth)
        .map((item) => item.id)
    )
  )

  const visibleTimelineYearGroups = computed(() => {
    if (displayDensity.value !== 'timeline') return timelineYearGroups.value

    let remaining = visibleTimelineMonthCount.value || getInitialVisibleTimelineMonths()
    const groups = []

    for (const yearGroup of timelineYearGroups.value) {
      if (remaining <= 0) break
      const months = yearGroup.months.slice(0, remaining)
      if (months.length === 0) continue

      groups.push({
        ...yearGroup,
        yearCount: months.reduce((sum, month) => sum + month.count, 0),
        yearTotal: months.reduce((sum, month) => sum + month.totalSpend, 0),
        months
      })
      remaining -= months.length
    }

    return groups
  })

  const timelineUnknown = computed(() =>
    timelineEntries.value.filter((item) => !item.timelineYearMonth)
  )

  const showVisibleTimelineUnknown = computed(() =>
    timelineUnknown.value.length > 0 && visibleTimelineMonthCount.value >= allTimelineMonthCount.value
  )

  return {
    timelineYearGroups,
    allTimelineMonthCount,
    timelineMonthIndexByItemId,
    timelineItemIndexById,
    timelineEntryById,
    timelineUnknownItemIds,
    visibleTimelineYearGroups,
    timelineUnknown,
    showVisibleTimelineUnknown
  }
}
