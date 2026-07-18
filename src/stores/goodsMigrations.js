import { triggerRef } from 'vue'
import { saveItems, deleteItems, saveEvents } from '@/utils/db/index'
import { buildGoodsIdentityKey } from '@/utils/goods/identity'
import { getPrimaryGoodsImageUrl, normalizeGoodsImageList, parseGistImageUri } from '@/utils/goods/images'
import { normalizeCharacterList, normalizeGoodsInput, normalizeTrashItem, mergeGoodsRecord } from '@/stores/goodsHelpers'
import { GOODS_IMAGE_BUCKET, EVENT_PHOTO_BUCKET } from '@/services/supabaseAdapter/storage'
import { readSyncKey } from '@/utils/sync/storage'

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

async function normalizeExistingCharacters(list, trashList, persistTrash) {
  const updates = []
  list.value = list.value.map((item) => {
    const normalizedCharacters = normalizeCharacterList(item.characters)
    if (deepEqual(normalizedCharacters, item.characters)) return item
    const next = { ...item, characters: normalizedCharacters, updatedAt: Date.now() }
    updates.push(next)
    return next
  })

  let trashChanged = false
  trashList.value = trashList.value.map((item) => {
    const normalizedCharacters = normalizeCharacterList(item.characters)
    if (deepEqual(normalizedCharacters, item.characters)) return item
    trashChanged = true
    return { ...item, characters: normalizedCharacters, updatedAt: Date.now() }
  })

  if (updates.length > 0) {
    triggerRef(list)
    await saveItems(updates)
  }
  if (trashChanged) {
    triggerRef(trashList)
    await persistTrash()
  }
}

async function normalizeExistingVariants(list, trashList, persistTrash) {
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

  let trashChanged = false
  trashList.value = trashList.value.map((item) => {
    const normalized = normalizeTrashItem(item, item.id)
    if (deepEqual(normalized, item)) return item
    const next = { ...normalized, updatedAt: now }
    trashChanged = true
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
  if (trashChanged) {
    triggerRef(trashList)
    await persistTrash()
  }
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

  function toPublicUrl(gistFileName) {
    const bucket = gistFileName.startsWith('event-photo__') ? EVENT_PHOTO_BUCKET : GOODS_IMAGE_BUCKET
    const path = gistFileName.replace(/\.txt$/, '')
    return `${supabaseUrl}/storage/v1/object/public/${bucket}/${path}`
  }

  const updates = []
  list.value = list.value.map((item) => {
    if (!Array.isArray(item.images) || item.images.length === 0) return item
    let changed = false
    const images = item.images.map((img) => {
      const uri = String(img?.uri || '').trim()
      if (!uri.startsWith('data:image/')) return img
      const gistFileName = String(img?.gistFileName || parseGistImageUri(uri) || '').trim()
      if (!gistFileName) return img
      changed = true
      return { ...img, uri: toPublicUrl(gistFileName), storageMode: 'remote' }
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

  function toPublicUrl(gistFileName) {
    const bucket = gistFileName.startsWith('event-photo__') ? EVENT_PHOTO_BUCKET : GOODS_IMAGE_BUCKET
    const path = gistFileName.replace(/\.txt$/, '')
    return `${supabaseUrl}/storage/v1/object/public/${bucket}/${path}`
  }

  const updates = []
  eventList.value = eventList.value.map((event) => {
    let changed = false
    let nextCoverImage = event.coverImage
    let nextPhotos = event.photos

    const coverUri = String(event.coverImage || '').trim()
    if (coverUri.startsWith('data:image/')) {
      const gistFileName = String(event?.coverImageData?.gistFileName || parseGistImageUri(coverUri) || '').trim()
      if (gistFileName) {
        nextCoverImage = toPublicUrl(gistFileName)
        changed = true
      }
    }

    if (Array.isArray(event.photos) && event.photos.length > 0) {
      nextPhotos = event.photos.map((photo) => {
        const photoUri = String(photo?.uri || '').trim()
        if (!photoUri.startsWith('data:image/')) return photo
        const gistFileName = String(photo?.gistFileName || parseGistImageUri(photoUri) || '').trim()
        if (!gistFileName) return photo
        changed = true
        return { ...photo, uri: toPublicUrl(gistFileName), storageMode: 'remote' }
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
  replaceEventBase64WithPublicUrls
}
