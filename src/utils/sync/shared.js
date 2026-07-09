import {
  inferGoodsImageStorageMode,
  normalizeGoodsImageList,
  parseGistImageUri
} from '@/utils/goods/images'
import { readPersisted } from '@/utils/platform/storage'
import { MONTHLY_BUDGET_STORAGE_KEY, YEARLY_BUDGET_STORAGE_KEY } from '@/constants/budgetConstants'

const IMAGE_FILE_PREFIX = 'goods-image__'
const EVENT_COVER_PREFIX = 'event-cover__'
const EVENT_PHOTO_PREFIX = 'event-photo__'

const MIME_EXTENSION_MAP = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'image/svg+xml': 'svg'
}

export function getItemTimestamp(item) {
  return Number(item?.updatedAt) || 0
}

export function countWishlistSplit(items = []) {
  let collection = 0
  let wishlist = 0

  for (const item of items) {
    if (item?.isWishlist) {
      wishlist += 1
    } else {
      collection += 1
    }
  }

  return { collection, wishlist }
}

export function sortObjectKeys(value) {
  if (Array.isArray(value)) {
    return value.map(sortObjectKeys)
  }

  if (!value || typeof value !== 'object') {
    return value
  }

  return Object.keys(value)
    .sort()
    .reduce((result, key) => {
      result[key] = sortObjectKeys(value[key])
      return result
    }, {})
}

/**
 * Single-pass sorted-key JSON.stringify — avoids intermediate object allocation
 * that sortObjectKeys + JSON.stringify creates.
 */
export function sortedStringify(value) {
  if (value === null || value === undefined) return 'null'
  if (typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'number') return Object.is(value, -0) ? 'null' : String(value)
  if (typeof value === 'boolean') return String(value)

  if (Array.isArray(value)) {
    let result = '['
    for (let i = 0; i < value.length; i++) {
      if (i > 0) result += ','
      const v = value[i]
      result += (v === undefined || typeof v === 'function') ? 'null' : sortedStringify(v)
    }
    return result + ']'
  }

  if (typeof value === 'object') {
    const keys = Object.keys(value).sort()
    let result = '{'
    let first = true
    for (const key of keys) {
      const v = value[key]
      if (v === undefined || typeof v === 'function') continue
      if (!first) result += ','
      first = false
      result += JSON.stringify(key) + ':' + sortedStringify(v)
    }
    return result + '}'
  }

  return undefined
}

export function normalizeRecordForContentCompare(item) {
  if (!item || typeof item !== 'object') return item
  const copy = { ...item }
  delete copy.syncedBy
  delete copy.synced_by
  delete copy.trashed
  return copy
}

export function recordsContentEqual(left, right) {
  return sortedStringify(normalizeRecordForContentCompare(left)) === sortedStringify(normalizeRecordForContentCompare(right))
}

export function recordsContentChanged(left, right) {
  return !recordsContentEqual(left, right)
}

const YIELD_BATCH_SIZE = 20

/**
 * Async version of sortedStringify that yields to the main thread periodically
 * during large array serialization to keep the UI responsive.
 *
 * Handles both top-level arrays and objects with array-valued properties.
 */
export async function asyncSortedStringify(value) {
  let callCount = 0

  function stringify(v) {
    if (v === null || v === undefined) return 'null'
    if (typeof v === 'string') return JSON.stringify(v)
    if (typeof v === 'number') return Object.is(v, -0) ? 'null' : String(v)
    if (typeof v === 'boolean') return String(v)

    if (Array.isArray(v)) {
      let result = '['
      for (let i = 0; i < v.length; i++) {
        if (i > 0) result += ','
        const item = v[i]
        result += (item === undefined || typeof item === 'function') ? 'null' : stringify(item)
      }
      return result + ']'
    }

    if (typeof v === 'object') {
      const keys = Object.keys(v).sort()
      let result = '{'
      let first = true
      for (const key of keys) {
        const item = v[key]
        if (item === undefined || typeof item === 'function') continue
        if (!first) result += ','
        first = false
        result += JSON.stringify(key) + ':' + stringify(item)
      }
      return result + '}'
    }

    return undefined
  }

  async function asyncStringifyArray(arr) {
    const parts = []
    let result = '['
    for (let i = 0; i < arr.length; i++) {
      if (i > 0) result += ','
      const v = arr[i]
      result += (v === undefined || typeof v === 'function') ? 'null' : stringify(v)
      if (++callCount % YIELD_BATCH_SIZE === 0) {
        parts.push(result)
        result = ''
        await yieldToMain()
      }
    }
    return parts.join('') + result + ']'
  }

  if (Array.isArray(value)) {
    return asyncStringifyArray(value)
  }

  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort()
    let result = '{'
    let first = true
    for (const key of keys) {
      const v = value[key]
      if (v === undefined || typeof v === 'function') continue
      if (!first) result += ','
      first = false
      result += JSON.stringify(key) + ':'
      if (Array.isArray(v) && v.length > YIELD_BATCH_SIZE) {
        result += await asyncStringifyArray(v)
      } else {
        result += stringify(v)
      }
    }
    return result + '}'
  }

  return stringify(value)
}

function yieldToMain() {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

/**
 * Process items with bounded concurrency and yield to main thread between items
 * so the UI stays responsive during heavy sync work.
 */
export async function processWithConcurrency(items, fn, concurrency = 3) {
  if (items.length === 0) return []
  const results = new Array(items.length)
  let index = 0

  async function worker() {
    while (index < items.length) {
      const i = index++
      results[i] = await fn(items[i])
      await yieldToMain()
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => worker()
  )
  await Promise.all(workers)
  return results
}

export function buildComparableRecordMap(items = []) {
  const map = new Map()
  for (const item of items) {
    const id = String(item?.id || '').trim()
    if (!id) continue
    map.set(id, sortedStringify(item))
  }
  return map
}

export async function asyncBuildComparableRecordMap(items = []) {
  const map = new Map()
  let count = 0
  for (const item of items) {
    const id = String(item?.id || '').trim()
    if (!id) continue
    map.set(id, sortedStringify(item))
    if (++count % YIELD_BATCH_SIZE === 0) await yieldToMain()
  }
  return map
}

export function buildTimestampRecordMap(items = []) {
  const map = new Map()
  for (const item of items) {
    const id = String(item?.id || '').trim()
    if (!id) continue
    map.set(id, Number(item?.updatedAt) || 0)
  }
  return map
}

export function countComparableRecordDiff(localMap, remoteMap) {
  let remoteOnly = 0
  let localOnly = 0
  let updated = 0

  for (const [id, remoteValue] of remoteMap.entries()) {
    if (!localMap.has(id)) {
      remoteOnly += 1
      continue
    }
    if (localMap.get(id) !== remoteValue) {
      updated += 1
    }
  }

  for (const id of localMap.keys()) {
    if (!remoteMap.has(id)) {
      localOnly += 1
    }
  }

  return {
    remoteTotal: remoteMap.size,
    remoteOnly,
    localOnly,
    updated
  }
}

export function buildGoodsImageReferenceMap(items = []) {
  const map = new Map()

  for (const item of items) {
    const itemId = String(item?.id || '').trim()
    if (!itemId) continue

    for (const imageEntry of normalizeGoodsImageList(item?.images)) {
      const imageId = String(imageEntry?.id || '').trim()
      const uri = String(imageEntry?.uri || '').trim()
      if (!imageId || !uri) continue

      const storageMode = inferGoodsImageStorageMode(uri, imageEntry?.storageMode)
      if (!['gist-local', 'linked-local', 'inline-local'].includes(storageMode)) continue

      // 只用图片 ID 作为版本标识，不依赖商品的 updatedAt 时间戳
      // 这样即使商品信息改变（updatedAt 改变），图片版本也不会改变
      // 除非图片内容本身改变（imageId 改变）
      
      const gistFileName = String(imageEntry?.gistFileName || parseGistImageUri(uri) || '').trim()
      if (!gistFileName) continue  // 跳过还没上传到 Gist 的图片

      // 提取图片的唯一标识，不含时间戳部分
      // 格式: goods-image__goodsId__imageId__timestamp.jpg.txt
      // 提取: goods-image__goodsId__imageId
      const parts = gistFileName.split('__')
      const baseFileName = parts.slice(0, 3).join('__')  // 前三个部分不含时间戳
      map.set(`goods:${itemId}:${imageId}`, baseFileName || imageId)
    }
  }

  return map
}

export function buildEventImageReferenceMap(events = []) {
  const map = new Map()

  for (const event of events) {
    const eventId = String(event?.id || '').trim()
    const coverImage = String(event?.coverImage || '').trim()
    if (!eventId || !coverImage) continue

    const storageMode = inferGoodsImageStorageMode(coverImage, event?.coverImageData?.storageMode)
    if (!['gist-local', 'linked-local', 'inline-local'].includes(storageMode)) continue

    // 只用活动 ID 作为版本标识，不依赖活动的 updatedAt 时间戳
    // 这样即使活动信息改变，封面版本也不会改变
    const gistFileName = String(event?.coverImageData?.gistFileName || parseGistImageUri(coverImage) || '').trim()
    if (!gistFileName) continue  // 跳过还没上传到 Gist 的图片

    // 提取活动封面的唯一标识，不含时间戳部分
    // 格式: event-cover__eventId__timestamp.jpg.txt
    // 提取: event-cover__eventId
    const parts = gistFileName.split('__')
    const baseFileName = parts.slice(0, 2).join('__')  // 前两个部分不含时间戳
    map.set(`event:${eventId}:cover`, baseFileName || eventId)
  }

  // 处理活动的相关图片
  for (const event of events) {
    const eventId = String(event?.id || '').trim()
    if (!eventId) continue

    const photos = Array.isArray(event?.photos) ? event.photos : []
    for (const photoEntry of photos) {
      const photoId = String(photoEntry?.id || '').trim()
      const photoUri = String(photoEntry?.uri || '').trim()
      if (!photoId || !photoUri) continue

      const storageMode = inferGoodsImageStorageMode(photoUri, photoEntry?.storageMode)
      if (!['gist-local', 'linked-local', 'inline-local'].includes(storageMode)) continue

      // 只用图片 ID 作为版本标识，不依赖活动的 updatedAt 时间戳
      const gistFileName = String(photoEntry?.gistFileName || parseGistImageUri(photoUri) || '').trim()
      if (!gistFileName) continue  // 跳过还没上传到 Gist 的图片

      // 提取图片的唯一标识，不含时间戳部分
      // photos 的格式应该与商品图片类似或不同，这里通用提取前端标识
      const parts = gistFileName.split('__')
      const baseFileName = parts.slice(0, 3).join('__')  // 提取基础部分不含时间戳
      map.set(`event:${eventId}:photo:${photoId}`, baseFileName || photoId)
    }
  }

  return map
}

export function buildImageReferenceMap({ goods = [], trash = [], events = [] } = {}) {
  return new Map([
    ...buildGoodsImageReferenceMap(goods).entries(),
    ...buildGoodsImageReferenceMap(trash).entries(),
    ...buildEventImageReferenceMap(events).entries()
  ])
}

export function resolveGoodsTrashMaps(goodsList = [], trashList = []) {
  const goodsMap = new Map(goodsList.map((item) => [item.id, item]))
  const trashMap = new Map(trashList.map((item) => [item.id, item]))

  for (const [id, trashItem] of trashMap) {
    const goodsItem = goodsMap.get(id)
    if (!goodsItem) continue

    if (getItemTimestamp(trashItem) >= getItemTimestamp(goodsItem)) {
      goodsMap.delete(id)
    } else {
      trashMap.delete(id)
    }
  }

  return { goodsMap, trashMap }
}

function sanitizeFilenamePart(value) {
  return String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    || 'unknown'
}

function getBase64ByteSize(base64Data) {
  const normalized = String(base64Data || '').trim()
  if (!normalized) return 0
  const padding = normalized.endsWith('==') ? 2 : (normalized.endsWith('=') ? 1 : 0)
  return Math.floor((normalized.length * 3) / 4) - padding
}

export function parseImageDataUrl(dataUrl) {
  const match = String(dataUrl || '').match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/)
  if (!match) return null

  const mimeType = match[1].toLowerCase()
  const base64Data = match[2]

  return {
    mimeType,
    base64Data,
    fileSize: getBase64ByteSize(base64Data)
  }
}

function resolveImageExtension(mimeType, fallbackName = '') {
  const normalizedMimeType = String(mimeType || '').trim().toLowerCase()
  if (MIME_EXTENSION_MAP[normalizedMimeType]) return MIME_EXTENSION_MAP[normalizedMimeType]

  const nameExt = String(fallbackName || '').split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '')
  return nameExt || 'jpg'
}

export function buildImageFilename(item, imageEntry, mimeType) {
  const existingGistFileName = String(imageEntry?.gistFileName || parseGistImageUri(imageEntry?.uri) || '').trim()
  if (existingGistFileName) return existingGistFileName

  const itemId = sanitizeFilenamePart(item?.id)
  const imageId = sanitizeFilenamePart(imageEntry?.id)
  const updatedAt = String(getItemTimestamp(item) || 0)
  const extension = resolveImageExtension(mimeType, imageEntry?.uri || imageEntry?.gistFileName || '')
  return `${IMAGE_FILE_PREFIX}${itemId}__${imageId}__${updatedAt}.${extension}.txt`
}

export function buildEventCoverFilename(event, mimeType) {
  const existingGistFileName = String(event?.coverImageData?.gistFileName || parseGistImageUri(event?.coverImage) || '').trim()
  if (existingGistFileName) return existingGistFileName

  const eventId = sanitizeFilenamePart(event?.id)
  const updatedAt = String(event?.updatedAt || 0)
  const extension = resolveImageExtension(mimeType, event?.coverImage || '')
  return `${EVENT_COVER_PREFIX}${eventId}__${updatedAt}.${extension}.txt`
}

export function buildEventPhotoFilename(event, photoEntry, mimeType) {
  const existingGistFileName = String(photoEntry?.gistFileName || parseGistImageUri(photoEntry?.uri) || '').trim()
  if (existingGistFileName) return existingGistFileName

  const eventId = sanitizeFilenamePart(event?.id)
  const photoId = sanitizeFilenamePart(photoEntry?.id)
  const updatedAt = String(event?.updatedAt || 0)
  const extension = resolveImageExtension(mimeType, photoEntry?.uri || photoEntry?.gistFileName || '')
  return `${EVENT_PHOTO_PREFIX}${eventId}__${photoId}__${updatedAt}.${extension}.txt`
}

export function buildImageSyncStats() {
  return {
    uploadedImages: 0,
    reusedImages: 0,
    restoredImages: 0,
    imageFileCount: 0,
    imageUpdatedAt: ''
  }
}

export function toTimestampMs(value) {
  if (!value) return 0
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  const ms = new Date(value).getTime()
  return Number.isFinite(ms) ? ms : 0
}

export function normalizeBudgetValue(value) {
  const num = Number(value)
  if (!Number.isFinite(num) || num <= 0) return 0
  return num
}

export function getLatestRechargeTimestamp(records = []) {
  let latest = 0
  for (const item of records || []) {
    latest = Math.max(latest, getItemTimestamp(item))
  }
  return latest
}

export function shouldPullRechargeByManifest(remoteManifest, localRechargeRecords) {
  const remoteRechargeTs = toTimestampMs(remoteManifest?.rechargeUpdatedAt)
  if (!remoteRechargeTs) return true
  const localRechargeTs = getLatestRechargeTimestamp(localRechargeRecords)
  return remoteRechargeTs > localRechargeTs
}

export async function readBudgetSettings() {
  const [monthlyRaw, yearlyRaw] = await Promise.all([
    readPersisted(MONTHLY_BUDGET_STORAGE_KEY, ''),
    readPersisted(YEARLY_BUDGET_STORAGE_KEY, '')
  ])

  return {
    monthly: normalizeBudgetValue(monthlyRaw),
    yearly: normalizeBudgetValue(yearlyRaw)
  }
}
