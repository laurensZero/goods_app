import { getItems, saveItems } from '@/utils/db'
import { buildGoodsIdentityKey } from '@/utils/goodsIdentity'
import { deleteManagedLocalImages } from '@/utils/localImage'
import { triggerRef } from 'vue'
import {
  normalizeGoodsInput,
  normalizeTrashItem,
  mergeGoodsRecord,
  shouldApplyRemoteBackup,
  restoreImportedGoodsItem,
  diffRemovedManagedImagePaths
} from '@/stores/goodsHelpers'
import { writePersistedTrash } from '@/stores/goodsPersistence'
import { normalizeGoodsImageList } from '@/utils/goodsImages'
import { isLocalImageUri } from '@/utils/localImage'

async function persistTrash(trashList) {
  await writePersistedTrash(trashList.value)
}

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
    newItems.push(normalized)
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

async function importGoodsBackup(items, list) {
  const existingIds = new Set(list.value.map((item) => item.id))
  const importableItems = items.filter((item) => item.id && !existingIds.has(item.id))
  const newItems = await Promise.all(
    importableItems.map(async (item) => normalizeGoodsInput({
      ...(await restoreImportedGoodsItem(item)),
      __imagesExplicit: true,
      image: '',
      coverImage: ''
    }, item.id))
  )

  if (newItems.length === 0) return 0

  list.value = [...newItems, ...list.value]

  await saveItems(newItems)
  return newItems.length
}

async function updateGoodsBackup(items, list) {
  if (!Array.isArray(items) || items.length === 0) return 0

  const existingMap = new Map(list.value.map((item) => [item.id, item]))
  const updatedItems = []

  for (const remoteItem of items) {
    const localItem = existingMap.get(remoteItem.id)
    if (!localItem || !shouldApplyRemoteBackup(localItem, remoteItem)) continue

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
    const idx = list.value.findIndex((item) => item.id === remoteItem.id)
    if (idx === -1) continue
    list.value[idx] = normalized
    updatedItems.push(normalized)
    await deleteManagedLocalImages(removedPaths)
  }

  if (updatedItems.length > 0) {
    triggerRef(list)
    await saveItems(updatedItems)
  }

  return updatedItems.length
}

async function importTrashBackup(items, trashList) {
  if (!Array.isArray(items) || items.length === 0) return 0

  const existingIds = new Set(trashList.value.map((item) => item.id))
  const importableItems = items.filter((item) => item.id && !existingIds.has(item.id))
  const newItems = await Promise.all(
    importableItems.map(async (item) => normalizeTrashItem({
      ...(await restoreImportedGoodsItem(item)),
      __imagesExplicit: true,
      image: '',
      coverImage: ''
    }, item.id))
  )

  if (newItems.length === 0) return 0

  trashList.value = [...newItems, ...trashList.value]
  await persistTrash(trashList)
  return newItems.length
}

async function updateTrashBackup(items, trashList) {
  if (!Array.isArray(items) || items.length === 0) return 0

  const existingMap = new Map(trashList.value.map((item) => [item.id, item]))
  const updatedItems = []

  for (const remoteItem of items) {
    const localItem = existingMap.get(remoteItem.id)
    if (localItem && shouldApplyRemoteBackup(localItem, remoteItem)) {
      const idx = trashList.value.findIndex(g => g.id === remoteItem.id)
      if (idx !== -1) {
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
        trashList.value[idx] = normalized
        updatedItems.push(normalized)
        await deleteManagedLocalImages(removedPaths)
      }
    }
  }

  if (updatedItems.length > 0) {
    triggerRef(trashList)
    await persistTrash(trashList)
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
        if (idx >= 0 && idx < images.length && prepared.gistFileName) {
          const currentUri = String(images[idx]?.uri || '').trim()
          const keepLocalUri = !!currentUri && (
            currentUri.startsWith('blob:')
            || currentUri.startsWith('data:image/')
            || isLocalImageUri(currentUri)
          )
          images[idx] = {
            ...images[idx],
            // Preserve local URI for offline display, but keep gist metadata for dedup/upload decisions.
            uri: keepLocalUri ? currentUri : (prepared.uri || `gist-image://${prepared.gistFileName}`),
            storageMode: 'gist-local',
            gistFileName: prepared.gistFileName,
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

export {
  addMultipleGoods,
  refreshList,
  importGoodsBackup,
  updateGoodsBackup,
  importTrashBackup,
  updateTrashBackup,
  markImagesAsRemote
}
