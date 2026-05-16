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
 * @returns {object}
 */
function createViewItem(item, exchangeRate) {
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
 * Mutates an existing viewItem in place to match the new source item.
 * Reuses the same object reference so downstream vnodes stay stable.
 * @param {object} view
 * @param {object} item
 * @param {object} exchangeRate
 */
function mutateViewItem(view, item, exchangeRate) {
  const keys = Object.keys(item)
  for (let i = 0; i < keys.length; i++) {
    view[keys[i]] = item[keys[i]]
  }
  view.isWishlist = normalizeWishlistFlag(item.isWishlist)
  view.sortId = String(item.id)
  view.acquiredTime = parseAcquiredTime(item.acquiredAt)
  view.timelineYearMonth = parseTimelineYearMonth(item.acquiredAt)

  const quantityNumber = parseQuantity(item.quantity)
  const officialPriceNumber = parseNumericPrice(item.price)
  const actualPriceNumber = parseNumericPrice(item.actualPrice)
  const effectivePriceNumber = parseNumericPrice(resolveEffectivePriceValue(item))
  const priceCNYNumber = exchangeRate.convertToCNY(effectivePriceNumber, item.currency)
  view.priceNumber = effectivePriceNumber
  view.officialPriceNumber = officialPriceNumber
  view.actualPriceNumber = actualPriceNumber
  view.effectivePriceNumber = effectivePriceNumber
  view.priceCNYNumber = priceCNYNumber
  view.quantityNumber = quantityNumber
  view.totalValueNumber = priceCNYNumber * quantityNumber
}

/**
 * Mutates an existing trash viewItem in place.
 * @param {object} view
 * @param {object} item
 * @param {object} exchangeRate
 */
function mutateTrashViewItem(view, item, exchangeRate) {
  const keys = Object.keys(item)
  for (let i = 0; i < keys.length; i++) {
    view[keys[i]] = item[keys[i]]
  }
  view.deletedTime = parseDeletedTime(item.deletedAt)
  view.acquiredTime = parseAcquiredTime(item.acquiredAt)

  const quantityNumber = parseQuantity(item.quantity)
  const officialPriceNumber = parseNumericPrice(item.price)
  const actualPriceNumber = parseNumericPrice(item.actualPrice)
  const effectivePriceNumber = parseNumericPrice(resolveEffectivePriceValue(item))
  const priceCNYNumber = exchangeRate.convertToCNY(effectivePriceNumber, item.currency)
  view.priceNumber = effectivePriceNumber
  view.officialPriceNumber = officialPriceNumber
  view.actualPriceNumber = actualPriceNumber
  view.effectivePriceNumber = effectivePriceNumber
  view.priceCNYNumber = priceCNYNumber
  view.quantityNumber = quantityNumber
  view.totalValueNumber = priceCNYNumber * quantityNumber
}

function idsEqual(a, b) {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
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
      if (cached) {
        mutateViewItem(cached.viewItem, item, exchangeRate)
        newMap.set(item.id, { viewItem: cached.viewItem, srcItem: item })
      } else {
        newMap.set(item.id, { viewItem: createViewItem(item, exchangeRate), srcItem: item })
      }
    }

    const newIds = new Set(newList.map((i) => i.id))
    for (const item of oldList) {
      if (!newIds.has(item.id)) {
        changed = true
        newMap.delete(item.id)
      }
    }

    if (!changed) return
    viewCache = newMap
    viewMap.value = newMap

    const newOrder = newList.map((i) => i.id)
    if (!idsEqual(newOrder, viewOrder.value)) {
      viewOrder.value = newOrder
    }
  }, { flush: 'sync' })

  watch(() => useExchangeRateStore().rates, () => {
    const exchangeRate = useExchangeRateStore()
    cachedRatesRef = exchangeRate.rates
    const newMap = new Map(viewCache)
    for (const [id, cached] of newMap) {
      mutateViewItem(cached.viewItem, cached.srcItem, exchangeRate)
    }
    viewCache = newMap
    viewMap.value = newMap
  })

  // Cache viewList — only rebuild when viewOrder or viewMap actually changes
  let cachedViewList = []
  let lastOrderRef = null
  let lastMapRef = null

  const viewList = computed(() => {
    if (viewOrder.value === lastOrderRef && viewMap.value === lastMapRef) {
      return cachedViewList
    }
    lastOrderRef = viewOrder.value
    lastMapRef = viewMap.value
    cachedViewList = viewOrder.value
      .map((id) => viewMap.value.get(id)?.viewItem)
      .filter(Boolean)
    return cachedViewList
  })

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
      if (cached) {
        mutateTrashViewItem(cached.viewItem, item, exchangeRate)
        newMap.set(item.id, { viewItem: cached.viewItem, srcItem: item })
      } else {
        newMap.set(item.id, { viewItem: createViewItem(item, exchangeRate), srcItem: item })
      }
    }

    const newIds = new Set(newList.map((i) => i.id))
    for (const item of oldList) {
      if (!newIds.has(item.id)) {
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
    const newMap = new Map(trashViewCache)
    for (const [id, cached] of newMap) {
      mutateTrashViewItem(cached.viewItem, cached.srcItem, exchangeRate)
    }
    trashViewCache = newMap
    viewMap.value = newMap
  })

  // Cache viewList — only rebuild when viewOrder or viewMap actually changes
  let cachedViewList = []
  let lastOrderRef = null
  let lastMapRef = null

  const viewList = computed(() => {
    if (viewOrder.value === lastOrderRef && viewMap.value === lastMapRef) {
      return cachedViewList
    }
    lastOrderRef = viewOrder.value
    lastMapRef = viewMap.value
    cachedViewList = viewOrder.value
      .map((id) => viewMap.value.get(id)?.viewItem)
      .filter(Boolean)
    return cachedViewList
  })

  return viewList
}

/**
 * Creates filtered view lists for collection and wishlist items.
 * @param {import('vue').ComputedRef} viewList
 */
export function createFilteredViewLists(viewList) {
  const collectionViewList = ref([])
  const wishlistViewList = ref([])

  watch(viewList, (list) => {
    const collection = []
    const wishlist = []
    for (const item of list) {
      if (item.isWishlist) {
        wishlist.push(item)
      } else {
        collection.push(item)
      }
    }
    collectionViewList.value = collection
    wishlistViewList.value = wishlist
  }, { flush: 'sync', immediate: true })

  return { collectionViewList, wishlistViewList }
}
