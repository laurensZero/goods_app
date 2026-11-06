import { computed } from 'vue'
import { getItemSpendEntries } from '@/utils/goods/statistics'
import { getTimelineSourceDates } from './useHomeTimeline'

const EXCLUDED_VALUE_STATUSES = new Set(['已赠出', '已出', '丢失'])

function toLocalDateKey(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * 构建吃谷日历数据：以「日」为单位聚合金额与条目。
 * - 金额：官方花费口径 getItemSpendEntries（与时间线月合计/预算/统计一致），
 *   逐份日期各自计入对应日期；无同月入手记录的独立运费条目没有明确日期，不计入任何一天。
 * - 条目：逐份入手日期（getTimelineSourceDates），同一商品同一天多份只出一条，
 *   份数信息由 dayItem.qty 提供；当天所有份数均显式标注已出/已赠出/丢失时置灰
 *   （isExcluded），未标注状态的份按已拥有计。
 * @param {object[]} goodsList
 * @returns {Map<string, { total: number, items: Array<{ item: object, qty: number, isExcluded: boolean }> }>}
 */
export function buildCalendarDayData(goodsList) {
  const dayMap = new Map()

  if (!Array.isArray(goodsList)) return dayMap

  for (const item of goodsList) {
    if (item?.isWishlist) continue

    const dates = getTimelineSourceDates(item)
    if (dates.length === 0) continue

    const unitStatuses = Array.isArray(item?.unitCollectStatusList) ? item.unitCollectStatusList : []

    // 金额：官方花费明细按日汇总
    const spendByDate = new Map()
    for (const { date, price } of getItemSpendEntries(item)) {
      const key = toLocalDateKey(date)
      spendByDate.set(key, (spendByDate.get(key) || 0) + price)
    }

    // 条目：逐份日期按天分组，同一天多份合并为一条
    const copiesByDate = new Map()
    for (let i = 0; i < dates.length; i++) {
      const date = dates[i]
      let bucket = copiesByDate.get(date)
      if (!bucket) {
        bucket = { qty: 0, statuses: [], hasUnnamed: false }
        copiesByDate.set(date, bucket)
      }
      bucket.qty += 1
      const status = String(unitStatuses[i] || '').trim()
      if (status) {
        bucket.statuses.push(status)
      } else if (unitStatuses.length > 0) {
        // 有逐份状态列表但这一份没标注：按已拥有计；
        // 整个列表都缺失时走下面的顶层状态回退
        bucket.hasUnnamed = true
      }
    }

    for (const [date, bucket] of copiesByDate) {
      let dayData = dayMap.get(date)
      if (!dayData) {
        dayData = { total: 0, items: [] }
        dayMap.set(date, dayData)
      }

      dayData.total += spendByDate.get(date) || 0
      // 未标注状态的份按已拥有计（与 normalizeCollectStatus 默认一致）：
      // 整件已赠出后补货的新份不该被置灰
      let isExcluded
      if (bucket.hasUnnamed) {
        isExcluded = false
      } else if (bucket.statuses.length > 0) {
        isExcluded = bucket.statuses.every((status) => EXCLUDED_VALUE_STATUSES.has(status))
      } else {
        isExcluded = EXCLUDED_VALUE_STATUSES.has(String(item?.collectStatus || '').trim())
      }
      dayData.items.push({ item, qty: bucket.qty, isExcluded })
    }
  }

  // 日内条目按 id 固定排序：首页排序方式变化不该让同一天的缩略图重挂载抖动
  for (const dayData of dayMap.values()) {
    dayData.items.sort((a, b) => String(a.item.id).localeCompare(String(b.item.id)))
  }

  return dayMap
}

/**
 * 吃谷日历：按日聚合收藏花费。数据跟随首页当前的筛选/分组结果（displayList）。
 * @returns {{ calendarDayData: import('vue').ComputedRef<Map> }}
 */
export function useHomeCalendar({ displayList, displayDensity }) {
  const calendarDayData = computed(() => {
    if (displayDensity.value !== 'calendar') return new Map()
    return buildCalendarDayData(displayList.value)
  })

  return { calendarDayData }
}
