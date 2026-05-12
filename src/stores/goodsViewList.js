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
  resolveEffectivePriceValue
} from '@/stores/goodsHelpers'

/**
 * @param {object} item
 * @param {object} exchangeRate
 */
function enrichItem(item, exchangeRate) {
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

    for (const item of oldList) {
      if (!newList.some((i) => i.id === item.id)) {
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
      const quantityNumber = parseQuantity(item.quantity)
      const officialPriceNumber = parseNumericPrice(item.price)
      const actualPriceNumber = parseNumericPrice(item.actualPrice)
      const effectivePriceNumber = parseNumericPrice(resolveEffectivePriceValue(item))
      const priceCNYNumber = exchangeRate.convertToCNY(effectivePriceNumber, item.currency)
      const viewItem = {
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
      newMap.set(item.id, { viewItem, srcItem: item })
    }

    for (const item of oldList) {
      if (!newList.some((i) => i.id === item.id)) {
        changed = true
        newMap.delete(item.id)
      }
    }

    if (!changed) return
    trashViewCache = newMap
    viewMap.value = newMap

    const sortedIds = [...newList]
      .sort((a, b) => {
        const va = viewMap.value.get(a.id)?.viewItem
        const vb = viewMap.value.get(b.id)?.viewItem
        return (vb?.deletedTime - va?.deletedTime) || (vb?.acquiredTime - va?.acquiredTime)
      })
      .map((i) => i.id)
    viewOrder.value = sortedIds
  }, { flush: 'sync' })

  watch(() => useExchangeRateStore().rates, () => {
    const exchangeRate = useExchangeRateStore()
    trashCachedRatesRef = exchangeRate.rates
    const newMap = new Map()
    for (const [id, { srcItem }] of trashViewCache) {
      const quantityNumber = parseQuantity(srcItem.quantity)
      const officialPriceNumber = parseNumericPrice(srcItem.price)
      const actualPriceNumber = parseNumericPrice(srcItem.actualPrice)
      const effectivePriceNumber = parseNumericPrice(resolveEffectivePriceValue(srcItem))
      const priceCNYNumber = exchangeRate.convertToCNY(effectivePriceNumber, srcItem.currency)
      const viewItem = {
        ...srcItem,
        deletedTime: parseDeletedTime(srcItem.deletedAt),
        acquiredTime: parseAcquiredTime(srcItem.acquiredAt),
        priceNumber: effectivePriceNumber,
        officialPriceNumber,
        actualPriceNumber,
        effectivePriceNumber,
        priceCNYNumber,
        quantityNumber,
        totalValueNumber: priceCNYNumber * quantityNumber
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
  const collectionViewList = computed(() => viewList.value.filter((item) => !item.isWishlist))
  const wishlistViewList = computed(() => viewList.value.filter((item) => item.isWishlist))
  return { collectionViewList, wishlistViewList }
}
