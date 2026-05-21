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

onMounted(() => {
  if (!chartRef.value) return
  chartInstance = echarts.init(chartRef.value)
  if (hasData.value) chartInstance.setOption(props.option)
  window.addEventListener('resize', resize)
})

watch(() => props.option, (opt) => {
  if (!chartInstance) return
  if (!opt || Object.keys(opt).length === 0) {
    chartInstance.clear()
    return
  }
  chartInstance.setOption(opt)
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
