// 从 helpers.js 源码解析同步业务字段数组（git 对比 / bump 脚本共用）

const KEY_EXPORTS = [
  'GOODS_BUSINESS_KEYS',
  'RECHARGE_BUSINESS_KEYS',
  'GOODS_GROUP_BUSINESS_KEYS',
  'GOODS_GROUP_ITEM_BUSINESS_KEYS',
  'EVENT_BUSINESS_KEYS',
  'EVENT_JSON_KEYS'
]

export function parseKeyArraysFromSource(source) {
  const result = {}
  for (const name of KEY_EXPORTS) {
    const re = new RegExp(`export const ${name}\\s*=\\s*(\\[[^\\]]*\\])`, 'm')
    const match = source.match(re)
    if (!match) throw new Error(`无法解析 ${name}`)
    result[name] = [...match[1].matchAll(/'([^']*)'/g)].map((m) => m[1])
  }
  return result
}

export function serializeKeyArrays(arrays) {
  return KEY_EXPORTS.map((name) => `${name}=${(arrays[name] || []).join(',')}`).join('\n')
}

export function parseSyncSchemaVersion(source) {
  const match = source.match(/export const SYNC_SCHEMA_VERSION\s*=\s*(\d+)/)
  return match ? Number(match[1]) : null
}
