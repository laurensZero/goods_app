export function normalizeGoodsName(name) {
  return String(name || '').trim()
}

export function normalizeGoodsVariant(variant) {
  let value = String(variant || '').trim()
  if (!value) return ''

  let previous = ''
  while (value && value !== previous) {
    previous = value
    value = value
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
