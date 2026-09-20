<template>
  <AppSheet
    :model-value="modelValue"
    sheet-class="event-date-sheet"
    size="wide"
    :close-on-overlay="false"
    @update:model-value="(v) => { if (!v) close() }"
  >
    <div class="sheet-head">
      <p class="sheet-title">{{ t('events.dateSheet.title') }}</p>
      <p class="sheet-hint">{{ t('events.dateSheet.hint') }}</p>
    </div>

    <div class="cal-card" :class="{ 'cal-card--jumping': jumping }">
      <!-- 选月面板打开时隐藏顶栏，避免和面板内年份导航重复 -->
      <div
        v-if="!showMonthPicker"
        class="cal-toolbar"
        @pointerdown="onMonthSwipeStart"
        @pointermove="onMonthSwipeMove"
        @pointerup="onMonthSwipeEnd"
        @pointercancel="onMonthSwipeEnd"
      >
        <button type="button" class="cal-nav__btn" :aria-label="t('events.dateSheet.prevMonth')" @click.stop="shiftMonth(-1)">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M15 6L9 12L15 18" /></svg>
        </button>
        <button type="button" class="cal-nav__label" @click.stop="openMonthPicker">
          <span>{{ monthLabel }}</span>
          <svg class="cal-nav__chevron" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M7 10L12 15L17 10" />
          </svg>
        </button>
        <button type="button" class="cal-nav__btn" :aria-label="t('events.dateSheet.nextMonth')" @click.stop="shiftMonth(1)">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9 6L15 12L9 18" /></svg>
        </button>
      </div>

      <div
        v-if="!showMonthPicker"
        class="cal-weekdays"
        aria-hidden="true"
        @pointerdown="onMonthSwipeStart"
        @pointermove="onMonthSwipeMove"
        @pointerup="onMonthSwipeEnd"
        @pointercancel="onMonthSwipeEnd"
      >
        <span v-for="w in weekdayLabels" :key="w">{{ w }}</span>
      </div>

      <div v-if="showMonthPicker" class="month-picker">
        <p class="month-picker__title">{{ t('events.dateSheet.pickMonth') }}</p>
        <div class="month-picker__year">
          <button type="button" class="cal-nav__btn" :aria-label="t('events.dateSheet.prevYear')" @click="pickerYear -= 1">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M15 6L9 12L15 18" /></svg>
          </button>
          <span class="month-picker__year-label">{{ t('events.dateSheet.yearLabel', { year: pickerYear }) }}</span>
          <button type="button" class="cal-nav__btn" :aria-label="t('events.dateSheet.nextYear')" @click="pickerYear += 1">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9 6L15 12L9 18" /></svg>
          </button>
        </div>
        <div class="month-picker__grid">
          <button
            v-for="m in 12"
            :key="m"
            type="button"
            class="month-picker__cell"
            :class="{
              'month-picker__cell--active': pickerYear === viewYear && m === viewMonth,
              'month-picker__cell--today': pickerYear === todayYear && m === todayMonth
            }"
            @click="pickMonth(pickerYear, m)"
          >
            {{ t('events.dateSheet.monthShort', { month: m }) }}
          </button>
        </div>
        <div class="month-picker__actions">
          <button type="button" class="month-picker__today" @click="pickMonth(todayYear, todayMonth)">
            {{ t('events.dateSheet.backToToday') }}
          </button>
          <button type="button" class="month-picker__close" @click="showMonthPicker = false">
            {{ t('events.dateSheet.closePicker') }}
          </button>
        </div>
      </div>

      <div
        v-else
        ref="stageRef"
        class="cal-stage"
        @pointerdown="onGridPointerDown"
        @pointermove="onGridPointerMove"
        @pointerup="onGridPointerUp"
        @pointercancel="onGridPointerUp"
      >
        <!-- 三页轨道：左=上月，中=当前，右=下月；整页滑动与月卡日历一致 -->
        <div class="cal-track" :style="trackStyle">
          <div v-for="page in trackPages" :key="page.key" class="cal-page">
            <div class="cal-grid">
              <button
                v-for="(cell, idx) in page.cells"
                :key="`${page.key}-${cell || `pad-${idx}`}`"
                type="button"
                class="cal-day"
                :class="dayClass(cell)"
                :data-date="cell || ''"
                :disabled="!cell"
              >
                <span v-if="cell">{{ Number(cell.slice(8)) }}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="selection-summary">
      <span class="selection-summary__label">{{ summaryLabel }}</span>
      <button v-if="draftDates.length" type="button" class="selection-clear" @click="clearSelection">
        {{ t('common.clear') }}
      </button>
    </div>

    <button type="button" class="sheet-apply" @click="confirm">{{ t('common.confirm') }}</button>
    <button type="button" class="sheet-cancel" @click="close">{{ t('common.cancel') }}</button>
  </AppSheet>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import AppSheet from '@/components/common/AppSheet.vue'
import { useDialogBackButton } from '@/composables/useDialogBackButton'
import {
  addDays,
  buildMonthCells,
  isFullContinuousRange,
  normalizeSelectedDates,
  selectionToEventDates
} from '@/utils/events/eventDates'
import { isDateStr } from '@/utils/events/dayTickets'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  startDate: { type: String, default: '' },
  endDate: { type: String, default: '' },
  selectedDates: { type: Array, default: () => [] }
})

const emit = defineEmits(['update:modelValue', 'confirm'])

const { t } = useI18n()

const todayStr = formatDateLocal(new Date())
const todayYear = Number(todayStr.slice(0, 4))
const todayMonth = Number(todayStr.slice(5, 7))

const viewYear = ref(todayYear)
const viewMonth = ref(todayMonth)
const draftDates = ref([])
const dragAnchor = ref('')
const isDragging = ref(false)
const dragMoved = ref(false)
const dragTarget = ref('')

const showMonthPicker = ref(false)
const pickerYear = ref(todayYear)
const jumping = ref(false)
const stageRef = ref(null)
const stageWidth = ref(0)

/** 相对「当前月居中」的位移：+右滑看上月，-左滑看下月 */
const trackOffset = ref(0)
const trackTransition = ref('')

const monthSwipe = ref({
  active: false,
  startX: 0,
  startY: 0,
  deltaX: 0,
  lockedAxis: '',
  pointerId: null,
  captured: false
})
let animTimer = null

function formatDateLocal(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function cellsFor(y, m) {
  const list = buildMonthCells(y, m)
  while (list.length < 42) list.push(null)
  return list.slice(0, 42)
}

function shiftYearMonth(y, m, delta) {
  let year = y
  let month = m + delta
  while (month < 1) {
    month += 12
    year -= 1
  }
  while (month > 12) {
    month -= 12
    year += 1
  }
  return { y: year, m: month }
}

const trackPages = computed(() => {
  const prev = shiftYearMonth(viewYear.value, viewMonth.value, -1)
  const next = shiftYearMonth(viewYear.value, viewMonth.value, 1)
  return [
    { key: `${prev.y}-${prev.m}`, year: prev.y, month: prev.m, cells: cellsFor(prev.y, prev.m) },
    { key: `${viewYear.value}-${viewMonth.value}`, year: viewYear.value, month: viewMonth.value, cells: cellsFor(viewYear.value, viewMonth.value) },
    { key: `${next.y}-${next.m}`, year: next.y, month: next.m, cells: cellsFor(next.y, next.m) }
  ]
})

/** 中页居中：用百分比（-1/3 轨道宽）而不是测量值，避免宽度量错导致整页空白 */
const trackStyle = computed(() => ({
  transform: `translate3d(calc(-33.3333% + ${trackOffset.value}px), 0, 0)`,
  transition: trackTransition.value || 'none',
  willChange: 'transform'
}))

const monthLabel = computed(() => t('events.dateSheet.monthLabel', {
  year: viewYear.value,
  month: viewMonth.value
}))

const weekdayLabels = computed(() => [
  t('events.dateSheet.week.sun'),
  t('events.dateSheet.week.mon'),
  t('events.dateSheet.week.tue'),
  t('events.dateSheet.week.wed'),
  t('events.dateSheet.week.thu'),
  t('events.dateSheet.week.fri'),
  t('events.dateSheet.week.sat')
])

const selectedSet = computed(() => new Set(draftDates.value))

const previewRange = computed(() => {
  if (!isDragging.value || !dragAnchor.value || !dragMoved.value) return []
  return expandBetween(dragAnchor.value, dragTarget.value)
})

function expandBetween(a, b) {
  if (!isDateStr(a) || !isDateStr(b)) return a ? [a] : []
  const [from, to] = a <= b ? [a, b] : [b, a]
  const out = []
  let cur = from
  let guard = 0
  while (guard < 31) {
    out.push(cur)
    if (cur === to) break
    const next = addDays(cur, 1)
    if (!next || next <= cur) break
    cur = next
    guard += 1
  }
  return out
}

function isContinuousSelection(dates) {
  const sorted = normalizeSelectedDates(dates)
  if (sorted.length <= 1) return true
  return isFullContinuousRange(sorted, sorted[0], sorted[sorted.length - 1])
}

const summaryLabel = computed(() => {
  const sorted = normalizeSelectedDates(draftDates.value)
  if (!sorted.length) return t('events.dateSheet.summaryEmpty')
  if (isContinuousSelection(sorted)) {
    if (sorted.length === 1) return t('events.dateSheet.summaryRange', { start: sorted[0], end: sorted[0] })
    return t('events.dateSheet.summaryRange', { start: sorted[0], end: sorted[sorted.length - 1] })
  }
  return t('events.dateSheet.summaryDays', { count: sorted.length })
})

function dayClass(cell) {
  if (!cell) return {}
  const inPreview = previewRange.value.includes(cell)
  const selected = selectedSet.value.has(cell)
  return {
    'cal-day--selected': selected || inPreview,
    'cal-day--today': cell === todayStr
  }
}

function clearAnimTimer() {
  if (animTimer) {
    clearTimeout(animTimer)
    animTimer = null
  }
}

function measureStage() {
  const el = stageRef.value
  if (!el) return
  const width = el.getBoundingClientRect().width
  if (width > 0) stageWidth.value = width
}

function pageWidth() {
  measureStage()
  return stageWidth.value
    || stageRef.value?.getBoundingClientRect().width
    || document.querySelector('.event-date-sheet .cal-stage')?.getBoundingClientRect().width
    || 0
}

let stageResizeObserver = null

function bindStageObserver() {
  if (typeof ResizeObserver === 'undefined') return
  const el = stageRef.value
  if (!el) return
  stageResizeObserver?.disconnect()
  stageResizeObserver = new ResizeObserver(() => {
    measureStage()
  })
  stageResizeObserver.observe(el)
}

watch(stageRef, (el) => {
  if (el) {
    measureStage()
    bindStageObserver()
  }
})

function applyMonthDelta(delta) {
  const next = shiftYearMonth(viewYear.value, viewMonth.value, delta)
  viewYear.value = next.y
  viewMonth.value = next.m
}

function shiftMonth(delta) {
  animateMonthSwipe(delta > 0 ? 'next' : 'prev')
}

/**
 * 整页滑动：百分比居中 + 像素位移一屏。
 * 量不到宽度时用 CSS 变量动画兜底，避免空白。
 */
function animateMonthSwipe(direction) {
  clearAnimTimer()
  showMonthPicker.value = false
  nextTick(() => {
    measureStage()
    const width = pageWidth()
    const sign = direction === 'next' ? -1 : 1

    if (width > 0) {
      trackTransition.value = 'transform 240ms cubic-bezier(0.22, 0.8, 0.3, 1)'
      trackOffset.value = sign * width
    } else {
      // 兜底：直接切月，不依赖位移动画
      applyMonthDelta(direction === 'next' ? 1 : -1)
      trackTransition.value = 'none'
      trackOffset.value = 0
      return
    }

    animTimer = setTimeout(() => {
      applyMonthDelta(direction === 'next' ? 1 : -1)
      trackTransition.value = 'none'
      trackOffset.value = 0
      nextTick(measureStage)
      animTimer = null
    }, 240)
  })
}

function openMonthPicker() {
  pickerYear.value = viewYear.value
  showMonthPicker.value = true
  clearAnimTimer()
  trackTransition.value = 'none'
  trackOffset.value = 0
}

function pickMonth(year, month) {
  showMonthPicker.value = false
  clearAnimTimer()
  jumping.value = true
  trackTransition.value = 'none'
  trackOffset.value = 0
  window.setTimeout(() => {
    viewYear.value = Number(year)
    viewMonth.value = Number(month)
    window.setTimeout(() => {
      jumping.value = false
    }, 160)
  }, 100)
}

/** 顶栏/星期行左右拖 → 整页翻月；按钮上不抢 click */
function onMonthSwipeStart(e) {
  if (showMonthPicker.value) return
  if (e.target?.closest?.('.cal-nav__btn')) return

  clearAnimTimer()
  measureStage()
  monthSwipe.value = {
    active: true,
    startX: e.clientX,
    startY: e.clientY,
    deltaX: 0,
    lockedAxis: '',
    pointerId: e.pointerId,
    captured: false
  }
}

function onMonthSwipeMove(e) {
  const s = monthSwipe.value
  if (!s.active) return
  const dx = e.clientX - s.startX
  const dy = e.clientY - s.startY
  if (!s.lockedAxis && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) {
    s.lockedAxis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'
    if (s.lockedAxis === 'x') {
      try { e.currentTarget?.setPointerCapture?.(e.pointerId) } catch { /* ignore */ }
      s.captured = true
    }
  }
  if (s.lockedAxis !== 'x') return
  s.deltaX = dx
  trackTransition.value = 'none'
  trackOffset.value = dx
}

function onMonthSwipeEnd(e) {
  const s = monthSwipe.value
  if (!s.active) return
  const dx = s.deltaX
  const width = pageWidth() || 300
  const captured = s.captured
  const pointerId = s.pointerId
  monthSwipe.value = { active: false, startX: 0, startY: 0, deltaX: 0, lockedAxis: '', pointerId: null, captured: false }
  if (captured) {
    try { e.currentTarget?.releasePointerCapture?.(pointerId) } catch { /* ignore */ }
  }

  const passed = Math.abs(dx) > Math.min(width * 0.22, 88)
  if (s.lockedAxis === 'x' && passed) {
    animateMonthSwipe(dx < 0 ? 'next' : 'prev')
    return
  }

  trackTransition.value = 'transform 200ms cubic-bezier(0.22, 1, 0.36, 1)'
  trackOffset.value = 0
  animTimer = setTimeout(() => {
    trackTransition.value = ''
    animTimer = null
  }, 200)
}

function seedFromProps() {
  const selected = normalizeSelectedDates(props.selectedDates)
  if (selected.length > 0) {
    draftDates.value = [...selected]
  } else if (props.startDate) {
    const start = props.startDate
    const end = isDateStr(props.endDate) && props.endDate >= start ? props.endDate : start
    draftDates.value = expandBetween(start, end)
  } else {
    draftDates.value = []
  }
  const focus = draftDates.value[0] || todayStr
  viewYear.value = Number(focus.slice(0, 4))
  viewMonth.value = Number(focus.slice(5, 7))
  pickerYear.value = viewYear.value
  showMonthPicker.value = false
  jumping.value = false
  trackOffset.value = 0
  trackTransition.value = ''
  dragAnchor.value = ''
  dragTarget.value = ''
  isDragging.value = false
  dragMoved.value = false
  nextTick(measureStage)
}

watch(
  () => props.modelValue,
  async (open) => {
    if (open) {
      seedFromProps()
      await nextTick()
      measureStage()
      await nextTick()
      measureStage()
    }
  },
  { immediate: true }
)

watch(showMonthPicker, (open) => {
  if (!open) {
    nextTick(() => {
      measureStage()
      bindStageObserver()
    })
  }
})

function dateFromPoint(x, y) {
  const el = typeof document !== 'undefined' ? document.elementFromPoint(x, y) : null
  const day = el?.closest?.('[data-date]')
  return String(day?.getAttribute?.('data-date') || '')
}

function onGridPointerDown(e) {
  if (showMonthPicker.value) return
  const cell = dateFromPoint(e.clientX, e.clientY)
  if (!isDateStr(cell)) return
  e.preventDefault()
  try { e.currentTarget?.setPointerCapture?.(e.pointerId) } catch { /* ignore */ }
  isDragging.value = true
  dragMoved.value = false
  dragAnchor.value = cell
  dragTarget.value = cell
}

function onGridPointerMove(e) {
  if (!isDragging.value) return
  const cell = dateFromPoint(e.clientX, e.clientY)
  if (!isDateStr(cell)) return
  if (!dragMoved.value && cell === dragAnchor.value) return
  if (cell !== dragAnchor.value) dragMoved.value = true
  dragTarget.value = cell
  if (dragMoved.value) {
    draftDates.value = expandBetween(dragAnchor.value, cell)
  }
}

function onGridPointerUp(e) {
  if (!isDragging.value) return
  const moved = dragMoved.value
  const anchor = dragAnchor.value
  const host = e.currentTarget
  const pid = e.pointerId
  isDragging.value = false
  dragMoved.value = false
  dragAnchor.value = ''
  dragTarget.value = ''
  try { host?.releasePointerCapture?.(pid) } catch { /* ignore */ }

  if (moved || !anchor) return
  const set = new Set(draftDates.value)
  if (set.has(anchor)) set.delete(anchor)
  else set.add(anchor)
  draftDates.value = normalizeSelectedDates([...set])
}

function clearSelection() {
  draftDates.value = []
  dragAnchor.value = ''
  dragTarget.value = ''
}

function confirm() {
  emit('confirm', selectionToEventDates(draftDates.value))
  close()
}

function close() {
  emit('update:modelValue', false)
}

onBeforeUnmount(() => {
  clearAnimTimer()
  stageResizeObserver?.disconnect()
  stageResizeObserver = null
})

useDialogBackButton(close, () => props.modelValue)
</script>

<style scoped>
.sheet-head {
  margin-bottom: 12px;
}

.sheet-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--app-text-tertiary, #8e8e93);
  text-align: center;
  margin: 0 0 6px;
}

.sheet-hint {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--app-text-tertiary, #8e8e93);
  text-align: center;
}

.cal-card {
  background: color-mix(in srgb, var(--app-glass) 76%, var(--app-surface));
  border: 1px solid color-mix(in srgb, var(--app-border) 78%, transparent);
  border-radius: 18px;
  padding: 10px 10px 16px;
  margin-bottom: 10px;
  overflow: hidden;
  transition: opacity 160ms ease, transform 160ms ease;
}

.cal-card--jumping {
  opacity: 0.28;
  transform: translateY(4px);
}

.cal-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
  padding: 0 2px;
  touch-action: pan-y;
  user-select: none;
  -webkit-user-select: none;
}

.cal-nav__btn {
  width: 36px;
  height: 36px;
  border: none;
  border-radius: 10px;
  background: transparent;
  color: var(--app-text);
  display: grid;
  place-items: center;
  cursor: pointer;
  flex: 0 0 auto;
}

.cal-nav__btn svg {
  width: 20px;
  height: 20px;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.cal-nav__label {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  min-width: 0;
  flex: 1;
  border: none;
  background: transparent;
  color: var(--app-text);
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  padding: 8px 6px;
  border-radius: 10px;
}

.cal-nav__label:active {
  background: color-mix(in srgb, var(--app-text) 8%, transparent);
}

.cal-nav__chevron {
  width: 16px;
  height: 16px;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
  opacity: 0.7;
}

.cal-weekdays {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  margin-bottom: 4px;
  touch-action: pan-y;
  user-select: none;
  -webkit-user-select: none;
}

.cal-weekdays span {
  text-align: center;
  font-size: 11px;
  color: var(--app-text-tertiary, #8e8e93);
  padding: 4px 0;
}

.cal-stage {
  overflow: hidden;
  border-radius: 12px;
  width: 100%;
  /* 固定 6 行日高，不依赖 aspect-ratio，避免布局塌掉 */
  height: 248px;
  box-sizing: border-box;
  touch-action: pan-y;
  user-select: none;
  -webkit-user-select: none;
}

.cal-track {
  display: flex;
  width: 300%;
  height: 100%;
  will-change: transform;
}

.cal-page {
  width: calc(100% / 3);
  flex: 0 0 calc(100% / 3);
  height: 100%;
  box-sizing: border-box;
}

.cal-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  grid-template-rows: repeat(6, 1fr);
  gap: 2px;
  width: 100%;
  height: 100%;
}

.cal-day {
  width: 100%;
  height: 100%;
  min-height: 0;
  border: none;
  border-radius: 10px;
  background: transparent;
  color: var(--app-text);
  font-size: 14px;
  font-weight: 500;
  display: grid;
  place-items: center;
  cursor: pointer;
  padding: 0;
  -webkit-user-select: none;
  user-select: none;
  -webkit-touch-callout: none;
}

.cal-day:disabled {
  cursor: default;
  visibility: hidden;
  pointer-events: none;
}

.cal-day--today {
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--app-text) 22%, transparent);
}

.cal-day--selected {
  background: var(--app-text);
  color: var(--app-surface);
  overflow: hidden;
}

:global(html.theme-dark) .cal-day--selected {
  background: #f5f5f7;
  color: #141416;
}

/* ---- 快速选月 ---- */
.month-picker {
  padding: 2px 2px 2px;
  min-height: 248px;
  box-sizing: border-box;
}

.month-picker__title {
  text-align: center;
  font-size: 13px;
  font-weight: 600;
  color: var(--app-text);
  margin: 0 0 10px;
}

.month-picker__year {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.month-picker__year-label {
  font-size: 15px;
  font-weight: 700;
  color: var(--app-text);
}

.month-picker__grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
  margin-bottom: 12px;
}

.month-picker__cell {
  height: 42px;
  border-radius: 12px;
  border: 1px solid color-mix(in srgb, var(--app-border) 70%, transparent);
  background: color-mix(in srgb, var(--app-surface) 80%, var(--app-glass));
  color: var(--app-text);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.month-picker__cell--today {
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--app-text) 28%, transparent);
}

.month-picker__cell--active {
  background: var(--app-text);
  color: var(--app-surface);
  border-color: transparent;
}

:global(html.theme-dark) .month-picker__cell--active {
  background: #f5f5f7;
  color: #141416;
}

.month-picker__actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.month-picker__today,
.month-picker__close {
  height: 40px;
  border-radius: 12px;
  border: 1px solid color-mix(in srgb, var(--app-border) 72%, transparent);
  background: color-mix(in srgb, var(--app-glass) 70%, var(--app-surface));
  color: var(--app-text);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.month-picker__today {
  background: var(--app-text);
  color: var(--app-surface);
  border-color: transparent;
}

:global(html.theme-dark) .month-picker__today {
  background: #f5f5f7;
  color: #141416;
}

.selection-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 28px;
  margin: 0 2px 10px;
}

.selection-summary__label {
  font-size: 12px;
  color: var(--app-text-tertiary, #8e8e93);
  line-height: 1.4;
}

.selection-clear {
  border: none;
  background: transparent;
  color: var(--app-text);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  padding: 4px 6px;
}

.sheet-apply {
  height: 54px;
  width: 100%;
  border: none;
  border-radius: 18px;
  background: var(--app-text);
  color: var(--app-surface);
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 8px;
  cursor: pointer;
}

.sheet-apply:active {
  opacity: 0.85;
}

.sheet-cancel {
  height: 54px;
  width: 100%;
  border: none;
  border-radius: 18px;
  background: color-mix(in srgb, var(--app-glass) 78%, var(--app-surface));
  border: 1px solid color-mix(in srgb, var(--app-border) 72%, transparent);
  font-size: 16px;
  font-weight: 600;
  color: var(--app-text);
  cursor: pointer;
}

.sheet-cancel:active {
  background: rgba(142, 142, 147, 0.18);
}

:global(.app-sheet-overlay--center) .sheet-cancel {
  display: none;
}

:global(html.theme-dark) .cal-card {
  background: color-mix(in srgb, var(--app-glass) 58%, var(--app-surface));
}

:global(html.theme-dark) .sheet-apply {
  background: #f5f5f7;
  color: #141416;
}

:global(html.theme-dark) .sheet-cancel {
  background: color-mix(in srgb, var(--app-glass) 58%, var(--app-surface));
}
</style>
