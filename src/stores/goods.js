import { Capacitor } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'
import { defineStore } from 'pinia'
import { ref, shallowRef, computed, triggerRef } from 'vue'
import { getItems, addItem, saveItems, deleteItems } from '@/utils/db'
import {
  buildGoodsIdentityKey,
  getGoodsVariant,
  normalizeGoodsName,
  stripVariantFromNote
} from '@/utils/goodsIdentity'
import {
  isStorageLocationUnderPrefix,
  normalizeStorageLocationValue,
  replaceStorageLocationPrefix as replaceStorageLocationPathPrefix
} from '@/utils/storageLocations'
import {
  getPrimaryGoodsImageUrl,
  normalizeGoodsImageList
} from '@/utils/goodsImages'
import { restoreLocalImageFromDataUrl } from '@/utils/localImage'
import { normalizeCharacterName } from '@/stores/presets'

const TRASH_STORAGE_KEY = 'goods_trash_items'
const IMAGES_MIGRATION_KEY = 'goods_images_migrated_v1'
const CHARACTERS_MIGRATION_KEY = 'goods_characters_normalized_v1'
const VARIANT_MIGRATION_KEY = 'goods_variant_normalized_v1'
const IS_NATIVE = Capacitor.isNativePlatform()

function isValidYearMonth(value) {
  return /^\d{4}-\d{2}$/.test(value)
}

function parseAcquiredTime(value) {
  if (!value) return 0
  const timestamp = Date.parse(String(value))
  return Number.isFinite(timestamp) ? timestamp : 0
}

function parseTimelineYearMonth(value) {
  const yearMonth = String(value || '').slice(0, 7)
  return isValidYearMonth(yearMonth) ? yearMonth : ''
}

function buildComparableImageState(item) {
  return normalizeGoodsImageList(item?.images, item?.coverImage || item?.image)
    .map((entry) => ({
      id: String(entry?.id || '').trim(),
      kind: String(entry?.kind || '').trim(),
      label: String(entry?.label || '').trim(),
      isPrimary: entry?.isPrimary === true,
      source: String(entry?.gistFileName || entry?.uri || '').trim(),
      mimeType: String(entry?.mimeType || '').trim(),
      fileSize: Number(entry?.fileSize) > 0 ? Number(entry.fileSize) : 0
    }))
}

function shouldApplyRemoteBackup(localItem, remoteItem) {
  if (!localItem) return true
  if ((remoteItem?.updatedAt || 0) > (localItem?.updatedAt || 0)) return true
  return JSON.stringify(buildComparableImageState(localItem)) !== JSON.stringify(buildComparableImageState(remoteItem))
}

function parseNumericPrice(value) {
  const price = Number.parseFloat(value)
  return Number.isFinite(price) ? price : 0
}

function parseQuantity(value) {
  return Math.max(1, Number(value) || 1)
}

function normalizeWishlistFlag(value) {
  return value === true || value === 1 || value === '1'
}

function normalizeCharacterList(list) {
  if (!Array.isArray(list)) return []
  return [...new Set(
    list
      .map((name) => normalizeCharacterName(name))
      .filter(Boolean)
  )]
}

function normalizeTagList(list) {
  if (!Array.isArray(list)) return []
  return [...new Set(
    list
      .map((tag) => String(tag || '').trim())
      .filter(Boolean)
  )]
}

function mergeGoodsImages(existingImages, incomingImages, existingImage = '', incomingImage = '') {
  const merged = normalizeGoodsImageList(
    [...normalizeGoodsImageList(existingImages, existingImage), ...normalizeGoodsImageList(incomingImages, incomingImage)],
    existingImage || incomingImage
  )

  return merged.length > 0 ? merged : normalizeGoodsImageList([], existingImage || incomingImage)
}

function parseDeletedTime(value) {
  if (!value) return 0
  const timestamp = Date.parse(String(value))
  return Number.isFinite(timestamp) ? timestamp : 0
}

function parsePersistedList(raw) {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function readTrashLocal() {
  try {
    return parsePersistedList(localStorage.getItem(TRASH_STORAGE_KEY))
  } catch {
    return []
  }
}

function writeTrashLocal(list) {
  try {
    localStorage.setItem(TRASH_STORAGE_KEY, JSON.stringify(list))
  } catch {
    // ignore
  }
}

async function readPersistedTrash() {
  if (IS_NATIVE) {
    try {
      const { value } = await Preferences.get({ key: TRASH_STORAGE_KEY })
      if (value !== null) return parsePersistedList(value)
    } catch {
      // fall through
    }
  }

  return readTrashLocal()
}

async function writePersistedTrash(list) {
  writeTrashLocal(list)

  if (!IS_NATIVE) return

  try {
    await Preferences.set({
      key: TRASH_STORAGE_KEY,
      value: JSON.stringify(list)
    })
  } catch {
    // ignore
  }
}

function readImagesMigrationFlagLocal() {
  try {
    return localStorage.getItem(IMAGES_MIGRATION_KEY) === '1'
  } catch {
    return false
  }
}

async function readImagesMigrationFlag() {
  if (IS_NATIVE) {
    try {
      const { value } = await Preferences.get({ key: IMAGES_MIGRATION_KEY })
      return value === '1'
    } catch {
      return false
    }
  }

  return readImagesMigrationFlagLocal()
}

async function writeImagesMigrationFlag() {
  try {
    localStorage.setItem(IMAGES_MIGRATION_KEY, '1')
  } catch {
    // ignore
  }

  if (!IS_NATIVE) return

  try {
    await Preferences.set({ key: IMAGES_MIGRATION_KEY, value: '1' })
  } catch {
    // ignore
  }
}

function readCharactersMigrationFlagLocal() {
  try {
    return localStorage.getItem(CHARACTERS_MIGRATION_KEY) === '1'
  } catch {
    return false
  }
}

async function readCharactersMigrationFlag() {
  if (IS_NATIVE) {
    try {
      const { value } = await Preferences.get({ key: CHARACTERS_MIGRATION_KEY })
      return value === '1'
    } catch {
      return false
    }
  }

  return readCharactersMigrationFlagLocal()
}

async function writeCharactersMigrationFlag() {
  try {
    localStorage.setItem(CHARACTERS_MIGRATION_KEY, '1')
  } catch {
    // ignore
  }

  if (!IS_NATIVE) return

  try {
    await Preferences.set({ key: CHARACTERS_MIGRATION_KEY, value: '1' })
  } catch {
    // ignore
  }
}

function readVariantMigrationFlagLocal() {
  try {
    return localStorage.getItem(VARIANT_MIGRATION_KEY) === '1'
  } catch {
    return false
  }
}

async function readVariantMigrationFlag() {
  if (IS_NATIVE) {
    try {
      const { value } = await Preferences.get({ key: VARIANT_MIGRATION_KEY })
      return value === '1'
    } catch {
      return false
    }
  }

  return readVariantMigrationFlagLocal()
}

async function writeVariantMigrationFlag() {
  try {
    localStorage.setItem(VARIANT_MIGRATION_KEY, '1')
  } catch {
    // ignore
  }

  if (!IS_NATIVE) return

  try {
    await Preferences.set({ key: VARIANT_MIGRATION_KEY, value: '1' })
  } catch {
    // ignore
  }
}

async function restoreImportedGoodsItem(rawItem) {
  const normalizedImages = normalizeGoodsImageList(rawItem?.images, rawItem?.coverImage || rawItem?.image)
  if (normalizedImages.length === 0) return rawItem

  const restoredImages = await Promise.all(normalizedImages.map(async (entry) => {
    if (!String(entry.uri || '').startsWith('data:image/')) return entry

    return {
      ...entry,
      uri: await restoreLocalImageFromDataUrl(entry.uri),
      storageMode: '',
      localPath: ''
    }
  }))

  const images = normalizeGoodsImageList(restoredImages)
  const coverImage = getPrimaryGoodsImageUrl(images, rawItem?.coverImage || rawItem?.image)

  return {
    ...rawItem,
    image: coverImage,
    coverImage,
    images
  }
}

export const useGoodsStore = defineStore('goods', () => {
  const list = shallowRef([])
  const trashList = shallowRef([])
  const isReady = ref(false)

  const getById = computed(() => (id) => list.value.find((item) => item.id === id))
  const getTrashById = computed(() => (id) => trashList.value.find((item) => item.id === id))
  const collectionList = computed(() => list.value.filter((item) => !item.isWishlist))
  const wishlistList = computed(() => list.value.filter((item) => item.isWishlist))
  const storageLocations = computed(() =>
    [...new Set(
      collectionList.value
        .map((item) => normalizeStorageLocationValue(item.storageLocation || ''))
        .filter(Boolean)
    )].sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'))
  )
  const viewList = computed(() =>
    list.value.map((item) => {
      const quantityNumber = parseQuantity(item.quantity)
      const priceNumber = parseNumericPrice(item.price)

      return {
        ...item,
        isWishlist: normalizeWishlistFlag(item.isWishlist),
        sortId: String(item.id),
        acquiredTime: parseAcquiredTime(item.acquiredAt),
        timelineYearMonth: parseTimelineYearMonth(item.acquiredAt),
        priceNumber,
        quantityNumber,
        totalValueNumber: priceNumber * quantityNumber
      }
    })
  )
  const collectionViewList = computed(() => viewList.value.filter((item) => !item.isWishlist))
  const wishlistViewList = computed(() => viewList.value.filter((item) => item.isWishlist))
  const trashViewList = computed(() =>
    [...trashList.value]
      .map((item) => {
        const quantityNumber = parseQuantity(item.quantity)
        const priceNumber = parseNumericPrice(item.price)

        return {
          ...item,
          deletedTime: parseDeletedTime(item.deletedAt),
          acquiredTime: parseAcquiredTime(item.acquiredAt),
          priceNumber,
          quantityNumber,
          totalValueNumber: priceNumber * quantityNumber
        }
      })
      .sort((a, b) => b.deletedTime - a.deletedTime || b.acquiredTime - a.acquiredTime)
  )

  function normalizeGoodsInput(data, fallbackId = '') {
    const variant = getGoodsVariant(data)
    const hasImagesArray = Array.isArray(data?.images)
    const imagesExplicit = data?.__imagesExplicit === true && hasImagesArray
    const shouldUseImagesArray = imagesExplicit || (hasImagesArray && data.images.length > 0)
    const fallbackImage = imagesExplicit ? '' : (data.image || data.coverImage)
    const images = normalizeGoodsImageList(shouldUseImagesArray ? data.images : undefined, fallbackImage)
    const coverImage = getPrimaryGoodsImageUrl(images, fallbackImage)

    return {
      id: data.id || fallbackId,
      name: normalizeGoodsName(data.name),
      category: String(data.category || '').trim(),
      ip: String(data.ip || '').trim(),
      isWishlist: normalizeWishlistFlag(data.isWishlist),
      characters: normalizeCharacterList(data.characters),
      tags: normalizeTagList(data.tags),
      storageLocation: normalizeStorageLocationValue(data.storageLocation || data.location || ''),
      variant,
      price: data.price === '' || data.price == null ? '' : data.price,
      points: data.points != null && data.points !== '' ? Number(data.points) : undefined,
      acquiredAt: String(data.acquiredAt || data.purchaseDate || '').trim(),
      coverImage,
      images,
      note: stripVariantFromNote(data.note || data.notes || ''),
      quantity: Math.max(1, Number(data.quantity) || 1),
      updatedAt: data.updatedAt || 0
    }
  }

  function normalizeTrashItem(data, fallbackId = '') {
    return {
      ...normalizeGoodsInput(data, fallbackId),
      deletedAt: String(data.deletedAt || new Date().toISOString()).trim()
    }
  }

  function mergeGoodsRecord(existing, incoming) {
    const variant = getGoodsVariant(existing) || getGoodsVariant(incoming)
    const images = mergeGoodsImages(existing.images, incoming.images, existing.coverImage, incoming.coverImage)

    return {
      ...existing,
      name: existing.name || incoming.name,
      category: existing.category || incoming.category,
      ip: existing.ip || incoming.ip,
      isWishlist: normalizeWishlistFlag(existing.isWishlist),
      characters: existing.characters?.length ? existing.characters : incoming.characters,
      tags: normalizeTagList([...(existing.tags || []), ...(incoming.tags || [])]),
      storageLocation: existing.storageLocation || incoming.storageLocation,
      variant,
      price: existing.price === '' || existing.price == null ? incoming.price : existing.price,
      points: existing.points ?? incoming.points,
      acquiredAt: existing.acquiredAt || incoming.acquiredAt,
      coverImage: getPrimaryGoodsImageUrl(images, existing.coverImage || incoming.coverImage),
      images,
      note: stripVariantFromNote(existing.note || '') || stripVariantFromNote(incoming.note || ''),
      quantity: Math.max(1, Number(existing.quantity) || 1) + Math.max(1, Number(incoming.quantity) || 1),
      updatedAt: Date.now()
    }
  }

  async function persistTrash() {
    await writePersistedTrash(trashList.value)
  }

  async function init() {
    list.value = (await getItems()).map((item) => normalizeGoodsInput(item, item.id))
    trashList.value = (await readPersistedTrash()).map((item) => normalizeTrashItem(item, item.id))
    if (!(await readImagesMigrationFlag())) {
      await backfillLegacyImages()
      await writeImagesMigrationFlag()
    }
    if (!(await readCharactersMigrationFlag())) {
      await normalizeExistingCharacters()
      await writeCharactersMigrationFlag()
    }
    if (!(await readVariantMigrationFlag())) {
      await normalizeExistingVariants()
      await writeVariantMigrationFlag()
    }
    isReady.value = true
  }

  async function normalizeExistingCharacters() {
    const updates = []
    list.value = list.value.map((item) => {
      const normalizedCharacters = normalizeCharacterList(item.characters)
      if (JSON.stringify(normalizedCharacters) === JSON.stringify(item.characters)) return item
      const next = { ...item, characters: normalizedCharacters, updatedAt: Date.now() }
      updates.push(next)
      return next
    })

    let trashChanged = false
    trashList.value = trashList.value.map((item) => {
      const normalizedCharacters = normalizeCharacterList(item.characters)
      if (JSON.stringify(normalizedCharacters) === JSON.stringify(item.characters)) return item
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

  async function normalizeExistingVariants() {
    const updates = []
    const now = Date.now()

    list.value = list.value.map((item) => {
      const normalized = normalizeGoodsInput(item, item.id)
      if (JSON.stringify(normalized) === JSON.stringify(item)) return item
      const next = { ...normalized, updatedAt: now }
      updates.push(next)
      return next
    })

    let trashChanged = false
    trashList.value = trashList.value.map((item) => {
      const normalized = normalizeTrashItem(item, item.id)
      if (JSON.stringify(normalized) === JSON.stringify(item)) return item
      const next = { ...normalized, updatedAt: now }
      trashChanged = true
      return next
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

  async function backfillLegacyImages() {
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

  async function addGoods(data) {
    const imagesExplicit = Array.isArray(data?.images)
    const now = Date.now()
    const incoming = normalizeGoodsInput({ ...data, __imagesExplicit: imagesExplicit, updatedAt: now }, String(now))
    const key = buildGoodsIdentityKey(incoming)
    const existingIndex = list.value.findIndex((item) =>
      item.isWishlist === incoming.isWishlist && buildGoodsIdentityKey(item) === key
    )

    if (existingIndex !== -1) {
      list.value[existingIndex] = mergeGoodsRecord(list.value[existingIndex], incoming)
    triggerRef(list)
      await addItem(list.value[existingIndex])
      return list.value[existingIndex]
    }

    list.value.unshift(incoming)
    triggerRef(list)
    await addItem(incoming)
    return incoming
  }

  async function updateGoods(id, data) {
    const idx = list.value.findIndex((item) => item.id === id)
    if (idx === -1) return null

    const imagesExplicit = Array.isArray(data?.images)
    list.value[idx] = normalizeGoodsInput({ ...list.value[idx], ...data, id, __imagesExplicit: imagesExplicit, updatedAt: Date.now() }, id)
    triggerRef(list)
    await addItem(list.value[idx])
    return id
  }

  async function updateMultipleGoods(ids, data) {
    let changed = false
    const imagesExplicit = Array.isArray(data?.images)
    const now = Date.now()

    list.value = list.value.map((item) => {
      if (!ids.has(item.id)) return item
      changed = true
      return normalizeGoodsInput({ ...item, ...data, id: item.id, __imagesExplicit: imagesExplicit, updatedAt: now }, item.id)
    })

    if (changed) {
      const updatedItems = list.value.filter(item => ids.has(item.id))
      await saveItems(updatedItems)
    }
  }

  async function removeGoods(id) {
    const item = list.value.find((entry) => entry.id === id)
    if (!item) return

    const now = Date.now()
    trashList.value.unshift(normalizeTrashItem({
      ...item,
      updatedAt: now,
      deletedAt: new Date(now).toISOString()
    }, item.id))
    triggerRef(trashList)
    list.value = list.value.filter((entry) => entry.id !== id)
    await Promise.all([
      deleteItems([id]),
      persistTrash()
    ])
  }

  async function removeMultipleGoods(ids) {
    const now = Date.now()
    const removedItems = list.value
      .filter((item) => ids.has(item.id))
      .map((item) => normalizeTrashItem({
        ...item,
        updatedAt: now,
        deletedAt: new Date(now).toISOString()
      }, item.id))

    if (removedItems.length === 0) return

    trashList.value = [...removedItems, ...trashList.value]
    list.value = list.value.filter((item) => !ids.has(item.id))
    await Promise.all([
      deleteItems(Array.from(ids)),
      persistTrash()
    ])
  }

  async function restoreTrashItem(id) {
    const item = trashList.value.find((entry) => entry.id === id)
    if (!item) return null

    const restored = normalizeGoodsInput({ ...item, updatedAt: Date.now() }, item.id)
    if (list.value.some((entry) => entry.id === restored.id)) {
      restored.id = String(Date.now())
    }

    list.value.unshift(restored)
    triggerRef(list)
    trashList.value = trashList.value.filter((entry) => entry.id !== id)
    await Promise.all([
      addItem(restored),
      persistTrash()
    ])
    return restored
  }

  async function deleteTrashItem(id) {
    const next = trashList.value.filter((entry) => entry.id !== id)
    if (next.length === trashList.value.length) return

    trashList.value = next
    await persistTrash()
  }

  async function emptyTrash() {
    if (trashList.value.length === 0) return
    trashList.value = []
    await persistTrash()
  }

  async function replaceCategoryName(oldName, newName) {
    const previous = String(oldName || '').trim()
    const next = String(newName || '').trim()
    if (!previous || !next || previous === next) return

    let listChanged = false
    let trashChanged = false
    const now = Date.now()

    list.value = list.value.map((item) => {
      if (item.category !== previous) return item
      listChanged = true
      return {
        ...item,
        category: next,
        updatedAt: now
      }
    })

    trashList.value = trashList.value.map((item) => {
      if (item.category !== previous) return item
      trashChanged = true
      return {
        ...item,
        category: next,
        updatedAt: now
      }
    })

    const updatedItems = list.value.filter(item => item.category === next)

    await Promise.all([
      listChanged ? saveItems(updatedItems) : Promise.resolve(),
      trashChanged ? persistTrash() : Promise.resolve()
    ])
  }

  async function replaceIpName(oldName, newName) {
    const previous = String(oldName || '').trim()
    const next = String(newName || '').trim()
    if (!previous || !next || previous === next) return

    let listChanged = false
    let trashChanged = false
    const now = Date.now()

    list.value = list.value.map((item) => {
      if (item.ip !== previous) return item
      listChanged = true
      return {
        ...item,
        ip: next,
        updatedAt: now
      }
    })

    trashList.value = trashList.value.map((item) => {
      if (item.ip !== previous) return item
      trashChanged = true
      return {
        ...item,
        ip: next,
        updatedAt: now
      }
    })

    const updatedItems = list.value.filter(item => item.ip === next)

    await Promise.all([
      listChanged ? saveItems(updatedItems) : Promise.resolve(),
      trashChanged ? persistTrash() : Promise.resolve()
    ])
  }

  async function replaceCharacterName(oldName, newName) {
    const previous = normalizeCharacterName(oldName)
    const next = normalizeCharacterName(newName)
    if (!previous || !next || previous === next) return

    let listChanged = false
    let trashChanged = false
    const now = Date.now()

    list.value = list.value.map((item) => {
      if (!item.characters?.includes(previous)) return item
      listChanged = true
      return {
        ...item,
        characters: normalizeCharacterList(
          item.characters.map((character) => (character === previous ? next : character))
        ),
        updatedAt: now
      }
    })

    trashList.value = trashList.value.map((item) => {
      if (!item.characters?.includes(previous)) return item
      trashChanged = true
      return {
        ...item,
        characters: normalizeCharacterList(
          item.characters.map((character) => (character === previous ? next : character))
        ),
        updatedAt: now
      }
    })

    const updatedItems = list.value.filter(item => item.characters?.includes(next))

    await Promise.all([
      listChanged ? saveItems(updatedItems) : Promise.resolve(),
      trashChanged ? persistTrash() : Promise.resolve()
    ])
  }

  async function syncCharacterIp(name, nextIp, previousIp = '') {
    const characterName = normalizeCharacterName(name)
    const currentIp = String(previousIp || '').trim()
    const targetIp = String(nextIp || '').trim()
    if (!characterName || currentIp === targetIp) return

    let listChanged = false
    let trashChanged = false
    const now = Date.now()

    const shouldSyncItem = (item) => {
      if (!item.characters?.includes(characterName)) return false
      const itemIp = String(item.ip || '').trim()
      return itemIp === currentIp || (!itemIp && targetIp)
    }

    list.value = list.value.map((item) => {
      if (!shouldSyncItem(item)) return item
      listChanged = true
      return {
        ...item,
        ip: targetIp,
        updatedAt: now
      }
    })

    trashList.value = trashList.value.map((item) => {
      if (!shouldSyncItem(item)) return item
      trashChanged = true
      return {
        ...item,
        ip: targetIp,
        updatedAt: now
      }
    })

    const updatedItems = list.value.filter(item => {
      if (!item.characters?.includes(characterName)) return false
      return item.ip === targetIp
    })

    await Promise.all([
      listChanged ? saveItems(updatedItems) : Promise.resolve(),
      trashChanged ? persistTrash() : Promise.resolve()
    ])
  }

  async function replaceStorageLocationPrefix(oldPrefix, newPrefix) {
    const normalizedOldPrefix = normalizeStorageLocationValue(oldPrefix)
    const normalizedNewPrefix = normalizeStorageLocationValue(newPrefix)
    if (!normalizedOldPrefix || normalizedOldPrefix === normalizedNewPrefix) return

    let changed = false
    const now = Date.now()
    list.value = list.value.map((item) => {
      const nextLocation = replaceStorageLocationPathPrefix(
        item.storageLocation,
        normalizedOldPrefix,
        normalizedNewPrefix
      )

      if (nextLocation === item.storageLocation) return item
      changed = true
      return {
        ...item,
        storageLocation: nextLocation,
        updatedAt: now
      }
    })

    if (changed) {
      const updatedItems = list.value.filter(item => isStorageLocationUnderPrefix(item.storageLocation, normalizedNewPrefix) || item.storageLocation === normalizedNewPrefix)
      await saveItems(updatedItems)
    }
  }

  async function clearStorageLocationPrefix(prefix) {
    const normalizedPrefix = normalizeStorageLocationValue(prefix)
    if (!normalizedPrefix) return

    let changed = false
    const now = Date.now()
    list.value = list.value.map((item) => {
      if (!isStorageLocationUnderPrefix(item.storageLocation, normalizedPrefix)) {
        return item
      }

      changed = true
      return {
        ...item,
        storageLocation: '',
        updatedAt: now
      }
    })

    if (changed) {
      const updatedItems = list.value.filter(item => item.storageLocation === '' && !isStorageLocationUnderPrefix(item.storageLocation, normalizedPrefix))
      await saveItems(updatedItems)
    }
  }

  async function addMultipleGoods(items) {
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

  async function refreshList() {
    list.value = (await getItems()).map((item) => normalizeGoodsInput(item, item.id))
  }

  async function importGoodsBackup(items) {
    const existingIds = new Set(list.value.map((item) => item.id))
    const importableItems = items.filter((item) => item.id && !existingIds.has(item.id))
    const newItems = await Promise.all(
      importableItems.map(async (item) => normalizeGoodsInput(await restoreImportedGoodsItem(item), item.id))
    )

    if (newItems.length === 0) return 0

    list.value = [...newItems, ...list.value]

    await saveItems(newItems)
    return newItems.length
  }

  async function updateGoodsBackup(items) {
    if (!Array.isArray(items) || items.length === 0) return 0

    const existingMap = new Map(list.value.map((item) => [item.id, item]))
    const updatedItems = []

    for (const remoteItem of items) {
      const localItem = existingMap.get(remoteItem.id)
      if (!localItem || !shouldApplyRemoteBackup(localItem, remoteItem)) continue

      const restoredRemote = await restoreImportedGoodsItem(remoteItem)
      const localImages = localItem.images || []
      const remoteImages = restoredRemote.images || []
      const remoteImageIds = new Set(remoteImages.map((image) => image.id))
      const localOnlyImages = localImages.filter((image) => !remoteImageIds.has(image.id))
      const mergedImages = [...remoteImages, ...localOnlyImages]
      const finalCoverImage = localOnlyImages.some((image) => image.uri === localItem.coverImage)
        ? localItem.coverImage
        : restoredRemote.coverImage

      const normalized = normalizeGoodsInput({
        ...localItem,
        ...restoredRemote,
        images: mergedImages,
        coverImage: finalCoverImage,
        updatedAt: remoteItem.updatedAt || restoredRemote.updatedAt || 0,
      }, remoteItem.id)
      const idx = list.value.findIndex((item) => item.id === remoteItem.id)
      if (idx === -1) continue
      list.value[idx] = normalized
      updatedItems.push(normalized)
    }

    if (updatedItems.length > 0) {
      triggerRef(list)
      await saveItems(updatedItems)
    }

    return updatedItems.length
  }

  async function importTrashBackup(items) {
    if (!Array.isArray(items) || items.length === 0) return 0

    const existingIds = new Set(trashList.value.map((item) => item.id))
    const importableItems = items.filter((item) => item.id && !existingIds.has(item.id))
    const newItems = await Promise.all(
      importableItems.map(async (item) => normalizeTrashItem(await restoreImportedGoodsItem(item), item.id))
    )

    if (newItems.length === 0) return 0

    trashList.value = [...newItems, ...trashList.value]
    await persistTrash()
    return newItems.length
  }

  async function updateTrashBackup(items) {
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
            updatedAt: remoteItem.updatedAt || restoredRemote.updatedAt || 0,
          }, remoteItem.id)
          trashList.value[idx] = normalized
          updatedItems.push(normalized)
        }
      }
    }

    if (updatedItems.length > 0) {
      triggerRef(trashList)
      await persistTrash()
    }
    return updatedItems.length
  }

  return {
    list,
    trashList,
    collectionList,
    wishlistList,
    viewList,
    collectionViewList,
    wishlistViewList,
    trashViewList,
    storageLocations,
    isReady,
    getById,
    getTrashById,
    init,
    addGoods,
    updateGoods,
    updateMultipleGoods,
    removeGoods,
    removeMultipleGoods,
    restoreTrashItem,
    deleteTrashItem,
    emptyTrash,
    replaceCategoryName,
    replaceIpName,
    replaceCharacterName,
    syncCharacterIp,
    replaceStorageLocationPrefix,
    clearStorageLocationPrefix,
    addMultipleGoods,
    importGoodsBackup,
    updateGoodsBackup,
    importTrashBackup,
    updateTrashBackup,
    refreshList
  }
})
