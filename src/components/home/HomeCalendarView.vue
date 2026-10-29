<template>
  <div class="cal-wrapper">
    <div class="cal-card">
      <Transition :name="slideTransitionName" mode="out-in">
        <div class="cal-months" :class="{ 'cal-months--double': isDoubleMonth }" :key="monthsKey">
          <div v-for="monthView in visibleMonthViews" :key="monthView.yearMonth" class="cal-month">
          <div class="cal-header">
            <button
              v-if="monthView.isFirst"
              type="button"
              class="cal-nav-btn"
              :aria-label="t('home.calendar.prevMonth')"
              @click="shiftMonth(-1)"
            >
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M14.5 6L8.5 12L14.5 18" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </button>
            <span v-else class="cal-nav-spacer" aria-hidden="true" />

            <button type="button" class="cal-month-title" @click="openMonthPicker(monthView.yearMonth)">
              <span>{{ monthView.title }}</span>
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M7 10l5 5 5-5" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </button>

            <button
              v-if="monthView.isLast"
              type="button"
              class="cal-nav-btn"
              :aria-label="t('home.calendar.nextMonth')"
              @click="shiftMonth(1)"
            >
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M9.5 6L15.5 12L9.5 18" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </button>
            <span v-else class="cal-nav-spacer" aria-hidden="true" />
          </div>

          <div class="cal-weekdays" aria-hidden="true">
            <span v-for="index in 7" :key="index" class="cal-weekday">
              {{ t(`home.calendar.weekday${index}`) }}
            </span>
          </div>

          <div class="cal-grid" role="grid">
            <span v-for="blank in monthView.leadingBlanks" :key="`blank-${blank}`" class="cal-cell cal-cell--blank" aria-hidden="true" />
            <button
              v-for="cell in monthView.cells"
              :key="cell.dateKey"
              type="button"
              role="gridcell"
              class="cal-cell"
              :class="[
                `cal-cell--level-${cell.level}`,
                {
                  'cal-cell--selected': cell.dateKey === selectedDate,
                  'cal-cell--today': cell.dateKey === todayKey,
                  'cal-cell--future': cell.isFuture
                }
              ]"
              :aria-label="cellAriaLabel(cell)"
              @click="selectDate(cell.dateKey)"
            >
          <span class="cal-cell-day">{{ cell.day }}</span>
          <span v-if="cell.total > 0" class="cal-cell-amount">{{ formatCompactAmount(cell.total) }}</span>
          <span v-else-if="cell.hasGoods" class="cal-cell-zero-dot" aria-hidden="true" />
            </button>
            <span v-for="blank in monthView.trailingBlanks" :key="`tail-${blank}`" class="cal-cell cal-cell--blank" aria-hidden="true" />
          </div>
          </div>
        </div>
      </Transition>

      <div class="cal-legend">
        <span class="cal-legend-label">{{ t('home.calendar.legendLess') }}</span>
        <span class="cal-legend-swatch cal-legend-swatch--level-1" />
        <span class="cal-legend-swatch cal-legend-swatch--level-2" />
        <span class="cal-legend-swatch cal-legend-swatch--level-3" />
        <span class="cal-legend-swatch cal-legend-swatch--level-4" />
        <span class="cal-legend-label">{{ t('home.calendar.legendMore') }}</span>
      </div>
    </div>

    <div class="cal-day-panel">
      <div class="cal-day-header">
        <span class="cal-day-title">{{ dayTitleLabel }}</span>
        <span v-if="selectedDay.count > 0" class="cal-day-meta">
          {{ t('leaderboard.items', { count: selectedDay.count }) }}<template v-if="selectedDay.total > 0"> · {{ formatPrice(selectedDay.total) }}</template>
        </span>
      </div>

      <div v-if="selectedDay.items.length > 0" class="cal-thumb-grid">
        <button
          v-for="(dayItem, index) in selectedDay.items"
          :key="`${dayItem.item.id}::${index}`"
          type="button"
          class="tl-thumb-btn"
          :class="{ 'tl-thumb-btn--disabled': dayItem.isExcluded }"
          @click="$emit('tap-item', dayItem.item)"
        >
          <span v-if="dayItem.qty > 1" class="tl-thumb-qty-badge">×{{ dayItem.qty }}</span>
          <div class="tl-thumb-img-wrap">
            <LazyCachedImage
              v-if="dayItem.item.coverImage"
              class="tl-thumb-img"
              :src="dayItem.item.coverImage"
              :alt="dayItem.item.name"
              root-margin="120px 0px"
            />
            <div v-else class="tl-thumb-empty">{{ t('home.noTimeline') }}</div>
          </div>
        </button>
      </div>
      <p v-else class="cal-day-empty">{{ t('home.calendar.emptyDay') }}</p>
    </div>

    <AppSheet v-model="showMonthPicker" placement="auto" sheet-class="cal-month-sheet">
      <div class="cal-picker">
        <div class="cal-picker-head">
          <p class="cal-picker-label">{{ t('home.calendar.pickMonth') }}</p>
          <div class="cal-picker-year-nav">
            <button type="button" class="cal-nav-btn" :aria-label="t('home.calendar.prevYear')" @click="shiftPickerYear(-1)">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M14.5 6L8.5 12L14.5 18" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </button>
            <span class="cal-picker-year">{{ pickerYear }}</span>
            <button type="button" class="cal-nav-btn" :aria-label="t('home.calendar.nextYear')" @click="shiftPickerYear(1)">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M9.5 6L15.5 12L9.5 18" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </button>
          </div>
        </div>

        <div class="cal-picker-grid">
          <button
            v-for="month in 12"
            :key="month"
            type="button"
            class="cal-picker-month"
            :class="{
              'cal-picker-month--active': pickerYear === viewYear && month === viewMonth,
              'cal-picker-month--has-data': hasMonthData(pickerYear, month)
            }"
            @click="pickMonth(pickerYear, month)"
          >
            {{ formatMonthLabel(month) }}
            <span v-if="hasMonthData(pickerYear, month)" class="cal-picker-dot" aria-hidden="true" />
          </button>
        </div>
      </div>
    </AppSheet>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import AppSheet from '@/components/common/AppSheet.vue'
import LazyCachedImage from '@/components/image/LazyCachedImage.vue'
import { formatMonthLabel, formatPrice } from '@/utils/format'
import { useTabletViewport } from '@/composables/viewport/useTabletViewport'

const { t, locale } = useI18n()

const props = defineProps({
  // Map<dateKey 'YYYY-MM-DD', { total, items: [{ item, qty, isExcluded }] }>
  dayData: { type: Map, default: () => new Map() }
})

defineEmits(['tap-item'])

function getTodayKey() {
  return toLocalDateKey(new Date())
}

function toLocalDateKey(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const todayKey = getTodayKey()
const selectedDate = ref(todayKey)
const showMonthPicker = ref(false)
const pickerYear = ref(Number(todayKey.slice(0, 4)))

function getShiftedYearMonth(yearMonth, delta) {
  const [year, month] = yearMonth.split('-').map(Number)
  const next = new Date(year, month - 1 + delta, 1)
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`
}

// 平板等宽视口一次并排展示两个月，避免单月网格被拉得过宽
const { isTabletViewport } = useTabletViewport()
const isDoubleMonth = isTabletViewport

// 双月布局锚定左侧月份：默认显示 上个月 | 当前月，今天落在右月
const viewYearMonth = ref(isDoubleMonth.value ? getShiftedYearMonth(todayKey.slice(0, 7), -1) : todayKey.slice(0, 7))

function shiftMonth(delta) {
  slideDirection.value = delta
  // 平板双月布局：左右两个月是一整页，翻页按 2 个月步进
  const step = isDoubleMonth.value ? delta * 2 : delta
  viewYearMonth.value = getShiftedYearMonth(viewYearMonth.value, step)
}

// 翻页方向：决定滑动动画朝向
const slideDirection = ref(1)
const slideTransitionName = computed(() => (slideDirection.value >= 0 ? 'cal-slide-fwd' : 'cal-slide-back'))
const monthsKey = computed(() => visibleMonthViews.value.map((monthView) => monthView.yearMonth).join('|'))

function getMonthTitle(yearMonth) {
  const [year, month] = yearMonth.split('-').map(Number)
  return t('home.calendar.monthTitle', {
    year,
    month: formatMonthLabel(month)
  })
}

const visibleMonthViews = computed(() => {
  const yearMonths = isDoubleMonth.value
    ? [viewYearMonth.value, getShiftedYearMonth(viewYearMonth.value, 1)]
    : [viewYearMonth.value]
  return yearMonths.map((yearMonth, index) => buildMonthView(yearMonth, {
    isFirst: index === 0,
    isLast: index === yearMonths.length - 1
  }))
})

function buildMonthView(yearMonth, { isFirst, isLast }) {
  const [year, month] = yearMonth.split('-').map(Number)
  const firstDay = new Date(year, month - 1, 1).getDay()
  const leadingBlanks = (firstDay + 6) % 7 // Monday-first 网格
  const daysInMonth = new Date(year, month, 0).getDate()
  const maxTotal = getMonthMaxTotal(year, month)

  const cells = []
  for (let day = 1; day <= daysInMonth; day++) {
    const dateKey = `${yearMonth}-${String(day).padStart(2, '0')}`
    const dayInfo = props.dayData.get(dateKey)
    const total = dayInfo?.total || 0
    cells.push({
      dateKey,
      day,
      total,
      // 0 元但有谷（白嫖/已出）也要在日历上留痕
      hasGoods: (dayInfo?.items.length || 0) > 0,
      level: resolveHeatLevel(total, maxTotal),
      isFuture: dateKey > todayKey
    })
  }

  return {
    yearMonth,
    isFirst,
    isLast,
    title: getMonthTitle(yearMonth),
    leadingBlanks,
    trailingBlanks: 42 - leadingBlanks - cells.length,
    cells
  }
}

function getMonthMaxTotal(year, month) {
  const prefix = `${year}-${String(month).padStart(2, '0')}-`
  let max = 0
  for (const [dateKey, dayData] of props.dayData) {
    if (dateKey.startsWith(prefix) && dayData.total > max) {
      max = dayData.total
    }
  }
  return max
}

// 热力色阶：0 无色；有消费按 0 ~ 当月最高消费 分 4 档
function resolveHeatLevel(total, maxTotal) {
  if (!(total > 0) || !(maxTotal > 0)) return 0
  const ratio = total / maxTotal
  if (ratio > 0.75) return 4
  if (ratio > 0.5) return 3
  if (ratio > 0.25) return 2
  return 1
}

function cellAriaLabel(cell) {
  if (cell.total > 0) {
    return `${cell.dateKey} ${formatPrice(cell.total)}`
  }
  return cell.dateKey
}

function selectDate(dateKey) {
  selectedDate.value = dateKey
}

function openMonthPicker(yearMonth) {
  pickerYear.value = Number(yearMonth.slice(0, 4))
  showMonthPicker.value = true
}

const selectedDay = computed(() => {
  const dayData = props.dayData.get(selectedDate.value)
  const items = dayData?.items || []
  return {
    items,
    total: dayData?.total || 0,
    count: items.reduce((sum, dayItem) => sum + dayItem.qty, 0)
  }
})

const dayTitleLabel = computed(() => {
  const [, month, day] = selectedDate.value.split('-').map(Number)
  return t('home.calendar.dayTitle', { month, day })
})

// 金额缩写：≥1万时缩成 1.2万 / 1.2k，其余保留实际金额（最多两位小数、去尾零）
function formatCompactAmount(value) {
  const isEnglish = String(locale.value || '').startsWith('en')
  if (value >= 10000) {
    const unit = isEnglish ? 'k' : '万'
    const divisor = isEnglish ? 1000 : 10000
    const scaled = value / divisor
    const text = scaled >= 100 ? String(Math.round(scaled)) : scaled.toFixed(1).replace(/\.0$/, '')
    return `¥${text}${unit}`
  }
  const text = Number.isInteger(value)
    ? String(value)
    : value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')
  return `¥${text}`
}

function shiftPickerYear(delta) {
  const next = pickerYear.value + delta
  if (next < 1970 || next > 2100) return
  pickerYear.value = next
}

function pickMonth(year, month) {
  slideDirection.value = `${year}-${String(month).padStart(2, '0')}` >= viewYearMonth.value ? 1 : -1
  viewYearMonth.value = `${year}-${String(month).padStart(2, '0')}`
  pickerYear.value = year
  showMonthPicker.value = false
}

const viewYear = computed(() => Number(viewYearMonth.value.slice(0, 4)))
const viewMonth = computed(() => Number(viewYearMonth.value.slice(5, 7)))

function hasMonthData(year, month) {
  const prefix = `${year}-${String(month).padStart(2, '0')}-`
  for (const dateKey of props.dayData.keys()) {
    if (dateKey.startsWith(prefix)) return true
  }
  return false
}
</script>

<style scoped>
.cal-wrapper {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.cal-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px 12px 12px;
  border-radius: var(--radius-card);
  background: var(--app-surface);
  box-shadow: var(--app-shadow-sm);
}

.cal-months {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.cal-months--double {
  flex-direction: row;
  gap: 24px;
}

.cal-months--double .cal-month + .cal-month {
  border-left: 1px solid var(--app-border);
  padding-left: 24px;
}

/* 翻页滑动动画：固定高度下进出，避免整卡跳动 */
.cal-slide-fwd-enter-active,
.cal-slide-fwd-leave-active,
.cal-slide-back-enter-active,
.cal-slide-back-leave-active {
  transition: transform 180ms var(--home-motion-ease-standard, ease), opacity 180ms var(--home-motion-ease-standard, ease);
}

.cal-slide-fwd-enter-from {
  transform: translateX(28px);
  opacity: 0;
}

.cal-slide-fwd-leave-to {
  transform: translateX(-28px);
  opacity: 0;
}

.cal-slide-back-enter-from {
  transform: translateX(-28px);
  opacity: 0;
}

.cal-slide-back-leave-to {
  transform: translateX(28px);
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .cal-slide-fwd-enter-active,
  .cal-slide-fwd-leave-active,
  .cal-slide-back-enter-active,
  .cal-slide-back-leave-active {
    transition: none;
  }
}

.cal-month {
  display: flex;
  flex-direction: column;
  gap: 10px;
  flex: 1;
  min-width: 0;
}

.cal-nav-spacer {
  width: 32px;
  height: 32px;
  flex-shrink: 0;
}

.cal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.cal-nav-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: none;
  border-radius: var(--radius-pill);
  background: transparent;
  color: var(--app-text-secondary);
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}

.cal-nav-btn:active {
  background: var(--app-surface-soft);
  color: var(--app-text);
}

.cal-nav-btn svg {
  width: 18px;
  height: 18px;
  stroke: currentColor;
  stroke-width: 2;
}

.cal-month-title {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border: none;
  border-radius: var(--radius-pill);
  background: transparent;
  color: var(--app-text);
  font-size: var(--font-title-lg);
  font-weight: 650;
  letter-spacing: -0.02em;
  cursor: pointer;
  transition: background 0.15s ease;
}

.cal-month-title:active {
  background: var(--app-surface-soft);
}

.cal-month-title svg {
  width: 14px;
  height: 14px;
  stroke: var(--app-text-tertiary);
  stroke-width: 2;
}

.cal-weekdays,
.cal-grid {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 4px;
}

.cal-weekday {
  text-align: center;
  font-size: var(--font-micro);
  font-weight: 600;
  color: var(--app-text-tertiary);
  padding: 2px 0;
}

.cal-cell {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1px;
  min-height: 46px;
  padding: 4px 2px;
  border: none;
  border-radius: var(--radius-tiny);
  background: transparent;
  color: var(--app-text);
  font-size: var(--font-small);
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.12s ease, background 0.15s ease;
}

.cal-cell:active {
  transform: scale(0.94);
}

.cal-cell--blank {
  pointer-events: none;
}

.cal-cell--future {
  opacity: 0.35;
  cursor: default;
}

.cal-cell--future:active {
  transform: none;
}

.cal-cell--level-1 {
  background: color-mix(in srgb, var(--app-primary) 10%, var(--app-surface-soft));
}

.cal-cell--level-2 {
  background: color-mix(in srgb, var(--app-primary) 26%, var(--app-surface-soft));
}

.cal-cell--level-3 {
  background: color-mix(in srgb, var(--app-primary) 56%, var(--app-surface-soft));
  color: #f5f5f7;
}

.cal-cell--level-4 {
  background: var(--app-primary);
  color: #f5f5f7;
}

.cal-cell--selected {
  outline: 2px solid var(--app-text);
  outline-offset: 2px;
}

.cal-cell--today:not(.cal-cell--selected)::after {
  content: '';
  position: absolute;
  bottom: 3px;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: currentColor;
  opacity: 0.7;
}

/* 0 元但有谷的日子：小圆点标记 */
.cal-cell-zero-dot {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: currentColor;
  opacity: 0.45;
}

.cal-cell-day {
  line-height: 1.2;
}

.cal-cell-amount {
  font-size: var(--font-micro);
  font-weight: 700;
  line-height: 1.2;
  opacity: 0.82;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cal-cell--level-0 .cal-cell-amount,
.cal-cell--level-1 .cal-cell-amount {
  opacity: 0.7;
}

.cal-legend {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
  padding-top: 2px;
}

.cal-legend-label {
  font-size: var(--font-micro);
  color: var(--app-text-tertiary);
  margin-right: 2px;
}

.cal-legend-swatch {
  width: 12px;
  height: 12px;
  border-radius: 4px;
}

.cal-legend-swatch--level-1 {
  background: color-mix(in srgb, var(--app-primary) 10%, var(--app-surface-soft));
}

.cal-legend-swatch--level-2 {
  background: color-mix(in srgb, var(--app-primary) 26%, var(--app-surface-soft));
}

.cal-legend-swatch--level-3 {
  background: color-mix(in srgb, var(--app-primary) 56%, var(--app-surface-soft));
}

.cal-legend-swatch--level-4 {
  background: var(--app-primary);
}

.cal-day-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.cal-day-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
}

.cal-day-title {
  font-size: var(--font-title-lg);
  font-weight: 650;
  color: var(--app-text);
  letter-spacing: -0.03em;
}

.cal-day-meta {
  font-size: var(--font-body);
  font-weight: 600;
  color: color-mix(in srgb, var(--app-text) 76%, var(--app-text-tertiary));
}

.cal-day-empty {
  margin: 8px 0;
  font-size: var(--font-body);
  color: var(--app-text-tertiary);
}

/* 日明细缩略图网格：与时间线月份缩略图一致的卡片样式 */
.cal-thumb-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
}

@media (min-width: 600px) {
  .cal-thumb-grid {
    grid-template-columns: repeat(5, 1fr);
  }
}

@media (min-width: 900px) {
  .cal-thumb-grid {
    grid-template-columns: repeat(7, 1fr);
  }
}

@media (min-width: 1200px) {
  .cal-thumb-grid {
    grid-template-columns: repeat(9, 1fr);
  }
}

.tl-thumb-btn {
  display: flex;
  flex-direction: column;
  position: relative;
  border: none;
  background: none;
  padding: 0;
  cursor: pointer;
  transition: transform 0.15s ease, opacity 0.15s ease;
}

.tl-thumb-btn:active {
  transform: scale(0.94);
  opacity: 0.8;
}

.tl-thumb-btn--disabled {
  opacity: 0.48;
  filter: grayscale(60%);
}

.tl-thumb-img-wrap {
  width: 100%;
  aspect-ratio: 1;
  border-radius: var(--radius-small);
  overflow: hidden;
  background: var(--app-surface-soft, #eeeff2);
  box-shadow: 0 6px 16px rgba(17, 20, 22, 0.06);
  border: 1px solid color-mix(in srgb, var(--app-text-tertiary) 10%, transparent);
}

.tl-thumb-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center;
  display: block;
  background: transparent;
}

.tl-thumb-empty {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--app-text-tertiary);
  font-size: var(--font-body-lg);
}

.tl-thumb-qty-badge {
  position: absolute;
  right: 6px;
  bottom: 6px;
  z-index: 3;
  padding: 2px 6px;
  border-radius: var(--radius-tiny);
  background: rgba(20, 20, 22, 0.72);
  color: #fff;
  font-size: var(--font-micro);
  font-weight: 700;
  line-height: 1.25;
  pointer-events: none;
  letter-spacing: 0.02em;
}

.cal-picker {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 4px 2px 8px;
}

.cal-picker-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.cal-picker-label {
  font-size: var(--font-body);
  font-weight: 600;
  color: var(--app-text-secondary);
}

.cal-picker-year-nav {
  display: flex;
  align-items: center;
  gap: 4px;
}

.cal-picker-year {
  min-width: 64px;
  text-align: center;
  font-size: var(--font-title-lg);
  font-weight: 700;
  color: var(--app-text);
}

.cal-picker-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.cal-picker-month {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 44px;
  border: none;
  border-radius: var(--radius-xs);
  background: var(--app-surface-soft);
  color: var(--app-text);
  font-size: var(--font-body);
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}

.cal-picker-month:active {
  transform: scale(0.96);
}

.cal-picker-month--active {
  background: var(--app-primary);
  color: #f5f5f7;
}

.cal-picker-dot {
  position: absolute;
  top: 7px;
  right: 9px;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: currentColor;
  opacity: 0.65;
}

html.theme-dark .cal-cell--level-3,
html.theme-dark .cal-cell--level-4,
html.theme-dark .cal-picker-month--active {
  color: #141416;
}

html.theme-dark .tl-thumb-img-wrap {
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.24);
  border-color: rgba(255, 255, 255, 0.08);
}
</style>
