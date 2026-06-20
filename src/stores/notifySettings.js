import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useTabletViewport } from '@/composables/useTabletViewport'

const STORAGE_KEY = 'goods_notify_settings'

// 默认通知设置
const DEFAULT_SETTINGS = {
  // 全局开关
  enabled: true,

  // 各类通知开关
  saleReminder: true,      // 开售提醒
  syncSuccess: true,       // 同步成功
  syncError: true,         // 同步失败
  syncing: true,           // 同步进行中
  updateAvailable: true,   // 更新可用

  // 通知显示设置
  position: 'top-right',   // top-right | top-center | top-left
  maxVisible: 3,           // 最多同时显示的通知数量
  autoClose: true,         // 自动关闭
  duration: 6000,          // 自动关闭时长（毫秒）

  // 声音和震动（仅移动端）
  sound: false,
  vibration: false,

  // Pad 端特有设置
  padPosition: 'top-right', // Pad 端通知位置
  padMaxVisible: 5,         // Pad 端最多同时显示数量
  padDuration: 8000,        // Pad 端自动关闭时长
}

export const useNotifySettingsStore = defineStore('notifySettings', () => {
  // 通知设置
  const settings = ref({ ...DEFAULT_SETTINGS })

  // 是否已加载
  const loaded = ref(false)

  // 检测是否是 Pad 端
  const { isTabletViewport } = useTabletViewport()

  // 获取当前设备类型对应的有效设置
  const effectiveSettings = computed(() => {
    const base = settings.value

    if (isTabletViewport.value) {
      // Pad 端使用 Pad 专属设置
      return {
        ...base,
        position: base.padPosition,
        maxVisible: base.padMaxVisible,
        duration: base.padDuration
      }
    }

    return base
  })

  // 是否启用了某类通知
  function isNotifyTypeEnabled(type) {
    if (!settings.value.enabled) return false

    const typeMap = {
      sale: 'saleReminder',
      syncing: 'syncing',
      'sync-error': 'syncError',
      success: 'syncSuccess',
      update: 'updateAvailable',
      warn: 'syncError'
    }

    const settingKey = typeMap[type]
    if (!settingKey) return true // 未知类型默认启用

    return settings.value[settingKey]
  }

  // 加载设置
  function loadSettings() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        const parsed = JSON.parse(saved)
        settings.value = { ...DEFAULT_SETTINGS, ...parsed }
      }
    } catch (e) {
      console.warn('Failed to load notify settings:', e)
    }
    loaded.value = true
  }

  // 保存设置
  function saveSettings() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings.value))
    } catch (e) {
      console.warn('Failed to save notify settings:', e)
    }
  }

  // 更新单个设置
  function updateSetting(key, value) {
    if (key in settings.value) {
      settings.value[key] = value
      saveSettings()
    }
  }

  // 批量更新设置
  function updateSettings(updates) {
    Object.assign(settings.value, updates)
    saveSettings()
  }

  // 重置为默认设置
  function resetToDefaults() {
    settings.value = { ...DEFAULT_SETTINGS }
    saveSettings()
  }

  // 初始化
  loadSettings()

  return {
    settings,
    loaded,
    isTabletViewport,
    effectiveSettings,
    isNotifyTypeEnabled,
    loadSettings,
    saveSettings,
    updateSetting,
    updateSettings,
    resetToDefaults
  }
})
