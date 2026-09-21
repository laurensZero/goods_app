export function normalizeGoodsName(name) {
  return String(name || '').trim()
}

/** 批次前缀：一批次/二批/第2批次/两期… */
const BATCH_PREFIX = String.raw`(?:(?:第?\d+|[一二三四五六七八九十两]+)\s*(?:批|批次|期)\s*)?`
/** 销售状态词：预售/现货/补款…（可与批次组合，如「二批次预售」） */
const SALE_WORDS = String.raw`(?:预售|预计|现货|补款|尾款|发货|到仓|开售|以规格标注为准)`
const VARIANT_SALE_KEYWORD_RE = new RegExp(
  String.raw`${BATCH_PREFIX}${SALE_WORDS}|${SALE_WORDS}\s*(?:第?\d+|[一二三四五六七八九十两]+)?\s*(?:批|批次|期)?`,
)
const VARIANT_SALE_MARKER_PATTERNS = [
  /【[^】]*】/g,
  /（[^）]*）/g,
  /\([^)]*\)/g,
]
/** 逗号后的销售备注：「兹白，二批次预售」 */
const VARIANT_TRAILING_SALE_NOTE_RE = new RegExp(
  String.raw`\s*[，,、;；]\s*.*?${BATCH_PREFIX}${SALE_WORDS}.*$`,
  'g',
)
/** 末尾裸标签（无逗号）：「兹白一批次预售」「芙宁娜一批次预售中」 */
const VARIANT_TRAILING_SALE_TAG_RE = new RegExp(
  String.raw`\s*(?:(?:第?\d+|[一二三四五六七八九十两]+)\s*(?:批|批次|期)\s*)?(?:预售|预计|现货|补款|尾款|发货|到仓|开售)(?:[^\s，,、;；/／]*)?$`,
  'g',
)

function stripVariantSaleMarkers(value) {
  return VARIANT_SALE_MARKER_PATTERNS.reduce((result, pattern) => (
    result.replace(pattern, (match) => (VARIANT_SALE_KEYWORD_RE.test(match) ? '' : match))
  ), String(value || ''))
}

function isVariantSaleSegment(segment) {
  const value = String(segment || '').trim()
  if (!value) return false
  const match = value.match(VARIANT_SALE_KEYWORD_RE)
  if (!match) return false
  const prefix = value.slice(0, match.index).replace(/[\s，,、;；:：|／/（）()【】\[\]-—]+/g, '')
  return !prefix
}

/** 去掉文本里的【一批次预售】/「二批次预售」等销售标签（不含整段角色清洗） */
export function stripGoodsSaleTags(text) {
  let value = stripVariantSaleMarkers(text).trim()
  if (!value) return ''
  let previous = ''
  while (value && value !== previous) {
    previous = value
    value = value
      .replace(VARIANT_TRAILING_SALE_NOTE_RE, '')
      .replace(VARIANT_TRAILING_SALE_TAG_RE, '')
      .replace(/\s{2,}/g, ' ')
      .trim()
  }
  return value
}

export function normalizeGoodsVariant(variant) {
  let value = stripVariantSaleMarkers(variant).trim()
  if (!value) return ''

  let previous = ''
  while (value && value !== previous) {
    previous = value
    const parts = stripVariantSaleMarkers(value)
      .split(/\s*[\/／]+\s*/)
      .map((part) => part.trim())
      .filter(Boolean)
      .filter((part) => !isVariantSaleSegment(part))

    value = parts.join(' / ')
      .replace(VARIANT_TRAILING_SALE_NOTE_RE, '')
      .replace(VARIANT_TRAILING_SALE_TAG_RE, '')
      .replace(/\s{2,}/g, ' ')
      .replace(/^\s*[-—:：|]+\s*/g, '')
      .replace(/\s*[-—:：|]+\s*$/g, '')
      .replace(/^\s*[，,、;；]+\s*/g, '')
      .replace(/\s*[，,、;；]+\s*$/g, '')
      .replace(/\s*[，,、;；]+\s*([\/／])/g, ' $1')
      .replace(/([\/／])\s*[，,、;；]+\s*/g, '$1 ')
      .replace(/^\s*[\/／]+\s*/g, '')
      .replace(/\s*[\/／]+\s*$/g, '')
      .trim()
  }

  return value
}

export function extractVariantFromNote(note) {
  const text = String(note || '')
  const match = text.match(/(?:^|\n)款式[:：]\s*(.+?)(?=\n|$)/)
  return normalizeGoodsVariant(match?.[1] || '')
}

export function stripVariantFromNote(note) {
  return String(note || '')
    .replace(/(?:^|\n)款式[:：]\s*.+?(?=\n|$)/g, '')
    .replace(/^\n+|\n+$/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function buildNoteWithVariant(note, variant) {
  const cleanVariant = normalizeGoodsVariant(variant)
  const body = stripVariantFromNote(note)

  if (!cleanVariant) return body
  return body ? `款式：${cleanVariant}\n${body}` : `款式：${cleanVariant}`
}

export function getGoodsVariant(item) {
  const explicitVariant = normalizeGoodsVariant(item?.variant || item?.style)
  if (explicitVariant) return explicitVariant

  const noteVariant = extractVariantFromNote(item?.note || item?.notes || '')
  if (noteVariant) return noteVariant

  const characters = Array.isArray(item?.characters) ? item.characters.filter(Boolean) : []
  if (characters.length > 0) {
    return characters.slice().sort().join(',')
  }

  return ''
}

function characterNameSet(characters) {
  return new Set(
    (Array.isArray(characters) ? characters : [])
      .map((name) => String(name || '').trim())
      .filter(Boolean),
  )
}

/** 款式规范化后是否与角色名重复（相等，或拆分后全是角色名） */
export function isVariantRedundantWithCharacters(variantText, characters) {
  const normalized = normalizeGoodsVariant(variantText)
  if (!normalized) return false

  const names = characterNameSet(characters)
  if (names.size === 0) return false
  if (names.has(normalized)) return true

  const parts = normalized
    .split(/\s*[\/／,，、]\s*/)
    .map((part) => part.trim())
    .filter(Boolean)
  return parts.length > 1 && parts.every((part) => names.has(part))
}

/** 展示用款式：与角色名重复时不返回，避免详情/卡片重复 chip */
export function getDisplayGoodsVariant(item) {
  const variant = getGoodsVariant(item)
  if (isVariantRedundantWithCharacters(variant, item?.characters)) return ''
  return variant
}

import { getPrimaryGoodsImageUrl } from '@/utils/goods/images'

export function buildGoodsIdentityKey(item) {
  const name = normalizeGoodsName(item?.name)
  const variant = getGoodsVariant(item)

  if (variant) {
    return `${name}||${variant}`
  }

  const image = String(getPrimaryGoodsImageUrl(item?.images, item?.coverImage || item?._coverUrl || '') || '').trim()
  if (image) {
    return `${name}||img:${image}`
  }

  return `${name}||`
}

function pushIdentityAlias(aliases, name, variant = '') {
  const normalizedName = normalizeGoodsName(name)
  const normalizedVariant = normalizeGoodsVariant(variant)
  if (!normalizedName) return
  aliases.add(`${normalizedName}||${normalizedVariant}`)
}

function getCompositeVariantNames(name, variant) {
  const normalizedName = normalizeGoodsName(name)
  const normalizedVariant = normalizeGoodsVariant(variant)
  if (!normalizedName || !normalizedVariant) return []

  return [
    `${normalizedName}-${normalizedVariant}`,
    `${normalizedName} - ${normalizedVariant}`,
    `${normalizedName}${normalizedVariant}`,
  ]
}

function nameContainsVariant(name, variant) {
  const normalizedName = normalizeGoodsName(name)
  const normalizedVariant = normalizeGoodsVariant(variant)
  if (!normalizedName || !normalizedVariant) return false

  return normalizedName.includes(normalizedVariant)
}

export function buildGoodsIdentityAliases(item) {
  const aliases = new Set()
  const name = normalizeGoodsName(item?.name)
  const variant = getGoodsVariant(item)
  const primaryKey = buildGoodsIdentityKey(item)

  if (primaryKey) aliases.add(primaryKey)

  if (!name) return aliases

  if (!variant) {
    pushIdentityAlias(aliases, name)
    return aliases
  }

  pushIdentityAlias(aliases, name, variant)
  if (nameContainsVariant(name, variant)) {
    pushIdentityAlias(aliases, name)
  }
  for (const compositeName of getCompositeVariantNames(name, variant)) {
    pushIdentityAlias(aliases, compositeName)
  }

  return aliases
}

/** 从备注提取米游铺订单号（「来自米游铺订单 #xxx」） */
export function extractMihoyoOrderNo(item) {
  const explicit = String(item?._orderNo || item?.orderNo || '').trim()
  if (explicit) return explicit
  const note = String(item?.note || item?.notes || '')
  const match = note.match(/米游铺订单\s*#\s*([A-Za-z0-9_-]+)/)
  return match?.[1] || ''
}

function normalizeIdentityToken(value) {
  return String(value || '').trim()
}

/** 收藏条目可贡献的款式 token：显式款式 + 角色名（订单 SKU 文案可能只写角色） */
function collectVariantTokens(item) {
  const tokens = new Set()
  const variant = getGoodsVariant(item)
  if (variant) {
    tokens.add(variant)
    for (const part of variant.split(/\s*[\/／,，、]\s*/)) {
      const trimmed = part.trim()
      if (trimmed) tokens.add(trimmed)
    }
  }
  const characters = Array.isArray(item?.characters) ? item.characters : []
  for (const name of characters) {
    const trimmed = normalizeIdentityToken(name)
    if (trimmed) tokens.add(trimmed)
  }
  return tokens
}

function variantsSoftMatch(orderVariant, collectionTokens) {
  if (!orderVariant) return true
  if (!collectionTokens || collectionTokens.size === 0) return true
  if (collectionTokens.has(orderVariant)) return true
  for (const token of collectionTokens) {
    if (token.includes(orderVariant) || orderVariant.includes(token)) return true
  }
  return false
}

/**
 * 米游铺订单导入精确身份（展示/调试用）：
 * 优先 订单号+goodsId+款式，否则 支付日+goodsId+款式。
 * 匹配逻辑见 isOrderItemImported（含 goodsId 软匹配，不单靠此 key）。
 */
export function buildOrderImportIdentity(item) {
  const goodsId = normalizeIdentityToken(item?.goodsId)
  if (!goodsId) return ''
  const variant = getGoodsVariant(item)
  const orderNo = extractMihoyoOrderNo(item)
  const acquiredAt = normalizeIdentityToken(item?.acquiredAt)
  if (orderNo && variant) return `ord|${orderNo}|${goodsId}|${variant}`
  if (acquiredAt && variant) return `gid|${acquiredAt}|${goodsId}|${variant}`
  if (orderNo) return `ord|${orderNo}|${goodsId}`
  if (acquiredAt) return `gid|${acquiredAt}|${goodsId}`
  return `gid||${goodsId}`
}

/** 订单行/收藏条目是否有 goodsId（有则走 goodsId 精确通道） */
export function canUseOrderImportIdentity(item) {
  return Boolean(normalizeIdentityToken(item?.goodsId))
}

/**
 * 收藏列表 → 订单导入已导入索引。
 * keys：精确/弱精确 key 集合
 * goodsIdIndex：goodsId → [{ orderNo, acquiredAt, variants:Set }]
 */
export function buildOrderImportImportedKeys(collectionList) {
  const keys = new Set()
  /** @type {Map<string, Array<{ orderNo: string, acquiredAt: string, variants: Set<string> }>>} */
  const goodsIdIndex = new Map()

  for (const item of collectionList || []) {
    const goodsId = normalizeIdentityToken(item?.goodsId)
    const acquiredAt = normalizeIdentityToken(item?.acquiredAt)
    const orderNo = extractMihoyoOrderNo(item)
    const variant = getGoodsVariant(item)
    const variants = collectVariantTokens(item)

    for (const alias of buildGoodsIdentityAliases(item)) keys.add(alias)

    if (!goodsId) continue

    if (orderNo && variant) keys.add(`ord|${orderNo}|${goodsId}|${variant}`)
    if (orderNo) keys.add(`ord|${orderNo}|${goodsId}`)
    if (acquiredAt && variant) keys.add(`gid|${acquiredAt}|${goodsId}|${variant}`)
    if (acquiredAt) keys.add(`gid|${acquiredAt}|${goodsId}`)
    keys.add(`gid||${goodsId}`)

    if (!goodsIdIndex.has(goodsId)) goodsIdIndex.set(goodsId, [])
    goodsIdIndex.get(goodsId).push({ orderNo, acquiredAt, variants })
  }

  return { keys, goodsIdIndex }
}

/**
 * 订单行是否已导入：
 * - 有 goodsId：只走 goodsId 通道（订单号/支付日 + 款式软匹配），避免同名误标
 * - 无 goodsId：回退名称别名
 */
export function isOrderItemImported(item, imported) {
  const keys = imported?.keys || imported
  const goodsId = normalizeIdentityToken(item?.goodsId)

  if (goodsId) {
    const orderNo = extractMihoyoOrderNo(item)
    const acquiredAt = normalizeIdentityToken(item?.acquiredAt)
    const variant = getGoodsVariant(item)

    if (orderNo && variant && keys?.has(`ord|${orderNo}|${goodsId}|${variant}`)) return true
    if (orderNo && keys?.has(`ord|${orderNo}|${goodsId}`)) {
      // 同订单同 goodsId：款式软匹配，兼容 SKU 文案与收藏款式名不一致
      const entries = imported?.goodsIdIndex?.get(goodsId) || []
      const sameOrder = entries.filter((e) => e.orderNo === orderNo)
      if (sameOrder.length === 0) return true
      if (sameOrder.some((e) => variantsSoftMatch(variant, e.variants))) return true
    }
    if (acquiredAt && variant && keys?.has(`gid|${acquiredAt}|${goodsId}|${variant}`)) return true
    if (acquiredAt && keys?.has(`gid|${acquiredAt}|${goodsId}`)) {
      const entries = imported?.goodsIdIndex?.get(goodsId) || []
      const sameDay = entries.filter((e) => e.acquiredAt === acquiredAt)
      if (sameDay.length === 0) return true
      if (sameDay.some((e) => variantsSoftMatch(variant, e.variants))) return true
    }
    // 仅有 goodsId（收藏缺支付日/订单号）：有该 goodsId 的收藏即视为可匹配
    if (!orderNo && !acquiredAt && keys?.has(`gid||${goodsId}`)) {
      const entries = imported?.goodsIdIndex?.get(goodsId) || []
      if (entries.some((e) => !e.acquiredAt && !e.orderNo)) {
        return entries.some((e) => variantsSoftMatch(variant, e.variants))
      }
    }
    return false
  }

  if (!keys || typeof keys.has !== 'function') return false
  return [...buildGoodsIdentityAliases(item)].some((key) => keys.has(key))
}
