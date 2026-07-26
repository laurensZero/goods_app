// @ts-check
import {
  buildGoodsIdentityKey,
  getGoodsVariant,
  normalizeGoodsName,
  stripVariantFromNote
} from '@/utils/goods/identity'
import {
  getPrimaryGoodsImageUrl,
  normalizeGoodsImageList
} from '@/utils/goods/images'
import {
  collectManagedLocalImagePathsFromGoodsItem,
  restoreLocalImageFromDataUrl
} from '@/utils/image/localImage'
import { normalizeCharacterName } from '@/stores/presets'
import { normalizeStorageLocationValue } from '@/utils/storageLocations'
import { normalizeTracks } from '@/utils/tracks'

const VALID_COLLECT_STATUSES = new Set(['待发货', '待补款', '待补邮', '已拥有', '丢失', '已赠出', '想出', '已出', '在售'])

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

function shouldApplyRemoteBackup(localItem, remoteItem) {
  if (!localItem) return true
  return (Number(remoteItem?.updatedAt) || 0) > (Number(localItem?.updatedAt) || 0)
}

function parseNumericPrice(value) {
  const price = Number.parseFloat(value)
  return Number.isFinite(price) ? price : 0
}

function parseQuantity(value) {
  return Math.max(1, Number(value) || 1)
}

function normalizeSingleDateValue(value) {
  const normalized = String(value || '').trim()
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : ''
}

function normalizeSaleAtValue(value) {
  const normalized = String(value || '').trim().replace(' ', 'T').slice(0, 16)
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(normalized) ? normalized : ''
}

function normalizeBooleanFlag(value) {
  if (value === true || value === 1) return true
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    return normalized === '1' || normalized === 'true'
  }
  return false
}

function normalizeSaleReminderOffsetList(list) {
  if (!Array.isArray(list)) {
    if (typeof list !== 'string' || !list.trim()) return []
    try {
      const parsed = JSON.parse(list)
      list = Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }

  return [...new Set(
    list
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value >= 0 && value <= 43200)
  )].sort((a, b) => b - a)
}

function normalizeUnitAcquiredAtList(list, quantity) {
  const quantityNumber = parseQuantity(quantity)
  if (quantityNumber < 2 || !Array.isArray(list)) return []

  const normalized = list
    .slice(0, quantityNumber)
    .map((value) => normalizeSingleDateValue(value))

  while (normalized.length > 0 && !normalized[normalized.length - 1]) {
    normalized.pop()
  }

  return normalized
}

function normalizeUnitPriceValue(value) {
  if (value === '' || value == null) return ''
  const numeric = Number.parseFloat(String(value).trim())
  if (!Number.isFinite(numeric) || numeric < 0) return ''
  return `${Math.round(numeric * 100) / 100}`
}

function normalizeUnitActualPriceList(list, quantity) {
  const quantityNumber = parseQuantity(quantity)
  if (quantityNumber < 2 || !Array.isArray(list)) return []

  const normalized = list
    .slice(0, quantityNumber)
    .map((value) => normalizeUnitPriceValue(value))

  while (normalized.length > 0 && !normalized[normalized.length - 1]) {
    normalized.pop()
  }

  return normalized
}

function normalizeUnitCharacterList(list, quantity) {
  const quantityNumber = parseQuantity(quantity)
  if (quantityNumber < 2 || !Array.isArray(list) || list.length === 0) return []

  return list
    .slice(0, quantityNumber)
    .map((value) => normalizeCharacterName(value))
}

function normalizeUnitCollectStatusList(list, quantity) {
  const quantityNumber = parseQuantity(quantity)
  if (quantityNumber < 2 || !Array.isArray(list) || list.length === 0) return []

  const normalized = list
    .slice(0, quantityNumber)
    .map((value) => normalizeCollectStatus(value))

  while (normalized.length > 0 && !normalized[normalized.length - 1]) {
    normalized.pop()
  }

  return normalized.some((value) => value && value !== '已拥有') ? normalized : []
}

function resolveCompleteUnitActualPriceTotal(list, quantity) {
  const quantityNumber = parseQuantity(quantity)
  if (quantityNumber < 2 || !Array.isArray(list) || list.length < quantityNumber) return ''

  const prices = list.slice(0, quantityNumber).map((value) => Number.parseFloat(value))
  if (prices.some((value) => !Number.isFinite(value) || value < 0)) return ''

  const total = prices.reduce((sum, value) => sum + value, 0)
  return `${Math.round(total * 100) / 100}`
}

function normalizePriceValue(value) {
  if (value === '' || value == null) return ''
  return value
}

function normalizeWishlistFlag(value) {
  if (value === true || value === 1) return true
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    return normalized === '1' || normalized === 'true'
  }
  return false
}

function normalizeCollectStatus(value) {
  const str = String(value || '').trim()
  return VALID_COLLECT_STATUSES.has(str) ? str : '已拥有'
}

function normalizeStatusTimeline(list) {
  if (!Array.isArray(list)) return []
  const seen = new Set()
  return list
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null
      const status = String(entry.status || '').trim()
      const at = String(entry.at || '').trim()
      if (!status || !/^\d{4}-\d{2}-\d{2}$/.test(at)) return null
      if (!VALID_COLLECT_STATUSES.has(status)) return null
      const result = { status, at }
      if (entry.note) result.note = String(entry.note).trim()
      if (entry.unitIndex != null && Number.isInteger(entry.unitIndex)) result.unitIndex = entry.unitIndex
      const price = String(entry.price ?? '').trim()
      if (price && Number.isFinite(Number(price))) result.price = price
      const fee = String(entry.fee ?? '').trim()
      if (fee && Number.isFinite(Number(fee))) result.fee = fee
      const platform = String(entry.platform ?? '').trim()
      if (platform) result.platform = platform
      // 去重：相同 status + at + unitIndex + note + price + platform + fee 只保留一条
      const key = `${result.status}|${result.at}|${result.unitIndex ?? ''}|${result.note ?? ''}|${result.price ?? ''}|${result.platform ?? ''}|${result.fee ?? ''}`
      if (seen.has(key)) return null
      seen.add(key)
      return result
    })
    .filter(Boolean)
    .sort((a, b) => a.at.localeCompare(b.at))
}

function resolveEffectivePriceValue(item) {
  if (normalizeWishlistFlag(item?.isWishlist)) {
    return item?.price
  }

  if (item?.actualPrice !== '' && item?.actualPrice != null) {
    return item?.actualPrice
  }

  return item?.price
}

function resolveCollectionTotalValue(item) {
  if (normalizeWishlistFlag(item?.isWishlist)) {
    return item?.price
  }

  const shipping = Number(item?.shippingFee) || 0
  if (item?.actualPrice !== '' && item?.actualPrice != null) {
    const actual = Number(item.actualPrice) || 0
    return String(actual + shipping)
  }

  const quantity = parseQuantity(item?.quantity)
  const basePrice = Number(item?.price) || 0
  return String((basePrice * quantity) + shipping)
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

function diffRemovedManagedImagePaths(previousItem, nextItem) {
  const previousPaths = collectManagedLocalImagePathsFromGoodsItem(previousItem)
  const nextPaths = collectManagedLocalImagePathsFromGoodsItem(nextItem)
  return [...previousPaths].filter((path) => !nextPaths.has(path))
}

/**
 * @param {Record<string, any>} data
 * @param {string} fallbackId
 * @returns {import('@/types/models').GoodsItem}
 */
function normalizeGoodsInput(data, fallbackId = '') {
  const isWishlist = normalizeWishlistFlag(data.isWishlist)
  const variant = getGoodsVariant(data)
  const hasImagesArray = Array.isArray(data?.images)
  const imagesExplicit = data?.__imagesExplicit === true && hasImagesArray
  const shouldUseImagesArray = imagesExplicit || (hasImagesArray && data.images.length > 0)
  const fallbackImage = imagesExplicit ? '' : (data.image || data.coverImage)
  const images = normalizeGoodsImageList(shouldUseImagesArray ? data.images : undefined, fallbackImage)
  const coverImage = getPrimaryGoodsImageUrl(images, fallbackImage)

  const unitActualPriceList = isWishlist
    ? []
    : normalizeUnitActualPriceList(data.unitActualPriceList || data.purchasePriceList, data.quantity)
  const unitCharacterList = isWishlist
    ? []
    : normalizeUnitCharacterList(data.unitCharacterList, data.quantity)
  const unitCollectStatusList = isWishlist
    ? []
    : normalizeUnitCollectStatusList(data.unitCollectStatusList || data.purchaseStatusList, data.quantity)
  const resolvedUnitActualPriceTotal = isWishlist
    ? ''
    : resolveCompleteUnitActualPriceTotal(unitActualPriceList, data.quantity)
  const normalizedActualPrice = isWishlist
    ? ''
    : (resolvedUnitActualPriceTotal || normalizePriceValue(data.actualPrice))

  return {
    id: data.id || fallbackId,
    name: normalizeGoodsName(data.name),
    category: String(data.category || '').trim(),
    ip: String(data.ip || '').trim(),
    goodsId: String(data.goodsId || data.goods_id || '').trim(),
    isWishlist,
    characters: normalizeCharacterList(data.characters),
    tags: normalizeTagList(data.tags),
    storageLocation: normalizeStorageLocationValue(data.storageLocation || data.location || ''),
    variant,
    price: normalizePriceValue(data.price),
    actualPrice: normalizedActualPrice,
    points: data.points != null && data.points !== '' ? Number(data.points) : undefined,
    acquiredAt: String(data.acquiredAt || data.purchaseDate || '').trim(),
    saleAt: isWishlist ? normalizeSaleAtValue(data.saleAt || data.sale_at || '') : '',
    saleReminderEnabled: isWishlist && normalizeBooleanFlag(data.saleReminderEnabled || data.sale_reminder_enabled),
    saleReminderOffsets: isWishlist ? normalizeSaleReminderOffsetList(data.saleReminderOffsets || data.sale_reminder_offsets) : [],
    unitAcquiredAtList: isWishlist
      ? []
      : normalizeUnitAcquiredAtList(data.unitAcquiredAtList || data.purchaseDateList, data.quantity),
    unitActualPriceList,
    unitCharacterList,
    unitCollectStatusList,
    coverImage,
    images,
    tracks: normalizeTracks(data.tracks),
    note: stripVariantFromNote(data.note || data.notes || ''),
    quantity: Math.max(1, Number(data.quantity) || 1),
    updatedAt: data.updatedAt || 0,
    currency: String(data.currency || '').trim() || 'CNY',
    actualPriceCurrency: String(data.actualPriceCurrency || '').trim() || 'CNY',
    collectStatus: normalizeCollectStatus(data.collectStatus),
    shippingFee: String(data.shippingFee || '').trim(),
    statusTimeline: normalizeStatusTimeline(data.statusTimeline)
  }
}

/**
 * @param {Record<string, any>} data
 * @param {string} fallbackId
 * @returns {import('@/types/models').TrashGoodsItem}
 */
function normalizeTrashItem(data, fallbackId = '') {
  return {
    ...normalizeGoodsInput(data, fallbackId),
    deletedAt: String(data.deletedAt || new Date().toISOString()).trim()
  }
}

/**
 * @param {import('@/types/models').GoodsItem} existing
 * @param {import('@/types/models').GoodsItem} incoming
 * @returns {import('@/types/models').GoodsItem}
 */
function mergeGoodsRecord(existing, incoming) {
  const variant = getGoodsVariant(existing) || getGoodsVariant(incoming)
  const images = mergeGoodsImages(existing.images, incoming.images, existing.coverImage, incoming.coverImage)
  const mergedQuantity = Math.max(1, Number(existing.quantity) || 1) + Math.max(1, Number(incoming.quantity) || 1)

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
    actualPrice: existing.actualPrice === '' || existing.actualPrice == null ? incoming.actualPrice : existing.actualPrice,
    points: existing.points ?? incoming.points,
    acquiredAt: existing.acquiredAt || incoming.acquiredAt,
    saleAt: existing.saleAt || incoming.saleAt,
    saleReminderEnabled: Boolean(existing.saleReminderEnabled || incoming.saleReminderEnabled),
    saleReminderOffsets: existing.saleReminderOffsets?.length ? existing.saleReminderOffsets : incoming.saleReminderOffsets,
    unitAcquiredAtList: normalizeUnitAcquiredAtList(
      [...(existing.unitAcquiredAtList || []), ...(incoming.unitAcquiredAtList || [])],
      mergedQuantity
    ),
    unitActualPriceList: normalizeUnitActualPriceList(
      [...(existing.unitActualPriceList || []), ...(incoming.unitActualPriceList || [])],
      mergedQuantity
    ),
    unitCharacterList: normalizeUnitCharacterList(
      [...(existing.unitCharacterList || []), ...(incoming.unitCharacterList || [])],
      mergedQuantity
    ),
    unitCollectStatusList: normalizeWishlistFlag(existing.isWishlist)
      ? []
      : normalizeUnitCollectStatusList(
        [...(existing.unitCollectStatusList || []), ...(incoming.unitCollectStatusList || [])],
        mergedQuantity
      ),
    coverImage: getPrimaryGoodsImageUrl(images, existing.coverImage || incoming.coverImage),
    images,
    note: stripVariantFromNote(existing.note || '') || stripVariantFromNote(incoming.note || ''),
    collectStatus: existing.collectStatus || incoming.collectStatus,
    shippingFee: existing.shippingFee === '' || existing.shippingFee == null ? incoming.shippingFee : existing.shippingFee,
    statusTimeline: normalizeStatusTimeline([
      ...(existing.statusTimeline || []),
      ...(incoming.statusTimeline || [])
    ]),
    quantity: mergedQuantity,
    updatedAt: Date.now()
  }
}

export {
  parseAcquiredTime,
  parseTimelineYearMonth,
  parseNumericPrice,
  parseQuantity,
  parseDeletedTime,
  normalizePriceValue,
  normalizeSaleAtValue,
  normalizeSaleReminderOffsetList,
  normalizeWishlistFlag,
  normalizeCollectStatus,
  resolveEffectivePriceValue,
  resolveCollectionTotalValue,
  normalizeCharacterList,
  normalizeTagList,
  normalizeUnitAcquiredAtList,
  normalizeUnitActualPriceList,
  normalizeUnitCharacterList,
  resolveCompleteUnitActualPriceTotal,
  mergeGoodsImages,
  shouldApplyRemoteBackup,
  restoreImportedGoodsItem,
  diffRemovedManagedImagePaths,
  normalizeGoodsInput,
  normalizeTrashItem,
  mergeGoodsRecord,
  normalizeStatusTimeline
}
