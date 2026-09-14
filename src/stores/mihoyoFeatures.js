import { defineStore } from 'pinia'
import { ref } from 'vue'

const STORAGE_KEY = 'goods_mihoyo_features'

/** 默认开启，避免升级用户功能突然消失 */
function readSavedEnabled() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (!saved) return true
    const parsed = JSON.parse(saved)
    if (parsed && typeof parsed === 'object' && 'enabled' in parsed) {
      return parsed.enabled !== false
    }
    return true
  } catch (e) {
    console.warn('[mihoyo-features] failed to load settings:', e)
    return true
  }
}

export const useMihoyoFeaturesStore = defineStore('mihoyoFeatures', () => {
  const enabled = ref(readSavedEnabled())

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ enabled: enabled.value }))
    } catch (e) {
      console.warn('[mihoyo-features] failed to save settings:', e)
    }
  }

  function setEnabled(value) {
    enabled.value = !!value
    persist()
  }

  return { enabled, setEnabled }
})
