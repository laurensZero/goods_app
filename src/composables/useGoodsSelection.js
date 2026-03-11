import { computed, ref, watch } from 'vue'

export function useGoodsSelection(items, options = {}) {
  const {
    historyKey = 'selectionMode',
    onExit = null,
    bodyClass = 'selection-active',
    getScrollTop = null,
    restoreScrollTop = null
  } = options

  const selectionMode = ref(false)
  const selectedIds = ref(new Set())
  let pendingRestoreScrollTop = null

  const allSelected = computed(() =>
    items.value.length > 0 && items.value.every((item) => selectedIds.value.has(item.id))
  )

  watch(selectionMode, (active) => {
    document.body.classList.toggle(bodyClass, active)
  })

  watch(items, (currentItems) => {
    const visibleIds = new Set(currentItems.map((item) => item.id))
    const next = new Set([...selectedIds.value].filter((id) => visibleIds.has(id)))

    if (next.size !== selectedIds.value.size) {
      selectedIds.value = next
    }
  })

  function clearSelectedIds() {
    selectedIds.value = new Set()
  }

  function enterSelectionMode(id) {
    if (!selectionMode.value) {
      selectionMode.value = true
      selectedIds.value = new Set([id])
      if (!history.state?.[historyKey]) {
        history.pushState({ ...(history.state || {}), [historyKey]: true }, '')
      }
      return
    }

    toggleSelect(id)
  }

  function toggleSelect(id) {
    const next = new Set(selectedIds.value)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    selectedIds.value = next
  }

  function toggleSelectAll() {
    if (items.value.length === 0) return

    if (allSelected.value) {
      clearSelectedIds()
      return
    }

    selectedIds.value = new Set(items.value.map((item) => item.id))
  }

  function exitSelectionModeQuiet() {
    onExit?.()
    selectionMode.value = false
    clearSelectedIds()
  }

  function restoreSelectionScrollTop(top) {
    if (top == null || !restoreScrollTop) return
    restoreScrollTop(top)
  }

  function exitSelectionMode() {
    const hadPushed = !!history.state?.[historyKey]
    const scrollTop = getScrollTop?.() ?? null

    if (hadPushed) {
      pendingRestoreScrollTop = scrollTop
      history.back()
      return
    }

    exitSelectionModeQuiet()
    restoreSelectionScrollTop(scrollTop)
  }

  function handleSelectionPopState() {
    if (!selectionMode.value && pendingRestoreScrollTop == null) return

    const scrollTop = pendingRestoreScrollTop ?? getScrollTop?.() ?? null
    pendingRestoreScrollTop = null

    if (selectionMode.value) {
      exitSelectionModeQuiet()
    }

    restoreSelectionScrollTop(scrollTop)
  }

  return {
    selectionMode,
    selectedIds,
    allSelected,
    enterSelectionMode,
    toggleSelect,
    toggleSelectAll,
    exitSelectionModeQuiet,
    exitSelectionMode,
    handleSelectionPopState
  }
}
