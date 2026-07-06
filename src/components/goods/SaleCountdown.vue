<template>
  <div v-if="text" class="sale-countdown">
    <span class="sale-countdown-icon">⏱</span>
    <span class="sale-countdown-text">{{ text }}</span>
  </div>
</template>

<script setup>
import { ref, watch, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { parseSaleAt } from '@/utils/saleReminder'

const { t } = useI18n()

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
    text.value = t('notify.saleTimeReached')
    return
  }

  const totalSec = Math.floor(diff / 1000)
  const days = Math.floor(totalSec / 86400)
  const hours = Math.floor((totalSec % 86400) / 3600)
  const minutes = Math.floor((totalSec % 3600) / 60)
  const seconds = totalSec % 60

  const parts = []
  if (days > 0) parts.push(`${days} ${t('common.daysUnit')}`)
  if (hours > 0) parts.push(`${hours} ${t('common.hoursUnit')}`)
  if (minutes > 0) parts.push(`${minutes} ${t('common.minutesUnit')}`)
  if (days === 0) parts.push(`${seconds} ${t('common.secondsUnit')}`)

  text.value = `${t('notify.saleCountdown')} ${parts.join(' ')}`
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
