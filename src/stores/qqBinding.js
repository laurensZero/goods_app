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
  setMihoyoEnabled,
  setMihoyoShops,
  setShipReminderOffsets,
  requestShipReminderBackfill,
  unbindQQ,
} from '@/services/qqService'
import { readPersisted, writePersisted, removePersisted } from '@/utils/platform/storage'

// 本地键：定时抢购成功 → QQ 提醒开关（纯客户端偏好，见 CheckoutView 使用）
const CHECKOUT_NOTIFY_KEY = 'goods_qq_checkout_notify'
// 本地键：绑定状态缓存（按 userId 隔离；账号管理优先读缓存再后台刷新）
const BINDING_CACHE_KEY = 'goods_qq_binding_cache'

export const useQQBindingStore = defineStore('qqBinding', () => {
  const binding = ref(null)
  const isInitialized = ref(false)
  const isLoading = ref(false)
  // 定时抢购成功 → QQ 提醒开关（本地偏好，需绑定 QQ 才可用）
  const checkoutNotify = ref(false)

  // 便捷状态
  const isBound = computed(() => binding.value?.status === 'active')
  const isPending = computed(() => binding.value?.status === 'pending')
  const isEnabled = computed(() => isBound.value && !!binding.value?.enabled)
  // 米游铺上新开关：绑定且主动开启才收（服务端 user_qq_bindings.mihoyo_enabled，默认关闭）
  const isMihoyoEnabled = computed(() => isBound.value && !!binding.value?.mihoyo_enabled)
  // 用户自选的米游铺监听店铺（空数组 = 全不选）
  const mihoyoShops = computed(() =>
    Array.isArray(binding.value?.mihoyo_shops) ? binding.value.mihoyo_shops : []
  )
  // 未发货超时提醒天数（空数组 = 关闭；服务端按这些天数给待发货商品入队提醒）
  const shipReminderOffsets = computed(() =>
    Array.isArray(binding.value?.ship_reminder_offsets_days)
      ? binding.value.ship_reminder_offsets_days.map(Number).filter((d) => Number.isInteger(d))
      : []
  )
  const bindCode = computed(() => binding.value?.bind_code || '')
  const qqNickname = computed(() => binding.value?.qq_nickname || '')

  /** 读取当前用户 id 下的本地绑定缓存（跨账号不串用） */
  async function loadCachedBinding(userId) {
    if (!userId) return null
    try {
      const raw = await readPersisted(BINDING_CACHE_KEY)
      if (!raw) return null
      const parsed = JSON.parse(raw)
      if (!parsed || parsed.userId !== userId) return null
      return parsed.binding || null
    } catch {
      return null
    }
  }

  /** 写入绑定缓存；binding 为 null 表示未绑定 */
  async function saveCachedBinding(userId, nextBinding) {
    if (!userId) return
    try {
      await writePersisted(BINDING_CACHE_KEY, JSON.stringify({ userId, binding: nextBinding }))
    } catch {
      // 缓存失败不影响主流程
    }
  }

  /** 登出/换账号时清除缓存，避免残留上一账号状态 */
  async function clearCachedBinding() {
    try {
      await removePersisted(BINDING_CACHE_KEY)
    } catch {
      // ignore
    }
  }

  /**
   * 初始化：优先读本地缓存立即展示，再后台拉取服务端刷新。
   * 未登录时置空并标记完成，避免每次重拉。
   */
  async function init() {
    if (isInitialized.value) return
    isInitialized.value = true
    checkoutNotify.value = (await readPersisted(CHECKOUT_NOTIFY_KEY, '0')) === '1'
    const authStore = useAuthStore()
    if (!authStore.isLoggedIn) {
      binding.value = null
      return
    }
    // 1) 缓存优先：已绑定账号立刻显示已绑定态，不等待网络
    const cached = await loadCachedBinding(authStore.user?.id)
    if (cached !== undefined) binding.value = cached
    // 2) 后台静默刷新（网络失败时保留缓存，不抹掉已绑定展示）
    isLoading.value = true
    try {
      const fresh = await getQQBinding()
      binding.value = fresh
      await saveCachedBinding(authStore.user?.id, fresh)
    } catch (e) {
      console.warn('[qq-binding] init failed:', e.message)
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
      await saveCachedBinding(useAuthStore().user?.id, binding.value)
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
      await saveCachedBinding(useAuthStore().user?.id, binding.value)
    } finally {
      isLoading.value = false
    }
  }

  /**
   * 设置 QQ 推送开关，并同步到服务端。
   */
  async function toggleEnabled(enabled) {
    await setQQEnabled(enabled)
    if (binding.value) {
      binding.value.enabled = !!enabled
      await saveCachedBinding(useAuthStore().user?.id, binding.value)
    }
  }

  /**
   * 设置「米游铺上新」推送开关，并同步到服务端。
   * 乐观更新：本地立即生效，网络失败回滚。
   */
  async function toggleMihoyoEnabled(enabled) {
    const next = !!enabled
    const prev = !!binding.value?.mihoyo_enabled
    if (binding.value) binding.value.mihoyo_enabled = next
    try {
      await setMihoyoEnabled(next)
      await saveCachedBinding(useAuthStore().user?.id, binding.value)
    } catch (e) {
      if (binding.value) binding.value.mihoyo_enabled = prev
      throw e
    }
  }

  /**
   * 设置米游铺监听的店铺集合，并同步到服务端。
   * 乐观更新：本地立即生效，网络失败回滚。
   * @param {string[]} shops - 店铺码数组（空 = 全不选）
   */
  async function toggleMihoyoShops(shops) {
    const next = Array.isArray(shops) ? [...shops] : []
    const prev = Array.isArray(binding.value?.mihoyo_shops)
      ? [...binding.value.mihoyo_shops]
      : []
    if (binding.value) binding.value.mihoyo_shops = next
    try {
      await setMihoyoShops(next)
      await saveCachedBinding(useAuthStore().user?.id, binding.value)
    } catch (e) {
      if (binding.value) binding.value.mihoyo_shops = prev
      throw e
    }
  }

  /**
   * 切换「未发货超时提醒」的一个天数档位，并同步到服务端。
   * 乐观更新：本地立即生效，网络失败回滚；成功后请求服务端补扫存量待发货商品。
   * @param {number} day - 天数档位，如 30
   */
  async function toggleShipReminderOffset(day) {
    const current = shipReminderOffsets.value
    const next = current.includes(day)
      ? current.filter((d) => d !== day)
      : [...current, day]
    const prev = [...current]
    if (binding.value) binding.value.ship_reminder_offsets_days = next
    try {
      await setShipReminderOffsets(next)
      // 让超期存量 / 新增档位立即生效：服务端重建该用户全部待发货商品的任务
      await requestShipReminderBackfill()
      await saveCachedBinding(useAuthStore().user?.id, binding.value)
    } catch (e) {
      if (binding.value) binding.value.ship_reminder_offsets_days = prev
      throw e
    }
  }

  /**
   * 解绑。
   */
  async function doUnbind() {
    isLoading.value = true
    try {
      await unbindQQ()
      binding.value = null
      await clearCachedBinding()
    } finally {
      isLoading.value = false
    }
  }

  /**
   * 设置「定时抢购成功」QQ 提醒开关（本地偏好，同步持久化）。
   */
  async function toggleCheckoutNotify(enabled) {
    const next = !!enabled
    checkoutNotify.value = next
    await writePersisted(CHECKOUT_NOTIFY_KEY, next ? '1' : '0')
  }

  /**
   * 登出/切换账号时重置状态，下次 init 会重新拉取。
   */
  function reset() {
    binding.value = null
    isInitialized.value = false
    isLoading.value = false
    clearCachedBinding()
  }

  return {
    binding,
    isInitialized,
    isLoading,
    isBound,
    isPending,
    isEnabled,
    isMihoyoEnabled,
    mihoyoShops,
    shipReminderOffsets,
    bindCode,
    qqNickname,
    checkoutNotify,
    init,
    startBinding,
    refreshBinding,
    toggleEnabled,
    toggleMihoyoEnabled,
    toggleMihoyoShops,
    toggleShipReminderOffset,
    toggleCheckoutNotify,
    doUnbind,
    reset,
  }
})
