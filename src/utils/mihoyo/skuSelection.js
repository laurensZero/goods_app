/**
 * 米游铺「多级 SKU」选择模型（纯函数，便于复用与单测）。
 *
 * 数据来源：
 *   - groups   : normalizeSaleAttrGroups(detail.sale_attrs) -> [{ name, key, content: [{ text, key, ... }] }]
 *   - variants : buildSkuVariantsFromDetail / buildSaleAttrVariants -> [{ text, key, cover_url, price }]
 *
 * 约定：
 *   - 只有「>1 个选项」的维度才会展示成可选择的层级；单选项维度（如「发货时间」）
 *     是固定值，不展示，但其 key 仍在 variant.key 里参与组合。
 *   - selection 形如 { [levelIndex]: string[] }，levelIndex 为维度在 groups 中的下标。
 *   - 选中结果统一用 variant key 数组表示（单选场景长度 0/1）。
 */

/** 单个维度是否可作为可选层级（>1 个选项） */
export function isSelectableGroup(group) {
  return Array.isArray(group?.content) && group.content.length > 1
}

/** 可选择的层级（只保留 >1 选项的维度，带上原始下标） */
export function buildPickerLevels(groups) {
  return (Array.isArray(groups) ? groups : [])
    .map((group, index) => ({
      index,
      name: String(group?.name || '').trim(),
      content: Array.isArray(group?.content) ? group.content : [],
    }))
    .filter((level) => level.content.length > 1)
}

/** itemKey -> 所属可选层级下标；固定维度（单项/未知）映射为 -1 */
export function buildItemLevelIndex(groups) {
  const map = new Map()
  ;(Array.isArray(groups) ? groups : []).forEach((group, index) => {
    const levelIndex = isSelectableGroup(group) ? index : -1
    for (const item of (Array.isArray(group?.content) ? group.content : [])) {
      if (item?.key) map.set(item.key, levelIndex)
    }
  })
  return map
}

/** variant.key 拆成维度项 key 数组 */
export function variantItemKeys(variant) {
  return String(variant?.key || '')
    .split('_')
    .map((part) => part.trim())
    .filter(Boolean)
}

function variantKeySet(variant) {
  return new Set(variantItemKeys(variant))
}

/** 由若干 variant key 反推 selection（用于外部回填，如自动匹配/草稿恢复） */
export function selectionFromVariantKeys(keys, levels, itemLevelIndex) {
  const selection = {}
  for (const level of levels) selection[level.index] = []
  for (const key of (Array.isArray(keys) ? keys : [])) {
    for (const part of variantItemKeys({ key })) {
      const levelIndex = itemLevelIndex.get(part)
      if (levelIndex == null || levelIndex < 0) continue
      if (!selection[levelIndex].includes(part)) selection[levelIndex].push(part)
    }
  }
  return selection
}

/** 是否至少选中了一个维度项 */
export function hasAnySelection(levels, selection) {
  return levels.some((level) => (selection[level.index] || []).length > 0)
}

/** 每个可选层级是否都至少选了一项 */
export function hasFullSelection(levels, selection) {
  return levels.every((level) => (selection[level.index] || []).length > 0)
}

function variantMatches(variantKeys, levels, selection) {
  for (const level of levels) {
    const selected = selection[level.index]
    if (!selected || !selected.length) continue
    if (!selected.some((key) => variantKeys.has(key))) return false
  }
  return true
}

/**
 * 由 selection 解析出选中的 variant 列表：
 *   - 单选场景：必须每个层级都选满，才返回唯一组合；否则返回 []。
 *   - 多选场景：某个层级未选 = 不约束该维度（自动展开为所选值的全部有效组合）；
 *     所有层级都未选时返回 []。
 */
export function resolveSelectedVariants(variants, levels, selection, multi) {
  const list = Array.isArray(variants) ? variants : []
  if (!levels.length) return []
  if (!hasAnySelection(levels, selection)) return []
  if (!multi && !hasFullSelection(levels, selection)) return []

  return list.filter((variant) => variantMatches(variantKeySet(variant), levels, selection))
}

/**
 * 某个维度项在当前 selection 下是否存在有效组合（其余未选层级视为不约束）。
 * 用于把「选了 A 之后不可能的组合」置灰。
 */
export function isLevelValueAvailable(variants, levels, selection, levelIndex, itemKey) {
  if (!itemKey) return false
  const list = Array.isArray(variants) ? variants : []
  return list.some((variant) => {
    const keys = variantKeySet(variant)
    if (!keys.has(itemKey)) return false
    for (const level of levels) {
      if (level.index === levelIndex) continue
      const selected = selection[level.index]
      if (!selected || !selected.length) continue
      if (!selected.some((key) => keys.has(key))) return false
    }
    return true
  })
}

/**
 * 点击维度项：多选场景在层级内增删；单选场景在同一层级内互斥（再点一次取消）。
 */
export function toggleSelection(selection, levelIndex, itemKey, multi) {
  const current = selection[levelIndex] || []
  const next = { ...selection }
  if (multi) {
    next[levelIndex] = current.includes(itemKey)
      ? current.filter((key) => key !== itemKey)
      : [...current, itemKey]
  } else {
    next[levelIndex] = current.includes(itemKey) ? [] : [itemKey]
  }
  return next
}

/** 两个 key 数组是否等价（顺序无关） */
export function sameKeySet(a, b) {
  const left = Array.isArray(a) ? a : []
  const right = Array.isArray(b) ? b : []
  if (left.length !== right.length) return false
  const set = new Set(right)
  return left.every((key) => set.has(key))
}

/**
 * 预先算好每个 variant 的 key 集合，避免在渲染 / 交互时反复 split + new Set。
 * 集合里额外包含「完整 variant.key」，这样在缺维度信息、退化成扁平列表时，
 * 也能用 variant.key 作为维度项 key 正常选择（不影响正常多级匹配）。
 * 返回 [{ variant, keys: Set<string> }]
 */
export function buildVariantEntries(variants) {
  return (Array.isArray(variants) ? variants : []).map((variant) => {
    const keys = new Set(variantItemKeys(variant))
    if (variant?.key) keys.add(String(variant.key))
    return { variant, keys }
  })
}

/** entry 是否命中当前 selection（未选层级不约束） */
export function entryMatchesSelection(entry, levels, selection) {
  for (const level of levels) {
    const selected = selection[level.index]
    if (!selected || !selected.length) continue
    if (!selected.some((key) => entry.keys.has(key))) return false
  }
  return true
}

/**
 * 一次遍历算出所有「可选 / 置灰」状态：Map<`${levelIndex}|${itemKey}`, true>。
 * 只要存在一条命中当前 selection（其余未选层级不约束）的组合包含该维度项，即视为可选。
 */
export function buildAvailabilityMap(entries, itemLevelIndex, levels, selection) {
  const map = new Map()
  for (const entry of entries) {
    if (!entryMatchesSelection(entry, levels, selection)) continue
    for (const key of entry.keys) {
      const levelIndex = itemLevelIndex.get(key)
      if (levelIndex == null || levelIndex < 0) continue
      map.set(`${levelIndex}|${key}`, true)
    }
  }
  return map
}

/** 由 selection 解析选中 variant（用预计算的 entries 版本，避免重复计算） */
export function resolveSelectedVariantsFromEntries(entries, levels, selection, multi) {
  if (!levels.length) return []
  if (!hasAnySelection(levels, selection)) return []
  if (!multi && !hasFullSelection(levels, selection)) return []
  return entries
    .filter((entry) => entryMatchesSelection(entry, levels, selection))
    .map((entry) => entry.variant)
}
