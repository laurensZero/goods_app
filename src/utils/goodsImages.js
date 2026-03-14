import { isLocalImageUri } from '@/utils/localImage'

export const GOODS_IMAGE_KIND_OPTIONS = [
  { value: 'primary', label: '主图' },
  { value: 'detail', label: '局部图' },
  { value: 'unboxing', label: '开箱图' },
  { value: 'closeup', label: '细节图' },
  { value: 'custom', label: '自定义' }
]

const VALID_KIND_SET = new Set(GOODS_IMAGE_KIND_OPTIONS.map((option) => option.value))

export function createGoodsImageId() {
  return `img_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

export function inferGoodsImageStorageMode(uri, explicitMode = '') {
  const normalizedMode = String(explicitMode || '').trim()
  if (normalizedMode) return normalizedMode

  const normalizedUri = String(uri || '').trim()
  if (!normalizedUri) return 'remote'
  if (normalizedUri.startsWith('http://') || normalizedUri.startsWith('https://')) return 'remote'
  if (normalizedUri.startsWith('blob:') || normalizedUri.startsWith('data:image/')) return 'inline-local'
  if (
    normalizedUri.startsWith('content://')
    || normalizedUri.startsWith('file://')
    || normalizedUri.startsWith('/storage/')
    || normalizedUri.startsWith('/private/')
    || isLocalImageUri(normalizedUri)
  ) {
    return 'linked-local'
  }

  return 'remote'
}

export function isExportableGoodsImage(entry) {
  const storageMode = inferGoodsImageStorageMode(entry?.uri, entry?.storageMode)
  return storageMode === 'remote'
}

export function normalizeGoodsImageEntry(entry, fallbackIndex = 0) {
  if (!entry) return null

  const uri = String(entry.uri || entry.url || entry.image || '').trim()
  if (!uri) return null

  const kind = VALID_KIND_SET.has(String(entry.kind || '').trim())
    ? String(entry.kind).trim()
    : (fallbackIndex === 0 ? 'primary' : 'custom')

  return {
    id: String(entry.id || createGoodsImageId()).trim(),
    uri,
    kind,
    label: String(entry.label || '').trim(),
    storageMode: inferGoodsImageStorageMode(uri, entry.storageMode),
    localPath: String(entry.localPath || '').trim(),
    isPrimary: entry.isPrimary === true
  }
}

export function normalizeGoodsImageList(rawImages, fallbackImage = '') {
  const sourceList = Array.isArray(rawImages)
    ? rawImages
    : (fallbackImage ? [{ uri: fallbackImage, isPrimary: true }] : [])

  const seenUris = new Set()
  const normalized = sourceList
    .map((entry, index) => normalizeGoodsImageEntry(entry, index))
    .filter((entry) => {
      if (!entry || seenUris.has(entry.uri)) return false
      seenUris.add(entry.uri)
      return true
    })

  if (normalized.length === 0 && fallbackImage) {
    const fallbackEntry = normalizeGoodsImageEntry({ uri: fallbackImage, isPrimary: true }, 0)
    if (fallbackEntry) {
      normalized.push(fallbackEntry)
    }
  }

  if (normalized.length === 0) return []

  const primaryIndex = normalized.findIndex((entry) => entry.isPrimary)
  const resolvedPrimaryIndex = primaryIndex >= 0 ? primaryIndex : 0

  return normalized.map((entry, index) => ({
    ...entry,
    isPrimary: index === resolvedPrimaryIndex,
    kind: index === resolvedPrimaryIndex ? 'primary' : entry.kind
  }))
}

export function getPrimaryGoodsImage(images, fallbackImage = '') {
  const normalized = normalizeGoodsImageList(images, fallbackImage)
  return normalized.find((entry) => entry.isPrimary) || normalized[0] || null
}

export function getPrimaryGoodsImageUrl(images, fallbackImage = '') {
  return getPrimaryGoodsImage(images, fallbackImage)?.uri || String(fallbackImage || '').trim()
}

export function sanitizeGoodsImagesForExport(images, fallbackImage = '') {
  const exportableImages = normalizeGoodsImageList(images, fallbackImage).filter(isExportableGoodsImage)
  if (exportableImages.length === 0) return []

  const primaryId = exportableImages.find((entry) => entry.isPrimary)?.id || exportableImages[0].id
  return exportableImages.map((entry) => ({
    id: entry.id,
    uri: entry.uri,
    kind: entry.id === primaryId ? 'primary' : entry.kind,
    label: entry.label,
    storageMode: 'remote',
    isPrimary: entry.id === primaryId
  }))
}

export function sanitizeGoodsItemForExport(item) {
  const { image: _legacyImage, coverImage: _coverImage, ...rest } = item || {}
  const images = sanitizeGoodsImagesForExport(item?.images, item?.coverImage || item?.image)
  return {
    ...rest,
    images
  }
}
