// @ts-check
import { computed, ref, shallowRef, watch } from 'vue'
import { createGoodsImageId } from '@/utils/goods/images'
import { deleteManagedLocalImages } from '@/utils/image/localImage'
import { appLog } from '@/utils/logger'

const STORAGE_KEY = 'batch-queue-data'
const STORAGE_KEY_DEFAULTS = 'batch-queue-defaults'
const STORAGE_KEY_META = 'batch-queue-meta'

// 模块级共享状态
const queue = shallowRef([])
const defaults = ref({ ip: '', category: '', price: '' })
// sessionStorage 写入是否已降级（配额不足时剥离内联图片，仅保留元数据）
const persistDegraded = ref(false)
// 批次标识 + 是否愿望单：入口发起时确定，随队列一起持久化，避免依赖 history.state 跨页传递
const batchId = ref('')
const isWishlist = ref(false)

/**
 * 生成批次标识（批量流程入口发起时调用，写入路由 state 用于识别同一批图片）
 */
export function createBatchId() {
  return `batch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

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
    const savedMeta = sessionStorage.getItem(STORAGE_KEY_META)
    if (savedMeta) {
      const meta = JSON.parse(savedMeta)
      batchId.value = meta.batchId || ''
      isWishlist.value = meta.isWishlist === true
    }
  } catch (e) {
    console.warn('[useBatchQueue] restore failed', e)
  }
}

// 判断是否为存储配额不足错误（name/code 双重检测，覆盖 Chrome/Safari/旧版 Firefox）
function isQuotaExceededError(e) {
  if (!e) return false
  return e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e.code === 22 || e.code === 1014
}

// 序列化队列；stripInlineImages 为 true 时剥离 data: 内联图片（Web 端配额降级用，原生文件 URI 很小始终保留）
function serializeQueue(stripInlineImages) {
  return JSON.stringify(queue.value.map((item) => ({
    ...item,
    imageUri: stripInlineImages && String(item.imageUri || '').startsWith('data:') ? '' : item.imageUri,
    dirtyFields: Array.from(item.dirtyFields || [])
  })))
}

// 保存到 sessionStorage（配额不足时降级为剥离内联图片的写入，并置 persistDegraded 提示用户）
function saveToStorage() {
  try {
    sessionStorage.setItem(STORAGE_KEY, serializeQueue(false))
    persistDegraded.value = false
  } catch (e) {
    if (isQuotaExceededError(e)) {
      try {
        sessionStorage.setItem(STORAGE_KEY, serializeQueue(true))
      } catch (e2) {
        console.warn('[useBatchQueue] degraded save failed', e2)
      }
      persistDegraded.value = true
    } else {
      console.warn('[useBatchQueue] save failed', e)
    }
  }
  try {
    sessionStorage.setItem(STORAGE_KEY_DEFAULTS, JSON.stringify(defaults.value))
    sessionStorage.setItem(STORAGE_KEY_META, JSON.stringify({ batchId: batchId.value, isWishlist: isWishlist.value }))
  } catch (e) {
    console.warn('[useBatchQueue] save meta failed', e)
  }
}

// 清除存储
function clearStorage() {
  try {
    sessionStorage.removeItem(STORAGE_KEY)
    sessionStorage.removeItem(STORAGE_KEY_DEFAULTS)
    sessionStorage.removeItem(STORAGE_KEY_META)
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
 * 初始化队列（仅新批次调用；同一批次重挂载时应恢复已有队列而非重建）
 * @param {Array} images
 * @param {{ batchId?: string, isWishlist?: boolean }} [meta]
 */
function initQueue(images, meta = {}) {
  batchId.value = meta.batchId || ''
  isWishlist.value = meta.isWishlist === true
  const incomingUris = images.map((img) => img.uri || img.localPath || '')
  const currentUris = queue.value.map((item) => item.imageUri)
  // 页面刷新后 history.state 仍携带 batchImages，与已恢复队列一致时跳过重建以保留编辑进度
  if (
    currentUris.length > 0 &&
    currentUris.length === incomingUris.length &&
    currentUris.every((uri, idx) => uri === incomingUris[idx])
  ) {
    return
  }
  // 重建前清理上一次未保存队列复制的本地图片（如进程被杀后的残留）
  const incomingSet = new Set(incomingUris)
  const staleUris = currentUris.filter((uri) => uri && !incomingSet.has(uri))
  if (staleUris.length > 0) void deleteManagedLocalImages(staleUris)
  appLog('info', 'batch-queue: init', { batchId: batchId.value, count: images.length, isWishlist: isWishlist.value, staleCleaned: staleUris.length })
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
  const item = queue.value.find((i) => i.id === id)
  // 尚未保存为谷子，移除时同步删除已复制的本地文件
  if (item?.imageUri) void deleteManagedLocalImages([item.imageUri])
  queue.value = queue.value.filter((i) => i.id !== id)
}

/**
 * 替换队列项图片并删除被替换的本地文件
 * @param {string} id
 * @param {string} newUri
 */
function replaceItemImage(id, newUri) {
  const item = queue.value.find((i) => i.id === id)
  if (!item) return
  const oldUri = item.imageUri
  if (oldUri && oldUri !== newUri) void deleteManagedLocalImages([oldUri])
  updateItem(id, { imageUri: newUri })
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
 * 批量保存（是否愿望单取自批次状态）
 * @param {Object} goodsStore
 */
async function saveAll(goodsStore) {
  const wishlist = isWishlist.value
  const items = queue.value.map((item) => ({
    name: item.name,
    price: item.price ? parseFloat(item.price) : 0,
    ip: item.ip,
    category: item.category,
    characters: item.charactersText
      ? item.charactersText.split(/[,，]/).filter(Boolean)
      : [],
    images: [{ id: item.id, uri: item.imageUri }],
    isWishlist: wishlist,
    collectStatus: wishlist ? '' : '已拥有',
    acquiredAt: wishlist ? '' : item.date
  }))
  await goodsStore.addMultipleGoods(items)
  appLog('info', 'batch-queue: saved', { batchId: batchId.value, count: items.length, isWishlist: wishlist })
  // 保存成功后图片归商品所有：仅清空队列状态，不删除图片文件；
  // 保留 batchId 标记该批次已消费，避免历史返回时重建队列导致重复保存
  queue.value = []
  defaults.value = { ip: '', category: '', price: '' }
}

/**
 * 清空队列
 */
function clearQueue() {
  queue.value = []
  defaults.value = { ip: '', category: '', price: '' }
  batchId.value = ''
  isWishlist.value = false
  persistDegraded.value = false
  clearStorage()
}

/**
 * 放弃批量添加流程：删除已复制且未保存的本地图片并清空队列
 */
function discardQueue() {
  const uris = queue.value.map((item) => item?.imageUri).filter(Boolean)
  if (uris.length > 0) void deleteManagedLocalImages(uris)
  appLog('info', 'batch-queue: discarded', { batchId: batchId.value, count: queue.value.length })
  clearQueue()
}

/**
 * 使用批量队列状态
 */
export function useBatchQueue() {
  return {
    queue,
    defaults,
    batchId,
    isWishlist,
    persistDegraded,
    completedCount,
    totalCount,
    canSaveAll,
    initQueue,
    updateItem,
    markDirty,
    removeItem,
    replaceItemImage,
    appendImages,
    applyDefaults,
    getItem,
    saveAll,
    clearQueue,
    discardQueue
  }
}
