// src/constants/eventTypes.js
// 活动类型：3 个内置 key + 用户自定义条目（presets.eventTypes: { name, showTracks }[]）。
// 自定义类型在 events.type 里存原始名称字符串；内置类型存 'exhibition' | 'concert' | 'other'。

export const BUILTIN_EVENT_TYPES = ['exhibition', 'concert', 'other']

export function isBuiltinEventType(type) {
  return BUILTIN_EVENT_TYPES.includes(String(type || '').trim())
}

export function getEventTypeChipClass(type) {
  const value = String(type || '').trim()
  if (value === 'exhibition') return 'type-exhibition'
  if (value === 'concert') return 'type-concert'
  if (!value || value === 'other') return 'type-other'
  return 'type-custom'
}

export function resolveEventTypeLabel(type, t) {
  const value = String(type || '').trim()
  if (value === 'exhibition') return t('events.typeExhibition')
  if (value === 'concert') return t('events.typeConcert')
  if (!value || value === 'other') return t('events.typeOther')
  return value
}

// 内置 concert 恒开曲目；自定义类型看条目上的 showTracks 开关
export function typeShowsTracks(type, customEventTypes = []) {
  const value = String(type || '').trim()
  if (value === 'concert') return true
  if (!value || isBuiltinEventType(value)) return false
  const entry = customEventTypes.find((item) => (
    (typeof item === 'string' ? item : item?.name) === value
  ))
  if (!entry || typeof entry === 'string') return false
  return entry.showTracks === true
}
