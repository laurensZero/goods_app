// 角色名绑定：把「同一个人物的不同变体名」绑成一组（如 初音未来 / 初音ミク / Miku）。
//
// 绑定按名字粒度（不区分 IP）：商品筛选与统计榜都是按名字命中，且「同一人物的不同
// 译名」本来就可能出现在不同 IP 下。组是一份独立列表 `[{ id, names }]`，不挂在角色
// 条目上，改名/删角色时由 presets store 负责联动维护。
//
// 纯 util：筛选（useGoodsSearch）、统计（leaderboard）、store、sync 共用，
// 避免形成循环依赖（同 characterId.js 的做法）。

import { normalizeCharacterName } from './characterId'

function createBindingId() {
  return `cb_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

/**
 * 规范化绑定组列表：names 去空/去重/规范化，少于 2 个名字的组丢弃。
 * @param {unknown} raw
 * @returns {Array<{ id: string, names: string[] }>}
 */
export function normalizeCharacterBindings(raw) {
  if (!Array.isArray(raw)) return []

  /** @type {Array<{ id: string, names: string[] }>} */
  const result = []
  for (const group of raw) {
    const id = String(group?.id || '').trim()
    const names = [...new Set(
      (Array.isArray(group?.names) ? group.names : [])
        .map((name) => normalizeCharacterName(name))
        .filter(Boolean)
    )]
    if (!id || names.length < 2) continue
    result.push({ id, names })
  }
  return result
}

/**
 * name → 该名字所在组的全体名字（含自身）。一个名字只属一个组（store 侧保证），
 * 后组覆盖前组；未绑定的名字不在 map 里。
 * @param {Array<{ id: string, names: string[] }>} bindings
 * @returns {Map<string, Set<string>>}
 */
export function buildCharacterCascadeMap(bindings) {
  const map = new Map()
  for (const group of Array.isArray(bindings) ? bindings : []) {
    const names = Array.isArray(group?.names) ? group.names : []
    const members = new Set(names)
    for (const name of names) map.set(name, members)
  }
  return map
}

/**
 * 选中名展开：保持选中顺序，选中名在前、组内其它名字按组内顺序垫后。
 * 关级联时调用方不要调它（保持原始选中列表）。
 * @param {string[]} selected
 * @param {Array<{ id: string, names: string[] }>} bindings
 * @returns {string[]}
 */
export function expandCharacterNames(selected, bindings) {
  const cascadeMap = buildCharacterCascadeMap(bindings)
  const result = []
  const seen = new Set()
  for (const raw of Array.isArray(selected) ? selected : []) {
    const name = String(raw || '').trim()
    if (!name || seen.has(name)) continue
    seen.add(name)
    result.push(name)
    const members = cascadeMap.get(name)
    if (!members) continue
    for (const member of members) {
      if (seen.has(member)) continue
      seen.add(member)
      result.push(member)
    }
  }
  return result
}

/**
 * 统计榜合并用：变体名 → 组内第一个名字（primary）；未绑定的名字原样返回。
 * @param {string} name
 * @param {Array<{ id: string, names: string[] }>} bindings
 * @returns {string}
 */
export function resolveCharacterPrimaryName(name, bindings) {
  const cascadeMap = buildCharacterCascadeMap(bindings)
  const members = cascadeMap.get(String(name || '').trim())
  if (!members) return String(name || '').trim()
  return members.values().next().value
}

/**
 * 角色改名时联动：把组内 from 换成 to（to 已在组里则只删 from，避免重复）。
 * 返回新数组；没有变化时返回 null（调用方据此跳过持久化）。
 * @param {Array<{ id: string, names: string[] }>} bindings
 * @param {string} from
 * @param {string} to
 * @returns {Array<{ id: string, names: string[] }> | null}
 */
export function remapCharacterBindingName(bindings, from, to) {
  const oldName = normalizeCharacterName(from)
  const newName = normalizeCharacterName(to)
  if (!oldName || !newName || oldName === newName) return null

  let changed = false
  const next = []
  for (const group of Array.isArray(bindings) ? bindings : []) {
    const names = Array.isArray(group?.names) ? group.names : []
    if (!names.includes(oldName)) {
      next.push(group)
      continue
    }
    changed = true
    const remapped = names
      .map((name) => (name === oldName ? newName : name))
      .filter((name, index, list) => list.indexOf(name) === index)
    if (remapped.length >= 2) next.push({ ...group, names: remapped })
  }
  return changed ? next : null
}

/**
 * 删角色时联动：把名字从所有组剔除，少于 2 个名字的组丢弃。
 * 返回新数组；没有变化时返回 null。
 * @param {Array<{ id: string, names: string[] }>} bindings
 * @param {string} name
 * @returns {Array<{ id: string, names: string[] }> | null}
 */
export function removeCharacterBindingName(bindings, name) {
  const target = normalizeCharacterName(name)
  if (!target) return null

  let changed = false
  const next = []
  for (const group of Array.isArray(bindings) ? bindings : []) {
    const names = Array.isArray(group?.names) ? group.names : []
    if (!names.includes(target)) {
      next.push(group)
      continue
    }
    changed = true
    const rest = names.filter((item) => item !== target)
    if (rest.length >= 2) next.push({ ...group, names: rest })
  }
  return changed ? next : null
}

/**
 * 把一组名字设为绑定组：名字只会属于这一个组（先从其它组移除）。
 * 返回新数组；names 少于 2 个时返回 null（不构成绑定）。
 * @param {Array<{ id: string, names: string[] }>} bindings
 * @param {string[]} names
 * @param {string} [existingGroupId] 更新已有组时传入，否则新建组
 * @returns {Array<{ id: string, names: string[] }> | null}
 */
export function upsertCharacterBinding(bindings, names, existingGroupId = '') {
  const normalized = [...new Set(
    (Array.isArray(names) ? names : [])
      .map((name) => normalizeCharacterName(name))
      .filter(Boolean)
  )]
  if (normalized.length < 2) return null

  const groupId = String(existingGroupId || '').trim()
  const next = []
  for (const group of Array.isArray(bindings) ? bindings : []) {
    // 目标组的旧成员先全部放行（set 语义：本次传入的名单就是全部成员）
    if (groupId && group.id === groupId) continue
    // 其它组里出现的名字本次都改投新组
    const rest = group.names.filter((name) => !normalized.includes(name))
    if (rest.length >= 2) next.push({ ...group, names: rest })
  }
  next.push({ id: groupId || createBindingId(), names: normalized })
  return next
}

// --- 绑定候选推荐排序 ---

function longestCommonSubstringLength(a, b) {
  if (!a || !b) return 0
  let best = 0
  let prev = new Array(b.length + 1).fill(0)
  for (let i = 1; i <= a.length; i++) {
    const row = new Array(b.length + 1).fill(0)
    for (let j = 1; j <= b.length; j++) {
      if (a[i - 1] === b[j - 1]) {
        row[j] = prev[j - 1] + 1
        if (row[j] > best) best = row[j]
      }
    }
    prev = row
  }
  return best
}

function sortChars(text) {
  return [...text].sort().join('')
}

/**
 * 绑定候选推荐：与当前名字大概率是「同一人物的变体」的排前面。
 * 推荐信号（按权重）：
 * - 名字公共子串（银狼LV.999 ↔ 银狼）：CJK ≥2 字、拉丁 ≥3 字符才算「推荐」
 * - 商品同现次数（同一件商品同时标过这两个名字）：只参与排序不触发推荐——
 *   多角色周边会让同 IP 的无关角色大量同现，作为推荐信号太松
 * - 同 IP：弱加权，同样不触发推荐
 * 排序稳定：推荐分降序，同分按 zh locale 字母序（与原候选顺序衔接）。
 * @param {string} currentName 当前编辑的角色名
 * @param {string[]} candidates 候选名字（已去重、已排除当前名与已绑定成员）
 * @param {{ coOccurCounts?: Map<string, number>, ipByName?: Map<string, string> }} [signals]
 * @returns {Array<{ name: string, score: number, recommended: boolean }>}
 */
export function rankCharacterBindCandidates(currentName, candidates, { coOccurCounts = new Map(), ipByName = new Map() } = {}) {
  const current = normalizeCharacterName(currentName).toLowerCase()
  const currentIp = String(ipByName.get(normalizeCharacterName(currentName)) || '').trim()
  // 公共子串门槛：中文名 2 字就够有辨识度，纯拉丁名要更长
  const lcsThreshold = /[\u4e00-\u9fff]/.test(current) ? 2 : 3

  const ranked = (Array.isArray(candidates) ? candidates : []).map((raw) => {
    const name = normalizeCharacterName(raw)
    const key = name.toLowerCase()
    const lcs = key === current ? 0 : longestCommonSubstringLength(current, key)
    // 字符重排（花火 ↔ 火花）：公共子串只有 1 字，但几乎必然是同一人的变体写法
    const isAnagram = key !== current && key.length >= 2 && sortChars(key) === sortChars(current)
    const effectiveLcs = isAnagram ? Math.max(lcs, Math.min(current.length, key.length)) : lcs
    const coOccur = coOccurCounts.get(name) || 0
    const sameIp = Boolean(currentIp) && currentIp === String(ipByName.get(name) || '').trim()

    const score = effectiveLcs * 8 + Math.min(coOccur, 5) + (sameIp ? 2 : 0)
    return {
      name,
      score,
      recommended: effectiveLcs >= lcsThreshold
    }
  })

  return ranked.sort((a, b) => (
    b.score - a.score || a.name.localeCompare(b.name, 'zh-Hans-CN')
  ))
}
