import { sanitizeGoodsItemForShare } from '@/utils/goods/images'

const SHARE_PAYLOAD_VERSION = 1

// 白名单：只有这些字段会出现在分享数据中。
// 新增的字段默认不会被分享，避免隐私数据泄露。
const ALLOWED_KEYS = new Set([
  'name',
  'category',
  'ip',
  'goodsId',
  'characters',
  'variant',
  'price',
  'currency',
  'images'
])

/**
 * Generate a short random share ID.
 */
export function generateShareId() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
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
    for (const key of ALLOWED_KEYS) {
      if (key in item) {
        cleaned[key] = item[key]
      }
    }
    return cleaned
  })

  return {
    version: SHARE_PAYLOAD_VERSION,
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
    // Normalise storageMode so inline-local and share-storage compare equal in fingerprints.
    if (sorted.storageMode === 'inline-local' || sorted.storageMode === 'share-storage') {
      sorted.storageMode = 'local'
    }
    return sorted
  }

  // Normalise ephemeral image URIs so that new payloads (data: URIs) and
  // stored payloads (__share_img__ refs) produce the same fingerprint.
  if (typeof value === 'string' && (value.startsWith('data:') || value.startsWith('__share_img__'))) {
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
 * Extract shareId from any text input (deep link, landing URL, or share code).
 * Returns { shareId }.
 */
export function extractIdsFromInput(input) {
  const text = String(input || '').trim()
  if (!text) return { shareId: '' }

  // 1. Deep link: goodsapp://share/<shareId>
  const linkMatch = text.match(/goodsapp:\/\/share\/([a-zA-Z0-9]{6})/)
  if (linkMatch) return { shareId: linkMatch[1] }

  // 2. Landing page URL: share.html?s=<shareId>
  try {
    const urlMatch = text.match(/https?:\/\/[^\s]+share\.html[^\s]*/)
    const landingUrl = urlMatch ? new URL(urlMatch[0]) : null
    if (landingUrl) {
      const shareId = landingUrl.searchParams.get('s') || ''
      if (/^[a-zA-Z0-9]{6}$/.test(shareId)) return { shareId }
    }
  } catch {
    // fall through
  }

  const landingMatch = text.match(/share\.html\?s=([a-zA-Z0-9]{6})/)
  if (landingMatch) return { shareId: landingMatch[1] }

  // 3. Plain 6-char share code
  if (/^[a-zA-Z0-9]{6}$/.test(text)) return { shareId: text }

  return { shareId: '' }
}
