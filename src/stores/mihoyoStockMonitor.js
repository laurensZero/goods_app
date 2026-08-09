// src/stores/mihoyoStockMonitor.js
// 米游铺库存有货监控 —— Pinia store
//
// 管理 mihoyo_monitor_goods 的客户端状态：监控列表、添加/移除。
// 底层读写见 src/services/mihoyoStockMonitorService.js；有货检测在服务端完成。

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useAuthStore } from '@/stores/auth'
import {
  listMonitoredGoods,
  addMonitoredGoods,
  removeMonitoredGoods,
  checkGoodsAvailability,
} from '@/services/mihoyoStockMonitorService'

export const useMihoyoStockMonitorStore = defineStore('mihoyoStockMonitor', () => {
  const items = ref([])
  const isInitialized = ref(false)
  const isLoading = ref(false)

  const count = computed(() => items.value.length)

  /**
   * 加载当前用户的监控列表（未登录时置空）。
   */
  async function load() {
    const authStore = useAuthStore()
    if (!authStore.isLoggedIn) {
      items.value = []
      isInitialized.value = true
      return
    }
    isLoading.value = true
    try {
      items.value = await listMonitoredGoods()
    } finally {
      isLoading.value = false
    }
    isInitialized.value = true
  }

  /**
   * 添加（或更新快照）一个监控商品，并插入列表头部。
   * 添加后立即调用米游铺 detail 接口做一次即时检测，反馈当前是否有货，
   * 避免等下一轮服务端扫描（≤1 分钟）才看到状态。
   * @param {Object} entry - 见 addMonitoredGoods
   * @returns {Promise<Object>}
   */
  async function add(entry) {
    const row = await addMonitoredGoods(entry)
    const existing = items.value.find((i) => i.id === row.id)
    if (existing) {
      Object.assign(existing, row)
    } else {
      items.value.unshift(row)
    }

    // 即时检测（失败静默忽略，服务端下一轮扫描兜底）
    if (!row.in_stock) {
      const status = await checkGoodsAvailability(row.goods_id, row.sku_key).catch(() => null)
      if (status) {
        Object.assign(row, {
          in_stock: status.available,
          price_cents: Number(status.priceCents) || row.price_cents || 0,
          stock_count: status.available ? Math.max(0, Number(status.stock) || 0) : 0,
          last_checked_at: new Date().toISOString(),
        })
        // SKU 文案会随商品改款变化，即时用解析出的当前名覆盖
        if (row.sku_key && status.skuName && status.skuName !== row.sku_name) {
          row.sku_name = status.skuName
        }
      }
    }
    return row
  }

  /**
   * 移除一个监控商品。
   * @param {string} id
   */
  async function remove(id) {
    await removeMonitoredGoods(id)
    items.value = items.value.filter((i) => i.id !== id)
  }

  /**
   * 登出/切换账号时重置，下次 load 会重新拉取。
   */
  function reset() {
    items.value = []
    isInitialized.value = false
    isLoading.value = false
  }

  return {
    items,
    isInitialized,
    isLoading,
    count,
    load,
    add,
    remove,
    reset,
  }
})
