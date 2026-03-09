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

  async function updateMultipleGoods(ids, data) {
    let changed = false

    list.value = list.value.map((item) => {
      if (!ids.has(item.id)) return item
      changed = true
      return { ...item, ...data }
    })

    if (changed) {
      await saveItems(list.value)
    }
  }

  async function removeGoods(id) {
    list.value = list.value.filter((item) => item.id !== id)
    await saveItems(list.value)
  }

  /** 批量删除，ids 为 Set<string> */
  async function removeMultipleGoods(ids) {
    list.value = list.value.filter((item) => !ids.has(item.id))
    await saveItems(list.value)
  }

  /** 批量导入，自动剖除 _开头的元数据字段 */
  async function addMultipleGoods(items) {
    const now = Date.now()
    const newItems = items.map((d, i) => {
      const clean = Object.fromEntries(
        Object.entries(d).filter(([k]) => !k.startsWith('_'))
      )
      return { ...clean, id: String(now + i) }
    })
    // 逆序插入使最先加入的高位于列表顶部
    for (let i = newItems.length - 1; i >= 0; i--) {
      list.value.unshift(newItems[i])
    }
    await saveItems(list.value)
  }

  /** 路由回到首页时重新同步 SQLite 数据 */
  async function refreshList() {
    list.value = await getItems()
  }

  return {
    list,
    isReady,
    getById,
    init,
    addGoods,
    updateGoods,
    updateMultipleGoods,
    removeGoods,
    removeMultipleGoods,
    addMultipleGoods,
    refreshList
  }
})
