// src/utils/syncColumnMapping.js
// camelCase ↔ snake_case 通用转换。
// 用算法自动转换、不维护静态映射表 —— 任何新列（如 force_resync_at、apk_version、
// bundle_version）都自动正确转换，杜绝「新列漏登记 → 读回 undefined / 写入错列」这类坑。
// 已校验：旧静态表的全部列与本算法输出完全一致（见历史提交）。

// snake_case → camelCase：foo_bar_baz → fooBarBaz
function snakeToCamelKey(key) {
  return String(key).replace(/_([a-zA-Z0-9])/g, (_, c) => c.toUpperCase())
}

// camelCase → snake_case：fooBarBaz → foo_bar_baz
function camelToSnakeKey(key) {
  return String(key)
    .replace(/([A-Z])/g, (c) => `_${c.toLowerCase()}`)
    .replace(/^_/, '')
}

/**
 * 将 camelCase 对象转为 snake_case（用于写入 Supabase）。
 * 已是 snake_case 的键保持原样；camelCase 键自动转换。
 */
export function toSnakeCase(obj) {
  const result = {}
  for (const [key, value] of Object.entries(obj)) {
    result[camelToSnakeKey(key)] = value
  }
  return result
}

/**
 * 将 snake_case 对象转为 camelCase（用于从 Supabase 读取）。
 * 已是 camelCase 的键保持原样；snake_case 键自动转换。
 */
export function toCamelCase(obj) {
  const result = {}
  for (const [key, value] of Object.entries(obj)) {
    result[snakeToCamelKey(key)] = value
  }
  return result
}

/**
 * 批量转换数组中的对象为 camelCase
 */
export function mapRowsToCamelCase(rows) {
  return rows.map(toCamelCase)
}
