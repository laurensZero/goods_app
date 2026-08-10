// src/stores/mihoyoStockMonitor.js
// 米游铺库存有货监控 —— Pinia store
//
// 管理 mihoyo_monitor_goods 的客户端状态：监控列表、添加/移除、手动重检。
// 底层读写见 src/services/mihoyoStockMonitorService.js；有货检测在服务端完成。

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useAuthStore } from '@/stores/auth'
import {
  listMonitoredGoods,
  addMonitoredGoods,
  removeMonitoredGoods,
  checkGoodsAvailability,
  updateMonitoredGoodsStatus,
} from '@/services/mihoyoStockMonitorService'

// 手动全量重检时相邻两个商品的请求间隔：逐个串行拉米游铺 detail，降低触发接口限流概率
const RECHECK_INTERVAL_MS = 600
// 手动重检的冷却时间：点击「刷新」后 RECHECK_COOLDOWN_MS 内不能再触发全量重检
const RECHECK_COOLDOWN_MS = 60_000

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export const useMihoyoStockMonitorStore = defineStore('mihoyoStockMonitor', () => {
  const items = ref([])
  const isInitialized = ref(false)
  const isLoading = ref(false)
  const rechecking = ref(false)
  const lastRecheckAt = ref(0)

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
        // 即时检测结果回写服务端，避免刷新列表后因服务端尚未扫描而一直显示“检测中”
        void updateMonitoredGoodsStatus(row.id, {
          in_stock: row.in_stock,
          stock_count: row.stock_count,
          price_cents: row.price_cents,
          sku_name: row.sku_name,
          last_checked_at: row.last_checked_at,
        }).catch(() => {})
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
    rechecking.value = false
    lastRecheckAt.value = 0
  }

  /**
   * 手动重检所有监控商品：逐个调米游铺 detail 接口检测是否有货，
   * 就地刷新列表快照并回写服务端（与添加时的即时检测同一判定逻辑）。
   * 串行执行、请求间隔 RECHECK_INTERVAL_MS；两次全量重检之间受冷却限制。
   * @returns {Promise<{rateLimited: boolean, checked: number, changed: number}>}
   */
  async function recheckAll() {
    if (rechecking.value) return { rateLimited: true, checked: 0, changed: 0 }
    if (Date.now() - lastRecheckAt.value < RECHECK_COOLDOWN_MS) {
      return { rateLimited: true, checked: 0, changed: 0 }
    }
    lastRecheckAt.value = Date.now()
    rechecking.value = true
    let checked = 0
    let changed = 0
    try {
      const snapshot = [...items.value]
      for (const item of snapshot) {
        const status = await checkGoodsAvailability(item.goods_id, item.sku_key).catch(() => null)
        if (status) {
          const prevInStock = !!item.in_stock
          Object.assign(item, {
            in_stock: status.available,
            price_cents: Number(status.priceCents) || item.price_cents || 0,
            stock_count: status.available ? Math.max(0, Number(status.stock) || 0) : 0,
            last_checked_at: new Date().toISOString(),
          })
          // SKU 文案会随商品改款变化，用解析出的当前名覆盖
          if (item.sku_key && status.skuName && status.skuName !== item.sku_name) {
            item.sku_name = status.skuName
          }
          if (prevInStock !== status.available) changed += 1
          // 结果回写服务端，避免其它端刷新列表看到过期的「检测中」
          void updateMonitoredGoodsStatus(item.id, {
            in_stock: item.in_stock,
            stock_count: item.stock_count,
            price_cents: item.price_cents,
            sku_name: item.sku_name,
            last_checked_at: item.last_checked_at,
          }).catch(() => {})
        }
        checked += 1
        if (checked < snapshot.length) await sleep(RECHECK_INTERVAL_MS)
      }
    } finally {
      rechecking.value = false
    }
    return { rateLimited: false, checked, changed }
  }

  /**
   * 距离下一次允许手动重检的剩余秒数（0 = 现在可以重检）。
   * @returns {number}
   */
  function getRecheckCooldownRemaining() {
    const remain = lastRecheckAt.value + RECHECK_COOLDOWN_MS - Date.now()
    return remain > 0 ? Math.ceil(remain / 1000) : 0
  }

  return {
    items,
    isInitialized,
    isLoading,
    rechecking,
    count,
    load,
    add,
    remove,
    reset,
    recheckAll,
    getRecheckCooldownRemaining,
  }
})
