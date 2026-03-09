export function normalizeGoodsName(name) {
  return String(name || '').trim()
}

export function extractVariantFromNote(note) {
  const text = String(note || '')
  const match = text.match(/(?:^|\n)款式[:：]\s*(.+?)(?=\n|$)/)
  return match?.[1]?.trim() || ''
}

export function stripVariantFromNote(note) {
  return String(note || '')
    .replace(/(?:^|\n)款式[:：]\s*.+?(?=\n|$)/g, '')
    .replace(/^\n+|\n+$/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function buildNoteWithVariant(note, variant) {
  const cleanVariant = String(variant || '').trim()
  const body = stripVariantFromNote(note)

  if (!cleanVariant) return body
  return body ? `款式：${cleanVariant}\n${body}` : `款式：${cleanVariant}`
}

export function getGoodsVariant(item) {
  const explicitVariant = String(item?.variant || item?.style || '').trim()
  if (explicitVariant) return explicitVariant

  const noteVariant = extractVariantFromNote(item?.note || item?.notes || '')
  if (noteVariant) return noteVariant

  const characters = Array.isArray(item?.characters) ? item.characters.filter(Boolean) : []
  if (characters.length > 0) {
    return characters.slice().sort().join(',')
  }

  return ''
}

export function buildGoodsIdentityKey(item) {
  const name = normalizeGoodsName(item?.name)
  const variant = getGoodsVariant(item)

  if (variant) {
    return `${name}||${variant}`
  }

  const image = String(item?.image || item?._coverUrl || '').trim()
  if (image) {
    return `${name}||img:${image}`
  }

  return `${name}||`
}
