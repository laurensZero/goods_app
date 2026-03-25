export function normalizeGoodsName(name) {
  return String(name || '').trim()
}

const VARIANT_SALE_KEYWORD_RE = /(?:(?:第?\d+|[一二三四五六七八九十两]+)(?:批|批次)?\s*)?(?:预售|预计|现货|补款|尾款|发货|到仓|开售|以规格标注为准)/
const VARIANT_SALE_MARKER_PATTERNS = [
  /【[^】]*】/g,
  /（[^）]*）/g,
  /\([^)]*\)/g,
]
const VARIANT_TRAILING_SALE_NOTE_RE = /\s*[，,、;；]\s*.*?(?:(?:第?\d+|[一二三四五六七八九十两]+)(?:批|批次)?\s*)?(?:预售|预计|现货|补款|尾款|发货|到仓|开售|以规格标注为准).*$/g

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

import { getPrimaryGoodsImageUrl } from '@/utils/goodsImages'

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
