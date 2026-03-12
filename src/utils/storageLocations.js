export const STORAGE_LOCATION_SEPARATOR = ' / '

const STORAGE_LOCATION_SPLIT_PATTERN = /\s*(?:\/|>|＞|›|»|->|→)\s*/g

export function splitStorageLocationPath(value) {
  const text = String(value || '').trim()
  if (!text) return []

  return text
    .split(STORAGE_LOCATION_SPLIT_PATTERN)
    .map((part) => part.trim())
    .filter(Boolean)
}

export function buildStorageLocationPath(parts) {
  return parts
    .map((part) => String(part || '').trim())
    .filter(Boolean)
    .join(STORAGE_LOCATION_SEPARATOR)
}

export function normalizeStorageLocationValue(value) {
  return buildStorageLocationPath(splitStorageLocationPath(value))
}

export function replaceStorageLocationPrefix(value, oldPrefix, newPrefix = '') {
  const normalizedValue = normalizeStorageLocationValue(value)
  const normalizedOldPrefix = normalizeStorageLocationValue(oldPrefix)
  const normalizedNewPrefix = normalizeStorageLocationValue(newPrefix)

  if (!normalizedValue || !normalizedOldPrefix) return normalizedValue
  if (normalizedValue === normalizedOldPrefix) return normalizedNewPrefix

  const prefixWithSeparator = `${normalizedOldPrefix}${STORAGE_LOCATION_SEPARATOR}`
  if (!normalizedValue.startsWith(prefixWithSeparator)) return normalizedValue

  const suffix = normalizedValue.slice(prefixWithSeparator.length)
  return normalizedNewPrefix
    ? buildStorageLocationPath([normalizedNewPrefix, suffix])
    : normalizeStorageLocationValue(suffix)
}

export function isStorageLocationUnderPrefix(value, prefix) {
  const normalizedValue = normalizeStorageLocationValue(value)
  const normalizedPrefix = normalizeStorageLocationValue(prefix)

  if (!normalizedValue || !normalizedPrefix) return false
  if (normalizedValue === normalizedPrefix) return true

  return normalizedValue.startsWith(`${normalizedPrefix}${STORAGE_LOCATION_SEPARATOR}`)
}
