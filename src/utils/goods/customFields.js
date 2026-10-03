// src/utils/goods/customFields.js
/**
 * 谷子自定义字段：定义（随 presets 同步）与值（随 goods 行同步）的**唯一**归一化实现。
 *
 * 为什么集中在这里：presets store 与同步两侧必须共用同一份实现。
 * `syncOrchestrator` 用 `JSON.stringify(localPresets) !== JSON.stringify(remotePresets)`
 * 判断「预设是否有差异」，两侧归一化只要有一点不对称（键顺序、默认值、trim 规则），
 * 就会永远判为有差异 → 每次同步都推一遍 presets。
 *
 * 数据形状：
 *   定义 sync_presets.custom_field_defs = [{ id, name, type, options }]（数组顺序即展示顺序）
 *   值   goods.custom_fields            = { <defId>: string }（键 = 定义 id，值统一存字符串）
 */

/** 第一版支持的字段类型（注册表：加类型只改这里 + UI 渲染分支） */
export const CUSTOM_FIELD_TYPES = ['text', 'select', 'number', 'date']

/**
 * 字段生效范围（可多选）：收藏 / 心愿。顺序即 UI 展示顺序。
 * 缺失或全非法 → 回落 `DEFAULT_CUSTOM_FIELD_SCOPES`（= 两边都生效），
 * 这样旧数据（没有 scopes 键）行为与加入该设置之前完全一致。
 */
export const CUSTOM_FIELD_SCOPES = ['collection', 'wishlist']
export const DEFAULT_CUSTOM_FIELD_SCOPES = [...CUSTOM_FIELD_SCOPES]

/** 定义数量上限，防止脏数据撑爆 presets 行 */
export const CUSTOM_FIELD_DEF_MAX = 30
/** 单个 select 字段的选项数量上限 */
export const CUSTOM_FIELD_OPTION_MAX = 50
/** 字段名 / 选项名长度上限 */
export const CUSTOM_FIELD_NAME_MAX = 40
export const CUSTOM_FIELD_OPTION_LABEL_MAX = 60
/** 值的键（= 定义 id）长度上限 */
export const CUSTOM_FIELD_KEY_MAX = 64
/** 单个值的长度上限 */
export const CUSTOM_FIELD_VALUE_MAX = 500

export function isCustomFieldType(type) {
  return CUSTOM_FIELD_TYPES.includes(String(type || ''))
}

/**
 * 归一化生效范围：只保留已知值、去重、按 CUSTOM_FIELD_SCOPES 顺序输出。
 * 非数组 / 过滤后为空 → 两边都生效（不允许「哪都不生效」否则字段在 UI 里彻底消失）。
 * @param {unknown} input
 * @returns {string[]}
 */
export function normalizeCustomFieldScopes(input) {
  if (!Array.isArray(input)) return [...DEFAULT_CUSTOM_FIELD_SCOPES]

  const given = new Set(input.map((item) => String(item || '').trim()))
  const scopes = CUSTOM_FIELD_SCOPES.filter((scope) => given.has(scope))
  return scopes.length ? scopes : [...DEFAULT_CUSTOM_FIELD_SCOPES]
}

/** 字段是否在某个视图（collection / wishlist）生效；缺 scopes 视为两边都生效 */
export function isCustomFieldInScope(def, scope) {
  const target = String(scope || '').trim()
  if (!target) return true

  const scopes = Array.isArray(def?.scopes) ? def.scopes : DEFAULT_CUSTOM_FIELD_SCOPES
  return scopes.length === 0 || scopes.includes(target)
}

// 确定性短哈希：给「缺失 id / 重复 id」的脏数据兜底。
// 不能用随机 id —— 同一份远端数据在本地与同步两侧各自归一化会得到不同 id，
// presets 于是永远判为有差异、每次同步都推送。
function hashString(value) {
  let hash = 0
  const text = String(value || '')
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0
  }
  return Math.abs(hash).toString(36)
}

/** 新建字段定义用的 id（时间戳 + 随机后缀，与 createStorageLocationId 同构） */
export function createCustomFieldDefId() {
  return `cf_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function fallbackDefId(name) {
  return `cf_auto_${hashString(name)}`
}

function normalizeOptionList(input) {
  if (!Array.isArray(input)) return []
  const seen = new Set()
  const options = []
  for (const raw of input) {
    const label = String(raw ?? '').trim().slice(0, CUSTOM_FIELD_OPTION_LABEL_MAX)
    if (!label || seen.has(label)) continue
    seen.add(label)
    options.push(label)
    if (options.length >= CUSTOM_FIELD_OPTION_MAX) break
  }
  return options
}

/**
 * 归一化字段定义列表（本地持久化、远端拉取、推送三处共用）。
 * - 非数组 → []
 * - name 为空或重名 → 整条丢弃（保留第一条）
 * - type 不在白名单 → 回落 text
 * - id 缺失/超长/重复 → 确定性兜底 id（撞 id 会让值错配到别的字段）
 * - options 仅 select 保留
 * - 超过 CUSTOM_FIELD_DEF_MAX 条 → 丢弃尾部
 * - 输出键顺序固定为 id → name → type → options → scopes
 * @param {unknown} input
 * @returns {{ id: string, name: string, type: string, options: string[], scopes: string[] }[]}
 */
export function normalizeCustomFieldDefs(input) {
  if (!Array.isArray(input)) return []

  const usedIds = new Set()
  const usedNames = new Set()
  const normalized = []

  for (const raw of input) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue

    const name = String(raw.name || '').trim().slice(0, CUSTOM_FIELD_NAME_MAX)
    if (!name || usedNames.has(name)) continue

    const type = isCustomFieldType(raw.type) ? String(raw.type) : 'text'

    let id = String(raw.id || '').trim()
    if (!id || id.length > CUSTOM_FIELD_KEY_MAX || usedIds.has(id)) id = fallbackDefId(name)
    let suffix = 2
    while (usedIds.has(id)) {
      id = `${fallbackDefId(name)}_${suffix}`
      suffix += 1
    }

    usedIds.add(id)
    usedNames.add(name)
    normalized.push({
      id,
      name,
      type,
      options: type === 'select' ? normalizeOptionList(raw.options) : [],
      scopes: normalizeCustomFieldScopes(raw.scopes)
    })

    if (normalized.length >= CUSTOM_FIELD_DEF_MAX) break
  }

  return normalized
}

/**
 * 归一化 goods.customFields = { <defId>: string }。
 *
 * 键存在 = **这件谷子添加了该字段**；值为空串 = 已添加但未填。
 * 编辑页据此只渲染「已添加」的字段（不是把所有定义都铺出来），所以空值必须保留，
 * 否则保存后重新打开商品，用户刚添加的字段会消失。
 *
 * - 非对象（含数组 / null / 字符串）→ {}
 * - 键 trim；空键、超长键丢弃（合法 defId 是 `cf_` 前缀的短字符串）
 * - 值字符串化 + trim（可为空串）；对象/数组丢弃，留给未来的 multiSelect
 * - 键排序，使同一份数据在本地 / 远端 / 各设备的序列化结果一致
 * - **不做键数量截断**：截断会静默丢掉已添加字段的值，而归一化结果会写回本地库并推上云
 *   → 数据永久损坏。孤儿键（定义已删）由「删除字段时清理」收口，
 *   见 docs/goods-custom-fields-plan.md。
 * @param {unknown} input
 * @returns {Record<string, string>}
 */
export function normalizeCustomFields(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {}

  const result = {}
  for (const key of Object.keys(input).sort()) {
    const id = String(key || '').trim()
    if (!id || id.length > CUSTOM_FIELD_KEY_MAX) continue

    const raw = input[key]
    if (raw != null && typeof raw === 'object') continue

    result[id] = String(raw ?? '').trim().slice(0, CUSTOM_FIELD_VALUE_MAX)
  }
  return result
}
