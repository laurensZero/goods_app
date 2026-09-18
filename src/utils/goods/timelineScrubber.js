/**
 * 时间线侧边选月条的纯函数映射。
 * ratio 为 0–1，months.length 为展示顺序中的月份总数
 * （与 useHomeTimeline 的 allTimelineMonthList 一致）。
 */
export function monthIndexFromRailRatio(ratio, monthCount) {
  const count = Number(monthCount) || 0
  if (count <= 0) return 0
  const r = Number(ratio)
  const normalized = Number.isFinite(r) ? Math.min(1, Math.max(0, r)) : 0
  const index = Math.floor(normalized * count)
  return Math.min(count - 1, Math.max(0, index))
}

export function formatScrubYearMonthLabel(year, monthLabel, locale, t) {
  const y = String(year || '')
  const m = String(monthLabel || '')
  if (!y && !m) return ''
  const loc = String(locale || 'zh-CN')
  if (loc.startsWith('en')) {
    return [m, y].filter(Boolean).join(' ')
  }
  if (loc.startsWith('ko')) {
    return `${y}년 ${m}`.trim()
  }
  // zh-CN / zh-TW / ja：年 + 月份标签（如 3月）
  return `${y}${y ? '年' : ''}${m}`
}
