// @ts-check
import { defineStore } from 'pinia'
import { ref, shallowRef, computed, triggerRef } from 'vue'
import { getItems, addItem, saveItems, deleteItems } from '@/utils/db'
import { useExchangeRateStore } from '@/stores/exchangeRate'
import { buildGoodsIdentityKey } from '@/utils/goodsIdentity'
import { normalizeStorageLocationValue } from '@/utils/storageLocations'
import {
  collectManagedLocalImagePathsFromGoodsItem,
  deleteManagedLocalImages
} from '@/utils/localImage'
import {
  parseAcquiredTime,
  parseTimelineYearMonth,
  parseNumericPrice,
  parseQuantity,
  parseDeletedTime,
  normalizeWishlistFlag,
  resolveEffectivePriceValue,
  normalizeGoodsInput,
  normalizeTrashItem,
  mergeGoodsRecord,
  diffRemovedManagedImagePaths
} from '@/stores/goodsHelpers'
import {
  readPersistedTrash,
  writePersistedTrash,
  readImagesMigrationFlag,
  writeImagesMigrationFlag,
  readCharactersMigrationFlag,
  writeCharactersMigrationFlag,
  readVariantMigrationFlag,
  writeVariantMigrationFlag
} from '@/stores/goodsPersistence'
import {
  normalizeExistingCharacters,
  normalizeExistingVariants,
  backfillLegacyImages
} from '@/stores/goodsMigrations'
import {
  replaceCategoryName as _replaceCategoryName,
  replaceIpName as _replaceIpName,
  replaceCharacterName as _replaceCharacterName,
  syncCharacterIp as _syncCharacterIp
} from '@/stores/goodsBatchRename'
import {
  addMultipleGoods as _addMultipleGoods,
  refreshList as _refreshList,
  importGoodsBackup as _importGoodsBackup,
  updateGoodsBackup as _updateGoodsBackup,
  importTrashBackup as _importTrashBackup,
  updateTrashBackup as _updateTrashBackup
} from '@/stores/goodsSync'
import {
  replaceStorageLocationPrefix as _replaceStorageLocationPrefix,
  clearStorageLocationPrefix as _clearStorageLocationPrefix
} from '@/stores/goodsStorageOps'

export const useGoodsStore = defineStore('goods', () => {
  /** @type {import('vue').ShallowRef<import('@/types/models').GoodsItem[]>} */
  const list = shallowRef([])
  /** @type {import('vue').ShallowRef<import('@/types/models').TrashGoodsItem[]>} */
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
  const viewList = computed(() => {
    const exchangeRate = useExchangeRateStore()
    return list.value.map((item) => {
      const quantityNumber = parseQuantity(item.quantity)
      const officialPriceNumber = parseNumericPrice(item.price)
      const actualPriceNumber = parseNumericPrice(item.actualPrice)
      const effectivePriceNumber = parseNumericPrice(resolveEffectivePriceValue(item))
      const priceCNYNumber = exchangeRate.convertToCNY(effectivePriceNumber, item.currency)

      return {
        ...item,
        isWishlist: normalizeWishlistFlag(item.isWishlist),
        sortId: String(item.id),
        acquiredTime: parseAcquiredTime(item.acquiredAt),
        timelineYearMonth: parseTimelineYearMonth(item.acquiredAt),
        priceNumber: effectivePriceNumber,
        officialPriceNumber,
        actualPriceNumber,
        effectivePriceNumber,
        priceCNYNumber,
        quantityNumber,
        totalValueNumber: priceCNYNumber * quantityNumber
      }
    })
  })
  const collectionViewList = computed(() => viewList.value.filter((item) => !item.isWishlist))
  const wishlistViewList = computed(() => viewList.value.filter((item) => item.isWishlist))
  const trashViewList = computed(() => {
    const exchangeRate = useExchangeRateStore()
    return [...trashList.value]
      .map((item) => {
        const quantityNumber = parseQuantity(item.quantity)
        const officialPriceNumber = parseNumericPrice(item.price)
        const actualPriceNumber = parseNumericPrice(item.actualPrice)
        const effectivePriceNumber = parseNumericPrice(resolveEffectivePriceValue(item))
        const priceCNYNumber = exchangeRate.convertToCNY(effectivePriceNumber, item.currency)

        return {
          ...item,
          deletedTime: parseDeletedTime(item.deletedAt),
          acquiredTime: parseAcquiredTime(item.acquiredAt),
          priceNumber: effectivePriceNumber,
          officialPriceNumber,
          actualPriceNumber,
          effectivePriceNumber,
          priceCNYNumber,
          quantityNumber,
          totalValueNumber: priceCNYNumber * quantityNumber
        }
      })
      .sort((a, b) => b.deletedTime - a.deletedTime || b.acquiredTime - a.acquiredTime)
  })

  async function persistTrash() {
    await writePersistedTrash(trashList.value)
  }

  async function init() {
    try {
      list.value = (await getItems()).map((item) => normalizeGoodsInput(item, item.id))
    } catch (e) {
      console.error('[goods] init: getItems failed, starting with empty list:', e)
      list.value = []
    }
    try {
      trashList.value = (await readPersistedTrash()).map((item) => normalizeTrashItem(item, item.id))
    } catch (e) {
      console.error('[goods] init: readPersistedTrash failed, starting with empty trash:', e)
      trashList.value = []
    }
    try {
      if (!(await readImagesMigrationFlag())) {
        await backfillLegacyImages(list)
        await writeImagesMigrationFlag()
      }
    } catch (e) {
      console.warn('[goods] init: images migration failed:', e)
    }
    try {
      if (!(await readCharactersMigrationFlag())) {
        await normalizeExistingCharacters(list, trashList, persistTrash)
        await writeCharactersMigrationFlag()
      }
    } catch (e) {
      console.warn('[goods] init: characters migration failed:', e)
    }
    try {
      if (!(await readVariantMigrationFlag())) {
        await normalizeExistingVariants(list, trashList, persistTrash)
        await writeVariantMigrationFlag()
      }
    } catch (e) {
      console.warn('[goods] init: variants migration failed:', e)
    }
    isReady.value = true
  }

  //  CRUD

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
      try {
        await addItem(list.value[existingIndex])
      } catch (e) {
        console.error('[goods] addGoods (merge) DB write failed:', e)
        throw e
      }
      return list.value[existingIndex]
    }

    list.value.unshift(incoming)
    triggerRef(list)
    try {
      await addItem(incoming)
    } catch (e) {
      console.error('[goods] addGoods DB write failed:', e)
      throw e
    }
    return incoming
  }

  async function updateGoods(id, data) {
    const idx = list.value.findIndex((item) => item.id === id)
    if (idx === -1) return null

    const imagesExplicit = Array.isArray(data?.images)
    const previous = list.value[idx]
    const next = normalizeGoodsInput({ ...previous, ...data, id, __imagesExplicit: imagesExplicit, updatedAt: Date.now() }, id)
    const removedPaths = diffRemovedManagedImagePaths(previous, next)
    list.value[idx] = next
    triggerRef(list)
    try {
      await addItem(next)
      await deleteManagedLocalImages(removedPaths)
    } catch (e) {
      console.error('[goods] updateGoods DB write failed:', e)
      throw e
    }
    return id
  }

  async function updateMultipleGoods(ids, data) {
    let changed = false
    const imagesExplicit = Array.isArray(data?.images)
    const now = Date.now()
    const removedPaths = new Set()

    list.value = list.value.map((item) => {
      if (!ids.has(item.id)) return item
      changed = true
      const next = normalizeGoodsInput({ ...item, ...data, id: item.id, __imagesExplicit: imagesExplicit, updatedAt: now }, item.id)
      for (const path of diffRemovedManagedImagePaths(item, next)) {
        removedPaths.add(path)
      }
      return next
    })

    if (changed) {
      const updatedItems = list.value.filter(item => ids.has(item.id))
      try {
        await saveItems(updatedItems)
        await deleteManagedLocalImages(removedPaths)
      } catch (e) {
        console.error('[goods] updateMultipleGoods DB write failed:', e)
        throw e
      }
    }
  }

  //  Trash

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
    try {
      await Promise.all([
        deleteItems([id]),
        persistTrash()
      ])
    } catch (e) {
      console.error('[goods] removeGoods DB write failed:', e)
      throw e
    }
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
    try {
      await Promise.all([
        deleteItems(Array.from(ids)),
        persistTrash()
      ])
    } catch (e) {
      console.error('[goods] removeMultipleGoods DB write failed:', e)
      throw e
    }
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
    try {
      await Promise.all([
        addItem(restored),
        persistTrash()
      ])
    } catch (e) {
      console.error('[goods] restoreTrashItem DB write failed:', e)
      throw e
    }
    return restored
  }

  async function deleteTrashItem(id) {
    const existing = trashList.value.find((entry) => entry.id === id)
    const next = trashList.value.filter((entry) => entry.id !== id)
    if (next.length === trashList.value.length) return

    trashList.value = next
    try {
      await persistTrash()
      await deleteManagedLocalImages(collectManagedLocalImagePathsFromGoodsItem(existing))
    } catch (e) {
      console.error('[goods] deleteTrashItem DB write failed:', e)
      throw e
    }
  }

  async function emptyTrash() {
    if (trashList.value.length === 0) return
    const removedPaths = new Set()
    for (const item of trashList.value) {
      for (const path of collectManagedLocalImagePathsFromGoodsItem(item)) {
        removedPaths.add(path)
      }
    }
    trashList.value = []
    try {
      await persistTrash()
      await deleteManagedLocalImages(removedPaths)
    } catch (e) {
      console.error('[goods] emptyTrash DB write failed:', e)
      throw e
    }
  }

  async function deleteGoodsPermanently(ids) {
    const targetIds = [...new Set(Array.from(ids || []).filter(Boolean))]
    if (targetIds.length === 0) return 0

    const targetIdSet = new Set(targetIds)
    const removedPaths = new Set()
    for (const item of list.value) {
      if (!targetIdSet.has(item.id)) continue
      for (const path of collectManagedLocalImagePathsFromGoodsItem(item)) {
        removedPaths.add(path)
      }
    }

    const next = list.value.filter((item) => !targetIdSet.has(item.id))
    if (next.length === list.value.length) return 0

    list.value = next
    triggerRef(list)
    try {
      await deleteItems(targetIds)
      await deleteManagedLocalImages(removedPaths)
    } catch (e) {
      console.error('[goods] deleteGoodsPermanently DB write failed:', e)
      throw e
    }
    return targetIds.length
  }

  //  Delegated to sub-modules

  function replaceCategoryName(oldName, newName) {
    return _replaceCategoryName(oldName, newName, list, trashList, persistTrash)
  }

  function replaceIpName(oldName, newName) {
    return _replaceIpName(oldName, newName, list, trashList, persistTrash)
  }

  function replaceCharacterName(oldName, newName) {
    return _replaceCharacterName(oldName, newName, list, trashList, persistTrash)
  }

  function syncCharacterIp(name, nextIp, previousIp = '') {
    return _syncCharacterIp(name, nextIp, previousIp, list, trashList, persistTrash)
  }

  function replaceStorageLocationPrefix(oldPrefix, newPrefix) {
    return _replaceStorageLocationPrefix(oldPrefix, newPrefix, list)
  }

  function clearStorageLocationPrefix(prefix) {
    return _clearStorageLocationPrefix(prefix, list)
  }

  function addMultipleGoods(items) {
    return _addMultipleGoods(items, list)
  }

  function refreshList() {
    return _refreshList(list)
  }

  function importGoodsBackup(items) {
    return _importGoodsBackup(items, list)
  }

  function updateGoodsBackup(items) {
    return _updateGoodsBackup(items, list)
  }

  function importTrashBackup(items) {
    return _importTrashBackup(items, trashList)
  }

  function updateTrashBackup(items) {
    return _updateTrashBackup(items, trashList)
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
    deleteGoodsPermanently,
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
