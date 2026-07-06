// @ts-check
import { ref, shallowRef, computed, watch } from 'vue'
import { useExchangeRateStore } from '@/stores/exchangeRate'
import {
  parseAcquiredTime,
  parseTimelineYearMonth,
  parseNumericPrice,
  parseQuantity,
  parseDeletedTime,
  normalizeWishlistFlag,
  resolveEffectivePriceValue,
  resolveCollectionTotalValue
} from '@/stores/goodsHelpers'
import { buildSearchText } from '@/utils/goods/filters'

/**
 * @param {object} item
 * @param {object} exchangeRate
 */
function computePriceFields(item, exchangeRate) {
  const quantityNumber = parseQuantity(item.quantity)
  const officialPriceNumber = parseNumericPrice(item.price)
  const actualPriceNumber = parseNumericPrice(item.actualPrice)
  const effectivePriceNumber = parseNumericPrice(resolveEffectivePriceValue(item))
  const priceCNYNumber = exchangeRate.convertToCNY(effectivePriceNumber, item.currency)
  const officialPriceCNYNumber = exchangeRate.convertToCNY(officialPriceNumber, item.currency)
  const actualPriceCNYNumber = exchangeRate.convertToCNY(actualPriceNumber, item.currency)
  const collectionTotalNumber = parseNumericPrice(resolveCollectionTotalValue(item))
  const collectionTotalCNYNumber = exchangeRate.convertToCNY(collectionTotalNumber, item.currency)
  return {
    priceNumber: effectivePriceNumber,
    officialPriceNumber,
    actualPriceNumber,
    effectivePriceNumber,
    priceCNYNumber,
    officialPriceCNYNumber,
    actualPriceCNYNumber,
    quantityNumber,
    totalValueNumber: collectionTotalCNYNumber
  }
}

/**
 * @param {object} item
 * @param {object} exchangeRate
 */
function enrichItem(item, exchangeRate) {
  return {
    ...item,
    ...computePriceFields(item, exchangeRate),
    isWishlist: normalizeWishlistFlag(item.isWishlist),
    sortId: String(item.id),
    acquiredTime: parseAcquiredTime(item.acquiredAt),
    timelineYearMonth: parseTimelineYearMonth(item.acquiredAt),
    searchText: buildSearchText(item)
  }
}

/**
 * Creates a viewList using incremental watcher-based diffing.
 * The watcher detects changed items and only recomputes those.
 * The computed reads from viewMap/viewOrder — no dependency on list.value.
 * @param {import('vue').ShallowRef<import('@/types/models').GoodsItem[]>} list
 */
export function createViewList(list) {
  /** @type {Map<string, {viewItem: object, srcItem: object}>} */
  let viewCache = new Map()
  let cachedRatesRef = null

  const viewMap = shallowRef(new Map())
  const viewOrder = ref([])

  watch(list, (newList, oldList) => {
    const exchangeRate = useExchangeRateStore()
    const ratesRef = exchangeRate.rates
    const ratesChanged = ratesRef !== cachedRatesRef
    cachedRatesRef = ratesRef

    const newMap = new Map(viewCache)
    let changed = false

    for (const item of newList) {
      const cached = viewCache.get(item.id)
      if (cached && cached.srcItem === item && !ratesChanged) continue
      changed = true
      const viewItem = enrichItem(item, exchangeRate)
      newMap.set(item.id, { viewItem, srcItem: item })
    }

    const newIdSet = new Set(newList.map((i) => i.id))
    for (const id of newMap.keys()) {
      if (!newIdSet.has(id)) {
        changed = true
        newMap.delete(id)
      }
    }

    if (!changed) return
    viewCache = newMap
    viewMap.value = newMap

    const newOrder = newList.map((i) => i.id)
    if (
      newOrder.length !== viewOrder.value.length ||
      newOrder.some((id, i) => id !== viewOrder.value[i])
    ) {
      viewOrder.value = newOrder
    }
  }, { flush: 'sync' })

  watch(() => useExchangeRateStore().rates, () => {
    const exchangeRate = useExchangeRateStore()
    cachedRatesRef = exchangeRate.rates
    const newMap = new Map()
    for (const [id, { srcItem }] of viewCache) {
      newMap.set(id, { viewItem: enrichItem(srcItem, exchangeRate), srcItem })
    }
    viewCache = newMap
    viewMap.value = newMap
  })

  const viewList = computed(() => viewOrder.value.map((id) => viewMap.value.get(id)?.viewItem).filter(Boolean))

  return { viewList, viewMap, viewOrder }
}

/**
 * Creates a computed trashViewList that enriches trash items with parsed values,
 * sorted by deletion time. Uses its own Map-based cache.
 * @param {import('vue').ShallowRef<import('@/types/models').TrashGoodsItem[]>} trashList
 */
export function createTrashViewList(trashList) {
  /** @type {Map<string, {viewItem: object, srcItem: object}>} */
  let trashViewCache = new Map()
  let trashCachedRatesRef = null

  const viewMap = shallowRef(new Map())
  const viewOrder = ref([])

  watch(trashList, (newList, oldList) => {
    const exchangeRate = useExchangeRateStore()
    const ratesRef = exchangeRate.rates
    const ratesChanged = ratesRef !== trashCachedRatesRef
    trashCachedRatesRef = ratesRef

    const newMap = new Map(trashViewCache)
    let changed = false

    for (const item of newList) {
      const cached = trashViewCache.get(item.id)
      if (cached && cached.srcItem === item && !ratesChanged) continue
      changed = true
      const viewItem = {
        ...item,
        ...computePriceFields(item, exchangeRate),
        deletedTime: parseDeletedTime(item.deletedAt),
        acquiredTime: parseAcquiredTime(item.acquiredAt)
      }
      newMap.set(item.id, { viewItem, srcItem: item })
    }

    const newIdSet = new Set(newList.map((i) => i.id))
    for (const id of newMap.keys()) {
      if (!newIdSet.has(id)) {
        changed = true
        newMap.delete(id)
      }
    }

    if (!changed) return
    trashViewCache = newMap
    viewMap.value = newMap

    // Pre-extract sort keys to avoid Map lookups in every comparison
    const vm = viewMap.value
    const sortKeys = new Map(newList.map((item) => {
      const vi = vm.get(item.id)?.viewItem
      return [item.id, { deleted: vi?.deletedTime || 0, acquired: vi?.acquiredTime || 0 }]
    }))
    const sortedIds = [...newList]
      .sort((a, b) => {
        const ka = sortKeys.get(a.id)
        const kb = sortKeys.get(b.id)
        return (kb.deleted - ka.deleted) || (kb.acquired - ka.acquired)
      })
      .map((i) => i.id)
    viewOrder.value = sortedIds
  }, { flush: 'sync' })

  watch(() => useExchangeRateStore().rates, () => {
    const exchangeRate = useExchangeRateStore()
    trashCachedRatesRef = exchangeRate.rates
    const newMap = new Map()
    for (const [id, { srcItem }] of trashViewCache) {
      const viewItem = {
        ...srcItem,
        ...computePriceFields(srcItem, exchangeRate),
        deletedTime: parseDeletedTime(srcItem.deletedAt),
        acquiredTime: parseAcquiredTime(srcItem.acquiredAt)
      }
      newMap.set(id, { viewItem, srcItem })
    }
    trashViewCache = newMap
    viewMap.value = newMap
  })

  const viewList = computed(() => viewOrder.value.map((id) => viewMap.value.get(id)?.viewItem).filter(Boolean))

  return viewList
}

/**
 * Creates filtered view lists for collection and wishlist items.
 * @param {import('vue').ComputedRef} viewList
 */
export function createFilteredViewLists(viewList) {
  const _partitioned = computed(() => {
    const collection = []
    const wishlist = []
    for (const item of viewList.value) {
      (item.isWishlist ? wishlist : collection).push(item)
    }
    return { collection, wishlist }
  })
  const collectionViewList = computed(() => _partitioned.value.collection)
  const wishlistViewList = computed(() => _partitioned.value.wishlist)
  return { collectionViewList, wishlistViewList }
}
