import { onBeforeUnmount } from 'vue'

const WHEEL_STEP_PX = 40
const WHEEL_IDLE_MS = 180

/**
 * 给 Vant 日期/时间滚轮补 PC 鼠标滚轮。
 * DatePicker 只暴露 confirm/getSelectedDate，因此按列直接步进 modelValue。
 *
 * @param {import('vue').Ref} valuesRef 当前选中值（date: [y,m,d]；time: [hh,mm]）
 * @param {object} options
 * @param {number} options.minYear
 * @param {number} options.maxYear
 * @param {Date} [options.minDate]
 * @param {Date} [options.maxDate]
 * @param {number} [options.minHour]
 * @param {number} [options.maxHour]
 * @param {number} [options.minMinute]
 * @param {number} [options.maxMinute]
 * @param {string} [options.mode] 'date' | 'time'
 */
export function usePickerWheel(valuesRef, options = {}) {
  let accum = 0
  let idleTimer = 0

  function resetAccumSoon() {
    if (idleTimer) window.clearTimeout(idleTimer)
    idleTimer = window.setTimeout(() => {
      accum = 0
      idleTimer = 0
    }, WHEEL_IDLE_MS)
  }

  function columnIndexFromEvent(event) {
    const columnEl = event.target?.closest?.('.van-picker-column')
    if (!columnEl) return -1
    const parent = columnEl.parentElement
    if (!parent) return -1
    return [...parent.children].indexOf(columnEl)
  }

  function toDateParts(list) {
    const [year, month, day] = Array.isArray(list) ? list : []
    const now = new Date()
    return {
      year: Number(year) || now.getFullYear(),
      month: Number(month) || now.getMonth() + 1,
      day: Number(day) || now.getDate()
    }
  }

  function toTimeParts(list) {
    const [hour, minute] = Array.isArray(list) ? list : []
    const now = new Date()
    return {
      hour: Number(hour) || now.getHours(),
      minute: Number(minute) || now.getMinutes()
    }
  }

  function formatDateValue(date) {
    const pad = (n) => String(n).padStart(2, '0')
    return [
      String(date.getFullYear()),
      pad(date.getMonth() + 1),
      pad(date.getDate())
    ]
  }

  function formatTimeValue(hour, minute) {
    const pad = (n) => String(n).padStart(2, '0')
    return [pad(hour), pad(minute)]
  }

  function daysInMonth(year, month) {
    return new Date(year, month, 0).getDate()
  }

  function stepDate(columnIndex, direction) {
    const { year, month, day } = toDateParts(valuesRef.value)
    const minDate = options.minDate instanceof Date && !Number.isNaN(options.minDate.getTime())
      ? options.minDate
      : null
    const maxDate = options.maxDate instanceof Date && !Number.isNaN(options.maxDate.getTime())
      ? options.maxDate
      : null

    let nextYear = year
    let nextMonth = month
    let nextDay = day

    if (columnIndex === 0) {
      nextYear = year + direction
      if (minDate) nextYear = Math.max(minDate.getFullYear(), nextYear)
      if (maxDate) nextYear = Math.min(maxDate.getFullYear(), nextYear)
      if (nextYear === year) return
      // 2/29 → 非闰年 2/28，不借月
      nextDay = Math.min(day, daysInMonth(nextYear, nextMonth))
    } else if (columnIndex === 1) {
      nextMonth = month + direction
      // 上/下都夹在 1–12，绝不滚进邻年
      if (nextMonth < 1 || nextMonth > 12) return
      if (minDate && nextYear === minDate.getFullYear() && nextMonth < minDate.getMonth() + 1) return
      if (maxDate && nextYear === maxDate.getFullYear() && nextMonth > maxDate.getMonth() + 1) return
      nextDay = Math.min(day, daysInMonth(nextYear, nextMonth))
    } else if (columnIndex === 2) {
      nextDay = day + direction
      // 上/下都夹在当月，绝不滚进邻月
      const maxDay = daysInMonth(nextYear, nextMonth)
      if (nextDay < 1 || nextDay > maxDay) return
    } else {
      return
    }

    const candidate = new Date(nextYear, nextMonth - 1, nextDay)
    // 贴 min/max 时保持当前值，不静默跳到边界日
    if (minDate && candidate.getTime() < minDate.getTime()) return
    if (maxDate && candidate.getTime() > maxDate.getTime()) return

    valuesRef.value = formatDateValue(candidate)
  }

  function stepTime(columnIndex, direction) {
    const { hour, minute } = toTimeParts(valuesRef.value)
    const minHour = options.minHour ?? 0
    const maxHour = options.maxHour ?? 23
    const minMinute = options.minMinute ?? 0
    const maxMinute = options.maxMinute ?? 59

    if (columnIndex === 0) {
      const nextHour = hour + direction
      // 上/下都夹住，0 点不跳 23 点
      if (nextHour < minHour || nextHour > maxHour) return
      valuesRef.value = formatTimeValue(nextHour, minute)
      return
    }

    if (columnIndex === 1) {
      const nextMinute = minute + direction
      if (nextMinute < minMinute || nextMinute > maxMinute) return
      valuesRef.value = formatTimeValue(hour, nextMinute)
    }
  }

  function onWheel(event) {
    const columnIndex = columnIndexFromEvent(event)
    if (columnIndex < 0) return

    // 阻止页面跟着滚
    event.preventDefault()

    accum += event.deltaY
    if (Math.abs(accum) < WHEEL_STEP_PX) return

    const direction = accum > 0 ? 1 : -1
    accum = 0
    resetAccumSoon()

    if (options.mode === 'time') {
      stepTime(columnIndex, direction)
    } else {
      stepDate(columnIndex, direction)
    }
  }

  onBeforeUnmount(() => {
    if (idleTimer) {
      window.clearTimeout(idleTimer)
      idleTimer = 0
    }
  })

  return { onWheel }
}
