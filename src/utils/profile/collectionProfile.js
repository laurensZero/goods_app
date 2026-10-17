// @ts-check
/**
 * 收藏馆（IP / 角色）本地个性化资料：自定义背景集 + 轮换策略。
 *
 * 这里只放**纯函数**（归一化 / 解析 / 序列化），便于单测；本地持久化与图片文件生命周期
 * 见 `stores/collectionProfile.js`，背景图导入压缩见 `utils/profile/backgroundImage.js`。
 *
 * 数据结构刻意保持「将来可直接搬进 sync_presets.ip_profiles」的形态，
 * 上云阶段不需要再做数据迁移。一张背景就是一张图（方形图 / 长条图都可能是），
 * 展示侧按图片宽高自动决定 cover 还是完整居中 + 模糊铺底。
 *
 * @typedef {{ id: string, kind: 'image'|'gradient', uri: string, localPath: string,
 *   cloudFileName: string, width: number, height: number, mimeType: string, fileSize: number,
 *   gradient: [string, string], focalY: number, scale: number, blur: number, overlay: number }} ProfileBackgroundItem
 * @typedef {{ mode: 'off'|'visit'|'interval', intervalSec: number,
 *   order: 'seq'|'random', transition: 'fade'|'kenburns' }} ProfileRotation
 * @typedef {{ items: ProfileBackgroundItem[], rotation: ProfileRotation }} ProfileBackgroundSet
 */

export const PROFILE_SCHEMA_VERSION = 2

export const PROFILE_ROTATION_MODES = ['off', 'visit', 'interval']
export const PROFILE_ROTATION_ORDERS = ['seq', 'random']
export const PROFILE_TRANSITIONS = ['fade', 'kenburns']
export const PROFILE_ITEM_KINDS = ['image', 'gradient']

/** 默认「每次进入换一张」，顺序播放、淡入淡出 */
export const DEFAULT_PROFILE_ROTATION = Object.freeze({
  mode: 'visit',
  intervalSec: 8,
  order: 'seq',
  transition: 'fade'
})

/** 纯色·渐变卡预设（固定调色，先不给完整取色器） */
export const PROFILE_GRADIENT_PRESETS = Object.freeze([
  ['#8EC5FC', '#E0C3FC'],
  ['#FBC2EB', '#A6C1EE'],
  ['#FDCB82', '#F88F70'],
  ['#A1C4FD', '#C2E9FB'],
  ['#84FAB0', '#8FD3F4'],
  ['#F6D365', '#FDA085'],
  ['#CD9CF2', '#F6F3FF'],
  ['#4E65FF', '#92EFFD']
])

const HEX_RE = /^#[0-9a-fA-F]{6}$/

function clampNumber(value, min, max, fallback) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

function normalizeHex(value, fallback) {
  const text = String(value || '').trim()
  return HEX_RE.test(text) ? text.toLowerCase() : fallback
}

/**
 * @returns {[string, string]}
 */
export function normalizeGradient(raw) {
  const fallback = PROFILE_GRADIENT_PRESETS[0]
  if (!Array.isArray(raw)) return [fallback[0], fallback[1]]
  return [normalizeHex(raw[0], fallback[0]), normalizeHex(raw[1], fallback[1])]
}

/** 生成稳定的条目 id（仅用于本地标识 / 列表 key） */
export function makeProfileItemId() {
  return `bg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
}

/**
 * 背景条目是否可用：图片必须有 uri 或 cloudFileName，渐变永远可用。
 * @param {Partial<ProfileBackgroundItem>} item
 */
export function isUsableProfileItem(item) {
  if (!item) return false
  if (item.kind === 'gradient') return true
  return Boolean(String(item.uri || '').trim() || String(item.cloudFileName || '').trim())
}

/**
 * @param {any} raw
 * @returns {ProfileBackgroundItem}
 */
export function normalizeProfileItem(raw = {}) {
  const uri = String(raw?.uri || '').trim()
  const kind = PROFILE_ITEM_KINDS.includes(raw?.kind)
    ? raw.kind
    : (uri ? 'image' : 'gradient')

  return {
    id: String(raw?.id || makeProfileItemId()),
    kind,
    uri,
    localPath: String(raw?.localPath || '').trim(),
    cloudFileName: String(raw?.cloudFileName || '').trim(),
    width: Math.max(0, Math.round(Number(raw?.width) || 0)),
    height: Math.max(0, Math.round(Number(raw?.height) || 0)),
    mimeType: String(raw?.mimeType || '').trim(),
    fileSize: Math.max(0, Math.round(Number(raw?.fileSize) || 0)),
    gradient: normalizeGradient(raw?.gradient),
    focalY: clampNumber(raw?.focalY ?? 0.5, 0, 1, 0.5),
    scale: clampNumber(raw?.scale ?? 1, 1, 2.2, 1),
    blur: clampNumber(Math.round(Number(raw?.blur ?? 0)), 0, 24, 0),
    overlay: clampNumber(raw?.overlay ?? 0.32, 0, 0.85, 0.32)
  }
}

/**
 * 定时轮播间隔：非法值（非数字 / <= 0）回落到默认 8 秒，其余夹到 3..120 秒。
 * @param {any} raw
 * @returns {number}
 */
export function normalizeIntervalSec(raw) {
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_PROFILE_ROTATION.intervalSec
  return Math.min(120, Math.max(3, Math.round(n)))
}

/**
 * @param {any} raw
 * @returns {ProfileRotation}
 */
export function normalizeProfileRotation(raw = {}) {
  return {
    mode: PROFILE_ROTATION_MODES.includes(raw?.mode) ? raw.mode : DEFAULT_PROFILE_ROTATION.mode,
    intervalSec: normalizeIntervalSec(raw?.intervalSec),
    order: PROFILE_ROTATION_ORDERS.includes(raw?.order) ? raw.order : DEFAULT_PROFILE_ROTATION.order,
    transition: PROFILE_TRANSITIONS.includes(raw?.transition) ? raw.transition : DEFAULT_PROFILE_ROTATION.transition
  }
}

/**
 * @param {any} raw
 * @returns {ProfileBackgroundSet}
 */
export function normalizeBackgroundSet(raw = {}) {
  const items = Array.isArray(raw?.items)
    ? raw.items.map(normalizeProfileItem).filter(isUsableProfileItem)
    : []
  return {
    items,
    rotation: normalizeProfileRotation(raw?.rotation)
  }
}

/**
 * 归一化 { [key]: BackgroundSet }；空集直接丢弃，避免脏 key 膨胀。
 * @param {any} raw
 * @returns {Record<string, ProfileBackgroundSet>}
 */
export function normalizeProfileMap(raw) {
  if (!raw || typeof raw !== 'object') return {}
  const out = {}
  for (const [key, value] of Object.entries(raw)) {
    const normalizedKey = String(key || '').trim()
    if (!normalizedKey) continue
    const set = normalizeBackgroundSet(value)
    if (set.items.length > 0) out[normalizedKey] = set
  }
  return out
}

/** 角色背景的存储键：`${ip}::${角色名}`，角色名全局唯一也保留 ip 前缀以便将来分组 */
export function buildCharacterProfileKey(ip, characterName) {
  return `${String(ip || '').trim()}::${String(characterName || '').trim()}`
}

/**
 * 背景解析：角色自有 → 所属 IP → 无。
 * @param {{ ip?: string, character?: string, ipProfiles?: Record<string, ProfileBackgroundSet>,
 *   characterProfiles?: Record<string, ProfileBackgroundSet> }} input
 * @returns {{ owner: 'character'|'ip'|'none', key: string, set: ProfileBackgroundSet|null }}
 */
export function resolveProfileBackground(input = {}) {
  const ip = String(input.ip || '').trim()
  const character = String(input.character || '').trim()
  const ipProfiles = input.ipProfiles || {}
  const characterProfiles = input.characterProfiles || {}

  if (character) {
    const characterKey = buildCharacterProfileKey(ip, character)
    const characterSet = characterProfiles[characterKey]
    if (characterSet?.items?.length) {
      return { owner: 'character', key: characterKey, set: characterSet }
    }
  }

  if (ip) {
    const ipSet = ipProfiles[ip]
    if (ipSet?.items?.length) {
      return { owner: 'ip', key: ip, set: ipSet }
    }
  }

  return { owner: 'none', key: character ? buildCharacterProfileKey(ip, character) : ip, set: null }
}
/**
 * 同步序列化：只保留可跨设备重建的字段（不含本机 uri/localPath/data URL）。
 * 云端 jsonb 会重排对象键，所以拉取侧必须用同一个序列化函数生成比较对象，
 * 否则 JSON.stringify 恒不相等（会变成每次同步都推一次）。
 * @param {ProfileBackgroundItem} item
 */
export function serializeProfileItemForSync(item) {
  /** @type {any} */
  const out = {
    id: String(item?.id || ''),
    kind: item?.kind === 'gradient' ? 'gradient' : 'image',
    gradient: normalizeGradient(item?.gradient),
    focalY: clampNumber(item?.focalY ?? 0.5, 0, 1, 0.5),
    scale: clampNumber(item?.scale ?? 1, 1, 2.2, 1),
    blur: clampNumber(Math.round(Number(item?.blur ?? 0)), 0, 24, 0),
    overlay: clampNumber(item?.overlay ?? 0.32, 0, 0.85, 0.32)
  }
  if (out.kind === 'image') {
    out.cloudFileName = String(item?.cloudFileName || '').trim()
    out.width = Math.max(0, Math.round(Number(item?.width) || 0))
    out.height = Math.max(0, Math.round(Number(item?.height) || 0))
    out.mimeType = String(item?.mimeType || '').trim()
    out.fileSize = Math.max(0, Math.round(Number(item?.fileSize) || 0))
  }
  return out
}

/**
 * 序列化整张 profile map（用于同步比较 / 落库）。空集不输出。
 * @param {Record<string, ProfileBackgroundSet>} raw
 * @returns {Record<string, { items: any[], rotation: ProfileRotation }>}
 */
export function serializeProfileMapForSync(raw) {
  if (!raw || typeof raw !== 'object') return {}
  const out = {}
  // 键排序 + 固定字段顺序：云端 jsonb 会重排对象键，本机与远端的序列化结果必须逐字节可比
  for (const key of Object.keys(raw).sort()) {
    const value = raw[key]
    const normalizedKey = String(key || '').trim()
    if (!normalizedKey) continue
    const set = normalizeBackgroundSet(value)
    const items = set.items.map(serializeProfileItemForSync)
    if (items.length === 0) continue
    out[normalizedKey] = { items, rotation: set.rotation }
  }
  return out
}

/** 图片是否都已有云端文件名（没有 = 本地图还没上传，presets 快照暂不能整块覆盖云端） */
export function isProfileMapFullyUploaded(raw) {
  if (!raw || typeof raw !== 'object') return true
  for (const set of Object.values(raw)) {
    for (const item of set?.items || []) {
      if (item?.kind !== 'image') continue
      if (!String(item.cloudFileName || '').trim()) return false
    }
  }
  return true
}

/**
 * 把同步用的 profile map 还原成本地 store 结构：云端图片用公开 URL 展示，
 * 若本机已有同一 cloudFileName 的本地文件则保留本地 uri/localPath（离线可用、不重复下载）。
 *
 * @param {Record<string, any>} raw 同步格式（serializeProfileMapForSync 的结果）
 * @param {{ resolveImageUrl?: (cloudFileName: string) => string,
 *   previous?: Record<string, ProfileBackgroundSet> }} [options]
 * @returns {Record<string, ProfileBackgroundSet>}
 */
export function hydrateProfileMapFromSync(raw, options = {}) {
  const resolveImageUrl = typeof options.resolveImageUrl === 'function' ? options.resolveImageUrl : null
  const previous = options.previous || {}
  if (!raw || typeof raw !== 'object') return {}

  const out = {}
  for (const [key, value] of Object.entries(raw)) {
    const normalizedKey = String(key || '').trim()
    if (!normalizedKey) continue
    const set = normalizeBackgroundSet(value)
    if (set.items.length === 0) continue

    const previousItems = new Map(
      (previous[normalizedKey]?.items || []).map((item) => [String(item?.id || ''), item])
    )

    set.items = set.items.map((item) => {
      if (item.kind !== 'image') return item
      const previousItem = previousItems.get(item.id) || null
      const keepLocal = previousItem
        && item.cloudFileName
        && previousItem.cloudFileName === item.cloudFileName
        && previousItem.uri
      let uri = keepLocal ? previousItem.uri : ''
      if (!uri && item.cloudFileName && resolveImageUrl) {
        uri = String(resolveImageUrl(item.cloudFileName) || '').trim()
      }
      if (!uri) uri = String(previousItem?.uri || '')
      return normalizeProfileItem({
        ...item,
        uri,
        localPath: keepLocal ? (previousItem?.localPath || '') : ''
      })
    })

    out[normalizedKey] = { items: set.items, rotation: set.rotation }
  }
  return out
}

/**
 * 从同步数据里收集收藏馆背景图的文件名与条目 id，供孤儿图片回收登记。
 * @param {{ ipProfiles?: Record<string, any>, characterProfiles?: Record<string, any> }} maps
 */
export function collectProfileImageRefs(maps = {}) {
  const referencedFiles = new Set()
  const ownedEntityIds = new Set()
  for (const map of [maps.ipProfiles, maps.characterProfiles]) {
    for (const set of Object.values(map || {})) {
      for (const item of set?.items || []) {
        const id = String(item?.id || '').trim()
        if (id) ownedEntityIds.add(id)
        const cloudFileName = String(item?.cloudFileName || '').trim()
        if (cloudFileName) referencedFiles.add(cloudFileName)
      }
    }
  }
  return { referencedFiles, ownedEntityIds }
}

/**
 * 背景集引用的全部本机文件路径，用于删除时回收。
 * @param {ProfileBackgroundSet|null} set
 * @returns {string[]}
 */
export function collectProfileSetLocalPaths(set) {
  const paths = new Set()
  for (const item of set?.items || []) {
    const localPath = String(item?.localPath || '').trim()
    if (localPath) paths.add(localPath)
  }
  return [...paths]
}