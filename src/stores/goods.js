/**
 * stores/goods.js
 * 使用 Pinia 管理谷子列表的全局状态。
 * 数据通过 localStorage 持久化，刷新后不丢失。
 *
 * 物品字段结构：
 * {
 *   id: string          唯一标识（时间戳字符串）
 *   name: string        名称
 *   category: string    分类
 *   price: string       购入价格
 *   acquiredAt: string  购入日期（YYYY-MM-DD）
 *   image: string       图片 URL（暂留空）
 *   note: string        备注
 * }
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { getItems, addItem, saveItems } from '@/utils/db'

export const useGoodsStore = defineStore('goods', () => {
  // -------- State --------
  /** 启动时为空，initDB + init() 完成后填充 */
  const list = ref([])
  const isReady = ref(false)

  // -------- Getters --------
  const getById = computed(() => (id) => list.value.find((item) => item.id === id))

  // -------- Actions --------

  /** 从 SQLite 加载全量数据，在 main.js 启动阶段调用 */
  async function init() {
    list.value = await getItems()
    isReady.value = true
  }

  async function addGoods(data) {
    const newItem = { ...data, id: String(Date.now()) }
    list.value.unshift(newItem) // 乐观更新：立即插到列表头部
    await addItem(newItem)
  }

  async function updateGoods(id, data) {
    const idx = list.value.findIndex((item) => item.id === id)
    if (idx !== -1) {
      list.value[idx] = { ...list.value[idx], ...data }
      await addItem(list.value[idx])
    }
  }

  async function removeGoods(id) {
    list.value = list.value.filter((item) => item.id !== id)
    await saveItems(list.value)
  }

  /** 路由回到首页时重新同步 SQLite 数据 */
  async function refreshList() {
    list.value = await getItems()
  }

  return { list, isReady, getById, init, addGoods, updateGoods, removeGoods, refreshList }
})
