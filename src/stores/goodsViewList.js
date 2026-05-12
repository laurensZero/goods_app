// @ts-check
import { computed } from 'vue'
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
 * Creates a computed viewList that enriches goods items with parsed prices,
 * quantities, and CNY conversions. Uses a Map-based cache keyed by item id
 * that invalidates when exchange rates change.
 * @param {import('vue').ShallowRef<import('@/types/models').GoodsItem[]>} list
 */
export function createViewList(list) {
  /** @type {Map<string, {viewItem: object, srcItem: object}>} */
  let viewCache = new Map()
  let cachedRatesRef = null

  return computed(() => {
    const exchangeRate = useExchangeRateStore()
    const ratesRef = exchangeRate.rates
    const ratesChanged = ratesRef !== cachedRatesRef
    cachedRatesRef = ratesRef

    const newCache = new Map()
    const result = list.value.map((item) => {
      const cached = viewCache.get(item.id)
      if (cached && cached.srcItem === item && !ratesChanged) {
        newCache.set(item.id, cached)
        return cached.viewItem
      }

      const quantityNumber = parseQuantity(item.quantity)
      const officialPriceNumber = parseNumericPrice(item.price)
      const actualPriceNumber = parseNumericPrice(item.actualPrice)
      const effectivePriceNumber = parseNumericPrice(resolveEffectivePriceValue(item))
      const priceCNYNumber = exchangeRate.convertToCNY(effectivePriceNumber, item.currency)

      const viewItem = {
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
      newCache.set(item.id, { viewItem, srcItem: item })
      return viewItem
    })
    viewCache = newCache
    return result
  })
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

  return computed(() => {
    const exchangeRate = useExchangeRateStore()
    const ratesRef = exchangeRate.rates
    const ratesChanged = ratesRef !== trashCachedRatesRef
    trashCachedRatesRef = ratesRef

    const newCache = new Map()
    const mapped = trashList.value.map((item) => {
      const cached = trashViewCache.get(item.id)
      if (cached && cached.srcItem === item && !ratesChanged) {
        newCache.set(item.id, cached)
        return cached.viewItem
      }

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
      newCache.set(item.id, { viewItem, srcItem: item })
      return viewItem
    })
    trashViewCache = newCache
    return mapped.sort((a, b) => b.deletedTime - a.deletedTime || b.acquiredTime - a.acquiredTime)
  })
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
