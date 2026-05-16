import { computed, ref } from 'vue'

export function useGoodsListCore(items, options = {}) {
  const {
    density,
    getResponsiveCols,
    rowHeightMap,
    getScrollEl,
    getViewportHeight,
    initialRenderRows = 6,
    rowGap = 12,
    overscanRows = 4,
    overscanRowsWide = 3,
    maxRenderCards = 96,
    getActiveScrollSource = null
  } = options

  const currentScrollTop = ref(0)
  const currentViewportHeight = ref(0)
  const visibleStartIndex = ref(0)
  const visibleRenderCount = ref(0)

  function getItemList() {
    return Array.isArray(items?.value) ? items.value : []
  }

  function getGridDensity() {
    const value = String(density?.value || 'standard')
    if (value === 'timeline') {
      return 'standard'
    }
    return value
  }

  function resolveViewportHeight(useFlipViewport = false, viewportHeight = 0) {
    if (Number.isFinite(viewportHeight) && viewportHeight > 0) {
      return viewportHeight
    }

    if (typeof getViewportHeight === 'function') {
      const resolved = Number(getViewportHeight({ useFlipViewport }) || 0)
      if (resolved > 0) return resolved
    }

    const el = getScrollEl?.()
    if (useFlipViewport && typeof getActiveScrollSource === 'function') {
      const activeSource = getActiveScrollSource()
      if (activeSource === 'window') {
        return window.innerHeight || document.documentElement.clientHeight || 800
      }
      if (el?.clientHeight) return el.clientHeight
    }

    return el?.clientHeight || window.innerHeight || document.documentElement.clientHeight || 800
  }

  const visibleEndIndex = computed(() => {
    const list = getItemList()
    if (String(density?.value || '') === 'timeline') {
      return list.length
    }
    return Math.min(list.length, visibleStartIndex.value + visibleRenderCount.value)
  })

  const visibleItems = computed(() => {
    const list = getItemList()
    if (String(density?.value || '') === 'timeline') {
      return list
    }
    return list.slice(visibleStartIndex.value, visibleEndIndex.value)
  })

  const gridStyle = computed(() => ({
    gridTemplateColumns: `repeat(${getResponsiveCols(density?.value || 'standard')}, minmax(0, 1fr))`
  }))

  const visibleHeadSpacerHeight = computed(() => {
    if (String(density?.value || '') === 'timeline') return 0

    const list = getItemList()
    if (!list.length) return 0

    const cols = getResponsiveCols(density?.value || 'standard')
    const headRows = Math.floor(visibleStartIndex.value / cols)
    if (headRows <= 0) return 0

    const rowHeight = rowHeightMap?.[density?.value] || rowHeightMap?.standard || 272
    return headRows * rowHeight + Math.max(0, headRows - 1) * rowGap
  })

  const visibleTailSpacerHeight = computed(() => {
    if (String(density?.value || '') === 'timeline') return 0

    const list = getItemList()
    const remainingItems = Math.max(0, list.length - visibleEndIndex.value)
    if (!remainingItems) return 0

    const cols = getResponsiveCols(density?.value || 'standard')
    const rowHeight = rowHeightMap?.[density?.value] || rowHeightMap?.standard || 272
    const remainingRows = Math.ceil(remainingItems / cols)
    return remainingRows > 0
      ? remainingRows * rowHeight + Math.max(0, remainingRows - 1) * rowGap
      : 0
  })

  function syncVisibleItems(scrollTop = 0, options = {}) {
    const normalizedTop = Math.max(0, Number(scrollTop) || 0)
    const list = getItemList()
    if (!list.length) {
      currentScrollTop.value = normalizedTop
      currentViewportHeight.value = resolveViewportHeight(!!options.useFlipViewport, options.viewportHeight)
      visibleStartIndex.value = 0
      visibleRenderCount.value = 0
      return
    }

    if (String(density?.value || '') === 'timeline') {
      currentScrollTop.value = normalizedTop
      currentViewportHeight.value = resolveViewportHeight(!!options.useFlipViewport, options.viewportHeight)
      visibleStartIndex.value = 0
      visibleRenderCount.value = list.length
      return
    }

    const viewportHeight = resolveViewportHeight(!!options.useFlipViewport, options.viewportHeight)
    const cols = getResponsiveCols(density?.value || 'standard')
    const rowHeight = rowHeightMap?.[density?.value] || rowHeightMap?.standard || 272
    const rowSpan = rowHeight + rowGap
    const overscan = cols >= 5 ? overscanRowsWide : overscanRows
    const viewportRows = Math.max(1, Math.ceil(Math.max(viewportHeight, rowHeight) / rowSpan))
    const startRow = Math.max(0, Math.floor(normalizedTop / rowSpan) - overscan)
    const renderRows = Math.max(initialRenderRows, viewportRows + overscan * 2)
    const startIndex = Math.min(list.length, startRow * cols)
    const remainingItems = Math.max(0, list.length - startIndex)
    const renderCount = Math.min(
      remainingItems,
      Math.min(
        maxRenderCards,
        Math.max(cols * 4, renderRows * cols)
      )
    )

    currentScrollTop.value = normalizedTop
    currentViewportHeight.value = viewportHeight
    visibleStartIndex.value = startIndex
    visibleRenderCount.value = renderCount
  }

  function syncVisibleItemsForActivatedRestore(scrollTop = 0) {
    const viewportHeight = resolveViewportHeight(true)
    const preloadTargetTop = Math.max(0, Number(scrollTop) || 0) + viewportHeight * 2.5
    syncVisibleItems(preloadTargetTop, { useFlipViewport: true, viewportHeight })
  }

  return {
    currentScrollTop,
    currentViewportHeight,
    visibleStartIndex,
    visibleRenderCount,
    visibleEndIndex,
    visibleItems,
    gridStyle,
    visibleHeadSpacerHeight,
    visibleTailSpacerHeight,
    syncVisibleItems,
    syncVisibleItemsForActivatedRestore,
    resolveViewportHeight
  }
}