// @ts-check
import { isLocalImageUri, readLocalImageAsDataUrl } from '@/utils/image/localImage'
import { preserveImageEditRecipe } from '@/utils/image/imageEditRecipe'
import { parseRef } from '@/utils/image/refKinds'

export const GOODS_IMAGE_KIND_OPTIONS = [
  { value: 'primary', label: '主图' },
  { value: 'detail', label: '局部图' },
  { value: 'unboxing', label: '开箱图' },
  { value: 'closeup', label: '细节图' },
  { value: 'custom', label: '自定义' }
]

export const CLOUD_IMAGE_PREFIX = 'cloud-image://'

const VALID_KIND_SET = new Set(GOODS_IMAGE_KIND_OPTIONS.map((option) => option.value))

export function createGoodsImageId() {
  return `img_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

export function buildCloudImageUri(filename) {
  const resolved = String(filename || '').trim()
  return resolved ? `${CLOUD_IMAGE_PREFIX}${resolved}` : ''
}

export function parseCloudImageUri(uri) {
  const value = String(uri || '').trim()
  if (value.startsWith(CLOUD_IMAGE_PREFIX)) return value.slice(CLOUD_IMAGE_PREFIX.length)
  // Backward compat: old gist-image:// prefix
  if (value.startsWith('gist-image://')) return value.slice('gist-image://'.length)
  // 收敛后的相对引用形态 cloud:<fileName>（见 src/utils/image/ref.js 的 CLOUD_REF_PREFIX）。
  // 云端迁移会写成这种形态，反解必须认：孤儿回收靠本函数判断"文件是否被引用"，
  // 认不出来就会把仍在使用的图当孤儿删掉。
  if (value.startsWith('cloud:')) return value.slice('cloud:'.length)
  return ''
}

// 从 Supabase Storage 公开 URL 中提取裸文件名（不含桶名与用户目录前缀），非 Storage URL 返回 ''
// URL 形如: ${url}/storage/v1/object/public/<bucket>/<path>
// path 可能带用户目录前缀（<uid>/goods-image__...），孤儿回收的引用比对使用裸文件名，
// 此处必须剥掉目录段，否则被引用的文件会因比对不上而被误判为孤儿删除
export function parseStoragePublicImageUrl(uri) {
  const value = String(uri || '').trim()
  const match = value.match(/\/storage\/v1\/object\/public\/[^/]+\/([^?#]+)/)
  if (!match) return ''
  let path = match[1]
  try {
    path = decodeURIComponent(path)
  } catch {}
  return path.split('/').pop() || ''
}

export function isCloudImageUri(uri) {
  return !!parseCloudImageUri(uri)
}

/**
 * 把可能带 ref 前缀的图片值还原成本地显示形态（读层边界用）。
 * - cloud:<name> → cloud-image://<name>（由图片缓存解析成公链）
 * - remote:<url> → <url>
 * - local:<path|data> → <path|data>
 * - 其它原样返回
 *
 * 用于没有独立 normalize 函数的字段（如充值记录 image）。
 * @param {unknown} value
 * @returns {string}
 */
export function normalizeImageRefDisplayValue(value) {
  const raw = String(value || '').trim()
  const ref = parseRef(raw)
  if (!ref) return raw
  if (ref.kind === 'cloud') return buildCloudImageUri(ref.value)
  return ref.value
}

export function inferGoodsImageStorageMode(uri, explicitMode = '') {
  const normalizedUri = String(uri || '').trim()

  // 文件型 URI 必须优先于 explicitMode：存量数据可能被误标成 remote
  // （convertFileSrc 自定义 host 曾被当成 https 远程图），否则会把本地路径推上云。
  if (normalizedUri.startsWith('blob:') || normalizedUri.startsWith('data:image/')) {
    return 'inline-local'
  }
  if (
    normalizedUri.startsWith('content://')
    || normalizedUri.startsWith('file://')
    || normalizedUri.startsWith('capacitor://')
    || normalizedUri.startsWith('/storage/')
    || normalizedUri.startsWith('/private/')
    || normalizedUri.includes('/_capacitor_file_/')
    || isLocalImageUri(normalizedUri)
  ) {
    return 'linked-local'
  }

  const normalizedMode = String(explicitMode || '').trim()
  // Backward compat: old 'gist-local' → 'cloud-local'
  if (normalizedMode === 'gist-local') return 'cloud-local'
  if (normalizedMode) return normalizedMode

  if (!normalizedUri) return 'remote'
  if (isCloudImageUri(normalizedUri)) return 'cloud-local'
  if (normalizedUri.startsWith('http://') || normalizedUri.startsWith('https://')) return 'remote'

  return 'remote'
}

export function isExportableGoodsImage(entry) {
  const uri = String(entry?.uri || '').trim()
  if (uri.startsWith('http://') || uri.startsWith('https://')) return true
  const storageMode = inferGoodsImageStorageMode(entry?.uri, entry?.storageMode)
  return storageMode === 'remote'
}

/**
 * uri 字段里的半迁移数据：迁移脚本写的是 `ref`，但如果它落到了 `uri` 里
 * （`cloud:xxx.jpg`），显示层要按 `cloud-image://` 认，否则图片空白。
 * 只处理 cloud:（与 fixture「cloud: ref 被当作 uri 传入」一致）；不猜其余前缀。
 * @param {unknown} value
 * @returns {string}
 */
function normalizeUriValue(value) {
  const trimmed = String(value || '').trim()
  if (trimmed.startsWith('cloud:')) return buildCloudImageUri(trimmed.slice('cloud:'.length))
  return trimmed
}

/**
 * @param {Partial<import('@/types/models').GoodsImage> & { url?: string, image?: string }} entry
 * @param {number} fallbackIndex
 * @returns {import('@/types/models').GoodsImage | null}
 */
export function normalizeGoodsImageEntry(entry, fallbackIndex = 0) {
  if (!entry) return null

  // 云端迁移后的条目只剩 ref（cloud:/remote:/local:）。
  // 这里是**唯一**把 ref 翻译回旧形态字段的地方：显示、同步、孤儿回收、
  // 外框编辑全都继续用 uri / cloudFileName，下游零改动。
  const ref = parseRef(entry?.ref)
  const refUri = ref ? (ref.kind === 'cloud' ? buildCloudImageUri(ref.value) : ref.value) : ''
  // local: 是本机专属路径，显式标记，别让 infer 把它当 remote 推上云
  const refStorageMode = ref?.kind === 'local' ? 'local' : ''

  // 支持纯字符串 URL
  if (typeof entry === 'string') {
    const stringRef = parseRef(entry)
    const uri = stringRef
      ? (stringRef.kind === 'cloud' ? buildCloudImageUri(stringRef.value) : stringRef.value)
      : normalizeUriValue(entry)
    if (!uri) return null
    return {
      id: createGoodsImageId(),
      uri,
      kind: fallbackIndex === 0 ? 'primary' : 'custom',
      label: '',
      storageMode: inferGoodsImageStorageMode(uri, stringRef?.kind === 'local' ? 'local' : ''),
      localPath: '',
      cloudFileName: parseCloudImageUri(uri) || (stringRef?.kind === 'cloud' ? stringRef.value : ''),
      mimeType: '',
      fileSize: 0,
      isPrimary: fallbackIndex === 0,
    }
  }

  const rawUri = normalizeUriValue(entry.uri || entry.url || entry.image) || refUri
  const cloudFileName = String(
    entry.cloudFileName || entry.gistFileName || parseCloudImageUri(rawUri) || (ref?.kind === 'cloud' ? ref.value : '')
  ).trim()
  const uri = rawUri || buildCloudImageUri(cloudFileName)
  if (!uri) return null

  const kind = VALID_KIND_SET.has(String(entry.kind || '').trim())
    ? String(entry.kind).trim()
    : (fallbackIndex === 0 ? 'primary' : 'custom')

  // 字段白名单：未登记的字段会被直接丢弃。
  // 新增图片字段时要同时改 sanitizeGoodsImagesForSync / ForExport，
  // 会同步的文件名引用还要登记到 collectReferencedImageState，否则会被孤儿回收删文件
  const edit = preserveImageEditRecipe(entry.edit)
  // 迁移后「去框底图」只剩 editSourceRef，同样在边界翻译回两个旧字段
  const editSource = edit ? parseRef(entry.editSourceRef) : null
  const editSourceUri = edit
    ? String(entry.editSourceUri || '').trim()
      || (editSource ? (editSource.kind === 'cloud' ? buildCloudImageUri(editSource.value) : editSource.value) : '')
    : ''
  const editSourceCloudFileName = edit
    ? String(entry.editSourceCloudFileName || '').trim()
      || (editSource?.kind === 'cloud' ? editSource.value : '')
    : ''
  return {
    id: String(entry.id || createGoodsImageId()).trim(),
    uri,
    kind,
    label: String(entry.label || '').trim(),
    storageMode: inferGoodsImageStorageMode(uri, entry.storageMode || refStorageMode),
    localPath: String(entry.localPath || '').trim(),
    cloudFileName,
    mimeType: String(entry.mimeType || '').trim(),
    fileSize: Number(entry.fileSize) > 0 ? Number(entry.fileSize) : 0,
    isPrimary: entry.isPrimary === true,
    // 外框二次编辑：配方 + 去框底图的云端位置。
    // 底图的**本地**路径不进这里（同步行会被远端整行覆盖），在 image_edits 表里单独记账
    edit,
    editSourceUri,
    editSourceCloudFileName
  }
}

function buildGoodsImageDedupKey(uri) {
  const value = String(uri || '').trim()
  if (!value) return ''

  try {
    const parsed = new URL(value)
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return `${parsed.protocol}//${parsed.hostname.toLowerCase()}${parsed.pathname}`
    }
  } catch {
    // Non-URL values such as content:// and cloud-image:// should keep exact matching.
  }

  return value
}

/**
 * @param {unknown} rawImages
 * @param {string} fallbackImage
 * @returns {import('@/types/models').GoodsImage[]}
 */
export function normalizeGoodsImageList(rawImages, fallbackImage = '') {
  const sourceList = Array.isArray(rawImages)
    ? rawImages
    : (fallbackImage ? [{ uri: fallbackImage, isPrimary: true }] : [])

  const seenUris = new Set()
  const normalized = sourceList
    .map((entry, index) => normalizeGoodsImageEntry(entry, index))
    .filter((entry) => {
      const dedupKey = buildGoodsImageDedupKey(entry?.uri)
      if (!entry || seenUris.has(dedupKey)) return false
      seenUris.add(dedupKey)
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

/**
 * @param {unknown} images
 * @param {string} fallbackImage
 * @returns {import('@/types/models').GoodsImage | null}
 */
export function getPrimaryGoodsImage(images, fallbackImage = '') {
  const normalized = normalizeGoodsImageList(images, fallbackImage)
  return normalized.find((entry) => entry.isPrimary) || normalized[0] || null
}

/**
 * @param {unknown} images
 * @param {string} fallbackImage
 * @returns {string}
 */
export function getPrimaryGoodsImageUrl(images, fallbackImage = '') {
  return getPrimaryGoodsImage(images, fallbackImage)?.uri || String(fallbackImage || '').trim()
}

export async function sanitizeGoodsImagesForExport(images, fallbackImage = '') {
  const normalizedImages = normalizeGoodsImageList(images, fallbackImage)
  if (normalizedImages.length === 0) return []

  const primaryId = normalizedImages.find((entry) => entry.isPrimary)?.id || normalizedImages[0].id
  // 备份要能还原「外框二次编辑」状态，所以配方与底图的云端引用跟着一起导出
  const exportableImages = (await Promise.all(normalizedImages.map(async (entry) => {
    const edit = preserveImageEditRecipe(entry.edit)
    const editSourceCloudFileName = edit
      ? String(entry.editSourceCloudFileName || parseCloudImageUri(entry.editSourceUri) || '').trim()
      : ''
    const editFields = edit
      ? { edit, editSourceUri: entry.editSourceUri, editSourceCloudFileName }
      : {}

    if (isExportableGoodsImage(entry)) {
      return {
        id: entry.id,
        uri: entry.uri,
        kind: entry.kind,
        label: entry.label,
        storageMode: 'remote',
        isPrimary: entry.id === primaryId,
        ...editFields
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
      isPrimary: true,
      ...editFields
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
  // 白名单决定什么能推上云；与 normalizeGoodsImageEntry 必须同时改，漏一处会静默丢字段
  const syncImages = normalizedImages
    .filter((entry) => preparedImages || isExportableGoodsImage(entry))
    .map((entry) => {
      const cloudFileName = entry.cloudFileName || parseCloudImageUri(entry.uri)
      // Never embed base64 data URLs in sync payload — images are uploaded separately.
      // Replace data: URIs with cloud-image:// references so all backends stay lightweight.
      let uri = entry.uri
      if (typeof uri === 'string' && uri.startsWith('data:')) {
        uri = cloudFileName ? `cloud-image://${cloudFileName}` : ''
      }
      const edit = preserveImageEditRecipe(entry.edit)
      const editSourceCloudFileName = edit
        ? String(entry.editSourceCloudFileName || parseCloudImageUri(entry.editSourceUri) || '').trim()
        : ''
      return {
        id: entry.id,
        uri,
        kind: entry.kind,
        label: entry.label,
        storageMode: inferGoodsImageStorageMode(uri, entry.storageMode),
        cloudFileName,
        mimeType: entry.mimeType || '',
        fileSize: Number(entry.fileSize) > 0 ? Number(entry.fileSize) : 0,
        isPrimary: entry.id === primaryId,
        // 配方只在真的套了框时才有值；底图只留云端引用，本地路径永远不推
        edit,
        editSourceUri: edit ? (editSourceCloudFileName ? `cloud-image://${editSourceCloudFileName}` : '') : '',
        editSourceCloudFileName: edit ? editSourceCloudFileName : ''
      }
    })

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

export async function sanitizeGoodsImagesForShare(images, fallbackImage = '') {
  const normalizedImages = normalizeGoodsImageList(images, fallbackImage)
  if (normalizedImages.length === 0) return []

  const primaryId = normalizedImages.find((entry) => entry.isPrimary)?.id || normalizedImages[0].id
  // Only include remote images (URLs) — skip local/base64 images to keep payload small.
  // 分享**刻意不带** edit / editSource*：分享只需要成品图，配方是本地编辑状态（白名单在这里天然排除）
  const shareableImages = normalizedImages
    .filter((entry) => isExportableGoodsImage(entry))
    .map((entry) => ({
      id: entry.id,
      uri: entry.uri,
      kind: entry.kind,
      label: entry.label,
      storageMode: 'remote',
      isPrimary: entry.id === primaryId
    }))

  if (shareableImages.length === 0) return []

  const resolvedPrimaryId = shareableImages.find((entry) => entry.isPrimary)?.id || shareableImages[0].id
  return shareableImages.map((entry) => ({
    ...entry,
    kind: entry.id === resolvedPrimaryId ? 'primary' : entry.kind,
    isPrimary: entry.id === resolvedPrimaryId
  }))
}

export async function sanitizeGoodsItemForShare(item) {
  const { image: _legacyImage, coverImage: _coverImage, isWishlist: _isWishlist, ...rest } = item || {}
  const images = await sanitizeGoodsImagesForShare(item?.images, item?.coverImage || item?.image)

  return {
    ...rest,
    images
  }
}

/**
 * events 封面：迁移后 `cover_image` 是 ref（`cloud:xxx.jpg`），
 * 在这里翻译回 `uri` + `coverImageData.cloudFileName`，其余逻辑不用知道 ref。
 * 非 ref 入参原样返回（仅 trim）。
 *
 * `fillCloudFileName` 保留本地库读取的旧行为：coverImage 能解析出云端文件名、
 * 而 coverImageData 里没有时补齐 uri / storageMode / cloudFileName。
 * 只给 getEvents 用，同步边界不要开启（否则会给远端行补字段、干扰 diff）。
 * @param {unknown} coverImage
 * @param {unknown} coverImageData
 * @param {{ fillCloudFileName?: boolean }} [options]
 * @returns {{ coverImage: string, coverImageData: any }}
 */
export function normalizeEventCoverFields(coverImage, coverImageData, options = {}) {
  const data = coverImageData && typeof coverImageData === 'object' ? { ...coverImageData } : null
  const ref = parseRef(coverImage)
  if (!ref) {
    const cover = String(coverImage || '').trim()
    const derivedName = String(data?.cloudFileName || parseCloudImageUri(cover) || '').trim()
    if (options.fillCloudFileName && derivedName) {
      return {
        coverImage: cover,
        coverImageData: {
          ...(data || {}),
          uri: String(data?.uri || '').trim() || buildCloudImageUri(derivedName),
          storageMode: String(data?.storageMode || '').trim() || 'cloud-local',
          cloudFileName: derivedName
        }
      }
    }
    return { coverImage: cover, coverImageData: data }
  }

  const uri = ref.kind === 'cloud' ? buildCloudImageUri(ref.value) : ref.value
  if (ref.kind !== 'cloud') return { coverImage: uri, coverImageData: data }

  return {
    coverImage: uri,
    coverImageData: {
      ...(data || {}),
      uri: String(data?.uri || '').trim() || uri,
      storageMode: String(data?.storageMode || '').trim() || 'cloud-local',
      cloudFileName: ref.value
    }
  }
}

/**
 * events.photos 条目：迁移后只有 ref，翻译回 uri / cloudFileName。
 * 照片条目不是 goods 图片（没有 kind / label / isPrimary），故不复用 normalizeGoodsImageEntry。
 * @param {any} photo
 * @returns {any}
 */
export function normalizeEventPhotoEntry(photo) {
  if (!photo || typeof photo !== 'object') return photo
  const ref = parseRef(photo.ref)
  if (!ref) return photo
  const { ref: _ref, ...rest } = photo
  const uri = ref.kind === 'cloud' ? buildCloudImageUri(ref.value) : ref.value
  return {
    ...rest,
    uri: String(photo.uri || '').trim() || uri,
    cloudFileName: String(photo.cloudFileName || '').trim() || (ref.kind === 'cloud' ? ref.value : '')
  }
}

/** @param {unknown} photos */
export function normalizeEventPhotoList(photos) {
  return Array.isArray(photos) ? photos.map(normalizeEventPhotoEntry) : []
}

export async function sanitizeEventForExport(event) {
  if (!event) return null
  const { coverImage, photos, ...rest } = event
  
  let processedCoverImage = ''
  if (coverImage) {
    const storageMode = inferGoodsImageStorageMode(coverImage)
    if (storageMode === 'local' || storageMode === 'cloud-local') {
      const embeddedUri = await readLocalImageAsDataUrl(coverImage)
      if (embeddedUri?.startsWith('data:image/')) {
        processedCoverImage = embeddedUri
      }
    }
    if (!processedCoverImage) {
      processedCoverImage = coverImage
    }
  }
  
  let processedPhotos = []
  if (photos && Array.isArray(photos)) {
    processedPhotos = await Promise.all(photos.map(async (photo) => {
      if (!photo?.uri) return null
      const photoStorageMode = inferGoodsImageStorageMode(photo.uri)
      if (photoStorageMode === 'local' || photoStorageMode === 'cloud-local') {
        const embeddedUri = await readLocalImageAsDataUrl(photo.uri)
        if (embeddedUri?.startsWith('data:image/')) {
          return { ...photo, uri: embeddedUri, storageMode: 'inline-local' }
        }
      }
      return { ...photo, storageMode: 'remote' }
    }))
    processedPhotos = processedPhotos.filter(Boolean)
  }
  
  return {
    ...rest,
    coverImage: processedCoverImage,
    photos: processedPhotos
  }
}
