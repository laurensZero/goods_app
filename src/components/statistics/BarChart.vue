<template>
  <ChartWrapper :option="chartOption" :loading="loading" />
</template>

<script setup>
import { computed } from 'vue'
import { formatCompactNumber, formatCurrency } from '@/utils/format'
import ChartWrapper from './ChartWrapper.vue'

const props = defineProps({
  entries: { type: Array, default: () => [] },
  labelKey: { type: String, default: 'label' },
  valueKey: { type: String, default: 'quantity' },
  horizontal: { type: Boolean, default: true },
  inverse: { type: Boolean, default: true },
  loading: { type: Boolean, default: false }
})

const chartOption = computed(() => {
  if (!props.entries || props.entries.length === 0) return {}
  const labels = props.entries.map((e) => e[props.labelKey])
  const values = props.entries.map((e) => Number(e[props.valueKey] || 0))

  // Determine a comfortable left margin for long labels when horizontal
  const leftMargin = props.horizontal ? '20%' : '6%'

  return {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: function (params) {
        const p = params[0]
        const raw = p.value
        const key = String(p.seriesName || '')

        function fmtNumberByKey(k, v) {
          const n = Number(v || 0)
          if (!Number.isFinite(n)) return '0'
          if (k === 'officialTotalValue' || k === 'actualTotalValue'
            || k === 'officialAvgPrice' || k === 'actualAvgPrice') {
            return formatCurrency(n, 'CNY')
          }
          return formatCompactNumber(n)
        }

        return `${p.name}<br/>${p.seriesName || ''}: ${fmtNumberByKey(key, raw)}`
      }
    },
    grid: { left: leftMargin, right: '6%', top: '12%', bottom: '12%', containLabel: true },
    xAxis: props.horizontal ? { type: 'value' } : { type: 'category', data: labels },
    yAxis: props.horizontal
      ? {
          type: 'category',
          data: labels,
          inverse: !!props.inverse,
          axisLabel: {
            interval: 0,
            formatter: function (val) {
              if (!val) return ''
              return val.length > 18 ? val.slice(0, 18) + '…' : val
            }
          }
        }
      : { type: 'value' },
    series: [
      {
        name: props.valueKey,
        type: 'bar',
        data: values,
        barMaxWidth: 24,
        itemStyle: { borderRadius: [6, 6, 6, 6] },
        label: { show: false }
      }
    ]
  }
})
</script>

<style scoped></style>
