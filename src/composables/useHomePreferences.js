import { onBeforeUnmount, ref, watch } from 'vue'
import { HOME_MOTION } from '@/constants/homeMotion'

const GRID_DENSITY_STORAGE_KEY = 'goods-app:home-grid-density'
const SORT_DIRECTION_STORAGE_KEY = 'goods-app:home-sort-direction'
const TIMELINE_EXPANDED_ITEM_STORAGE_KEY = 'goods-app:home-timeline-expanded-item'

const densityModes = [
  { value: 'comfortable', label: '舒适', columns: 2 },
  { value: 'standard', label: '标准', columns: 3 },
  { value: 'compact', label: '紧凑', columns: 4 }
]

const densityColumnsMap = Object.fromEntries(densityModes.map((mode) => [mode.value, mode.columns]))

const densityBreakpoints = {
  comfortable: [
    { minWidth: 1200, cols: 5 },
    { minWidth: 900, cols: 4 },
    { minWidth: 600, cols: 3 },
    { minWidth: 0, cols: 2 }
  ],
  standard: [
    { minWidth: 1200, cols: 6 },
    { minWidth: 900, cols: 5 },
    { minWidth: 600, cols: 4 },
    { minWidth: 0, cols: 3 }
  ],
  compact: [
    { minWidth: 1200, cols: 8 },
    { minWidth: 900, cols: 6 },
    { minWidth: 600, cols: 5 },
    { minWidth: 0, cols: 4 }
  ]
}

export function useHomePreferences(windowWidth) {
  const displayDensity = ref('comfortable')
  const sortDirection = ref('desc')
  const expandedTimelineItemId = ref(null)
  const isDensityAnimating = ref(false)
  const isSortAnimating = ref(false)
  let densityAnimationTimer = 0
  let sortAnimationTimer = 0
  let lastNonTimelineDensity = 'comfortable'

  function getResponsiveCols(density) {
    const breakpoints = densityBreakpoints[density]
    if (!breakpoints) return densityColumnsMap[density] || 2
    return (breakpoints.find((item) => windowWidth.value >= item.minWidth) ?? breakpoints[breakpoints.length - 1]).cols
  }

  function clearDensityAnimationTimer() {
    if (!densityAnimationTimer) return
    window.clearTimeout(densityAnimationTimer)
    densityAnimationTimer = 0
  }

  function clearSortAnimationTimer() {
    if (!sortAnimationTimer) return
    window.clearTimeout(sortAnimationTimer)
    sortAnimationTimer = 0
  }

  function setDisplayDensity(mode) {
    if (!densityColumnsMap[mode] || displayDensity.value === mode) return

    clearDensityAnimationTimer()
    displayDensity.value = mode
    isDensityAnimating.value = true
    densityAnimationTimer = window.setTimeout(() => {
      isDensityAnimating.value = false
      densityAnimationTimer = 0
    }, HOME_MOTION.densityDurationMs)
  }

  function toggleTimelineMode() {
    if (displayDensity.value === 'timeline') {
      displayDensity.value = densityColumnsMap[lastNonTimelineDensity] ? lastNonTimelineDensity : 'comfortable'
      return
    }

    if (densityColumnsMap[displayDensity.value]) {
      lastNonTimelineDensity = displayDensity.value
    }
    displayDensity.value = 'timeline'
  }

  function triggerSortAnimation() {
    clearSortAnimationTimer()
    isSortAnimating.value = true
    sortAnimationTimer = window.setTimeout(() => {
      isSortAnimating.value = false
      sortAnimationTimer = 0
    }, HOME_MOTION.sortDurationMs)
  }

  function toggleSortDirection() {
    triggerSortAnimation()
    sortDirection.value = sortDirection.value === 'desc' ? 'asc' : 'desc'
  }

  function restoreDisplayDensity() {
    const storedDensity = localStorage.getItem(GRID_DENSITY_STORAGE_KEY)
    if (!storedDensity || !densityModes.find((mode) => mode.value === storedDensity)) return

    lastNonTimelineDensity = storedDensity
    displayDensity.value = storedDensity
  }

  function restoreSortDirection() {
    const storedSortDirection = localStorage.getItem(SORT_DIRECTION_STORAGE_KEY)
    if (storedSortDirection === 'asc' || storedSortDirection === 'desc') {
      sortDirection.value = storedSortDirection
    }
  }

  function restoreExpandedTimelineItem() {
    expandedTimelineItemId.value = localStorage.getItem(TIMELINE_EXPANDED_ITEM_STORAGE_KEY) || null
  }

  function restoreHomePreferences() {
    restoreSortDirection()
    restoreDisplayDensity()
    restoreExpandedTimelineItem()
  }

  function toggleExpandedTimelineItem(id) {
    expandedTimelineItemId.value = expandedTimelineItemId.value === id ? null : id
  }

  function clearExpandedTimelineItem() {
    expandedTimelineItemId.value = null
  }

  watch(displayDensity, (value) => {
    if (value === 'timeline') return
    lastNonTimelineDensity = value
    localStorage.setItem(GRID_DENSITY_STORAGE_KEY, value)
  })

  watch(sortDirection, (value) => {
    localStorage.setItem(SORT_DIRECTION_STORAGE_KEY, value)
  })

  watch(expandedTimelineItemId, (value) => {
    if (value) {
      localStorage.setItem(TIMELINE_EXPANDED_ITEM_STORAGE_KEY, value)
      return
    }

    localStorage.removeItem(TIMELINE_EXPANDED_ITEM_STORAGE_KEY)
  })

  onBeforeUnmount(() => {
    clearDensityAnimationTimer()
    clearSortAnimationTimer()
  })

  return {
    densityModes,
    densityColumnsMap,
    displayDensity,
    sortDirection,
    expandedTimelineItemId,
    isDensityAnimating,
    isSortAnimating,
    getResponsiveCols,
    setDisplayDensity,
    toggleTimelineMode,
    toggleSortDirection,
    toggleExpandedTimelineItem,
    clearExpandedTimelineItem,
    restoreDisplayDensity,
    restoreSortDirection,
    restoreExpandedTimelineItem,
    restoreHomePreferences,
    clearDensityAnimationTimer,
    clearSortAnimationTimer
  }
}
