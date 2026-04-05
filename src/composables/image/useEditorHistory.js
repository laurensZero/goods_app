import { ref, computed } from 'vue'

const MAX_HISTORY = 30

export function useEditorHistory() {
  const stack = ref([])
  const cursor = ref(-1)

  const canUndo = computed(() => cursor.value > 0)
  const canRedo = computed(() => cursor.value < stack.value.length - 1)
  const historyCount = computed(() => stack.value.length)

  function snapshot(state) {
    const entry = {
      brightness: Number(state.brightness) || 0,
      contrast: Number(state.contrast) || 0,
      flipX: Number(state.flipX) || 1,
      cropData: state.cropData ? JSON.parse(JSON.stringify(state.cropData)) : null,
      rotation: Number(state.rotation) || 0,
      cutoutPreviewUrl: state.cutoutPreviewUrl || '',
      cutoutMaskUrl: state.cutoutMaskUrl || '',
      cutoutPreparedImageUrl: state.cutoutPreparedImageUrl || '',
      cutoutMeta: state.cutoutMeta ? JSON.parse(JSON.stringify(state.cutoutMeta)) : null,
      hasCutout: Boolean(state.hasCutout),
      timestamp: Date.now()
    }

    stack.value = stack.value.slice(0, cursor.value + 1)
    stack.value.push(entry)

    if (stack.value.length > MAX_HISTORY) {
      stack.value.shift()
    }

    cursor.value = stack.value.length - 1
  }

  function undo() {
    if (!canUndo.value) return null
    cursor.value--
    return getCurrent()
  }

  function redo() {
    if (!canRedo.value) return null
    cursor.value++
    return getCurrent()
  }

  function getCurrent() {
    if (cursor.value < 0 || cursor.value >= stack.value.length) return null
    return { ...stack.value[cursor.value] }
  }

  function reset() {
    stack.value = []
    cursor.value = -1
  }

  return {
    canUndo,
    canRedo,
    historyCount,
    snapshot,
    undo,
    redo,
    getCurrent,
    reset
  }
}
