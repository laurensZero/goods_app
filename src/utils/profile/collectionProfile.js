// @ts-check
/**
 * 收藏馆（IP / 角色）本地个性化资料：自定义背景集 + 轮换策略 + 主题色。
 *
 * 这里只放**纯函数**（归一化 / 解析 / 序列化），便于单测；本地持久化与图片文件生命周期
 * 见 `stores/collectionProfile.js`，背景图导入压缩 / 取色见 `utils/profile/backgroundImage.js`。
 *
 * 数据结构刻意保持可直接写入 collection_profiles 行的形态，
 * 上云阶段不需要再做数据迁移。一张背景就是一张图（方形图 / 长条图都可能是），
 * 展示侧按图片宽高自动决定 cover 还是完整居中 + 模糊铺底。
 * 深浅色永远跟随 App 主题；这里只存每个收藏馆独立的强调色（主题色）来源。
 *
 * @typedef {{ id: string, kind: 'image'|'gradient', uri: string, localPath: string,
 *   cloudFileName: string, width: number, height: number, mimeType: string, fileSize: number,
 *   accent: string, gradient: [string, string], focalY: number, scale: number, blur: number,
 *   overlay: number }} ProfileBackgroundItem
 * @typedef {{ mode: 'off'|'visit'|'interval', intervalSec: number,
 *   order: 'seq'|'random', transition: 'fade'|'kenburns' }} ProfileRotation
 * @typedef {{ source: 'app'|'background'|'custom', customColor: string }} ProfileTheme
 * @typedef {{ items: ProfileBackgroundItem[], rotation: ProfileRotation, theme: ProfileTheme }} ProfileBackgroundSet
 */

import { hexToHsl, hexToRgb, hslToHex, isHexColor } from '@/utils/color'

export const PROFILE_SCHEMA_VERSION = 3

export const PROFILE_ROTATION_MODES = ['off', 'visit', 'interval']
export const PROFILE_ROTATION_ORDERS = ['seq', 'random']
export const PROFILE_TRANSITIONS = ['fade', 'kenburns']
export const PROFILE_ITEM_KINDS = ['image', 'gradient']
export const PROFILE_THEME_SOURCES = ['app', 'background', 'custom']

/** 默认「每次进入换一张」，顺序播放、淡入淡出 */
export const DEFAULT_PROFILE_ROTATION = Object.freeze({
  mode: 'visit',
  intervalSec: 8,
  order: 'seq',
  transition: 'fade'
})

/** 每个收藏馆默认按背景取主题色（没有可用颜色时自动回落到 App 主题） */
export const DEFAULT_PROFILE_THEME = Object.freeze({
  source: 'background',
  customColor: '#8ec5fc'
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

/** 导入中的临时预览条目：只有 blob: 地址，进程重启后必然失效，不能从持久化数据里恢复 */
export function isTransientBlobItem(item) {
  if (!item || item.kind === 'gradient') return false
  const uri = String(item.uri || '').trim()
  return uri.startsWith('blob:') && !String(item.localPath || '').trim() && !String(item.cloudFileName || '').trim()
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
    accent: normalizeAccentHex(raw?.accent),
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
 * @returns {ProfileTheme}
 */
export function normalizeProfileTheme(raw = {}) {
  const source = PROFILE_THEME_SOURCES.includes(raw?.source) ? raw.source : DEFAULT_PROFILE_THEME.source
  const customColor = normalizeAccentHex(raw?.customColor) || DEFAULT_PROFILE_THEME.customColor
  return { source, customColor }
}

/** 只保留合法 hex；非法值返回空串 */
export function normalizeAccentHex(value) {
  const text = String(value || '').trim()
  return isHexColor(text) ? text.toLowerCase() : ''
}

/**
 * 把背景取色拉进「浅色 / 深色 App 主题下都看得清」的区间：
 * 灰色没有主题感、太暗太亮在白底/深底上都不好读，统一夹 S 46–82、L 42–60。
 */
export function ensureReadableAccent(hex) {
  const normalized = normalizeAccentHex(hex)
  if (!normalized) return ''
  const { h, s, l } = hexToHsl(normalized)
  if (s < 12) return ''
  return hslToHex(h, Math.min(82, Math.max(46, s)), Math.min(60, Math.max(42, l)))
}

/** 主题色上的文字颜色：按相对亮度选白/近黑 */
export function accentContrastColor(hex) {
  const normalized = normalizeAccentHex(hex) || DEFAULT_PROFILE_THEME.customColor
  const { r, g, b } = hexToRgb(normalized)
  const toLinear = (value) => {
    const channel = value / 255
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  }
  const luminance = 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b)
  return luminance > 0.46 ? '#141416' : '#ffffff'
}

/** 渐变卡没有存 accent：从两个颜色里挑更「鲜艳」的一档 */
export function getGradientAccent(gradient) {
  const colors = Array.isArray(gradient) ? gradient : []
  let best = ''
  let bestScore = -1
  for (const color of colors) {
    const normalized = normalizeAccentHex(color)
    if (!normalized) continue
    const { s, l } = hexToHsl(normalized)
    const score = s * (1 - Math.abs(l - 50) / 60)
    if (score > bestScore) {
      bestScore = score
      best = normalized
    }
  }
  return ensureReadableAccent(best)
}

/** 单张背景条目的主题色：图片用导入时提取的 accent，渐变从渐变色里取 */
export function getItemAccent(item) {
  if (!item) return ''
  if (item.kind === 'gradient') return getGradientAccent(item.gradient)
  return ensureReadableAccent(item.accent) || ''
}

/**
 * 收藏馆主题色解析结果：
 * - app：空串（展示层回落到 App 主题的强调色）
 * - background：当前这张背景的颜色；没取到也返回空串
 * - custom：用户自选颜色
 */
export function resolveProfileAccent(themeRaw, item) {
  const theme = normalizeProfileTheme(themeRaw)
  if (theme.source === 'custom') return theme.customColor
  if (theme.source === 'background') return getItemAccent(item)
  return ''
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
    rotation: normalizeProfileRotation(raw?.rotation),
    theme: normalizeProfileTheme(raw?.theme),
    // 按收藏馆逐条 LWW：每个 IP/角色自己的修改时间与删除墓碑
    updatedAt: Math.max(0, Math.round(Number(raw?.updatedAt) || 0)),
    deleted: raw?.deleted === true
  }
}

/**
 * 归一化 { [key]: BackgroundSet }；空集且不是删除墓碑的脏 key 直接丢弃。
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
    // 持久化数据里的 blob: 预览地址（上次导入未完成就被杀）直接丢弃
    set.items = set.items.filter((item) => !isTransientBlobItem(item))
    if (set.items.length > 0 || set.deleted) out[normalizedKey] = set
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
    out.accent = normalizeAccentHex(item?.accent)
  }
  return out
}

/**
 * 序列化整张 profile map（用于同步比较 / 落库）。空集（非删除墓碑）不输出。
 * 每个收藏馆带自己的 `updatedAt` 与 `deleted`，同步侧据此做逐条 LWW，
 * 而不是整块覆盖（否则一台设备的旧快照会把另一台设备刚加的背景抹掉）。
 * @param {Record<string, ProfileBackgroundSet>} raw
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
    if (items.length === 0 && !set.deleted) continue
    out[normalizedKey] = {
      items,
      rotation: set.rotation,
      theme: set.theme,
      updatedAt: set.updatedAt,
      deleted: set.deleted
    }
  }
  return out
}

/** 图片是否都已有云端文件名（没有 = 本地图还没上传，presets 快照暂不能整块覆盖云端） */
export function isProfileMapFullyUploaded(raw) {
  if (!raw || typeof raw !== 'object') return true
  for (const set of Object.values(raw)) {
    if (set?.deleted) continue
    for (const item of set?.items || []) {
      if (item?.kind !== 'image') continue
      if (!String(item.cloudFileName || '').trim()) return false
    }
  }
  return true
}

/**
 * 单个远端 set 转成本地结构：同 id 条目尽量保留本机 uri/localPath。
 * @param {ProfileBackgroundSet} remoteSet
 * @param {ProfileBackgroundSet|null} previousSet
 * @param {((cloudFileName: string) => string)|null} resolveImageUrl
 */
function hydrateProfileSet(remoteSet, previousSet, resolveImageUrl) {
  const previousItems = new Map(
    (previousSet?.items || []).map((item) => [String(item?.id || ''), item])
  )
  const items = remoteSet.items.map((item) => {
    if (item.kind !== 'image') return item
    const previousItem = previousItems.get(item.id) || null
    const previousUri = String(previousItem?.uri || '').trim()
    // 同 id 的条目一定对应同一张本地图：只要本机还有可用 uri（本地文件 / data URL /
    // 之前已解析的公开 URL），就继续用本机的。云端上传失败时若改用云端 URL，
    // 会把本来能显示的本地图换成 404 链——这正是「同步一次背景图就丢了」的原因。
    const keepLocal = Boolean(previousItem?.uri)
    let uri = keepLocal ? previousUri : ''
    if (!uri && item.cloudFileName && resolveImageUrl) {
      uri = String(resolveImageUrl(item.cloudFileName) || '').trim()
    }
    if (!uri) uri = previousUri
    return normalizeProfileItem({
      ...item,
      uri,
      localPath: keepLocal ? (previousItem?.localPath || '') : '',
      // 云端快照没带主题色时沿用本机已提取的值
      accent: item.accent || previousItem?.accent || ''
    })
  })
  return {
    items,
    rotation: remoteSet.rotation,
    theme: remoteSet.theme,
    updatedAt: remoteSet.updatedAt,
    deleted: remoteSet.deleted
  }
}

/**
 * 把同步用的 profile map 还原成本地 store 结构（纯转换，不做时间比较）。
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
    if (set.items.length === 0 && !set.deleted) continue
    out[normalizedKey] = hydrateProfileSet(set, previous[normalizedKey] || null, resolveImageUrl)
  }
  return out
}

/**
 * 逐条 LWW 合并远端 profile map：同一 IP/角色比较 `updatedAt`，更新的一方生效；
 * 删除用 `deleted: true` 墓碑传播。**不会整块覆盖**，因此一台设备的旧快照
 * 不会抹掉另一台设备新增/修改的收藏馆背景。
 *
 * @param {Record<string, ProfileBackgroundSet>} localMap
 * @param {Record<string, any>} remoteMap 同步格式
 * @param {{ resolveImageUrl?: (cloudFileName: string) => string }} [options]
 * @returns {Record<string, ProfileBackgroundSet>}
 */
export function mergeProfileMapFromRemote(localMap, remoteMap, options = {}) {
  const resolveImageUrl = typeof options.resolveImageUrl === 'function' ? options.resolveImageUrl : null
  const out = {}
  for (const [key, value] of Object.entries(localMap || {})) {
    const normalizedKey = String(key || '').trim()
    if (!normalizedKey) continue
    out[normalizedKey] = normalizeBackgroundSet(value)
  }

  for (const [key, value] of Object.entries(remoteMap || {})) {
    const normalizedKey = String(key || '').trim()
    if (!normalizedKey) continue
    const remoteSet = normalizeBackgroundSet(value)
    if (remoteSet.items.length === 0 && !remoteSet.deleted) continue
    const localSet = out[normalizedKey] || null
    const localTs = Number(localSet?.updatedAt) || 0
    const remoteTs = Number(remoteSet.updatedAt) || 0
    // 远端更新才覆盖；时间相同且远端有内容（旧数据 updatedAt=0 首次上云）时也采用远端
    const remoteWins = !localSet
      || remoteTs > localTs
      || (remoteTs === localTs && remoteSet.items.length > 0)
    if (remoteWins) {
      out[normalizedKey] = hydrateProfileSet(remoteSet, localSet, resolveImageUrl)
    }
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
