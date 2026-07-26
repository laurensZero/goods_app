<template>
  <div class="chart-wrapper">
    <div v-if="loading" class="chart-loading">{{ t('stats.loading') }}</div>
    <div v-else-if="!hasData" class="chart-empty">{{ t('stats.noData') }}</div>
    <!-- v-show 常驻:挂载时无数据也保留容器,数据到达/清空往返时实例始终绑定同一 DOM -->
    <div v-show="!loading && hasData" ref="chartRef" class="chart-root" />
  </div>
</template>

<script setup>
import { onMounted, onBeforeUnmount, ref, watch, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import * as echarts from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { PieChart, BarChart, LineChart, HeatmapChart } from 'echarts/charts'
import { TitleComponent, TooltipComponent, LegendComponent, GridComponent, CalendarComponent, VisualMapComponent, DataZoomComponent, MarkLineComponent } from 'echarts/components'

echarts.use([CanvasRenderer, PieChart, BarChart, LineChart, HeatmapChart, TitleComponent, TooltipComponent, LegendComponent, GridComponent, CalendarComponent, VisualMapComponent, DataZoomComponent, MarkLineComponent])

const { t } = useI18n()

const props = defineProps({
  option: { type: Object, required: false },
  loading: { type: Boolean, default: false }
})

const chartRef = ref(null)
let chartInstance = null
let resizeObserver = null
let themeObserver = null
let lastSize = { width: 0, height: 0 }
let lastOptionJson = ''

const hasData = computed(() => props.option && Object.keys(props.option).length > 0)

// 只在容器尺寸真正变化时 resize——手机浏览器滚动时地址栏收起/展开会
// 连环触发 window resize,不加判断的话图表在上下滑动中反复重排,看起来像在重载
function resizeIfNeeded() {
  if (!chartInstance || !chartRef.value) return
  const rect = chartRef.value.getBoundingClientRect()
  const width = Math.round(rect.width)
  const height = Math.round(rect.height)
  if (width === lastSize.width && height === lastSize.height) return
  if (width === 0 || height === 0) return
  lastSize = { width, height }
  chartInstance.resize()
}

function serializeOption(opt) {
  try {
    return JSON.stringify(opt)
  } catch {
    return ''
  }
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
  // shallow copy to avoid mutating prop while preserving functions (formatter, etc.)
  // 被注入颜色的嵌套对象也要拷贝:直接改 prop 会把旧主题色烙进上游 computed 缓存,
  // 主题切换后重放 setOption 时 || 兜底就再也不会生效
  const option = Array.isArray(opt) ? opt.slice() : Object.assign({}, opt)

  if (!option.textStyle) option.textStyle = { color: colors.text }

  if (option.legend) {
    option.legend = Object.assign({}, option.legend)
    option.legend.textStyle = Object.assign({}, option.legend.textStyle)
    option.legend.textStyle.color = option.legend.textStyle.color || colors.secondary
  }

  if (option.tooltip) {
    option.tooltip = Object.assign({}, option.tooltip)
    option.tooltip.textStyle = Object.assign({}, option.tooltip.textStyle)
    option.tooltip.textStyle.color = option.tooltip.textStyle.color || colors.text
    // apply glass-like background for tooltip using CSS variables
    const s = getComputedStyle(document.documentElement)
    const glass = (s.getPropertyValue('--app-glass') || 'rgba(255,255,255,0.06)').trim()
    const glassBorder = (s.getPropertyValue('--app-glass-border') || 'rgba(255,255,255,0.06)').trim()
    option.tooltip.backgroundColor = option.tooltip.backgroundColor || glass
    option.tooltip.borderColor = option.tooltip.borderColor || glassBorder
    option.tooltip.borderWidth = option.tooltip.borderWidth || 1
    option.tooltip.padding = option.tooltip.padding || 10
    option.tooltip.extraCssText = option.tooltip.extraCssText || `border-radius: var(--radius-card); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);`
  }

  const themedAxis = (axis) => {
    if (!axis) return axis
    if (Array.isArray(axis)) return axis.map((a) => themedAxis(a))
    const next = Object.assign({}, axis)
    next.axisLabel = Object.assign({}, next.axisLabel)
    next.axisLabel.color = next.axisLabel.color || colors.secondary
    return next
  }

  option.xAxis = themedAxis(option.xAxis)
  option.yAxis = themedAxis(option.yAxis)

  // legend style: use glass subtle background and rounded markers
  if (option.legend) {
    option.legend.itemWidth = option.legend.itemWidth || 14
    option.legend.itemHeight = option.legend.itemHeight || 8
    option.legend.textStyle.fontFamily = option.legend.textStyle.fontFamily || getComputedStyle(document.documentElement).getPropertyValue('font-family')
  }

  return option
}

// 主题切换后重读 CSS 变量并强制重放 setOption:统计页在 KeepAlive 中存活,
// 切深/浅色时 option JSON 未变会被同值跳过,颜色停留在旧主题
function refreshThemeColors() {
  if (!chartInstance || !hasData.value) return
  lastOptionJson = serializeOption(props.option)
  chartInstance.setOption(applyThemeToOption(props.option), { replaceMerge: ['series'] })
}

onMounted(() => {
  if (!chartRef.value) return
  chartInstance = echarts.init(chartRef.value)
  const rect = chartRef.value.getBoundingClientRect()
  lastSize = { width: Math.round(rect.width), height: Math.round(rect.height) }
  if (hasData.value) {
    lastOptionJson = serializeOption(props.option)
    chartInstance.setOption(applyThemeToOption(props.option), { replaceMerge: ['series'] })
  }
  resizeObserver = new ResizeObserver(resizeIfNeeded)
  resizeObserver.observe(chartRef.value)
  themeObserver = new MutationObserver(refreshThemeColors)
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class', 'data-theme-id', 'data-theme-appearance']
  })
})

// flush post:等 v-show 把容器显示出来后再量尺寸,空态→有数据时能拿到真实宽高
watch(() => props.option, (opt) => {
  if (!chartInstance) return
  if (!opt || Object.keys(opt).length === 0) {
    lastOptionJson = ''
    chartInstance.clear()
    return
  }
  // 同值跳过:上游 computed 产生新引用但内容未变时,不重放 setOption 动画
  const json = serializeOption(opt)
  if (json && json === lastOptionJson) return
  lastOptionJson = json
  chartInstance.setOption(applyThemeToOption(opt), { replaceMerge: ['series'] })
  // 挂载时无数据的话 init 发生在隐藏容器上(0x0),首批数据到达后补一次 resize
  resizeIfNeeded()
}, { flush: 'post' })

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
  themeObserver?.disconnect()
  themeObserver = null
  chartInstance?.dispose()
  chartInstance = null
})
</script>

<style scoped>
.chart-wrapper { position: relative; min-height: 180px; display: flex; align-items: center; justify-content: center; padding: 8px; }
.chart-wrapper::before {
  content: '';
  position: absolute;
  inset: 6px;
  border-radius: var(--radius-card);
  background: var(--app-glass-strong, rgba(255,255,255,0.04));
  border: 1px solid var(--app-glass-border, rgba(255,255,255,0.06));
  backdrop-filter: blur(8px) saturate(120%);
  -webkit-backdrop-filter: blur(8px) saturate(120%);
  pointer-events: none;
}
.chart-root { width: 100%; height: 240px; position: relative; z-index: 1; }
.chart-loading, .chart-empty { color: var(--app-text-tertiary); }
</style>
