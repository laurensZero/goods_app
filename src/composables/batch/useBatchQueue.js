// @ts-check
import { computed, ref, shallowRef, watch } from 'vue'
import { createGoodsImageId, buildCloudImageUri, parseCloudImageUri, parseStoragePublicImageUrl } from '@/utils/goods/images'
import { deleteManagedLocalImages, isLocalImageUri } from '@/utils/image/localImage'
import { appLog } from '@/utils/logger'
import { getAllBatchDrafts, getBatchDraft, getBatchDraftUpdatedAt, saveBatchDraft, saveBatchDrafts, softDeleteBatchDraft } from '@/utils/db'
import { createAutoPush } from '@/stores/storeCore'
import { buildSingleDraftItem, getSingleDraftEntry, SINGLE_DRAFT_FORM_KEY } from '@/utils/batch/singleDraft'

/** @typedef {'collection' | 'wishlist'} BatchDraftSlot */

export const BATCH_DRAFT_SLOTS = Object.freeze({
  COLLECTION: /** @type {BatchDraftSlot} */ ('collection'),
  WISHLIST: /** @type {BatchDraftSlot} */ ('wishlist')
})

// 模块级共享状态
const queue = shallowRef([])
const defaults = ref({ ip: '', category: '', price: '' })
// 批次标识 + 是否愿望单：入口发起时确定，随队列一起持久化，避免依赖 history.state 跨页传递
const batchId = ref('')
const isWishlist = ref(false)
// 当前内存队列归属的草稿槽位；空串 = 尚未 init/resume
const activeSlot = ref(/** @type {BatchDraftSlot | ''} */ (''))
// 单个新增编辑器当前绑定的草稿槽（空串 = 未打开）。与 activeSlot 互斥：
// 同一时刻一侧只可能有一个「未完成新增」，要么队列、要么单个表单。
const singleDraftActiveSlot = ref(/** @type {BatchDraftSlot | ''} */ (''))
// 远端 pull 合并命中单个草稿槽时自增，编辑器据此重新读库对齐（避免 stale 表单盖回远端）
export const singleDraftRemoteRevision = ref(0)

// 防抖落库计时器
let persistTimer = null
// 写入串行化：防抖触发与 flush/saveAll/clear 竞争时保证最终一致
let persistChain = Promise.resolve()
// pull/updateLocalRefs 回写内存时置位，避免 watch 把远端内容再 persist 出去形成无意义推送环
let suppressPersist = false
// 草稿域自动推送（2s 防抖）；与 goods/recharge 同一条 dirtyDomains 通道
const triggerBatchDraftSync = createAutoPush('batchDrafts')

function withSuppressPersist(fn) {
  suppressPersist = true
  cancelPersistTimer()
  try {
    return fn()
  } finally {
    // 微任务后恢复：确保同步路径里的 watch 回调被吞掉
    queueMicrotask(() => { suppressPersist = false })
  }
}

/**
 * 生成批次标识（批量流程入口发起时调用，写入路由 state 用于识别同一批图片）
 */
export function createBatchId() {
  return `batch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

/**
 * 按 isWishlist 推导草稿槽位
 * @param {boolean} wishlist
 * @returns {BatchDraftSlot}
 */
export function slotForWishlist(wishlist) {
  return wishlist ? BATCH_DRAFT_SLOTS.WISHLIST : BATCH_DRAFT_SLOTS.COLLECTION
}

/**
 * 序列化队列项（dirtyFields Set → 数组）
 */
function serializeItems() {
  return queue.value.map((item) => ({
    ...item,
    dirtyFields: Array.from(item.dirtyFields || [])
  }))
}

/**
 * 反序列化队列项（数组 → dirtyFields Set）
 * @param {any[]} items
 */
function deserializeItems(items) {
  if (!Array.isArray(items)) return []
  return items.map((item) => ({
    ...item,
    dirtyFields: new Set(item.dirtyFields || [])
  }))
}

function cancelPersistTimer() {
  if (persistTimer != null) {
    clearTimeout(persistTimer)
    persistTimer = null
  }
}

/**
 * 把当前内存队列写入 activeSlot 对应的草稿行。
 * 队列为空时删除该槽位行（不删图片——空队列意味着图片已逐项移除或已归商品）。
 */
async function persistActiveDraft() {
  const slot = activeSlot.value
  if (!slot) return
  if (queue.value.length === 0) {
    // 空队列 = 草稿结束（saveAll / 逐项移除完）：软删墓碑让对端同步清除，不删本地图片
    // （图片此时已归商品，或已被 removeItem 单独删过）
    await softDeleteBatchDraft(slot)
    triggerBatchDraftSync()
    return
  }
  // 草稿采用 LWW。设备时钟可能比云端/另一台设备慢，因此不能只用
  // Date.now()；否则二次编辑会被远端较大的 updatedAt 判定为旧数据。
  // 读取原始行（含墓碑），这样清除后再次编辑也能基于旧 updatedAt 递增。
  const knownUpdatedAt = await getBatchDraftUpdatedAt(slot)
  const updatedAt = Math.max(Date.now(), knownUpdatedAt + 1)
  await saveBatchDraft({
    slot,
    batchId: batchId.value,
    isWishlist: isWishlist.value,
    items: serializeItems(),
    defaults: { ...defaults.value },
    deleted: false,
    updatedAt
  })
  triggerBatchDraftSync()
}

/**
 * 串行执行一次持久化（内部自动取消挂起的防抖）
 * @returns {Promise<void>}
 */
function enqueuePersist() {
  cancelPersistTimer()
  persistChain = persistChain
    .then(() => persistActiveDraft())
    .catch((e) => {
      console.warn('[useBatchQueue] persist failed', e)
    })
  return persistChain
}

/**
 * 立即落库（离开页面 / pagehide 时调用）
 * @returns {Promise<void>}
 */
export function flushBatchDraft() {
  return enqueuePersist()
}

function schedulePersist() {
  if (suppressPersist) return
  cancelPersistTimer()
  persistTimer = setTimeout(() => {
    persistTimer = null
    void enqueuePersist()
  }, 300)
}

/**
 * 查询槽位是否存在未完成草稿
 * @param {BatchDraftSlot} slot
 * @returns {Promise<{ kind: 'queue' | 'single', count: number, batchId: string, isWishlist: boolean, updatedAt: number } | null>}
 */
export async function getDraftMeta(slot) {
  if (!slot) return null
  try {
    const draft = await getBatchDraft(slot)
    if (!draft) return null
    // 单个草稿与队列草稿共用一行：单个草稿 = 唯一一个带 singleForm 的条目
    if (getSingleDraftEntry(draft)) {
      return {
        kind: 'single',
        count: 1,
        batchId: '',
        isWishlist: draft.isWishlist === true,
        updatedAt: draft.updatedAt
      }
    }
    if (!Array.isArray(draft.items) || draft.items.length === 0) return null
    return {
      kind: 'queue',
      count: draft.items.length,
      batchId: draft.batchId,
      isWishlist: draft.isWishlist,
      updatedAt: draft.updatedAt
    }
  } catch (e) {
    console.warn('[useBatchQueue] getDraftMeta failed', e)
    return null
  }
}

/**
 * 槽位是否有可恢复草稿
 * @param {BatchDraftSlot} slot
 * @returns {Promise<boolean>}
 */
export async function hasDraft(slot) {
  return (await getDraftMeta(slot)) != null
}

/**
 * 从 DB 恢复指定槽位草稿到内存。槽位无草稿时清空内存队列（视为新批次起点）。
 * @param {BatchDraftSlot} slot
 * @returns {Promise<boolean>} 是否恢复到非空队列
 */
export async function resumeDraft(slot) {
  if (!slot) return false
  cancelPersistTimer()
  // 切槽前先把旧槽位落库，避免被内存覆盖后丢失
  if (activeSlot.value && activeSlot.value !== slot && queue.value.length > 0) {
    await enqueuePersist()
  }
  try {
    const draft = await getBatchDraft(slot)
    // 该槽是单个草稿：队列恢复不认它，且绝不能软删（否则会毁掉单个草稿）
    if (getSingleDraftEntry(draft)) return false
    const items = draft && Array.isArray(draft.items) ? draft.items : []
    if (items.length === 0) {
      queue.value = []
      defaults.value = { ip: '', category: '', price: '' }
      batchId.value = ''
      isWishlist.value = slot === BATCH_DRAFT_SLOTS.WISHLIST
      activeSlot.value = slot
      // 空/墓碑行：标软删（若仍存在），避免脏行挡后续恢复
      if (draft) await softDeleteBatchDraft(slot)
      return false
    }
    queue.value = deserializeItems(items)
    defaults.value = {
      ip: String(draft.defaults?.ip || ''),
      category: String(draft.defaults?.category || ''),
      price: String(draft.defaults?.price || '')
    }
    batchId.value = draft.batchId || ''
    isWishlist.value = draft.isWishlist === true
    activeSlot.value = slot
    appLog('info', 'batch-queue: resumed', { slot, count: items.length, batchId: batchId.value })
    return true
  } catch (e) {
    console.warn('[useBatchQueue] resumeDraft failed', e)
    return false
  }
}

/**
 * 删除槽位草稿行 + 其引用的本地图片 +（若为当前槽位）清空内存。
 * 一键清除入口使用；普通离开不要再调。
 * @param {BatchDraftSlot} [slot] 缺省用 activeSlot
 */
export async function clearDraft(slot) {
  const target = slot || activeSlot.value
  if (!target) return
  cancelPersistTimer()
  let uris = []
  if (activeSlot.value === target) {
    uris = queue.value.map((item) => item.localImageUri || item.imageUri).filter(Boolean)
    queue.value = []
    defaults.value = { ip: '', category: '', price: '' }
    batchId.value = ''
    isWishlist.value = false
    activeSlot.value = ''
  }
  // 单个草稿（或非当前队列槽）的图片只能从 DB 行里取
  try {
    const draft = await getBatchDraft(target)
    uris = uris.concat(collectDraftLocalImageCandidates(draft))
  } catch (e) {
    console.warn('[useBatchQueue] clearDraft read failed', e)
  }
  if (singleDraftActiveSlot.value === target) singleDraftActiveSlot.value = ''
  try {
    await softDeleteBatchDraft(target)
  } catch (e) {
    console.warn('[useBatchQueue] clearDraft soft-delete failed', e)
  }
  // 只删本地文件；云端已上传副本由孤儿回收（48h 宽限）处理
  const localUris = [...new Set(
    uris.filter((uri) => isLocalImageUri(uri) || String(uri).startsWith('file:') || String(uri).startsWith('data:image/'))
  )]
  if (localUris.length > 0) void deleteManagedLocalImages(localUris)
  triggerBatchDraftSync()
  appLog('info', 'batch-queue: draft cleared', { slot: target, count: localUris.length })
}

/**
 * 从草稿行收集需要清理的本地图片（原始 URI）。
 * 队列草稿取 items[].localImageUri/imageUri；单个草稿取 singleForm.images[].uri。
 * @param {any} draft
 * @returns {Array<string>}
 */
function collectDraftLocalImageCandidates(draft) {
  const out = []
  if (!draft) return out
  const singleEntry = getSingleDraftEntry(draft)
  if (singleEntry) {
    const form = singleEntry[SINGLE_DRAFT_FORM_KEY]
    const images = Array.isArray(form?.images) ? form.images : []
    for (const image of images) {
      const uri = image?.uri || image?.localPath
      if (uri) out.push(uri)
    }
    return out
  }
  if (Array.isArray(draft.items)) {
    for (const item of draft.items) {
      const uri = item?.localImageUri || item?.imageUri
      if (uri) out.push(uri)
    }
  }
  return out
}

// ── 单个谷子新增草稿（与队列草稿共用同一 batch_drafts 行）────────────────────

/**
 * 读取槽位的单个草稿
 * @param {BatchDraftSlot} slot
 * @returns {Promise<{ form: object, isWishlist: boolean, updatedAt: number } | null>}
 */
export async function getSingleDraft(slot) {
  if (!slot) return null
  try {
    const draft = await getBatchDraft(slot)
    const entry = getSingleDraftEntry(draft)
    if (!entry) return null
    const form = entry[SINGLE_DRAFT_FORM_KEY]
    return {
      form: form && typeof form === 'object' && !Array.isArray(form) ? form : {},
      isWishlist: draft.isWishlist === true,
      updatedAt: Number(draft.updatedAt) || 0
    }
  } catch (e) {
    console.warn('[useBatchQueue] getSingleDraft failed', e)
    return null
  }
}

/**
 * 写入单个草稿（LWW，与队列草稿同款时钟策略）。
 * 写入即代表该槽被单个草稿占用：清掉可能残留的队列内存，避免之后 flush 把整行盖成队列。
 * @param {BatchDraftSlot} slot
 * @param {object} form 表单快照
 * @param {boolean} isWishlist
 * @returns {Promise<number>} 落库的 updatedAt
 */
export async function saveSingleDraft(slot, form, isWishlist) {
  if (!slot) return 0
  cancelPersistTimer()
  try {
    const knownUpdatedAt = await getBatchDraftUpdatedAt(slot)
    const updatedAt = Math.max(Date.now(), knownUpdatedAt + 1)
    await saveBatchDraft({
      slot,
      batchId: '',
      isWishlist: isWishlist === true,
      items: [buildSingleDraftItem(form)],
      defaults: { ip: '', category: '', price: '' },
      deleted: false,
      updatedAt
    })
    if (activeSlot.value === slot) {
      queue.value = []
      defaults.value = { ip: '', category: '', price: '' }
      batchId.value = ''
      activeSlot.value = ''
    }
    triggerBatchDraftSync()
    return updatedAt
  } catch (e) {
    console.warn('[useBatchQueue] saveSingleDraft failed', e)
    return 0
  }
}

/**
 * 软删单个草稿行（不删图片）。成功保存为商品后调用：图片已归商品所有。
 * @param {BatchDraftSlot} slot
 */
export async function clearSingleDraft(slot) {
  const target = slot || singleDraftActiveSlot.value
  if (!target) return
  cancelPersistTimer()
  if (singleDraftActiveSlot.value === target) singleDraftActiveSlot.value = ''
  try {
    await softDeleteBatchDraft(target)
    triggerBatchDraftSync()
  } catch (e) {
    console.warn('[useBatchQueue] clearSingleDraft failed', e)
  }
}

/**
 * 单个编辑器挂载时绑定槽位（供 pull 合并后回刷）
 */
export function bindSingleDraftSlot(slot) {
  singleDraftActiveSlot.value = slot || ''
}

/** 单个编辑器卸载时解绑 */
export function unbindSingleDraftSlot(slot) {
  if (!slot || singleDraftActiveSlot.value === slot) singleDraftActiveSlot.value = ''
}

/**
 * 初始化队列（新批次入口调用）。
 * 同一批次重挂载时应先 resumeDraft 再走此处的 URI 对齐跳过逻辑。
 * @param {Array} images
 * @param {{ batchId?: string, isWishlist?: boolean }} [meta]
 */
async function initQueue(images, meta = {}) {
  const nextWishlist = meta.isWishlist === true
  const nextSlot = slotForWishlist(nextWishlist)
  // 切槽前落库旧槽，防止覆盖丢失另一侧草稿
  if (activeSlot.value && activeSlot.value !== nextSlot && queue.value.length > 0) {
    await enqueuePersist()
  }
  const prevSlot = activeSlot.value
  batchId.value = meta.batchId || ''
  isWishlist.value = nextWishlist
  const incomingUris = images.map((img) => img.uri || img.localPath || '')
  const currentUris = queue.value.map((item) => item.imageUri)
  // 页面刷新后 history.state 仍携带 batchImages，与已恢复队列一致时跳过重建以保留编辑进度
  if (
    currentUris.length > 0 &&
    currentUris.length === incomingUris.length &&
    currentUris.every((uri, idx) => uri === incomingUris[idx])
  ) {
    activeSlot.value = nextSlot
    return
  }
  // 仅同槽位重建时清理旧未保存图片；跨槽切换时旧图归另一侧草稿所有，不能删
  if (!prevSlot || prevSlot === nextSlot) {
    const incomingSet = new Set(incomingUris)
    const staleUris = currentUris
      .map((uri, idx) => queue.value[idx]?.localImageUri || uri)
      .filter((uri) => uri && !incomingSet.has(uri) && isLocalImageUri(uri))
    if (staleUris.length > 0) void deleteManagedLocalImages(staleUris)
    if (staleUris.length > 0 || currentUris.length > 0) {
      appLog('info', 'batch-queue: init', { batchId: batchId.value, count: images.length, isWishlist: nextWishlist, staleCleaned: staleUris.length })
    }
  } else {
    appLog('info', 'batch-queue: init', { batchId: batchId.value, count: images.length, isWishlist: nextWishlist, prevSlot })
  }
  activeSlot.value = nextSlot
  queue.value = images.map((img) => ({
    id: createGoodsImageId(),
    imageUri: img.uri || img.localPath || '',
    localImageUri: img.uri || img.localPath || '',
    cloudFileName: '',
    storageMode: '',
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
  // 尚未保存为谷子，移除时同步删除已复制的本地文件（云端副本交给孤儿回收）
  const localUri = item?.localImageUri || (isLocalImageUri(item?.imageUri) ? item.imageUri : '')
  if (localUri) void deleteManagedLocalImages([localUri])
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
  const oldLocal = item.localImageUri || (isLocalImageUri(item.imageUri) ? item.imageUri : '')
  if (oldLocal && oldLocal !== newUri) void deleteManagedLocalImages([oldLocal])
  updateItem(id, {
    imageUri: newUri,
    localImageUri: newUri,
    cloudFileName: '',
    storageMode: ''
  })
}

/**
 * 追加图片到队列
 * @param {Array} images
 */
function appendImages(images) {
  const newItems = images.map((img) => {
    const uri = img.uri || img.localPath || ''
    return {
      id: createGoodsImageId(),
      imageUri: uri,
      localImageUri: uri,
      cloudFileName: '',
      storageMode: '',
      name: '',
      category: defaults.value.category || '',
      ip: defaults.value.ip || '',
      charactersText: '',
      price: defaults.value.price || '',
      date: new Date().toISOString().split('T')[0],
      dirtyFields: new Set()
    }
  })
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
  const slot = activeSlot.value
  const items = queue.value.map((item) => {
    // 已上云的图：goods 侧直接复用 cloudFileName，避免二次上传与孤儿回收误删
    const cloudFileName = String(item.cloudFileName || parseCloudImageUri(item.imageUri) || parseStoragePublicImageUrl(item.imageUri) || '').trim()
    const images = cloudFileName
      ? [{
          id: item.id,
          uri: item.imageUri || buildCloudImageUri(cloudFileName),
          cloudFileName,
          storageMode: item.storageMode || 'remote'
        }]
      : [{ id: item.id, uri: item.imageUri }]
    return {
      name: item.name,
      price: item.price ? parseFloat(item.price) : 0,
      ip: item.ip,
      category: item.category,
      characters: item.charactersText
        ? item.charactersText.split(/[,，]/).filter(Boolean)
        : [],
      images,
      isWishlist: wishlist,
      collectStatus: wishlist ? '' : '已拥有',
      acquiredAt: wishlist ? '' : item.date
    }
  })
  await goodsStore.addMultipleGoods(items)
  appLog('info', 'batch-queue: saved', { batchId: batchId.value, count: items.length, isWishlist: wishlist, slot })
  // 保存成功后图片归商品所有：清空内存 + 软删草稿行。
  // 本地文件：未上云的继续由 goods 管理；已上云的删除本地副本（云端已有）
  cancelPersistTimer()
  for (const item of queue.value) {
    const cloudFileName = String(item.cloudFileName || parseCloudImageUri(item.imageUri) || parseStoragePublicImageUrl(item.imageUri) || '').trim()
    const localUri = item.localImageUri || (isLocalImageUri(item.imageUri) ? item.imageUri : '')
    if (cloudFileName && localUri && isLocalImageUri(localUri)) {
      void deleteManagedLocalImages([localUri])
    }
  }
  queue.value = []
  defaults.value = { ip: '', category: '', price: '' }
  if (slot) {
    try {
      await softDeleteBatchDraft(slot)
      triggerBatchDraftSync()
    } catch (e) {
      console.warn('[useBatchQueue] clear draft after save failed', e)
    }
  }
}

/**
 * 清空内存队列并软删当前槽草稿（不删图片）。
 * 普通离开不要调；需要删图片的一键清除用 clearDraft。
 */
function clearQueue() {
  cancelPersistTimer()
  const slot = activeSlot.value
  queue.value = []
  defaults.value = { ip: '', category: '', price: '' }
  batchId.value = ''
  isWishlist.value = false
  activeSlot.value = ''
  if (slot) {
    void softDeleteBatchDraft(slot).then(() => triggerBatchDraftSync()).catch(() => {})
  }
}

/**
 * 放弃当前槽批量草稿：删除已复制且未保存的本地图片 + 草稿行 + 内存。
 * 仅「清除草稿」按钮调用；离开页面静默保留，不要走这里。
 * @returns {Promise<void>}
 */
function discardQueue() {
  return clearDraft()
}

/**
 * pull 合并写库后刷新当前编辑槽内存，避免 stale 队列在下次 persist 盖回远端。
 * 同时通知正在打开的单个草稿编辑器重读（singleDraftRemoteRevision）。
 */
export async function refreshActiveSlotFromDb() {
  const slot = activeSlot.value
  if (slot) {
    try {
      const draft = await getBatchDraft(slot)
      // 远端把该槽改成了单个草稿：不要塞进队列内存（否则队列会把整行盖回去）
      const items = draft && !getSingleDraftEntry(draft) && Array.isArray(draft.items) ? draft.items : []
      withSuppressPersist(() => {
        if (items.length === 0) {
          // 远端墓碑赢下 LWW：清空内存，但不删本地图片（清除语义由对端 clear 触发）
          queue.value = []
          defaults.value = { ip: '', category: '', price: '' }
          batchId.value = ''
          return
        }
        queue.value = deserializeItems(items)
        defaults.value = {
          ip: String(draft.defaults?.ip || ''),
          category: String(draft.defaults?.category || ''),
          price: String(draft.defaults?.price || '')
        }
        batchId.value = draft.batchId || ''
        isWishlist.value = draft.isWishlist === true
      })
      appLog('info', 'batch-queue: refreshed active slot from remote', { slot, count: items.length })
    } catch (e) {
      console.warn('[useBatchQueue] refreshActiveSlotFromDb failed', e)
    }
  }
  // 单个草稿编辑器打开：无论远端是单个草稿、被清空还是变成队列，都让它重读对齐
  if (singleDraftActiveSlot.value) {
    singleDraftRemoteRevision.value += 1
  }
}

/**
 * push 成功后把 cloudFileName 写回本地草稿行（不删本地文件）。
 * 杀进程后下次同步仍能从 localImageUri 重试上传；孤儿 GC 靠 cloudFileName 保护云端文件。
 * @param {Array<{ slot: string, items: any[], deleted?: boolean, updatedAt?: number }>} updates
 */
export async function markBatchDraftImagesAsRemote(updates) {
  if (!Array.isArray(updates) || updates.length === 0) return
  const toSave = []
  for (const update of updates) {
    const slot = String(update?.slot || '').trim()
    if (!slot) continue
    if (update.deleted) {
      toSave.push({
        slot,
        batchId: '',
        isWishlist: slot === BATCH_DRAFT_SLOTS.WISHLIST,
        items: [],
        defaults: { ip: '', category: '', price: '' },
        deleted: true,
        updatedAt: Number(update.updatedAt) || Date.now()
      })
      continue
    }
    try {
      const existing = await getBatchDraft(slot)
      if (!existing) continue
      const byId = new Map((Array.isArray(update.items) ? update.items : []).map((item) => [item.id, item]))
      // 图片上传可能在草稿防抖落库之前完成。当前槽位以内存队列为准，
      // 否则用旧的 DB 快照回写会把刚新增/刚编辑的条目从队列中删掉，
      // 随后点击这些条目就会得到“未找到该条目”。
      const baseItems = activeSlot.value === slot && queue.value.length > 0
        ? serializeItems()
        : existing.items
      const nextItems = baseItems.map((item) => {
        const remote = byId.get(item.id)
        if (!remote?.cloudFileName) return item
        return {
          ...item,
          imageUri: remote.imageUri || buildCloudImageUri(remote.cloudFileName),
          cloudFileName: remote.cloudFileName,
          storageMode: remote.storageMode || 'cloud-local'
          // localImageUri 保留：clearDraft / 保存失败重试仍依赖本地文件
        }
      })
      toSave.push({
        ...existing,
        items: nextItems,
        deleted: false,
        // 不刷新 updatedAt：本次只是补云端引用，避免无意义地覆盖对端更新的行
        updatedAt: existing.updatedAt || Date.now()
      })
    } catch (e) {
      console.warn('[useBatchQueue] markBatchDraftImagesAsRemote read failed', e)
    }
  }
  if (toSave.length === 0) return
  await saveBatchDrafts(toSave)
  // 若正是当前编辑槽，只回写图片字段，不整体替换 queue。
  // 整体替换会让上传完成时的旧 DB 快照覆盖当前编辑中的条目，
  // 导致当前路由 id 在队列中消失并显示“未找到该条目”。
  const slot = activeSlot.value
  if (slot) {
    const hit = toSave.find((d) => d.slot === slot)
    if (hit && Array.isArray(hit.items)) {
      const byId = new Map(hit.items.map((item) => [item.id, item]))
      withSuppressPersist(() => {
        queue.value = queue.value.map((item) => {
          const remote = byId.get(item.id)
          if (!remote?.cloudFileName) return item
          return {
            ...item,
            imageUri: remote.imageUri || buildCloudImageUri(remote.cloudFileName),
            cloudFileName: remote.cloudFileName,
            storageMode: remote.storageMode || 'cloud-local'
          }
        })
      })
    }
  }
}

// 队列/默认值变更 → 防抖落库（离开静默保留的核心路径）
watch(queue, schedulePersist, { deep: false })
watch(defaults, schedulePersist, { deep: true })

// 页面被隐藏/卸载前尽量把防抖中的写入刷出（杀进程场景）
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => {
    void flushBatchDraft()
  })
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flushBatchDraft()
  })
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
    activeSlot,
    completedCount: computed(() =>
      queue.value.filter((item) => item.name?.trim()).length
    ),
    totalCount: computed(() => queue.value.length),
    canSaveAll: computed(() =>
      queue.value.length > 0 && queue.value.every((item) => item.name?.trim())
    ),
    // 图片丢失（草稿缺 imageUri）的项数，保存前需引导用户重新选图或确认
    missingImageCount: computed(() =>
      queue.value.filter((item) => !item.imageUri).length
    ),
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
    discardQueue,
    getDraftMeta,
    hasDraft,
    resumeDraft,
    clearDraft,
    getSingleDraft,
    saveSingleDraft,
    clearSingleDraft,
    bindSingleDraftSlot,
    unbindSingleDraftSlot,
    singleDraftRemoteRevision,
    flushBatchDraft,
    slotForWishlist,
    getAllBatchDrafts,
    refreshActiveSlotFromDb,
    markBatchDraftImagesAsRemote
  }
}
