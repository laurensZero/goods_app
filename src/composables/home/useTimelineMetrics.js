import { ref } from 'vue'

/**
 * 时间线月份高度实测 + 逐月偏移映射。
 *
 * 与网格模式的 useVirtualGridMetrics 相同思路：从 DOM 实测高度，
 * 消除硬编码估算导致的累积偏移。但时间线每月高度不同（取决于该月
 * 物品数和缩略图网格换行），因此必须逐月记录，不能像网格那样全表
 * 共用一个行高。
 *
 * 测量基于 .tl-month-group[data-tl-month] 的 offsetHeight，
 * 按 yearMonth 键存入 Map。offsetOfMonth / monthAtOffset 接收
 * allMonths 数组作参数（避免与 useHomeTimeline 的循环依赖）：
 * 已测月份用精确高度，未测月份回退到已测均值。
 */

const MIN_MONTH_HEIGHT = 80
const MAX_MONTH_HEIGHT = 3000
const MIN_YEAR_HEADER_HEIGHT = 20
const MAX_YEAR_HEADER_HEIGHT = 200
const MAX_MEASURE_ATTEMPTS = 60

export function useTimelineMetrics({
  getSectionEl,
  fallbackMonthHeight = 360,
  fallbackYearHeaderHeight = 48
}) {
  const metricsVersion = ref(0)
  /** @type {Map<string, number>} yearMonth → measured height */
  const monthHeightMap = new Map()
  let measuredYearHeaderHeight = fallbackYearHeaderHeight
  let measureRaf = 0
  let measureAttempts = 0

  function getAverageMonthHeight() {
    let sum = 0
    let count = 0
    for (const h of monthHeightMap.values()) {
      sum += h
      count += 1
    }
    return count > 0 ? sum / count : fallbackMonthHeight
  }

  function tryMeasure() {
    const el = getSectionEl?.()
    if (!el || !el.isConnected) return false

    const monthEls = el.querySelectorAll('.tl-month-group[data-tl-month]')
    if (monthEls.length < 2) return false

    let changed = false

    for (const monthEl of monthEls) {
      const yearMonth = monthEl.getAttribute('data-tl-month')
      if (!yearMonth) continue
      const h = monthEl.offsetHeight
      if (!(h >= MIN_MONTH_HEIGHT && h <= MAX_MONTH_HEIGHT)) continue
      const prev = monthHeightMap.get(yearMonth)
      if (prev == null || Math.abs(prev - h) >= 2) {
        monthHeightMap.set(yearMonth, h)
        changed = true
      }
    }

    const yearHeaderEls = el.querySelectorAll('.tl-year-header')
    if (yearHeaderEls.length > 0) {
      let headerSum = 0
      let headerCount = 0
      for (const hEl of yearHeaderEls) {
        const h = hEl.offsetHeight
        if (h >= MIN_YEAR_HEADER_HEIGHT && h <= MAX_YEAR_HEADER_HEIGHT) {
          headerSum += h
          headerCount += 1
        }
      }
      if (headerCount > 0) {
        const avg = headerSum / headerCount
        if (Math.abs(measuredYearHeaderHeight - avg) >= 1) {
          measuredYearHeaderHeight = avg
          changed = true
        }
      }
    }

    if (changed) metricsVersion.value += 1
    return monthHeightMap.size >= 2
  }

  function scheduleMeasure() {
    measureAttempts = 0
    if (measureRaf) return
    const tick = () => {
      measureRaf = 0
      if (tryMeasure()) return
      measureAttempts += 1
      if (measureAttempts < MAX_MEASURE_ATTEMPTS) {
        measureRaf = window.requestAnimationFrame(tick)
      }
    }
    measureRaf = window.requestAnimationFrame(tick)
  }

  function cancelMeasure() {
    if (!measureRaf) return
    window.cancelAnimationFrame(measureRaf)
    measureRaf = 0
  }

  function estimateMonthHeight(/* _monthIndex */) {
    return getAverageMonthHeight()
  }

  /**
   * monthIndex 之前所有月份 + 年份标题的总高度。
   * @param {number} monthIndex
   * @param {Array<{yearMonth: string, year: string}>} allMonths
   */
  function offsetOfMonth(monthIndex, allMonths) {
    if (!(monthIndex > 0)) return 0
    if (!allMonths || allMonths.length === 0) return monthIndex * fallbackMonthHeight

    const end = Math.min(monthIndex, allMonths.length)
    let total = 0
    let lastYear = ''
    for (let i = 0; i < end; i++) {
      const m = allMonths[i]
      if (m.year !== lastYear) {
        total += measuredYearHeaderHeight
        lastYear = m.year
      }
      total += monthHeightMap.get(m.yearMonth) ?? estimateMonthHeight(i)
    }
    if (monthIndex > allMonths.length) {
      total += (monthIndex - allMonths.length) * getAverageMonthHeight()
    }
    return total
  }

  /**
   * 给定滚动偏移量，返回它落在第几个月份（offsetOfMonth 的逆映射）。
   * @param {number} offset
   * @param {Array<{yearMonth: string, year: string}>} allMonths
   */
  function monthAtOffset(offset, allMonths) {
    const top = Math.max(0, Number(offset) || 0)
    if (top <= 0) return 0
    if (!allMonths || allMonths.length === 0) {
      return Math.floor(top / Math.max(1, getAverageMonthHeight()))
    }

    let total = 0
    let lastYear = ''
    for (let i = 0; i < allMonths.length; i++) {
      const m = allMonths[i]
      if (m.year !== lastYear) {
        total += measuredYearHeaderHeight
        lastYear = m.year
      }
      const h = monthHeightMap.get(m.yearMonth) ?? estimateMonthHeight(i)
      if (total + h > top) return i
      total += h
    }
    return Math.max(0, allMonths.length - 1)
  }

  /**
   * 删除指定月份的已测高度，使其回退到估值。
   * 用于展开/折叠切换后，已被裁剪的旧展开月份无法从 DOM 重测，
   * 需要清除其在 map 中的（含展开卡的）旧高度。
   */
  function invalidateMonthHeight(yearMonth) {
    monthHeightMap.delete(yearMonth)
  }

  return {
    metricsVersion,
    scheduleMeasure,
    cancelMeasure,
    getAverageMonthHeight,
    getAverageYearHeaderHeight: () => measuredYearHeaderHeight,
    offsetOfMonth,
    monthAtOffset,
    invalidateMonthHeight
  }
}
