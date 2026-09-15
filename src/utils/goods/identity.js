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
