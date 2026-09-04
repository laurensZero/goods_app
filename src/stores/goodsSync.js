import { getItems, saveItems } from '@/utils/db/index'
import { buildGoodsIdentityKey } from '@/utils/goods/identity'
import { deleteManagedLocalImages } from '@/utils/image/localImage'
import { cancelSaleReminderNotifications } from '@/utils/saleReminder'
import { triggerRef } from 'vue'
import {
  normalizeGoodsInput,
  normalizeTrashItem,
  mergeGoodsRecord,
  shouldApplyRemoteBackup,
  restoreImportedGoodsItem,
  diffRemovedManagedImagePaths
} from '@/stores/goodsHelpers'
import { ensureInitialTimeline } from '@/utils/goods/statusTimeline'
import { normalizeGoodsImageList, parseCloudImageUri } from '@/utils/goods/images'
import { isLocalImageUri } from '@/utils/image/localImage'
import { aliasCachedImage } from '@/utils/image/cache'

async function addMultipleGoods(items, list) {
  const now = Date.now()
  const existingItems = [...list.value]
  const buildScopedKey = (item) => `${item.isWishlist ? 1 : 0}::${buildGoodsIdentityKey(item)}`
  const existingKeyToIndex = new Map(
    existingItems.map((item, index) => [buildScopedKey(item), index])
  )
  const newItems = []
  const newKeyToIndex = new Map()
  const changedExistingIds = new Set()

  items.forEach((rawItem, index) => {
    const clean = Object.fromEntries(
      Object.entries(rawItem).filter(([key]) => !key.startsWith('_'))
    )
    const normalized = normalizeGoodsInput(clean, String(now + index))
    const key = buildScopedKey(normalized)

    // 合并进已有商品时不做时间线兜底——避免重复导入给既有时间线拼入「已拥有@今天」,
    // 重置持有天数并随下次推送扩散;只有真正新增的条目才 ensureInitialTimeline
    if (existingKeyToIndex.has(key)) {
      const existingIndex = existingKeyToIndex.get(key)
      existingItems[existingIndex] = mergeGoodsRecord(existingItems[existingIndex], normalized)
      changedExistingIds.add(existingItems[existingIndex].id)
      return
    }

    if (newKeyToIndex.has(key)) {
      const newIndex = newKeyToIndex.get(key)
      newItems[newIndex] = mergeGoodsRecord(newItems[newIndex], normalized)
      return
    }

    newKeyToIndex.set(key, newItems.length)
    newItems.push(ensureInitialTimeline(normalized))
  })

  list.value = [...newItems, ...existingItems]
  await saveItems([
    ...newItems,
    ...existingItems.filter((item) => changedExistingIds.has(item.id))
  ])
}

async function refreshList(list) {
  list.value = (await getItems()).map((item) => normalizeGoodsInput(item, item.id))
}

async function importGoodsBackup(items, list, trashList) {
  const existingIds = new Set(list.value.map((item) => item.id))
  const trashIdMap = new Map(trashList.value.map((item) => [item.id, item]))

  // 关键守卫：本地刚删除（在回收站里）的条目，远端若仍是 trashed=0 会把它当活跃行拉回。
  // 按 LWW 判定——本地删除时间不早于远端更新时间则保持删除，不恢复；
  // 远端更新时间更新（比如另一台设备重新添加）才恢复并同时移出本地回收站
  const importableItems = []
  const idsToUnTrash = []
  for (const remoteItem of items) {
    if (!remoteItem?.id) continue
    if (existingIds.has(remoteItem.id)) continue

    const localTrash = trashIdMap.get(remoteItem.id)
    if (localTrash) {
      const remoteTs = Number(remoteItem.updatedAt) || 0
      const localTs = Number(localTrash.updatedAt) || 0
      if (remoteTs > localTs) {
        importableItems.push(remoteItem)
        idsToUnTrash.push(remoteItem.id)
      }
      // 否则：本地删除较新，远端活跃行是旧快照，跳过不恢复
    } else {
      importableItems.push(remoteItem)
    }
  }

  if (importableItems.length === 0) return 0

  const newItems = await Promise.all(
    importableItems.map(async (item) => normalizeGoodsInput({
      ...(await restoreImportedGoodsItem(item)),
      __imagesExplicit: true,
      image: '',
      coverImage: ''
    }, item.id))
  )

  if (idsToUnTrash.length > 0) {
    const untrashSet = new Set(idsToUnTrash)
    trashList.value = trashList.value.filter((item) => !untrashSet.has(item.id))
  }

  list.value = [...newItems, ...list.value]

  // 恢复的行 INSERT OR REPLACE 会把 trashed 翻回 0（normalizeGoodsInput 输出 trashed=false），
  // 同表软删除下恢复与导入是同一次写入
  await saveItems(newItems)
  return newItems.length
}

async function updateGoodsBackup(items, list, { forceReapply = false } = {}) {
  if (!Array.isArray(items) || items.length === 0) return 0

  const existingMap = new Map(list.value.map((item) => [item.id, item]))

  // Filter items that need updating first (cheap), then restore in parallel (expensive I/O)
  const candidates = items.filter((remoteItem) => {
    const localItem = existingMap.get(remoteItem.id)
    return localItem && shouldApplyRemoteBackup(localItem, remoteItem, { forceReapply })
  })

  const results = await Promise.all(candidates.map(async (remoteItem) => {
    const localItem = existingMap.get(remoteItem.id)
    const restoredRemote = await restoreImportedGoodsItem(remoteItem)
    const normalized = normalizeGoodsInput({
      ...localItem,
      ...restoredRemote,
      __imagesExplicit: true,
      image: '',
      coverImage: '',
      updatedAt: remoteItem.updatedAt || restoredRemote.updatedAt || 0,
    }, remoteItem.id)
    const removedPaths = diffRemovedManagedImagePaths(localItem, normalized)
    return { normalized, removedPaths, id: remoteItem.id }
  }))

  const updatedItems = []
  const cleanupPaths = []
  for (const { normalized, removedPaths, id } of results) {
    const idx = list.value.findIndex((item) => item.id === id)
    if (idx === -1) continue
    list.value[idx] = normalized
    updatedItems.push(normalized)
    if (removedPaths.length > 0) cleanupPaths.push(...removedPaths)
  }

  if (cleanupPaths.length > 0) await deleteManagedLocalImages(cleanupPaths)

  if (updatedItems.length > 0) {
    triggerRef(list)
    await saveItems(updatedItems)
  }

  return updatedItems.length
}

async function importTrashBackup(items, list, trashList, purgedTrashIds = null) {
  if (!Array.isArray(items) || items.length === 0) return 0

  const existingIds = new Set(trashList.value.map((item) => item.id))
  const activeIdMap = new Map((list?.value || []).map((item) => [item.id, item]))

  // 关键守卫（与 importGoodsBackup 的反向守卫对称）：远端回收站行命中本地活跃行时
  // 按 LWW 裁决——远端删除较新才把活跃行移入回收站（整行覆盖为远端 trashed=1 内容）；
  // 本地较新说明远端墓碑是旧快照，既不导入也不动活跃行
  const importableItems = []
  const idsToTrashLocally = []
  const reminderOffsetsById = new Map()
  for (const item of items) {
    const id = String(item?.id || '').trim()
    if (!id || existingIds.has(id) || purgedTrashIds?.has(id)) continue

    const activeItem = activeIdMap.get(id)
    if (activeItem) {
      const remoteTs = Number(item.updatedAt) || 0
      const localTs = Number(activeItem.updatedAt) || 0
      if (remoteTs > localTs) {
        importableItems.push(item)
        idsToTrashLocally.push(id)
        reminderOffsetsById.set(id, activeItem.saleReminderOffsets)
      }
      // 否则：本地活跃行较新，远端回收站行是旧快照，跳过不导入
      continue
    }

    importableItems.push(item)
  }

  const newItems = await Promise.all(
    importableItems.map(async (item) => normalizeTrashItem({
      ...(await restoreImportedGoodsItem(item)),
      __imagesExplicit: true,
      image: '',
      coverImage: ''
    }, item.id))
  )

  if (newItems.length === 0) return 0

  // 同表软删除：墓碑行以 trashed=1 整行写入 goods 表。命中活跃行的 id 也走同一写入
  // （INSERT OR REPLACE 翻转 trashed），不再有「Preferences 挂回收站 + SQLite 留活跃行」
  // 的跨桶中间态
  await saveItems(newItems)

  const prevList = list?.value
  if (idsToTrashLocally.length > 0 && prevList) {
    const removeSet = new Set(idsToTrashLocally)
    list.value = prevList.filter((item) => !removeSet.has(item.id))
  }
  trashList.value = [...newItems, ...trashList.value]

  for (const id of idsToTrashLocally) {
    void cancelSaleReminderNotifications(id, reminderOffsetsById.get(id)).catch(() => {})
  }
  return newItems.length
}

async function updateTrashBackup(items, trashList, purgedTrashIds = null, { forceReapply = false } = {}) {
  if (!Array.isArray(items) || items.length === 0) return 0

  const existingMap = new Map(trashList.value.map((item) => [item.id, item]))

  const candidates = items.filter((remoteItem) => {
    if (purgedTrashIds?.has(String(remoteItem?.id || '').trim())) return false
    const localItem = existingMap.get(remoteItem.id)
    return localItem && shouldApplyRemoteBackup(localItem, remoteItem, { forceReapply })
  })

  const results = await Promise.all(candidates.map(async (remoteItem) => {
    const localItem = existingMap.get(remoteItem.id)
    const restoredRemote = await restoreImportedGoodsItem(remoteItem)
    const normalized = normalizeTrashItem({
      ...localItem,
      ...restoredRemote,
      __imagesExplicit: true,
      image: '',
      coverImage: '',
      updatedAt: remoteItem.updatedAt || restoredRemote.updatedAt || 0,
    }, remoteItem.id)
    const removedPaths = diffRemovedManagedImagePaths(localItem, normalized)
    return { normalized, removedPaths, id: remoteItem.id }
  }))

  const updatedItems = []
  const cleanupPaths = []
  for (const { normalized, removedPaths, id } of results) {
    const idx = trashList.value.findIndex((item) => item.id === id)
    if (idx === -1) continue
    trashList.value[idx] = normalized
    updatedItems.push(normalized)
    if (removedPaths.length > 0) cleanupPaths.push(...removedPaths)
  }

  if (cleanupPaths.length > 0) await deleteManagedLocalImages(cleanupPaths)

  if (updatedItems.length > 0) {
    triggerRef(trashList)
    await saveItems(updatedItems)
  }
  return updatedItems.length
}

/**
 * After push: update local image entries so future syncs can dedup.
 * @param {Map<string, Map<number, object>>} preparedImagesByItemId - itemId -> (imageIndex -> preparedEntry)
 * @param {import('vue').Ref<Array>} list
 * @param {import('vue').Ref<Array>} trashList
 */
async function markImagesAsRemote(preparedImagesByItemId, list, trashList) {
  if (!preparedImagesByItemId || preparedImagesByItemId.size === 0) return

  const allLists = [list, trashList]
  const updatedItems = []

  for (const listRef of allLists) {
    for (let i = 0; i < listRef.value.length; i++) {
      const item = listRef.value[i]
      const preparedMap = preparedImagesByItemId.get(item.id)
      if (!preparedMap) continue

      const images = normalizeGoodsImageList(item.images)
      let changed = false
      for (const [idx, prepared] of preparedMap) {
        if (idx >= 0 && idx < images.length && prepared.cloudFileName) {
          const currentUri = String(images[idx]?.uri || '').trim()
          // When backend provides a public URL (Supabase), always use it — don't keep base64 in SQLite.
          // Only preserve local URIs for cloud backend where offline display needs the local copy.
          const hasRemoteUri = /^https?:\/\//.test(prepared.uri || '')
          const keepLocalUri = !hasRemoteUri && !!currentUri && (
            currentUri.startsWith('blob:')
            || currentUri.startsWith('data:image/')
            || isLocalImageUri(currentUri)
          )
          const nextUri = keepLocalUri ? currentUri : (prepared.uri || `cloud-image://${prepared.cloudFileName}`)
          // 本地图→云图改写会把卡片正在显示的 src 换掉：先把内存位图过户给新 URL，
          // 否则卡片重载期间 hero 快照拍不到位图，保存后的第一次 hero 动画必失败。
          aliasCachedImage(currentUri, nextUri)
          images[idx] = {
            ...images[idx],
            uri: nextUri,
            storageMode: 'cloud-local',
            cloudFileName: prepared.cloudFileName,
            mimeType: prepared.mimeType || images[idx]?.mimeType || '',
            fileSize: Number(prepared.fileSize) > 0 ? Number(prepared.fileSize) : (Number(images[idx]?.fileSize) || 0)
          }
          changed = true
        }
      }
      if (changed) {
        listRef.value[i] = { ...item, images }
        updatedItems.push(listRef.value[i])
      }
    }
  }

  if (updatedItems.length > 0) {
    triggerRef(list)
    triggerRef(trashList)
    await saveItems(updatedItems)
  }
}

/**
 * Replace data:image/ base64 with public URLs for all items that have cloudFileName.
 * Called after sync when backend is Supabase.
 * skipFiles: cloudFileNames whose upload failed — keep their base64 so the next sync retries.
 */
async function cleanupBase64Images(list, trashList, backend, { skipFiles = null } = {}) {
  if (!backend?.getImagePublicUrl) return

  // 只清理云端确认存在的文件：base64 是本地唯一原图，
  // 文件未落云就替换为 public URL 会造成图片永久丢失。
  // 列表获取失败时保守跳过本次清理（下次同步再清）。
  let cloudFiles = null
  if (typeof backend.getExistingImageCloud === 'function') {
    try {
      cloudFiles = (await backend.getExistingImageCloud())?.files || null
    } catch {
      return
    }
    if (!cloudFiles) return
  }

  const allLists = [list, trashList]
  const updatedItems = []

  for (const listRef of allLists) {
    for (let i = 0; i < listRef.value.length; i++) {
      const item = listRef.value[i]
      const images = normalizeGoodsImageList(item.images)
      let changed = false

      const nextImages = images.map((img) => {
        const uri = String(img?.uri || '').trim()
        if (!uri.startsWith('data:image/')) return img
        const cloudFileName = String(img?.cloudFileName || parseCloudImageUri(uri) || '').trim()
        if (!cloudFileName) return img
        if (skipFiles && skipFiles.has(cloudFileName)) return img
        if (cloudFiles && !cloudFiles[cloudFileName]) return img
        changed = true
        const publicUrl = backend.getImagePublicUrl(cloudFileName)
        aliasCachedImage(uri, publicUrl)
        return { ...img, uri: publicUrl, storageMode: 'remote' }
      })

      if (!changed) continue
      // 纯本地的 base64→URL 表示替换，保持 updatedAt 不变：
      // bump 会被当成"本地已改"触发冗余推送，并在 LWW 中压过其他设备的同期真实编辑
      listRef.value[i] = { ...item, images: nextImages }
      updatedItems.push(listRef.value[i])
    }
  }

  if (updatedItems.length > 0) {
    triggerRef(list)
    triggerRef(trashList)
    await saveItems(updatedItems)
  }
}

export {
  addMultipleGoods,
  refreshList,
  importGoodsBackup,
  updateGoodsBackup,
  importTrashBackup,
  updateTrashBackup,
  markImagesAsRemote,
  cleanupBase64Images
}
