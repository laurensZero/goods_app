// @ts-check
import { defineStore } from 'pinia'
import { ref, shallowRef, computed } from 'vue'
import { getItems } from '@/utils/db/index'
import { normalizeStorageLocationValue } from '@/utils/storageLocations'
import { createByIdLookup, createAutoPush } from '@/stores/storeCore'
import { normalizeGoodsInput, normalizeTrashItem } from '@/stores/goodsHelpers'
import {
  readPersistedTrash,
  writePersistedTrash,
  readImagesMigrationFlag,
  writeImagesMigrationFlag,
  readCharactersMigrationFlag,
  writeCharactersMigrationFlag,
  readVariantMigrationFlag,
  writeVariantMigrationFlag,
  readBase64UrlMigrationFlag,
  writeBase64UrlMigrationFlag
} from '@/stores/goodsPersistence'
import {
  normalizeExistingCharacters,
  normalizeExistingVariants,
  backfillLegacyImages,
  replaceBase64WithPublicUrls
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
  // 读库失败标记：为 true 时同步入口会拒绝推送，避免把空列表推上云端覆盖备份
  const loadFailed = ref(false)

  //  Computed getters

  const getById = createByIdLookup(list)
  const getTrashById = createByIdLookup(trashList)
  // Single-pass partition instead of two separate filters
  const _partitioned = computed(() => {
    const collection = []
    const wishlist = []
    for (const item of list.value) {
      (item.isWishlist ? wishlist : collection).push(item)
    }
    return { collection, wishlist }
  })
  const collectionList = computed(() => _partitioned.value.collection)
  const wishlistList = computed(() => _partitioned.value.wishlist)
  const storageLocations = computed(() => {
    const set = new Set()
    for (const item of collectionList.value) {
      const loc = normalizeStorageLocationValue(item.storageLocation || '')
      if (loc) set.add(loc)
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'))
  })

  /** 角色 → 收藏谷子数量（多角色商品按比例分摊） */
  const characterCountMap = computed(() => {
    const map = new Map()
    for (const item of collectionList.value) {
      if (!Array.isArray(item.characters)) continue
      const qty = Number(item.quantity) || 1
      const chars = item.characters
      if (chars.length === 1) {
        map.set(chars[0], (map.get(chars[0]) || 0) + qty)
      } else if (chars.length > 1) {
        const share = qty / chars.length
        for (const c of chars) {
          map.set(c, (map.get(c) || 0) + share)
        }
      }
    }
    return map
  })

  //  View enrichment

  const { viewList } = createViewList(list)
  const { collectionViewList, wishlistViewList } = createFilteredViewLists(viewList)
  const trashViewList = createTrashViewList(trashList)

  //  Persistence

  async function persistTrash() {
    await writePersistedTrash(trashList.value)
  }

  //  Sync helper

  const autoPushGoods = createAutoPush('goods')

  let migrationPromise = null

  function startMigrationsInBackground() {
    if (migrationPromise) return migrationPromise
    migrationPromise = (async () => {
      const [imagesMigrated, charactersMigrated, variantsMigrated, base64UrlMigrated] = await Promise.all([
        readImagesMigrationFlag().catch(() => false),
        readCharactersMigrationFlag().catch(() => false),
        readVariantMigrationFlag().catch(() => false),
        readBase64UrlMigrationFlag().catch(() => false)
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

      if (!base64UrlMigrated) {
        try {
          const result = await replaceBase64WithPublicUrls(list)
          if (result !== 'skip') await writeBase64UrlMigrationFlag()
        } catch (e) {
          console.warn('[goods] init: base64 URL migration failed:', e)
        }
      }
    })().finally(() => {
      migrationPromise = null
    })
    return migrationPromise
  }

  //  Init

  async function init() {
    const [itemsResult, trashResult] = await Promise.allSettled([getItems(), readPersistedTrash()])

    if (itemsResult.status === 'fulfilled') {
      list.value = itemsResult.value.map((item) => normalizeGoodsInput(item, item.id))
      loadFailed.value = false
    } else {
      console.error('[goods] init: getItems failed, starting with empty list:', itemsResult.reason)
      loadFailed.value = true
      list.value = []
      import('@/utils/globalToast').then(({ showGlobalToast }) => {
        import('@/locales').then(({ default: i18n }) => {
          showGlobalToast(i18n.global.t('toast.dataLoadFailed', { error: (itemsResult.reason && itemsResult.reason.message) || i18n.global.t('goods.unknownError') }))
        }).catch(() => {})
      }).catch(() => {})
    }

    if (trashResult.status === 'fulfilled') {
      trashList.value = trashResult.value.map((item) => normalizeTrashItem(item, item.id))
    } else {
      console.error('[goods] init: readPersistedTrash failed, starting with empty trash:', trashResult.reason)
      trashList.value = []
    }

    isReady.value = true
    void startMigrationsInBackground()
  }

  //  CRUD wrappers

  function addGoods(data) { return crud.addGoods(data, list, autoPushGoods) }
  function addGoodsBatch(itemsData) { return crud.addGoodsBatch(itemsData, list, autoPushGoods) }
  function updateGoods(id, data) { return crud.updateGoods(id, data, list, autoPushGoods) }
  function updateMultipleGoods(ids, data) { return crud.updateMultipleGoods(ids, data, list, autoPushGoods) }
  function removeGoods(id) { return crud.removeGoods(id, list, trashList, persistTrash, autoPushGoods) }
  function removeMultipleGoods(ids) { return crud.removeMultipleGoods(ids, list, trashList, persistTrash, autoPushGoods) }
  function restoreTrashItem(id) { return crud.restoreTrashItem(id, list, trashList, persistTrash, autoPushGoods) }
  function deleteTrashItem(id) { return crud.deleteTrashItem(id, trashList, persistTrash, autoPushGoods) }
  function emptyTrash() { return crud.emptyTrash(trashList, persistTrash, autoPushGoods) }
  function deleteGoodsPermanently(ids) { return crud.deleteGoodsPermanently(ids, list, autoPushGoods) }

  //  Delegated to sub-modules

  function replaceCategoryName(oldName, newName) {
    return _replaceCategoryName(oldName, newName, list, trashList, persistTrash, autoPushGoods)
  }

  function replaceIpName(oldName, newName) {
    return _replaceIpName(oldName, newName, list, trashList, persistTrash, autoPushGoods)
  }

  function replaceCharacterName(oldName, newName) {
    return _replaceCharacterName(oldName, newName, list, trashList, persistTrash, autoPushGoods)
  }

  function syncCharacterIp(name, nextIp, previousIp = '') {
    return _syncCharacterIp(name, nextIp, previousIp, list, trashList, persistTrash)
  }

  function replaceStorageLocationPrefix(oldPrefix, newPrefix) {
    return _replaceStorageLocationPrefix(oldPrefix, newPrefix, list, autoPushGoods)
  }

  function clearStorageLocationPrefix(prefix) {
    return _clearStorageLocationPrefix(prefix, list, autoPushGoods)
  }

  function addMultipleGoods(items) {
    return _addMultipleGoods(items, list)
  }

  async function refreshList() {
    await _refreshList(list)
    loadFailed.value = false
  }

  function importGoodsBackup(items) {
    return _importGoodsBackup(items, list, trashList)
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
    characterCountMap,
    viewList,
    collectionViewList,
    wishlistViewList,
    trashViewList,
    storageLocations,
    isReady,
    loadFailed,
    getById,
    getTrashById,
    init,
    addGoods,
    addGoodsBatch,
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
