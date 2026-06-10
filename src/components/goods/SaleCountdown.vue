<template>
  <div v-if="text" class="sale-countdown">
    <span class="sale-countdown-icon">⏱</span>
    <span class="sale-countdown-text">{{ text }}</span>
  </div>
</template>

<script setup>
import { ref, watch, onUnmounted } from 'vue'
import { parseSaleAt } from '@/utils/saleReminder'

const props = defineProps({
  saleAt: { type: String, default: '' }
})

const text = ref('')
let timer = null

function update() {
  const date = parseSaleAt(props.saleAt)
  if (!date) { text.value = ''; return }

  const diff = date.getTime() - Date.now()
  if (diff <= 0) {
    text.value = '已到开售时间'
    return
  }

  const totalSec = Math.floor(diff / 1000)
  const days = Math.floor(totalSec / 86400)
  const hours = Math.floor((totalSec % 86400) / 3600)
  const minutes = Math.floor((totalSec % 3600) / 60)
  const seconds = totalSec % 60

  const parts = []
  if (days > 0) parts.push(`${days} 天`)
  if (hours > 0) parts.push(`${hours} 时`)
  if (minutes > 0) parts.push(`${minutes} 分`)
  if (days === 0) parts.push(`${seconds} 秒`)

  text.value = `距开售 ${parts.join(' ')}`
}

function startTimer() {
  stopTimer()
  update()
  timer = window.setInterval(update, 1000)
}

function stopTimer() {
  if (timer) {
    window.clearInterval(timer)
    timer = null
  }
}

watch(() => props.saleAt, startTimer, { immediate: true })
onUnmounted(stopTimer)
</script>

<style scoped>
.sale-countdown {
  display: flex;
  align-items: center;
  gap: 5px;
  margin-top: 6px;
  padding: 6px 10px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--app-chip-accent-text) 8%, transparent);
  font-size: 13px;
  font-weight: 500;
  color: var(--app-chip-accent-text);
}

.sale-countdown-icon {
  font-size: 13px;
  line-height: 1;
}

.sale-countdown-text {
  letter-spacing: 0.3px;
}
</style>
