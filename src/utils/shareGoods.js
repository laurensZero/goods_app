import { sanitizeGoodsItemForShare } from '@/utils/goodsImages'

const SHARE_PAYLOAD_VERSION = 1

const SHARE_FILENAME_PREFIX = 'share_'
const LEGACY_SHARE_FILENAME = 'share.json'
const IMG_REF_PREFIX = '__gist_img__'

const EXCLUDED_KEYS = new Set([
  'id',
  'tags',
  'storageLocation',
  'updatedAt',
  'points',
  'unitAcquiredAtList',
  'unitActualPriceList',
  'unitCharacterList',
  'image',
  'coverImage',
  '_imagesExplicit',
  '__imagesExplicit',
  'quantity',
  'note'
])

/**
 * Generate a short random share ID.
 */
export function generateShareId() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let id = ''
  for (let i = 0; i < 6; i++) {
    id += chars[Math.floor(Math.random() * chars.length)]
  }
  return id
}

/**
 * Build a share payload from one or more goods items.
 * Excludes personal fields (tags, storageLocation, id, etc.)
 * Converts local images to embedded data URLs.
 */
export async function buildSharePayload(goodsItems) {
  const sanitized = await Promise.all(
    goodsItems.map((item) => sanitizeGoodsItemForShare(item))
  )

  const goods = sanitized.map((item) => {
    const cleaned = {}
    for (const key of Object.keys(item)) {
      if (!EXCLUDED_KEYS.has(key) && !key.startsWith('_')) {
        cleaned[key] = item[key]
      }
    }
    return cleaned
  })

  return {
    version: SHARE_PAYLOAD_VERSION,
    sharedAt: new Date().toISOString(),
    appId: 'com.goodsapp.collector',
    goods
  }
}

function sortObjectKeys(value) {
  if (Array.isArray(value)) {
    return value.map((item) => sortObjectKeys(item))
  }

  if (value && typeof value === 'object') {
    const sorted = {}
    for (const key of Object.keys(value).sort()) {
      sorted[key] = sortObjectKeys(value[key])
    }
    // Normalise storageMode so that inline-local (new payload) and
    // gist-inline (stored payload) compare equal in fingerprints.
    if (sorted.storageMode === 'inline-local' || sorted.storageMode === 'gist-inline') {
      sorted.storageMode = 'local'
    }
    return sorted
  }

  // Normalise ephemeral image URIs so that new payloads (data: URIs) and
  // stored payloads (__gist_img__ refs) produce the same fingerprint.
  if (typeof value === 'string' && (value.startsWith('data:') || value.startsWith('__gist_img__'))) {
    return ''
  }

  return value
}

function buildComparableSharePayload(payload) {
  const goods = Array.isArray(payload?.goods) ? payload.goods : []
  const normalizedGoods = goods
    .map((item) => JSON.stringify(sortObjectKeys(item)))
    .sort()
    .map((item) => JSON.parse(item))

  return {
    version: payload?.version || SHARE_PAYLOAD_VERSION,
    appId: payload?.appId || 'com.goodsapp.collector',
    goods: normalizedGoods
  }
}

export function getShareFingerprint(payload) {
  return JSON.stringify(buildComparableSharePayload(payload))
}

/**
 * Validate that a payload looks like a valid share payload.
 * Returns { valid, reason }.
 */
export function validateSharePayload(payload) {
  if (!payload || typeof payload !== 'object') {
    return { valid: false, reason: '数据格式无效' }
  }

  if (payload.version !== SHARE_PAYLOAD_VERSION) {
    return { valid: false, reason: `不支持的数据版本: ${payload.version}` }
  }

  if (payload.disabled) {
    return { valid: false, reason: '该分享码已停用' }
  }

  if (!Array.isArray(payload.goods) || payload.goods.length === 0) {
    return { valid: false, reason: '没有可导入的谷子数据' }
  }

  for (let i = 0; i < payload.goods.length; i++) {
    const item = payload.goods[i]
    if (!item.name || typeof item.name !== 'string' || !item.name.trim()) {
      return { valid: false, reason: `第 ${i + 1} 件商品缺少名称` }
    }
  }

  return { valid: true, reason: '' }
}

/**
 * Get the gist filename for a given share ID.
 */
export function getShareFilename(shareId) {
  return `${SHARE_FILENAME_PREFIX}${shareId}.json`
}

/**
 * Build an image reference key that points to a Gist file.
 */
function makeImageRef(shareId, itemIdx, imgIdx) {
  return `${IMG_REF_PREFIX}share_${shareId}_img_${itemIdx}_${imgIdx}`
}

/**
 * Build the Gist image filename for a given image reference.
 */
function imageRefToFilename(ref) {
  return ref.slice(IMG_REF_PREFIX.length)
}

/**
 * Extract inline-local images from the payload into separate Gist files
 * to avoid exceeding the 1MB per-file limit. Replaces base64 data URIs
 * with Gist file references.
 */
function extractImagesFromPayload(payload, shareId) {
  const imageFiles = {}

  const strippedGoods = payload.goods.map((item, itemIdx) => {
    if (!item.images?.length) return item

    const strippedImages = item.images.map((img, imgIdx) => {
      if (img.storageMode !== 'inline-local' || !img.uri?.startsWith('data:image/')) {
        return img
      }

      const ref = makeImageRef(shareId, itemIdx, imgIdx)
      const imgFilename = imageRefToFilename(ref)
      imageFiles[imgFilename] = { content: img.uri }

      return {
        ...img,
        uri: ref,
        storageMode: 'gist-inline'
      }
    })

    return { ...item, images: strippedImages }
  })

  return {
    strippedPayload: { ...payload, goods: strippedGoods },
    imageFiles
  }
}

/**
 * Build Gist files for a share. Splits embedded images into separate
 * files to stay under the 1MB Gist file limit.
 */
export function buildShareGistFiles(payload, shareId) {
  const { strippedPayload, imageFiles } = extractImagesFromPayload(payload, shareId)

  const filename = getShareFilename(shareId)
  const json = JSON.stringify(strippedPayload, null, 2)

  return {
    [filename]: { content: json },
    ...imageFiles
  }
}

/**
 * Parse share data from a raw JSON string.
 */
export function parseSharePayload(raw) {
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

/**
 * Patch Gist-inline image references back to their actual content
 * by reading from the Gist's image files.
 */
function patchImagesFromGist(payload, gist) {
  if (!payload?.goods) return payload

  const patchedGoods = payload.goods.map((item) => {
    if (!item.images?.length) return item

    const patchedImages = item.images.map((img) => {
      if (img.storageMode !== 'gist-inline' || !img.uri?.startsWith(IMG_REF_PREFIX)) {
        return img
      }

      const imgFilename = imageRefToFilename(img.uri)
      const file = gist?.files?.[imgFilename]
      if (file?.content) {
        return {
          ...img,
          uri: file.content,
          storageMode: 'inline-local'
        }
      }
      // Image file not found in Gist; leave as-is (import will skip it)
      return img
    })

    return { ...item, images: patchedImages }
  })

  return { ...payload, goods: patchedGoods }
}

/**
 * Extract share payload from a Gist by shareId.
 * Looks for share_<shareId>.json, with fallback to share.json for legacy shares.
 * Patches embedded image references back from separate Gist files.
 */
export function extractSharePayloadFromGist(gist, shareId) {
  let parsed = null

  // Try the shareId-specific file first
  if (shareId) {
    const filename = getShareFilename(shareId)
    const file = gist?.files?.[filename]
    if (file?.content) {
      parsed = parseSharePayload(file.content)
    }
  }

  // Fallback: try legacy share.json
  if (!parsed) {
    const legacyFile = gist?.files?.[LEGACY_SHARE_FILENAME]
    if (legacyFile?.content) {
      parsed = parseSharePayload(legacyFile.content)
    }
  }

  // Fallback: try any file matching share_*.json
  if (!parsed && gist?.files) {
    for (const [name, file] of Object.entries(gist.files)) {
      if (name.startsWith(SHARE_FILENAME_PREFIX) && name.endsWith('.json') && file?.content) {
        parsed = parseSharePayload(file.content)
        if (parsed) break
      }
    }
  }

  if (!parsed) return null

  // Patch image references back from Gist files
  return patchImagesFromGist(parsed, gist)
}

/**
 * Extract the shareId from a gist filename.
 * e.g. "share_a1b2c3.json" → "a1b2c3"
 */
export function shareIdFromFilename(filename) {
  if (!filename.startsWith(SHARE_FILENAME_PREFIX) || !filename.endsWith('.json')) return ''
  return filename.slice(SHARE_FILENAME_PREFIX.length, -5)
}

/**
 * List all shares from a Gist, returning lightweight summaries.
 */
export function listSharesFromGist(gist) {
  if (!gist?.files) return []

  const entries = []

  for (const [filename, file] of Object.entries(gist.files)) {
    const shareId = shareIdFromFilename(filename)
    if (!shareId) continue

    try {
      const content = typeof file?.content === 'string' ? file.content : ''
      if (!content) continue

      const payload = parseSharePayload(content)
      if (!payload) continue

      const firstGoods = payload.goods?.[0]
      const images = firstGoods?.images || []

      // Find a cover image (prefer primary, fallback to first image)
      let coverUri = ''
      const primary = images.find((img) => img.isPrimary)
      const candidate = primary || images[0]
      if (candidate?.uri) {
        if (candidate.uri.startsWith(IMG_REF_PREFIX)) {
          // Resolve Gist-inline image reference from the Gist's image files
          const imgFilename = candidate.uri.slice(IMG_REF_PREFIX.length)
          const imgFile = gist?.files?.[imgFilename]
          if (imgFile?.content) {
            coverUri = imgFile.content
          }
        } else {
          coverUri = candidate.uri
        }
      }

      entries.push({
        shareId,
        filename,
        goodsCount: payload.goods?.length || 0,
        sharedAt: payload.sharedAt || '',
        firstGoodsName: firstGoods?.name || '未命名',
        coverUri,
        disabled: !!payload.disabled
      })
    } catch {
      // skip malformed files
    }
  }

  // Newest first
  entries.sort((a, b) => (b.sharedAt || '').localeCompare(a.sharedAt || ''))
  return entries
}

export function findMatchingShareInGist(gist, payload) {
  if (!gist?.files || !payload) return null

  const targetFingerprint = getShareFingerprint(payload)

  for (const [filename, file] of Object.entries(gist.files)) {
    const shareId = shareIdFromFilename(filename)
    if (!shareId) continue

    const content = typeof file?.content === 'string' ? file.content : ''
    if (!content) continue

    const existingPayload = parseSharePayload(content)
    if (!existingPayload) continue

    if (getShareFingerprint(existingPayload) === targetFingerprint) {
      return {
        shareId,
        filename,
        disabled: !!existingPayload.disabled
      }
    }
  }

  return null
}

/**
 * Toggle the disabled flag on a share file.
 * Returns the updated file content, or null if the share doesn't exist.
 */
export function toggleShareDisabled(gist, filename, disabled) {
  const file = gist?.files?.[filename]
  if (!file?.content) return null

  try {
    const payload = JSON.parse(file.content)
    payload.disabled = disabled
    return JSON.stringify(payload, null, 2)
  } catch {
    return null
  }
}

/**
 * Collect the gist filenames owned by a share, including extracted image files.
 */
export function getShareAssetFilenames(gist, filename) {
  const file = gist?.files?.[filename]
  if (!file?.content) return filename ? [filename] : []

  try {
    const payload = JSON.parse(file.content)
    const names = new Set(filename ? [filename] : [])

    for (const item of payload?.goods || []) {
      for (const image of item?.images || []) {
        if (image?.storageMode === 'gist-inline' && typeof image.uri === 'string' && image.uri.startsWith(IMG_REF_PREFIX)) {
          names.add(image.uri.slice(IMG_REF_PREFIX.length))
        }
      }
    }

    return [...names]
  } catch {
    return filename ? [filename] : []
  }
}

/**
 * Extract gistId and shareId from any text input, such as a copied message or just the URL.
 * Scans the first recognized URL or pattern in the text.
 */
export function extractIdsFromInput(input) {
  const text = String(input || '').trim()
  if (!text) return { gistId: '', shareId: '' }

  // 1. Try deep link: goodsapp://share/<gistId>?s=<shareId>
  const linkMatch = text.match(/goodsapp:\/\/share\/([a-zA-Z0-9]+)(?:\?s=([a-zA-Z0-9]+))?/)
  if (linkMatch) return { gistId: linkMatch[1], shareId: linkMatch[2] || '' }

  // 2. Try share landing page URL: share.html?g=<gistId>&s=<shareId>
  const landingMatch = text.match(/share\.html\?g=([a-zA-Z0-9]+)(?:&s=([a-zA-Z0-9]+))?/)
  if (landingMatch) return { gistId: landingMatch[1], shareId: landingMatch[2] || '' }

  // 3. Try combined share code strictly or within word boundaries: <gistId>-<shareId> 
  //   (gistId 10-40 chars, shareId 6 chars)
  const codeMatch = text.match(/(?:^|\s)([a-zA-Z0-9]{10,40})-([a-zA-Z0-9]{6})(?:\s|$)/)
  if (codeMatch) return { gistId: codeMatch[1], shareId: codeMatch[2] || '' }

  // 4. Try GitHub URL
  const urlMatch = text.match(/gist\.github\.com\/[^/]+\/([a-zA-Z0-9]+)/)
  if (urlMatch) return { gistId: urlMatch[1], shareId: '' }

  // 5. Plain gist ID (legacy, no shareId  will pick first share in gist)
  // Only valid if the whole text is roughly just the ID
  if (/^[a-zA-Z0-9]{10,40}$/.test(text)) return { gistId: text, shareId: '' }

  return { gistId: '', shareId: '' }
}
