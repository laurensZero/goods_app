// src/stores/qqBinding.js
// QQ 推送绑定 —— Pinia store
//
// 管理 user_qq_bindings 的客户端状态：绑定状态（pending/active/unbound）、
// 推送开关、绑定码。底层读写见 src/services/qqService.js。
//
// 用法：登录后（或打开绑定页时）调用 init() 加载一次；绑定弹窗打开期间
// 轮询 refreshBinding() 直到 status 变为 active。

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useAuthStore } from '@/stores/auth'
import {
  requestBindCode,
  getQQBinding,
  setQQEnabled,
  unbindQQ,
} from '@/services/qqService'

export const useQQBindingStore = defineStore('qqBinding', () => {
  const binding = ref(null)
  const isInitialized = ref(false)
  const isLoading = ref(false)

  // 便捷状态
  const isBound = computed(() => binding.value?.status === 'active')
  const isPending = computed(() => binding.value?.status === 'pending')
  const isEnabled = computed(() => isBound.value && !!binding.value?.enabled)
  const bindCode = computed(() => binding.value?.bind_code || '')
  const qqNickname = computed(() => binding.value?.qq_nickname || '')

  /**
   * 初始化：拉取当前用户绑定状态。未登录时置空并标记完成，避免每次重拉。
   */
  async function init() {
    if (isInitialized.value) return
    isInitialized.value = true
    const authStore = useAuthStore()
    if (!authStore.isLoggedIn) {
      binding.value = null
      return
    }
    isLoading.value = true
    try {
      binding.value = await getQQBinding()
    } catch (e) {
      console.warn('[qq-binding] init failed:', e.message)
      binding.value = null
    } finally {
      isLoading.value = false
    }
  }

  /**
   * 发起绑定：生成新绑定码，返回给 UI 展示。
   */
  async function startBinding() {
    isLoading.value = true
    try {
      const code = await requestBindCode()
      binding.value = { status: 'pending', bind_code: code, enabled: true }
      return code
    } finally {
      isLoading.value = false
    }
  }

  /**
   * 刷新绑定状态（绑定弹窗轮询用）。
   */
  async function refreshBinding() {
    isLoading.value = true
    try {
      binding.value = await getQQBinding()
    } finally {
      isLoading.value = false
    }
  }

  /**
   * 设置 QQ 推送开关，并同步到服务端。
   */
  async function toggleEnabled(enabled) {
    await setQQEnabled(enabled)
    if (binding.value) binding.value.enabled = !!enabled
  }

  /**
   * 解绑。
   */
  async function doUnbind() {
    isLoading.value = true
    try {
      await unbindQQ()
      binding.value = null
    } finally {
      isLoading.value = false
    }
  }

  /**
   * 登出/切换账号时重置状态，下次 init 会重新拉取。
   */
  function reset() {
    binding.value = null
    isInitialized.value = false
    isLoading.value = false
  }

  return {
    binding,
    isInitialized,
    isLoading,
    isBound,
    isPending,
    isEnabled,
    bindCode,
    qqNickname,
    init,
    startBinding,
    refreshBinding,
    toggleEnabled,
    doUnbind,
    reset,
  }
})
