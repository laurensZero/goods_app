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

    <div class="cal-card">
      <div class="cal-nav">
        <button type="button" class="cal-nav__btn" :aria-label="t('events.dateSheet.prevMonth')" @click="shiftMonth(-1)">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M15 6L9 12L15 18" /></svg>
        </button>
        <span class="cal-nav__label">{{ monthLabel }}</span>
        <button type="button" class="cal-nav__btn" :aria-label="t('events.dateSheet.nextMonth')" @click="shiftMonth(1)">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9 6L15 12L9 18" /></svg>
        </button>
      </div>

      <div class="cal-weekdays" aria-hidden="true">
        <span v-for="w in weekdayLabels" :key="w">{{ w }}</span>
      </div>

      <div
        class="cal-grid"
        @pointerdown="onGridPointerDown"
        @pointermove="onGridPointerMove"
        @pointerup="onGridPointerUp"
        @pointercancel="onGridPointerUp"
      >
        <button
          v-for="(cell, idx) in cells"
          :key="cell || `pad-${idx}`"
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
import { computed, ref, watch } from 'vue'
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
const viewYear = ref(Number(todayStr.slice(0, 4)))
const viewMonth = ref(Number(todayStr.slice(5, 7)))
const draftDates = ref([])
const dragAnchor = ref('')
const isDragging = ref(false)
const dragMoved = ref(false)

function formatDateLocal(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const cells = computed(() => buildMonthCells(viewYear.value, viewMonth.value))

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

// 拖选中的连续段（anchor → 当前），与已点选的天并排高亮
const previewRange = computed(() => {
  if (!isDragging.value || !dragAnchor.value || !dragMoved.value) return []
  return expandBetween(dragAnchor.value, dragTarget.value)
})

const dragTarget = ref('')

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
    'cal-day--selected': (selected || inPreview),
    'cal-day--today': cell === todayStr
  }
}

function shiftMonth(delta) {
  let y = viewYear.value
  let m = viewMonth.value + delta
  if (m < 1) {
    m = 12
    y -= 1
  } else if (m > 12) {
    m = 1
    y += 1
  }
  viewYear.value = y
  viewMonth.value = m
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
  dragAnchor.value = ''
  dragTarget.value = ''
  isDragging.value = false
  dragMoved.value = false
}

watch(
  () => props.modelValue,
  (open) => {
    if (open) seedFromProps()
  },
  { immediate: true }
)

function dateFromPoint(x, y) {
  const el = typeof document !== 'undefined' ? document.elementFromPoint(x, y) : null
  const day = el?.closest?.('[data-date]')
  return String(day?.getAttribute?.('data-date') || '')
}

/**
 * 统一手势（触屏滑动 / PC 鼠标按住拖动）：
 * - 点选（无拖动）→ 切换该天（可点出不连续的几天）
 * - 滑选（按下后移到别的天）→ 从锚点到当前的连续段
 */
function onGridPointerDown(e) {
  const host = e.currentTarget
  const cell = String(host && e.target?.closest?.('[data-date]')?.getAttribute?.('data-date') || '')
    || dateFromPoint(e.clientX, e.clientY)
  if (!isDateStr(cell)) return
  e.preventDefault()
  try { host?.setPointerCapture?.(e.pointerId) } catch { /* ignore */ }
  isDragging.value = true
  dragMoved.value = false
  dragAnchor.value = cell
  dragTarget.value = cell
}

function onGridPointerMove(e) {
  if (!isDragging.value) return
  // pointer capture 后 target 可能一直是 grid，用坐标反查日期格
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
  // 连续一段 → start-end；不连续 → selectedDates
  emit('confirm', selectionToEventDates(draftDates.value))
  close()
}

function close() {
  emit('update:modelValue', false)
}

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
  padding: 12px 10px 14px;
  margin-bottom: 10px;
}

.cal-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
  padding: 0 4px;
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
  font-size: 15px;
  font-weight: 600;
  color: var(--app-text);
}

.cal-weekdays {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  margin-bottom: 4px;
}

.cal-weekdays span {
  text-align: center;
  font-size: 11px;
  color: var(--app-text-tertiary, #8e8e93);
  padding: 4px 0;
}

.cal-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 2px;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
}

.cal-day {
  aspect-ratio: 1;
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
}

.cal-day--today {
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--app-text) 22%, transparent);
}

.cal-day--selected {
  background: var(--app-text);
  color: var(--app-surface);
}

:global(html.theme-dark) .cal-day--selected {
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
