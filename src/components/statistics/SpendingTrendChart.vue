<template>
  <div class="trend-section">
    <div class="trend-header">
      <h3 class="chart-title">{{ t('stats.trend.title') }}</h3>
      <div class="trend-controls">
        <div v-if="currentMode !== 'year'" class="trend-nav">
          <button type="button" class="trend-nav-btn" @click="prevPage">‹</button>
          <span class="trend-nav-label">{{ pageLabel }}</span>
          <button type="button" class="trend-nav-btn" @click="nextPage">›</button>
        </div>
        <div class="trend-mode-selector">
          <button
            v-for="m in modeOptions"
            :key="m.value"
            type="button"
            :class="['mode-chip', { 'mode-chip--active': currentMode === m.value }]"
            @click="$emit('update:mode', m.value)"
          >
            {{ m.label }}
          </button>
        </div>
      </div>
    </div>

    <ChartWrapper :option="chartOption" :loading="loading" />
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { formatCurrency } from '@/utils/format'
import ChartWrapper from './ChartWrapper.vue'

const { t } = useI18n()

const props = defineProps({
  trendData: { type: Array, default: () => [] },
  budgetLine: { type: Number, default: 0 },
  currentMode: { type: String, default: 'year' },
  loading: { type: Boolean, default: false }
})

const emit = defineEmits(['update:mode', 'update:window'])

const modeOptions = computed(() => [
  { value: 'year', label: t('stats.trend.mode.year') },
  { value: 'month', label: t('stats.trend.mode.month') },
  { value: 'week', label: t('stats.trend.mode.week') }
])

// Navigation state
const monthOffset = ref(0) // 0 = current year, -1 = last year
const weekOffset = ref(0)  // 0 = current week, -1 = last week

function resetOffset() {
  monthOffset.value = 0
  weekOffset.value = 0
}

watch(() => props.currentMode, resetOffset)

function getWindow() {
  const now = new Date()
  const mode = props.currentMode

  if (mode === 'month') {
    const refYear = now.getFullYear() + monthOffset.value
    const startDate = new Date(refYear, 0, 1)
    const endDate = new Date(refYear, 11, 31, 23, 59, 59)
    return { startDate, endDate, label: `${refYear}` }
  }

  if (mode === 'week') {
    const dayOfWeek = now.getDay()
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
    const monday = new Date(now)
    monday.setDate(now.getDate() + mondayOffset + weekOffset.value * 7)
    monday.setHours(0, 0, 0, 0)
    const sunday = new Date(monday)
    sunday.setDate(monday.getDate() + 6)
    sunday.setHours(23, 59, 59, 999)
    const sm = monday.getMonth() + 1
    const sd = monday.getDate()
    const em = sunday.getMonth() + 1
    const ed = sunday.getDate()
    return { startDate: monday, endDate: sunday, label: `${sm}/${sd} — ${em}/${ed}` }
  }

  return { startDate: null, endDate: null, label: '' }
}

const windowInfo = computed(() => getWindow())

const pageLabel = computed(() => windowInfo.value.label)

function prevPage() {
  if (props.currentMode === 'month') monthOffset.value--
  else if (props.currentMode === 'week') weekOffset.value--
}

function nextPage() {
  if (props.currentMode === 'month') monthOffset.value++
  else if (props.currentMode === 'week') weekOffset.value++
}

// Emit window changes to parent (only when not in year mode)
watch(windowInfo, (info) => {
  if (props.currentMode !== 'year') {
    emit('update:window', { startDate: info.startDate, endDate: info.endDate })
  }
}, { immediate: true })

function readThemeColors() {
  try {
    const s = getComputedStyle(document.documentElement)
    const text = (s.getPropertyValue('--app-text') || '').trim() || '#111'
    const secondary = (s.getPropertyValue('--app-text-secondary') || '').trim() || '#666'
    const pending = (s.getPropertyValue('--app-pending') || '').trim() || '#0e74e9'
    return { text, secondary, pending }
  } catch {
    return { text: '#111', secondary: '#666', pending: '#0e74e9' }
  }
}

const chartOption = computed(() => {
  if (!props.trendData || props.trendData.length === 0) return {}
  const colors = readThemeColors()
  const labels = props.trendData.map((d) => d.label)
  const values = props.trendData.map((d) => Number(d.value || 0))
  const hasBudget = props.budgetLine > 0

  // Per-bar coloring: red gradient if over budget, normal gradient otherwise
  const barData = values.map((v) => {
    if (hasBudget && v > props.budgetLine) {
      return {
        value: v,
        itemStyle: {
          borderRadius: [4, 4, 0, 0],
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: '#ef4444' },
              { offset: 1, color: 'rgba(239, 68, 68, 0.3)' }
            ]
          }
        }
      }
    }
    return {
      value: v,
      itemStyle: {
        borderRadius: [4, 4, 0, 0],
        color: {
          type: 'linear',
          x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [
            { offset: 0, color: colors.text },
            { offset: 1, color: 'rgba(20, 20, 22, 0.3)' }
          ]
        }
      }
    }
  })

  const barSeries = {
    name: t('stats.trend.spend'),
    type: 'bar',
    data: barData,
    barMaxWidth: 32,
    z: 2
  }

  const series = [barSeries]

  if (hasBudget) {
    series.unshift({
      name: 'budget',
      type: 'line',
      data: new Array(labels.length).fill(props.budgetLine),
      symbol: 'none',
      lineStyle: {
        color: colors.pending,
        type: 'dashed',
        width: 2
      },
      endLabel: {
        show: true,
        formatter: `¥${props.budgetLine.toFixed(0)}`,
        color: colors.pending,
        fontSize: 11,
        fontWeight: 600,
        padding: [2, 6],
        borderRadius: 4,
        backgroundColor: 'rgba(14, 116, 233, 0.08)',
        distance: 8
      },
      z: 1
    })
  }

  return {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter(params) {
        const bar = params.find(p => p.seriesType === 'bar')
        if (!bar) return ''
        return `${bar.name}<br/>${t('stats.trend.spend')}: ${formatCurrency(bar.value, 'CNY')}`
      }
    },
    grid: {
      left: 10,
      right: 60,
      top: 14,
      bottom: 36,
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: labels,
      axisLabel: {
        color: colors.secondary,
        fontSize: 11,
        interval: 0,
        rotate: labels.length > 8 ? 45 : 0,
        hideOverlap: true
      },
      axisLine: { lineStyle: { color: 'rgba(0,0,0,0.06)' } },
      axisTick: { show: false }
    },
    yAxis: {
      type: 'value',
      min: 0,
      axisLabel: {
        color: colors.secondary,
        fontSize: 11,
        formatter(val) {
          if (val >= 10000) return `${(val / 10000).toFixed(1)}w`
          if (val >= 1000) return `${(val / 1000).toFixed(1)}k`
          return String(val)
        }
      },
      splitLine: { lineStyle: { color: 'rgba(0,0,0,0.04)', type: 'dashed' } }
    },
    series
  }
})
</script>

<style scoped>
.trend-section { margin-top: var(--section-gap); }
.trend-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
  padding: 0 var(--page-padding);
}
.chart-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--app-text);
}
.trend-controls {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}
.trend-nav {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}
.trend-nav-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 50%;
  background: var(--app-chip-bg);
  color: var(--app-text-secondary);
  font-size: 16px;
  font-weight: 700;
  cursor: pointer;
  transition: background var(--motion-fast) var(--motion-emphasis), transform var(--motion-fast) var(--motion-emphasis);
}
.trend-nav-btn:active {
  transform: scale(0.9);
  background: var(--app-text);
  color: var(--app-surface);
}
.trend-nav-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--app-text-secondary);
  white-space: nowrap;
}
.trend-mode-selector {
  display: flex;
  gap: 4px;
  padding: 4px;
  border-radius: 999px;
  background: var(--app-chip-bg);
}
.mode-chip {
  flex-shrink: 0;
  border: none;
  border-radius: 999px;
  padding: 6px 14px;
  background: transparent;
  color: var(--app-text-secondary);
  font-size: 13px;
  font-weight: 600;
  transition: background var(--motion-fast) var(--motion-emphasis), color var(--motion-fast) var(--motion-emphasis);
}
.mode-chip:active { transform: scale(0.97); }
.mode-chip--active {
  background: var(--app-text);
  color: var(--app-surface);
}
:global(html.theme-dark) .mode-chip--active {
  background: #f5f5f7;
  color: #141416;
}
</style>
