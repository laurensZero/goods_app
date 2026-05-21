<template>
  <div class="chart-wrapper">
    <div v-if="loading" class="chart-loading">加载中…</div>
    <div v-else-if="!hasData" class="chart-empty">暂无数据</div>
    <div v-else ref="chartRef" class="chart-root" />
  </div>
</template>

<script setup>
import { onMounted, onBeforeUnmount, ref, watch, computed } from 'vue'
import * as echarts from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { PieChart, BarChart, LineChart } from 'echarts/charts'
import { TitleComponent, TooltipComponent, LegendComponent, GridComponent } from 'echarts/components'

echarts.use([CanvasRenderer, PieChart, BarChart, LineChart, TitleComponent, TooltipComponent, LegendComponent, GridComponent])

const props = defineProps({
  option: { type: Object, required: false },
  loading: { type: Boolean, default: false }
})

const chartRef = ref(null)
let chartInstance = null

const hasData = computed(() => props.option && Object.keys(props.option).length > 0)

function resize() {
  chartInstance?.resize()
}

function readThemeColors() {
  try {
    const s = getComputedStyle(document.documentElement)
    const text = (s.getPropertyValue('--app-text') || '').trim() || '#111'
    const secondary = (s.getPropertyValue('--app-text-secondary') || '').trim() || text
    return { text, secondary }
  } catch (e) {
    return { text: '#111', secondary: '#666' }
  }
}

function applyThemeToOption(opt) {
  if (!opt) return opt
  const colors = readThemeColors()
  // deep clone to avoid mutating prop
  const option = JSON.parse(JSON.stringify(opt))

  if (!option.textStyle) option.textStyle = { color: colors.text }

  if (option.legend) {
    option.legend.textStyle = option.legend.textStyle || {}
    option.legend.textStyle.color = option.legend.textStyle.color || colors.secondary
  }

  if (option.tooltip) {
    option.tooltip.textStyle = option.tooltip.textStyle || {}
    option.tooltip.textStyle.color = option.tooltip.textStyle.color || colors.text
  }

  const applyAxis = (axis) => {
    if (!axis) return
    if (Array.isArray(axis)) {
      axis.forEach((a) => {
        a.axisLabel = a.axisLabel || {}
        a.axisLabel.color = (a.axisLabel && a.axisLabel.color) || colors.secondary
      })
    } else {
      axis.axisLabel = axis.axisLabel || {}
      axis.axisLabel.color = (axis.axisLabel && axis.axisLabel.color) || colors.secondary
    }
  }

  applyAxis(option.xAxis)
  applyAxis(option.yAxis)

  return option
}

onMounted(() => {
  if (!chartRef.value) return
  chartInstance = echarts.init(chartRef.value)
  if (hasData.value) chartInstance.setOption(applyThemeToOption(props.option))
  window.addEventListener('resize', resize)
})

watch(() => props.option, (opt) => {
  if (!chartInstance) return
  if (!opt || Object.keys(opt).length === 0) {
    chartInstance.clear()
    return
  }
  chartInstance.setOption(applyThemeToOption(opt))
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', resize)
  chartInstance?.dispose()
  chartInstance = null
})
</script>

<style scoped>
.chart-wrapper { min-height: 180px; display: flex; align-items: center; justify-content: center; }
.chart-root { width: 100%; height: 240px; }
.chart-loading, .chart-empty { color: var(--app-text-tertiary); }
</style>
