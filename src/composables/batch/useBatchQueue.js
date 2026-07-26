// @ts-check
import { computed, ref, shallowRef, watch } from 'vue'
import { createGoodsImageId } from '@/utils/goods/images'

const STORAGE_KEY = 'batch-queue-data'
const STORAGE_KEY_DEFAULTS = 'batch-queue-defaults'

// 模块级共享状态
const queue = shallowRef([])
const defaults = ref({ ip: '', category: '', price: '' })

// 从 sessionStorage 恢复数据
function restoreFromStorage() {
  try {
    const saved = sessionStorage.getItem(STORAGE_KEY)
    if (saved) {
      const data = JSON.parse(saved)
      queue.value = data.map(item => ({
        ...item,
        dirtyFields: new Set(item.dirtyFields || [])
      }))
    }
    const savedDefaults = sessionStorage.getItem(STORAGE_KEY_DEFAULTS)
    if (savedDefaults) {
      defaults.value = JSON.parse(savedDefaults)
    }
  } catch (e) {
    console.warn('[useBatchQueue] restore failed', e)
  }
}

// 保存到 sessionStorage
function saveToStorage() {
  try {
    const data = queue.value.map(item => ({
      ...item,
      dirtyFields: Array.from(item.dirtyFields || [])
    }))
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    sessionStorage.setItem(STORAGE_KEY_DEFAULTS, JSON.stringify(defaults.value))
  } catch (e) {
    console.warn('[useBatchQueue] save failed', e)
  }
}

// 清除存储
function clearStorage() {
  try {
    sessionStorage.removeItem(STORAGE_KEY)
    sessionStorage.removeItem(STORAGE_KEY_DEFAULTS)
  } catch (e) {
    // ignore
  }
}

// 初始化时恢复
restoreFromStorage()

// 监听变化自动保存
watch(queue, saveToStorage, { deep: false })
watch(defaults, saveToStorage, { deep: true })

const completedCount = computed(() =>
  queue.value.filter((item) => item.dirtyFields.size > 0).length
)

const totalCount = computed(() => queue.value.length)

const canSaveAll = computed(() =>
  queue.value.length > 0 && queue.value.every((item) => item.name?.trim())
)

/**
 * 初始化队列
 * @param {Array} images
 */
function initQueue(images) {
  queue.value = images.map((img) => ({
    id: createGoodsImageId(),
    imageUri: img.uri || img.localPath || '',
    name: '',
    category: '',
    ip: '',
    charactersText: '',
    price: '',
    date: new Date().toISOString().split('T')[0],
    dirtyFields: new Set()
  }))
}

/**
 * 更新队列项
 * @param {string} id
 * @param {Record<string, any>} data
 */
function updateItem(id, data) {
  const idx = queue.value.findIndex((i) => i.id === id)
  if (idx === -1) return
  const item = { ...queue.value[idx] }
  Object.assign(item, data)
  const next = [...queue.value]
  next[idx] = item
  queue.value = next
}

/**
 * 标记字段为已修改
 * @param {string} id
 * @param {string} field
 */
function markDirty(id, field) {
  const idx = queue.value.findIndex((i) => i.id === id)
  if (idx === -1) return
  const item = { ...queue.value[idx], dirtyFields: new Set(queue.value[idx].dirtyFields) }
  item.dirtyFields.add(field)
  const next = [...queue.value]
  next[idx] = item
  queue.value = next
}

/**
 * 从队列中移除
 * @param {string} id
 */
function removeItem(id) {
  queue.value = queue.value.filter((i) => i.id !== id)
}

/**
 * 追加图片到队列
 * @param {Array} images
 */
function appendImages(images) {
  const newItems = images.map((img) => ({
    id: createGoodsImageId(),
    imageUri: img.uri || img.localPath || '',
    name: '',
    category: defaults.value.category || '',
    ip: defaults.value.ip || '',
    charactersText: '',
    price: defaults.value.price || '',
    date: new Date().toISOString().split('T')[0],
    dirtyFields: new Set()
  }))
  queue.value = [...queue.value, ...newItems]
}

/**
 * 应用默认值到所有未修改的项
 * @param {{ ip?: string, category?: string, price?: string }} newDefaults
 */
function applyDefaults(newDefaults) {
  defaults.value = {
    ip: newDefaults.ip || '',
    category: newDefaults.category || '',
    price: newDefaults.price || ''
  }
  queue.value = queue.value.map((item) => {
    const updated = { ...item }
    if (!item.dirtyFields.has('ip') && newDefaults.ip) updated.ip = newDefaults.ip
    if (!item.dirtyFields.has('category') && newDefaults.category) updated.category = newDefaults.category
    if (!item.dirtyFields.has('price') && newDefaults.price && !item.price) updated.price = newDefaults.price
    return updated
  })
}

/**
 * 获取指定项
 * @param {string} id
 * @returns {Object|undefined}
 */
function getItem(id) {
  return queue.value.find((i) => i.id === id)
}

/**
 * 批量保存
 * @param {Object} goodsStore
 * @param {boolean} isWishlist
 */
async function saveAll(goodsStore, isWishlist) {
  const items = queue.value.map((item) => ({
    name: item.name,
    price: item.price ? parseFloat(item.price) : 0,
    ip: item.ip,
    category: item.category,
    characters: item.charactersText
      ? item.charactersText.split(/[,，]/).filter(Boolean)
      : [],
    images: [{ id: item.id, uri: item.imageUri }],
    collectStatus: isWishlist ? 'wishlist' : 'unacquired',
    acquiredAt: isWishlist ? null : item.date
  }))
  await goodsStore.addMultipleGoods(items)
  // 保存成功后清除存储
  clearStorage()
}

/**
 * 清空队列
 */
function clearQueue() {
  queue.value = []
  defaults.value = { ip: '', category: '', price: '' }
  clearStorage()
}

/**
 * 使用批量队列状态
 */
export function useBatchQueue() {
  return {
    queue,
    defaults,
    completedCount,
    totalCount,
    canSaveAll,
    initQueue,
    updateItem,
    markDirty,
    removeItem,
    appendImages,
    applyDefaults,
    getItem,
    saveAll,
    clearQueue
  }
}
