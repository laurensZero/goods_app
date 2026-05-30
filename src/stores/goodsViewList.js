// @ts-check
import { ref, computed, watch } from 'vue'
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
  const collectionTotalNumber = parseNumericPrice(resolveCollectionTotalValue(item))
  const collectionTotalCNYNumber = exchangeRate.convertToCNY(collectionTotalNumber, item.currency)
  return {
    priceNumber: effectivePriceNumber,
    officialPriceNumber,
    actualPriceNumber,
    effectivePriceNumber,
    priceCNYNumber,
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
    timelineYearMonth: parseTimelineYearMonth(item.acquiredAt)
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

  const viewMap = ref(new Map())
  const viewOrder = ref([])
  const collectionOrder = ref([])
  const wishlistOrder = ref([])

  watch(list, (newList, oldList) => {
    const exchangeRate = useExchangeRateStore()
    const ratesRef = exchangeRate.rates
    const ratesChanged = ratesRef !== cachedRatesRef
    cachedRatesRef = ratesRef

    const newMap = new Map(viewCache)
    let changed = false

    const newCollectionIds = []
    const newWishlistIds = []

    for (const item of newList) {
      const cached = viewCache.get(item.id)
      if (cached && cached.srcItem === item && !ratesChanged) {
        // Still track partition for unchanged items
        if (item.isWishlist) newWishlistIds.push(item.id)
        else newCollectionIds.push(item.id)
        continue
      }
      changed = true
      const viewItem = enrichItem(item, exchangeRate)
      newMap.set(item.id, { viewItem, srcItem: item })
      if (item.isWishlist) newWishlistIds.push(item.id)
      else newCollectionIds.push(item.id)
    }

    for (const item of oldList) {
      if (!newMap.has(item.id)) {
        changed = true
        newMap.delete(item.id)
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
    collectionOrder.value = newCollectionIds
    wishlistOrder.value = newWishlistIds
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
  const collectionViewList = computed(() => collectionOrder.value.map((id) => viewMap.value.get(id)?.viewItem).filter(Boolean))
  const wishlistViewList = computed(() => wishlistOrder.value.map((id) => viewMap.value.get(id)?.viewItem).filter(Boolean))

  return { viewList, viewMap, viewOrder, collectionViewList, wishlistViewList }
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

  const viewMap = ref(new Map())
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

    for (const item of oldList) {
      if (!newMap.has(item.id)) {
        changed = true
        newMap.delete(item.id)
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
