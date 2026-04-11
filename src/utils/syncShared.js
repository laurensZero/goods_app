import {
  inferGoodsImageStorageMode,
  normalizeGoodsImageList,
  parseGistImageUri
} from '@/utils/goodsImages'

const IMAGE_FILE_PREFIX = 'goods-image__'
const EVENT_COVER_PREFIX = 'event-cover__'

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

export function buildComparableRecordMap(items = []) {
  const map = new Map()
  for (const item of items) {
    const id = String(item?.id || '').trim()
    if (!id) continue
    map.set(id, JSON.stringify(sortObjectKeys(item)))
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

function buildGoodsImageReferenceMap(items = []) {
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

function buildEventImageReferenceMap(events = []) {
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

export function buildImageSyncStats() {
  return {
    uploadedImages: 0,
    reusedImages: 0,
    restoredImages: 0,
    imageFileCount: 0,
    imageUpdatedAt: ''
  }
}
