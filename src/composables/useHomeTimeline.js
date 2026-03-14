import { computed } from 'vue'

export function useHomeTimeline({
  goodsList,
  displayDensity,
  visibleTimelineMonthCount,
  getInitialVisibleTimelineMonths
}) {
  const timelineYearGroups = computed(() => {
    const yearGroups = []
    const yearMap = new Map()

    for (const item of goodsList.value) {
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
      monthGroup.count += 1
      monthGroup.totalSpend += item.priceNumber
      yearGroup.yearCount += 1
      yearGroup.yearTotal += item.priceNumber
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

    goodsList.value.forEach((item, index) => {
      map.set(item.id, index)
    })

    return map
  })

  const timelineUnknownItemIds = computed(() =>
    new Set(
      goodsList.value
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
    goodsList.value.filter((item) => !item.timelineYearMonth)
  )

  const showVisibleTimelineUnknown = computed(() =>
    timelineUnknown.value.length > 0 && visibleTimelineMonthCount.value >= allTimelineMonthCount.value
  )

  return {
    timelineYearGroups,
    allTimelineMonthCount,
    timelineMonthIndexByItemId,
    timelineItemIndexById,
    timelineUnknownItemIds,
    visibleTimelineYearGroups,
    timelineUnknown,
    showVisibleTimelineUnknown
  }
}
