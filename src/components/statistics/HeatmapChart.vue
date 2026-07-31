<template>
  <div class="heatmap-section">
    <div class="heatmap-header">
      <h3 class="chart-title">{{ t('stats.heatmap.title') }}</h3>
      <div class="heatmap-year-selector">
        <button
          v-for="y in availableYears"
          :key="y"
          type="button"
          :class="['year-chip', { 'year-chip--active': selectedYear === y }]"
          @click="selectedYear = y"
        >
          {{ y }}
        </button>
      </div>
    </div>

    <div v-if="!loading && cells.length === 0" class="heatmap-empty">
      {{ t('stats.noData') }}
    </div>

    <div v-else class="heatmap-scroll">
      <div class="heatmap-grid-wrap">
        <!-- Month labels -->
        <div class="heatmap-months">
          <span
            v-for="(m, i) in monthPositions"
            :key="i"
            class="heatmap-month"
            :style="{ gridColumnStart: m.col + 1 }"
          >
            {{ m.label }}
          </span>
        </div>

        <!-- Grid + day labels -->
        <div class="heatmap-body">
          <div class="heatmap-days">
            <span class="heatmap-day-label">{{ t('stats.heatmap.dayMon') }}</span>
            <span class="heatmap-day-label" />
            <span class="heatmap-day-label">{{ t('stats.heatmap.dayWed') }}</span>
            <span class="heatmap-day-label" />
            <span class="heatmap-day-label">{{ t('stats.heatmap.dayFri') }}</span>
            <span class="heatmap-day-label" />
            <span class="heatmap-day-label" />
          </div>

          <div
            class="heatmap-grid"
            :style="{ gridTemplateColumns: 'repeat(' + weekCount + ', var(--hm-size))' }"
          >
            <div
              v-for="(cell, idx) in cells"
              :key="idx"
              class="heatmap-cell"
              :class="cell.level"
              :title="cell.tooltip"
            />
          </div>
        </div>
      </div>

    </div>

    <!-- Legend: outside scroll, fixed at bottom-right -->
    <div class="heatmap-legend">
      <span class="heatmap-legend-label">{{ t('stats.heatmap.less') }}</span>
      <div class="heatmap-cell heatmap-cell--legend level-0" />
      <div class="heatmap-cell heatmap-cell--legend level-1" />
      <div class="heatmap-cell heatmap-cell--legend level-2" />
      <div class="heatmap-cell heatmap-cell--legend level-3" />
      <div class="heatmap-cell heatmap-cell--legend level-4" />
      <span class="heatmap-legend-label">{{ t('stats.heatmap.more') }}</span>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const props = defineProps({
  heatmapData: { type: Array, default: () => [] },
  availableYears: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false }
})

const selectedYear = ref(props.availableYears[0] || new Date().getFullYear())

watch(() => props.availableYears, (years) => {
  if (years.length > 0 && !years.includes(selectedYear.value)) {
    selectedYear.value = years[0]
  }
})

function toDateKey(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const yearRange = computed(() => {
  const year = selectedYear.value
  const jan1 = new Date(year, 0, 1)
  const dec31 = new Date(year, 11, 31)
  const startDay = (jan1.getDay() + 6) % 7
  const totalDays = Math.floor((dec31 - jan1) / 86400000) + 1
  return { jan1, startDay, totalDays }
})

const weekCount = computed(() => {
  const { startDay, totalDays } = yearRange.value
  return Math.ceil((totalDays + startDay) / 7)
})

const cells = computed(() => {
  const year = selectedYear.value
  const dataMap = new Map(props.heatmapData.filter(([date]) => date.startsWith(String(year))))
  const counts = [...dataMap.values()]
  const maxCount = Math.max(3, ...counts)
  const { startDay, totalDays } = yearRange.value
  const result = []

  for (let i = 0; i < startDay; i++) {
    result.push({ level: '', tooltip: '' })
  }

  for (let d = 0; d < totalDays; d++) {
    const date = new Date(year, 0, 1 + d)
    const key = toDateKey(date)
    const count = dataMap.get(key) || 0
    let level = 'level-0'
    if (count > 0) {
      const ratio = count / maxCount
      if (ratio <= 0.25) level = 'level-1'
      else if (ratio <= 0.5) level = 'level-2'
      else if (ratio <= 0.75) level = 'level-3'
      else level = 'level-4'
    }
    const month = date.getMonth() + 1
    const day = date.getDate()
    const tooltip = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}: ${t('stats.heatmap.items', { count })}`
    result.push({ level, tooltip })
  }

  return result
})

const monthPositions = computed(() => {
  const year = selectedYear.value
  const monthNames = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月']
  const { jan1, startDay } = yearRange.value
  return monthNames.map((label, m) => {
    const firstDay = new Date(year, m, 1)
    const dayOfYear = Math.floor((firstDay - jan1) / 86400000)
    const col = Math.floor((dayOfYear + startDay) / 7)
    return { label, col }
  })
})
</script>

<style scoped>
.heatmap-section {
  margin-top: var(--section-gap);
  min-width: 0;
}
.heatmap-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}
.chart-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--app-text);
  white-space: nowrap;
  flex-shrink: 0;
}
.heatmap-year-selector {
  display: flex;
  gap: 6px;
}
.year-chip {
  flex-shrink: 0;
  border: none;
  border-radius: 999px;
  padding: 6px 14px;
  background: var(--app-chip-bg);
  color: var(--app-text-secondary);
  font-size: 13px;
  font-weight: 600;
  transition: background var(--motion-fast) var(--motion-emphasis), color var(--motion-fast) var(--motion-emphasis);
}
.year-chip:active { transform: scale(0.97); }
.year-chip--active {
  background: var(--app-text);
  color: var(--app-surface);
}
.heatmap-empty {
  padding: 40px 0;
  text-align: center;
  color: var(--app-text-tertiary);
  font-size: 14px;
}

/* Scroll container */
.heatmap-scroll {
  position: relative;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: thin;
  scrollbar-color: var(--app-text-tertiary) transparent;
}
.heatmap-scroll::-webkit-scrollbar { height: 4px; }
.heatmap-scroll::-webkit-scrollbar-track { background: transparent; }
.heatmap-scroll::-webkit-scrollbar-thumb { background: var(--app-text-tertiary); border-radius: 2px; }

/* Grid wrapper */
.heatmap-grid-wrap {
  --hm-size: 13px;
  --hm-gap: 3px;
  min-width: max-content;
}
@media (min-width: 600px) {
  .heatmap-grid-wrap { --hm-size: 16px; }
}
@media (min-width: 1200px) {
  .heatmap-grid-wrap { --hm-size: 26px; --hm-gap: 5px; }
}

.heatmap-months {
  display: grid;
  grid-template-columns: repeat(53, calc(var(--hm-size) + var(--hm-gap)));
  margin-left: 30px;
  margin-bottom: 4px;
  height: 20px;
}
.heatmap-month {
  font-size: 11px;
  color: var(--app-text-secondary);
  white-space: nowrap;
}

.heatmap-body {
  display: flex;
  gap: 4px;
}
.heatmap-days {
  display: flex;
  flex-direction: column;
  gap: 3px;
  flex-shrink: 0;
  width: 26px;
}
.heatmap-day-label {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  height: var(--hm-size);
  font-size: 10px;
  color: var(--app-text-tertiary);
}

.heatmap-grid {
  display: grid;
  grid-template-rows: repeat(7, var(--hm-size));
  /* 格子按列填充：每列代表一周，与月份/星期标签对齐（缺省为按行填充会导致整图转置） */
  grid-auto-flow: column;
  gap: var(--hm-gap);
}

.heatmap-cell {
  width: var(--hm-size);
  height: var(--hm-size);
  border-radius: 3px;
  outline: 1px solid rgba(27, 31, 35, 0.06);
}
.heatmap-cell--legend {
  width: 11px;
  height: 11px;
}

.level-0 { background: var(--app-surface-soft); }
.level-1 { background: color-mix(in srgb, var(--app-primary) 18%, var(--app-surface-soft)); }
.level-2 { background: color-mix(in srgb, var(--app-primary) 36%, var(--app-surface-soft)); }
.level-3 { background: color-mix(in srgb, var(--app-primary) 60%, var(--app-surface-soft)); }
.level-4 { background: color-mix(in srgb, var(--app-primary) 88%, var(--app-surface-soft)); }

/* Legend: below scroll, right-aligned */
.heatmap-legend {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
  margin-top: 8px;
}
.heatmap-legend-label {
  font-size: 10px;
  color: var(--app-text-tertiary);
}
@media (max-width: 480px) {
  .heatmap-header { gap: 8px; }
  .year-chip { padding: 5px 10px; font-size: 12px; }
}
</style>
