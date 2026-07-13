import { ref, watch } from 'vue'
import { normalizePresetSortMode } from '@/utils/presets/sort'

const STORAGE_KEYS = {
  categories: {
    mode: 'goods-app:preset-categories-sort-mode',
    direction: 'goods-app:preset-categories-sort-direction'
  },
  ips: {
    mode: 'goods-app:preset-ips-sort-mode',
    direction: 'goods-app:preset-ips-sort-direction'
  },
  characters: {
    mode: 'goods-app:preset-characters-sort-mode',
    direction: 'goods-app:preset-characters-sort-direction'
  }
}

/**
 * 预设管理页面的排序偏好 composable
 *
 * @param {'categories'|'ips'|'characters'} type
 * @returns {{ sortMode, sortDirection, toggleSortDirection, setSortMode, restorePreferences }}
 */
export function usePresetPreferences(type) {
  const keys = STORAGE_KEYS[type]
  if (!keys) {
    throw new Error(`[usePresetPreferences] Unknown type: ${type}`)
  }

  const sortMode = ref('default')
  const sortDirection = ref('asc')

  function restorePreferences() {
    const storedMode = localStorage.getItem(keys.mode)
    sortMode.value = normalizePresetSortMode(storedMode)

    const storedDirection = localStorage.getItem(keys.direction)
    if (storedDirection === 'asc' || storedDirection === 'desc') {
      sortDirection.value = storedDirection
    }
  }

  function toggleSortDirection() {
    sortDirection.value = sortDirection.value === 'desc' ? 'asc' : 'desc'
  }

  function setSortMode(mode) {
    sortMode.value = normalizePresetSortMode(mode)
  }

  // 自动持久化
  watch(sortMode, (value) => {
    localStorage.setItem(keys.mode, value)
  })

  watch(sortDirection, (value) => {
    localStorage.setItem(keys.direction, value)
  })

  // 立即恢复已存储的偏好
  restorePreferences()

  return {
    sortMode,
    sortDirection,
    toggleSortDirection,
    setSortMode,
    restorePreferences
  }
}
