<template>
  <ChartWrapper :option="chartOption" :loading="loading" />
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import ChartWrapper from './ChartWrapper.vue'

const props = defineProps({
  entries: { type: Array, default: () => [] },
  labelKey: { type: String, default: 'label' },
  valueKey: { type: String, default: 'quantity' },
  topN: { type: Number, default: 10 },
  loading: { type: Boolean, default: false }
})

const viewportWidth = ref(typeof window !== 'undefined' ? window.innerWidth : 0)
let resizeHandler = null

onMounted(() => {
  resizeHandler = () => {
    viewportWidth.value = window.innerWidth
  }
  window.addEventListener('resize', resizeHandler, { passive: true })
  window.visualViewport?.addEventListener('resize', resizeHandler)
})

onBeforeUnmount(() => {
  if (resizeHandler) {
    window.removeEventListener('resize', resizeHandler)
    window.visualViewport?.removeEventListener('resize', resizeHandler)
  }
})

const isCompact = computed(() => viewportWidth.value > 0 && viewportWidth.value <= 640)

const chartOption = computed(() => {
  if (!props.entries || props.entries.length === 0) return {}

  const items = props.entries
    .map((e) => ({ name: e[props.labelKey], value: Number(e[props.valueKey] || 0) }))
    .filter((d) => d.value > 0)
    .sort((a, b) => b.value - a.value)

  const top = items.slice(0, props.topN)
  const others = items.slice(props.topN)
  const othersSum = others.reduce((s, it) => s + it.value, 0)

  const data = top.slice()
  if (othersSum > 0) {
    data.push({ name: '其他', value: othersSum })
  }

  return {
    tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)', confine: true },
    legend: isCompact.value
      ? {
          orient: 'horizontal',
          bottom: 0,
          type: 'scroll',
          itemWidth: 10,
          itemHeight: 10,
          textStyle: { fontSize: 11 }
        }
      : { orient: 'horizontal', bottom: 0, type: 'scroll' },
    series: [
      {
        type: 'pie',
        radius: isCompact.value ? ['30%', '54%'] : ['40%', '70%'],
        center: isCompact.value ? ['50%', '42%'] : ['50%', '50%'],
        avoidLabelOverlap: false,
        label: { show: false, position: 'center' },
        emphasis: { label: { show: true, fontSize: '14', fontWeight: 'bold' } },
        labelLine: { show: false },
        data
      }
    ]
  }
})
</script>

<style scoped></style>
