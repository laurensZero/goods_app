import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

/**
 * 管理页底部编辑面板：可见性、软键盘 inset、输入框聚焦滚动。
 * open/close 的业务字段仍由各页面持有。
 *
 * @param {Object} options
 * @param {import('vue').Ref<string>} options.editingKey - 非空字符串表示编辑中
 * @param {import('vue').Ref<HTMLInputElement|null>} options.editInputRef
 * @param {() => void} options.closeEdit - 面板关闭时调用
 */
export function useEditSheet({ editingKey, editInputRef, closeEdit }) {
  const keyboardInset = ref(0)

  const editSheetStyle = computed(() => ({
    '--edit-sheet-keyboard-offset': `${keyboardInset.value}px`
  }))

  const editSheetVisible = computed({
    get: () => Boolean(editingKey.value),
    set: (v) => {
      if (!v) closeEdit()
    }
  })

  function updateKeyboardInset() {
    if (!editingKey.value) {
      keyboardInset.value = 0
      return
    }

    const viewport = window.visualViewport
    if (!viewport) {
      keyboardInset.value = 0
      return
    }

    keyboardInset.value = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)
  }

  function ensureEditInputVisible() {
    if (!editingKey.value) return
    editInputRef.value?.scrollIntoView?.({
      block: 'center',
      inline: 'nearest',
      behavior: 'smooth'
    })
  }

  function handleEditInputFocus() {
    window.setTimeout(() => {
      updateKeyboardInset()
      ensureEditInputVisible()
    }, 80)
    window.setTimeout(ensureEditInputVisible, 220)
  }

  onMounted(() => {
    window.visualViewport?.addEventListener('resize', updateKeyboardInset)
    window.visualViewport?.addEventListener('scroll', updateKeyboardInset)
  })

  onBeforeUnmount(() => {
    window.visualViewport?.removeEventListener('resize', updateKeyboardInset)
    window.visualViewport?.removeEventListener('scroll', updateKeyboardInset)
  })

  watch(editingKey, async (value) => {
    if (!value) {
      keyboardInset.value = 0
      return
    }

    await nextTick()
    updateKeyboardInset()
    window.setTimeout(ensureEditInputVisible, 120)
  })

  return {
    keyboardInset,
    editSheetStyle,
    editSheetVisible,
    handleEditInputFocus
  }
}
