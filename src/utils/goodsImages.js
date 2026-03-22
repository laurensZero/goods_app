import { isLocalImageUri, readLocalImageAsDataUrl } from '@/utils/localImage'

export const GOODS_IMAGE_KIND_OPTIONS = [
  { value: 'primary', label: '主图' },
  { value: 'detail', label: '局部图' },
  { value: 'unboxing', label: '开箱图' },
  { value: 'closeup', label: '细节图' },
  { value: 'custom', label: '自定义' }
]

export const GIST_LOCAL_IMAGE_PREFIX = 'gist-image://'

const VALID_KIND_SET = new Set(GOODS_IMAGE_KIND_OPTIONS.map((option) => option.value))

export function createGoodsImageId() {
  return `img_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

export function buildGistImageUri(filename) {
  const resolved = String(filename || '').trim()
  return resolved ? `${GIST_LOCAL_IMAGE_PREFIX}${resolved}` : ''
}

export function parseGistImageUri(uri) {
  const value = String(uri || '').trim()
  return value.startsWith(GIST_LOCAL_IMAGE_PREFIX)
    ? value.slice(GIST_LOCAL_IMAGE_PREFIX.length)
    : ''
}

export function isGistImageUri(uri) {
  return !!parseGistImageUri(uri)
}

export function inferGoodsImageStorageMode(uri, explicitMode = '') {
  const normalizedMode = String(explicitMode || '').trim()
  if (normalizedMode) return normalizedMode

  const normalizedUri = String(uri || '').trim()
  if (!normalizedUri) return 'remote'
  if (isGistImageUri(normalizedUri)) return 'gist-local'
  if (
    normalizedUri.startsWith('content://')
    || normalizedUri.startsWith('file://')
    || normalizedUri.startsWith('/storage/')
    || normalizedUri.startsWith('/private/')
    || isLocalImageUri(normalizedUri)
  ) {
    return normalizedUri.startsWith('blob:') || normalizedUri.startsWith('data:image/')
      ? 'inline-local'
      : 'linked-local'
  }
  if (normalizedUri.startsWith('http://') || normalizedUri.startsWith('https://')) return 'remote'
  if (normalizedUri.startsWith('blob:') || normalizedUri.startsWith('data:image/')) return 'inline-local'

  return 'remote'
}

export function isExportableGoodsImage(entry) {
  const storageMode = inferGoodsImageStorageMode(entry?.uri, entry?.storageMode)
  return storageMode === 'remote'
}

export function normalizeGoodsImageEntry(entry, fallbackIndex = 0) {
  if (!entry) return null

  const rawUri = String(entry.uri || entry.url || entry.image || '').trim()
  const gistFileName = String(entry.gistFileName || parseGistImageUri(rawUri)).trim()
  const uri = rawUri || buildGistImageUri(gistFileName)
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
    gistFileName,
    mimeType: String(entry.mimeType || '').trim(),
    fileSize: Number(entry.fileSize) > 0 ? Number(entry.fileSize) : 0,
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

export async function sanitizeGoodsImagesForExport(images, fallbackImage = '') {
  const normalizedImages = normalizeGoodsImageList(images, fallbackImage)
  if (normalizedImages.length === 0) return []

  const primaryId = normalizedImages.find((entry) => entry.isPrimary)?.id || normalizedImages[0].id
  const exportableImages = (await Promise.all(normalizedImages.map(async (entry) => {
    if (isExportableGoodsImage(entry)) {
      return {
        id: entry.id,
        uri: entry.uri,
        kind: entry.kind,
        label: entry.label,
        storageMode: 'remote',
        isPrimary: entry.id === primaryId
      }
    }

    if (entry.id !== primaryId) return null

    const embeddedUri = await readLocalImageAsDataUrl(entry.uri)
    if (!embeddedUri?.startsWith('data:image/')) return null

    return {
      id: entry.id,
      uri: embeddedUri,
      kind: 'primary',
      label: entry.label,
      storageMode: 'inline-local',
      isPrimary: true
    }
  }))).filter(Boolean)

  if (exportableImages.length === 0) return []

  const resolvedPrimaryId = exportableImages.find((entry) => entry.isPrimary)?.id || exportableImages[0].id
  return exportableImages.map((entry) => ({
    ...entry,
    kind: entry.id === resolvedPrimaryId ? 'primary' : entry.kind,
    isPrimary: entry.id === resolvedPrimaryId
  }))
}

export function sanitizeGoodsImagesForSync(images, preparedImages = null) {
  const normalizedImages = normalizeGoodsImageList(preparedImages || images)
  if (normalizedImages.length === 0) return []

  const primaryId = normalizedImages.find((entry) => entry.isPrimary)?.id || normalizedImages[0].id
  const syncImages = normalizedImages
    .filter((entry) => preparedImages || isExportableGoodsImage(entry))
    .map((entry) => ({
      id: entry.id,
      uri: entry.uri,
      kind: entry.kind,
      label: entry.label,
      storageMode: inferGoodsImageStorageMode(entry.uri, entry.storageMode),
      gistFileName: entry.gistFileName || parseGistImageUri(entry.uri),
      mimeType: entry.mimeType || '',
      fileSize: Number(entry.fileSize) > 0 ? Number(entry.fileSize) : 0,
      isPrimary: entry.id === primaryId
    }))

  if (syncImages.length === 0) return []

  const resolvedPrimaryId = syncImages.find((entry) => entry.isPrimary)?.id || syncImages[0].id
  return syncImages.map((entry) => ({
    ...entry,
    kind: entry.id === resolvedPrimaryId ? 'primary' : entry.kind,
    isPrimary: entry.id === resolvedPrimaryId
  }))
}

function normalizeSyncVariant(variant) {
  let value = String(variant || '').trim()
  if (!value) return ''

  let previous = ''
  while (value && value !== previous) {
    previous = value
    value = value
      .replace(/^[\/,+\s]+/g, '')
      .replace(/[\/,+\s]+$/g, '')
      .trim()
  }

  return value
}

export function sanitizeGoodsItemForSync(item, preparedImages = null) {
  const { image: _legacyImage, coverImage: _coverImage, ...rest } = item || {}
  const images = sanitizeGoodsImagesForSync(item?.images, preparedImages)
  return {
    ...rest,
    variant: normalizeSyncVariant(rest.variant),
    images
  }
}

export async function sanitizeGoodsItemForExport(item) {
  const { image: _legacyImage, coverImage: _coverImage, ...rest } = item || {}
  const images = await sanitizeGoodsImagesForExport(item?.images, item?.coverImage || item?.image)
  return {
    ...rest,
    images
  }
}
