import { computed, ref, watch } from 'vue'

export function useGoodsSelection(items, options = {}) {
  const {
    historyKey = 'selectionMode',
    onExit = null,
    bodyClass = 'selection-active'
  } = options

  const selectionMode = ref(false)
  const selectedIds = ref(new Set())

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

  function exitSelectionMode() {
    const hadPushed = !!history.state?.[historyKey]
    exitSelectionModeQuiet()
    if (hadPushed) history.back()
  }

  function handleSelectionPopState() {
    if (!selectionMode.value) return
    exitSelectionModeQuiet()
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
