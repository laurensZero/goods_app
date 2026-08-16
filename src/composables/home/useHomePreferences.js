import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { HOME_MOTION } from '@/constants/homeMotion'
import { normalizeHomeSortMode } from '@/utils/goods/homeSort'

const DEFAULT_STORAGE_KEYS = {
  displayMode: 'goods-app:home-display-mode',
  gridDensity: 'goods-app:home-grid-density',
  sortDirection: 'goods-app:home-sort-direction',
  sortMode: 'goods-app:home-sort-mode',
  groupDisplayMode: 'goods-app:home-group-display-mode'
}

export const GROUP_DISPLAY_MODES = {
  pinned: 'pinned',
  chronological: 'chronological',
  hidden: 'hidden'
}

const DEFAULT_DENSITY_MODES = [
  { value: 'comfortable', label: '舒适', columns: 2 },
  { value: 'standard', label: '标准', columns: 3 },
  { value: 'compact', label: '紧凑', columns: 4 }
]

const densityColumnsMap = Object.fromEntries(DEFAULT_DENSITY_MODES.map((mode) => [mode.value, mode.columns]))

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

export function useHomePreferences(windowWidth, options = {}) {
  const {
    storageKeys = DEFAULT_STORAGE_KEYS,
    allowTimeline = true,
    t = null
  } = options
  const displayModeStorageKey = storageKeys.displayMode || storageKeys.gridDensity
  const densityModes = computed(() =>
    t
      ? DEFAULT_DENSITY_MODES.map((mode) => ({
          ...mode,
          label: t(`home.density.${mode.value}`)
        }))
      : DEFAULT_DENSITY_MODES
  )
  const displayDensity = ref('comfortable')
  const sortDirection = ref('desc')
  const sortMode = ref('createdAt')
  const groupDisplayMode = ref(GROUP_DISPLAY_MODES.pinned)
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
    if (!allowTimeline) return
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

  function setSortMode(nextMode) {
    const normalized = normalizeHomeSortMode(nextMode)
    if (sortMode.value === normalized) return

    triggerSortAnimation()
    sortMode.value = normalized
  }

  function setGroupDisplayMode(mode) {
    if (!GROUP_DISPLAY_MODES[mode] || groupDisplayMode.value === mode) return
    groupDisplayMode.value = mode
  }

  function restoreDisplayDensity() {
    const storedDisplayMode = localStorage.getItem(displayModeStorageKey)
    if (allowTimeline && storedDisplayMode === 'timeline') {
      const storedGridDensity = localStorage.getItem(storageKeys.gridDensity)
      if (storedGridDensity && DEFAULT_DENSITY_MODES.find((mode) => mode.value === storedGridDensity)) {
        lastNonTimelineDensity = storedGridDensity
      }
      displayDensity.value = 'timeline'
      return
    }

    const storedDensity = storedDisplayMode || localStorage.getItem(storageKeys.gridDensity)
    if (!storedDensity || !DEFAULT_DENSITY_MODES.find((mode) => mode.value === storedDensity)) return

    lastNonTimelineDensity = storedDensity
    displayDensity.value = storedDensity
  }

  function restoreSortDirection() {
    const storedSortDirection = localStorage.getItem(storageKeys.sortDirection)
    if (storedSortDirection === 'asc' || storedSortDirection === 'desc') {
      sortDirection.value = storedSortDirection
    }
  }

  function restoreSortMode() {
    sortMode.value = normalizeHomeSortMode(localStorage.getItem(storageKeys.sortMode))
  }

  function restoreGroupDisplayMode() {
    const stored = localStorage.getItem(storageKeys.groupDisplayMode)
    if (GROUP_DISPLAY_MODES[stored]) {
      groupDisplayMode.value = stored
    }
  }

  function restoreHomePreferences() {
    restoreSortMode()
    restoreSortDirection()
    restoreDisplayDensity()
    restoreGroupDisplayMode()
  }

  // Restore synchronously during setup so keep-alive pages don't flash
  // the default grid mode for one frame before switching back to timeline.
  restoreHomePreferences()

  watch(displayDensity, (value) => {
    localStorage.setItem(displayModeStorageKey, value)
    if (value === 'timeline') return
    lastNonTimelineDensity = value
    localStorage.setItem(storageKeys.gridDensity, value)
  })

  watch(sortDirection, (value) => {
    localStorage.setItem(storageKeys.sortDirection, value)
  })

  watch(sortMode, (value) => {
    localStorage.setItem(storageKeys.sortMode, value)
  })

  watch(groupDisplayMode, (value) => {
    localStorage.setItem(storageKeys.groupDisplayMode, value)
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
    sortMode,
    groupDisplayMode,
    isDensityAnimating,
    isSortAnimating,
    getResponsiveCols,
    setDisplayDensity,
    toggleTimelineMode,
    toggleSortDirection,
    setSortMode,
    setGroupDisplayMode,
    restoreDisplayDensity,
    restoreSortDirection,
    restoreSortMode,
    restoreGroupDisplayMode,
    restoreHomePreferences,
    clearDensityAnimationTimer,
    clearSortAnimationTimer
  }
}
