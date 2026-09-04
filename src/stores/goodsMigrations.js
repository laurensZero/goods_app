import { triggerRef } from 'vue'
import { saveItems, deleteItems, saveEvents } from '@/utils/db/index'
import { buildGoodsIdentityKey } from '@/utils/goods/identity'
import { getPrimaryGoodsImageUrl, normalizeGoodsImageList, parseCloudImageUri } from '@/utils/goods/images'
import { normalizeCharacterList, normalizeGoodsInput, normalizeTrashItem, mergeGoodsRecord } from '@/stores/goodsHelpers'
import { GOODS_IMAGE_BUCKET, EVENT_PHOTO_BUCKET } from '@/services/supabaseAdapter/storage'
import { readSyncKey } from '@/utils/sync/storage'
import { aliasCachedImage } from '@/utils/image/cache'
import {
  readPersistedTrash,
  removeTrashStorage,
  readTrashSameTableMigrationFlag,
  writeTrashSameTableMigrationFlag
} from '@/stores/goodsPersistence'

const SUPABASE_URL_KEY = 'sync_supabase_url'

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function deepEqual(left, right) {
  if (Object.is(left, right)) return true
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false
    for (let i = 0; i < left.length; i++) {
      if (!deepEqual(left[i], right[i])) return false
    }
    return true
  }
  if (isPlainObject(left) || isPlainObject(right)) {
    if (!isPlainObject(left) || !isPlainObject(right)) return false
    const leftKeys = Object.keys(left)
    const rightKeys = Object.keys(right)
    if (leftKeys.length !== rightKeys.length) return false
    for (const key of leftKeys) {
      if (!Object.prototype.hasOwnProperty.call(right, key)) return false
      if (!deepEqual(left[key], right[key])) return false
    }
    return true
  }
  return false
}

async function normalizeExistingCharacters(list, trashList) {
  const updates = []
  list.value = list.value.map((item) => {
    const normalizedCharacters = normalizeCharacterList(item.characters)
    if (deepEqual(normalizedCharacters, item.characters)) return item
    const next = { ...item, characters: normalizedCharacters, updatedAt: Date.now() }
    updates.push(next)
    return next
  })

  const trashUpdates = []
  trashList.value = trashList.value.map((item) => {
    const normalizedCharacters = normalizeCharacterList(item.characters)
    if (deepEqual(normalizedCharacters, item.characters)) return item
    const next = { ...item, characters: normalizedCharacters, updatedAt: Date.now() }
    trashUpdates.push(next)
    return next
  })

  if (updates.length > 0) {
    triggerRef(list)
    await saveItems(updates)
  }
  if (trashUpdates.length > 0) {
    triggerRef(trashList)
    await saveItems(trashUpdates)
  }
}

async function normalizeExistingVariants(list, trashList) {
  const now = Date.now()
  let listChanged = false
  const mergedList = []
  const mergedKeyToIndex = new Map()
  const removedIds = new Set()

  list.value.forEach((item) => {
    const normalized = normalizeGoodsInput(item, item.id)
    const unchanged = deepEqual(normalized, item)
    const next = unchanged ? item : { ...normalized, updatedAt: now }
    if (!unchanged) listChanged = true

    const key = `${next.isWishlist ? 1 : 0}::${buildGoodsIdentityKey(next)}`
    if (mergedKeyToIndex.has(key)) {
      const existingIndex = mergedKeyToIndex.get(key)
      mergedList[existingIndex] = { ...mergeGoodsRecord(mergedList[existingIndex], next), updatedAt: now }
      removedIds.add(next.id)
      listChanged = true
      return
    }

    mergedKeyToIndex.set(key, mergedList.length)
    mergedList.push(next)
  })

  const trashUpdates = []
  trashList.value = trashList.value.map((item) => {
    const normalized = normalizeTrashItem(item, item.id)
    if (deepEqual(normalized, item)) return item
    const next = { ...normalized, updatedAt: now }
    trashUpdates.push(next)
    return next
  })

  if (listChanged) {
    list.value = mergedList
    triggerRef(list)
    await saveItems(mergedList)
    if (removedIds.size > 0) {
      await deleteItems(Array.from(removedIds))
    }
  }
  if (trashUpdates.length > 0) {
    triggerRef(trashList)
    await saveItems(trashUpdates)
  }
}

/**
 * 一次性迁移：把 Preferences 里的旧回收站（TRASH_STORAGE_KEY）回填进 goods 表，
 * trashList 从此以 trashed=1 行为数据源。Preferences trashList 是回收站展示的
 * 权威源，规则（与被替代的 reconcileListTrashOverlap 一致）：
 *  - 同 id 已在回收站桶 → 以 Preferences 内容覆盖该行（补齐 deletedAt 等字段）
 *  - 同 id 在活跃桶 → 按 LWW 裁决：回收站条目不早于活跃行才移入回收站；
 *    活跃行较新说明条目过期，直接丢弃
 *  - 两桶都没有 → 作为 trashed=1 行插入
 * 回填成功后写迁移 flag 并清空 TRASH_STORAGE_KEY；任一步失败则保留现场下次重试。
 */
async function migratePreferencesTrashToDb(list, trashList, purgedTrashIds) {
  if (await readTrashSameTableMigrationFlag()) return 0

  const legacyTrash = await readPersistedTrash()
  if (!Array.isArray(legacyTrash) || legacyTrash.length === 0) {
    await writeTrashSameTableMigrationFlag()
    await removeTrashStorage()
    return 0
  }

  const purged = purgedTrashIds instanceof Set
    ? purgedTrashIds
    : (purgedTrashIds?.value instanceof Set ? purgedTrashIds.value : new Set())
  const trashIdSet = new Set(trashList.value.map((item) => item.id))
  const activeById = new Map(list.value.map((item) => [item.id, item]))

  const rowsToWrite = []
  const importedTrash = []
  const overwrittenTrashIds = new Set()
  const idsToUnlist = new Set()

  for (const raw of legacyTrash) {
    const id = String(raw?.id || '').trim()
    if (!id || purged.has(id)) continue
    // 旧条目可能缺 deletedAt：以删除时刻写入的 updatedAt 兜底
    const item = normalizeTrashItem({
      ...raw,
      trashed: true,
      deletedAt: raw.deletedAt || (raw.updatedAt ? new Date(raw.updatedAt).toISOString() : '')
    }, id)

    const activeItem = activeById.get(id)
    if (activeItem && !trashIdSet.has(id)) {
      if ((Number(item.updatedAt) || 0) >= (Number(activeItem.updatedAt) || 0)) {
        idsToUnlist.add(id)
      } else {
        continue
      }
    }

    rowsToWrite.push(item)
    if (trashIdSet.has(id)) overwrittenTrashIds.add(id)
    importedTrash.push(item)
  }

  if (rowsToWrite.length > 0) {
    await saveItems(rowsToWrite)
    trashList.value = [
      ...importedTrash,
      ...trashList.value.filter((item) => !overwrittenTrashIds.has(item.id))
    ]
    if (idsToUnlist.size > 0) {
      list.value = list.value.filter((item) => !idsToUnlist.has(item.id))
    }
  }

  await writeTrashSameTableMigrationFlag()
  await removeTrashStorage()
  return rowsToWrite.length
}

async function backfillLegacyImages(list) {
  const updates = []
  list.value = list.value.map((item) => {
    if (Array.isArray(item.images) && item.images.length > 0) return item
    const legacyCover = String(item.coverImage || '').trim()
    if (!legacyCover) return item
    const images = normalizeGoodsImageList(undefined, legacyCover)
    if (images.length === 0) return item
    const coverImage = getPrimaryGoodsImageUrl(images, legacyCover)
    const next = { ...item, images, coverImage }
    updates.push(next)
    return next
  })

  if (updates.length > 0) {
    triggerRef(list)
    await saveItems(updates)
  }
}

/**
 * Replace data:image/ base64 URIs in goods images with Supabase public URLs.
 * Runs once on startup. Only acts when a Supabase client is available.
 */
async function replaceBase64WithPublicUrls(list) {
  const supabaseUrl = await readSyncKey(SUPABASE_URL_KEY).catch(() => '') || ''
  if (!supabaseUrl) return 'skip'

  function toPublicUrl(cloudFileName) {
    const bucket = cloudFileName.startsWith('event-photo__') ? EVENT_PHOTO_BUCKET : GOODS_IMAGE_BUCKET
    const path = cloudFileName.replace(/\.txt$/, '')
    return `${supabaseUrl}/storage/v1/object/public/${bucket}/${path}`
  }

  const updates = []
  list.value = list.value.map((item) => {
    if (!Array.isArray(item.images) || item.images.length === 0) return item
    let changed = false
    const images = item.images.map((img) => {
      const uri = String(img?.uri || '').trim()
      if (!uri.startsWith('data:image/')) return img
      const cloudFileName = String(img?.cloudFileName || parseCloudImageUri(uri) || '').trim()
      if (!cloudFileName) return img
      changed = true
      const publicUrl = toPublicUrl(cloudFileName)
      aliasCachedImage(uri, publicUrl)
      return { ...img, uri: publicUrl, storageMode: 'remote' }
    })
    if (!changed) return item
    const next = { ...item, images, updatedAt: Date.now() }
    updates.push(next)
    return next
  })

  if (updates.length > 0) {
    triggerRef(list)
    await saveItems(updates)
  }
  return 'done'
}

/**
 * Replace data:image/ base64 URIs in event coverImage and photos with Supabase public URLs.
 */
async function replaceEventBase64WithPublicUrls(eventList) {
  const supabaseUrl = await readSyncKey(SUPABASE_URL_KEY).catch(() => '') || ''
  if (!supabaseUrl) return

  function toPublicUrl(cloudFileName) {
    const bucket = cloudFileName.startsWith('event-photo__') ? EVENT_PHOTO_BUCKET : GOODS_IMAGE_BUCKET
    const path = cloudFileName.replace(/\.txt$/, '')
    return `${supabaseUrl}/storage/v1/object/public/${bucket}/${path}`
  }

  const updates = []
  eventList.value = eventList.value.map((event) => {
    let changed = false
    let nextCoverImage = event.coverImage
    let nextPhotos = event.photos

    const coverUri = String(event.coverImage || '').trim()
    if (coverUri.startsWith('data:image/')) {
      const cloudFileName = String(event?.coverImageData?.cloudFileName || parseCloudImageUri(coverUri) || '').trim()
      if (cloudFileName) {
        nextCoverImage = toPublicUrl(cloudFileName)
        aliasCachedImage(coverUri, nextCoverImage)
        changed = true
      }
    }

    if (Array.isArray(event.photos) && event.photos.length > 0) {
      nextPhotos = event.photos.map((photo) => {
        const photoUri = String(photo?.uri || '').trim()
        if (!photoUri.startsWith('data:image/')) return photo
        const cloudFileName = String(photo?.cloudFileName || parseCloudImageUri(photoUri) || '').trim()
        if (!cloudFileName) return photo
        changed = true
        const publicUrl = toPublicUrl(cloudFileName)
        aliasCachedImage(photoUri, publicUrl)
        return { ...photo, uri: publicUrl, storageMode: 'remote' }
      })
    }

    if (!changed) return event
    const next = { ...event, coverImage: nextCoverImage, photos: nextPhotos, updatedAt: Date.now() }
    updates.push(next)
    return next
  })

  if (updates.length > 0) {
    triggerRef(eventList)
    await saveEvents(updates)
  }
}

export {
  normalizeExistingCharacters,
  normalizeExistingVariants,
  backfillLegacyImages,
  replaceBase64WithPublicUrls,
  replaceEventBase64WithPublicUrls,
  migratePreferencesTrashToDb
}
