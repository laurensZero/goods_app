// 角色生日彩蛋：匹配与日期判断的纯函数。
// 云端 RPC 已按「名字/别名归一化 key」筛出候选行，这里负责客户端侧的
// IP 消歧与生日判定。归一化规则必须与 get_character_birthdays RPC 一致。

export function normalizeBirthdayKey(text) {
  return String(text || '').toLowerCase().replace(/\s+/g, '')
}

/**
 * name/alias 归一化 key → 行列表 的倒排索引。
 * 同一行可能出现在多个 key 下（本名 + 各别名）。
 */
export function buildBirthdayIndex(rows) {
  const index = new Map()
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row || !row.name) continue
    const keys = new Set([
      normalizeBirthdayKey(row.name),
      ...(Array.isArray(row.aliases) ? row.aliases : []).map(normalizeBirthdayKey)
    ])
    for (const key of keys) {
      if (!key) continue
      const list = index.get(key)
      if (list) list.push(row)
      else index.set(key, [row])
    }
  }
  return index
}

/**
 * 用「角色名 + IP」在索引中定位唯一的生日行。
 * - IP 非空：要求候选行 ip 或 ip_aliases 归一化命中
 * - IP 为空：仅当候选无歧义（只有一行）才匹配，避免跨 IP 重名误报
 */
export function matchBirthdayRow(index, { name, ip } = {}) {
  const key = normalizeBirthdayKey(name)
  if (!key) return null
  const candidates = index.get(key)
  if (!candidates || !candidates.length) return null

  const ipKey = normalizeBirthdayKey(ip)
  if (!ipKey) {
    return candidates.length === 1 ? candidates[0] : null
  }

  return candidates.find((row) => {
    const rowIpKeys = [row.ip, ...(Array.isArray(row.ipAliases) ? row.ipAliases : [])]
      .map(normalizeBirthdayKey)
      .filter(Boolean)
    return rowIpKeys.includes(ipKey)
  }) || null
}

/**
 * 生日是否落在指定日期（默认今天，按设备本地时区）。
 * 2/29 出生的角色在平年提前到 2/28 庆祝。
 */
export function isBirthdayOnDate(month, day, date = new Date()) {
  const m = date.getMonth() + 1
  const d = date.getDate()
  if (month === m && day === d) return true

  if (month === 2 && day === 29 && m === 2 && d === 28) {
    const year = date.getFullYear()
    const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
    return !isLeap
  }
  return false
}
