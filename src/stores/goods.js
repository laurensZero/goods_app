// @ts-check
import { defineStore } from 'pinia'
import { ref, shallowRef, computed } from 'vue'
import { getItems } from '@/utils/db'
import { normalizeStorageLocationValue } from '@/utils/storageLocations'
import { useSyncStore } from '@/stores/sync'
import { normalizeGoodsInput, normalizeTrashItem } from '@/stores/goodsHelpers'
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
  updateTrashBackup as _updateTrashBackup,
  markImagesAsRemote as _markImagesAsRemote
} from '@/stores/goodsSync'
import {
  replaceStorageLocationPrefix as _replaceStorageLocationPrefix,
  clearStorageLocationPrefix as _clearStorageLocationPrefix
} from '@/stores/goodsStorageOps'
import {
  createViewList,
  createTrashViewList,
  createFilteredViewLists
} from '@/stores/goodsViewList'
import * as crud from '@/stores/goodsCrud'

export const useGoodsStore = defineStore('goods', () => {
  /** @type {import('vue').ShallowRef<import('@/types/models').GoodsItem[]>} */
  const list = shallowRef([])
  /** @type {import('vue').ShallowRef<import('@/types/models').TrashGoodsItem[]>} */
  const trashList = shallowRef([])
  const isReady = ref(false)

  //  Computed getters

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

  //  View enrichment

  const { viewList } = createViewList(list)
  const { collectionViewList, wishlistViewList } = createFilteredViewLists(viewList)
  const trashViewList = createTrashViewList(trashList)

  //  Persistence

  async function persistTrash() {
    await writePersistedTrash(trashList.value)
  }

  //  Sync helper

  function autoPushGoods() {
    useSyncStore().autoPushGoods()
  }

  let migrationPromise = null

  function startMigrationsInBackground() {
    if (migrationPromise) return migrationPromise
    migrationPromise = (async () => {
      const [imagesMigrated, charactersMigrated, variantsMigrated] = await Promise.all([
        readImagesMigrationFlag().catch(() => false),
        readCharactersMigrationFlag().catch(() => false),
        readVariantMigrationFlag().catch(() => false)
      ])

      if (!imagesMigrated) {
        try {
          await backfillLegacyImages(list)
          await writeImagesMigrationFlag()
        } catch (e) {
          console.warn('[goods] init: images migration failed:', e)
        }
      }

      if (!charactersMigrated) {
        try {
          await normalizeExistingCharacters(list, trashList, persistTrash)
          await writeCharactersMigrationFlag()
        } catch (e) {
          console.warn('[goods] init: characters migration failed:', e)
        }
      }

      if (!variantsMigrated) {
        try {
          await normalizeExistingVariants(list, trashList, persistTrash)
          await writeVariantMigrationFlag()
        } catch (e) {
          console.warn('[goods] init: variants migration failed:', e)
        }
      }
    })().finally(() => {
      migrationPromise = null
    })
    return migrationPromise
  }

  //  Init

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
    isReady.value = true
    void startMigrationsInBackground()
  }

  //  CRUD wrappers

  function addGoods(data) { return crud.addGoods(data, list, autoPushGoods) }
  function updateGoods(id, data) { return crud.updateGoods(id, data, list, autoPushGoods) }
  function updateMultipleGoods(ids, data) { return crud.updateMultipleGoods(ids, data, list, autoPushGoods) }
  function removeGoods(id) { return crud.removeGoods(id, list, trashList, persistTrash, autoPushGoods) }
  function removeMultipleGoods(ids) { return crud.removeMultipleGoods(ids, list, trashList, persistTrash, autoPushGoods) }
  function restoreTrashItem(id) { return crud.restoreTrashItem(id, list, trashList, persistTrash, autoPushGoods) }
  function deleteTrashItem(id) { return crud.deleteTrashItem(id, trashList, persistTrash) }
  function emptyTrash() { return crud.emptyTrash(trashList, persistTrash) }
  function deleteGoodsPermanently(ids) { return crud.deleteGoodsPermanently(ids, list) }

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

  function markImagesAsRemote(preparedImagesByItemId) {
    return _markImagesAsRemote(preparedImagesByItemId, list, trashList)
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
    markImagesAsRemote,
    refreshList
  }
})
