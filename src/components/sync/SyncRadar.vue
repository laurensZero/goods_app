<template>
  <article class="sync-radar-card">
    <div class="sync-radar-head">
      <div>
        <p class="sync-radar-label">LAN Sync</p>
        <h3 class="sync-radar-title">同步中心</h3>
      </div>
      <button type="button" class="sync-radar-refresh" :disabled="loading || disabled" @click="$emit('refresh')">
        {{ loading ? '扫描中...' : '重新扫描' }}
      </button>
    </div>

    <div class="sync-radar-status" :class="`status--${status}`">
      <span class="sync-radar-dot" aria-hidden="true" />
      <p>{{ statusText }}</p>
    </div>

    <div v-if="devices.length > 0" class="sync-radar-list">
      <DeviceCard
        v-for="device in devices"
        :key="device.baseUrl"
        :device="device"
        :disabled="disabled"
        @select="$emit('select-device', $event)"
      />
    </div>

    <div v-if="showManualFallback" class="manual-fallback">
      <p class="manual-fallback__title">自动发现失败，手动输入接收端 IP</p>
      <p class="manual-fallback__desc">请确认接收端服务已启动，并放行防火墙端口。若处于访客 Wi-Fi 或 AP 隔离网络，可能无法建立连接。</p>
      <div class="manual-fallback__row">
        <input
          :value="manualHost"
          class="manual-fallback__input"
          type="text"
          inputmode="decimal"
          placeholder="例如 192.168.1.23"
          :disabled="disabled"
          @input="$emit('update:manualHost', $event.target.value)"
        >
        <button type="button" class="manual-fallback__btn" :disabled="disabled || !manualHost" @click="$emit('start-manual')">开始同步</button>
      </div>
      <p v-if="errorMessage" class="manual-fallback__error">{{ errorMessage }}</p>
    </div>
  </article>
</template>

<script setup>
import { computed } from 'vue'
import DeviceCard from './DeviceCard.vue'

const props = defineProps({
  status: {
    type: String,
    default: 'idle'
  },
  devices: {
    type: Array,
    default: () => []
  },
  loading: {
    type: Boolean,
    default: false
  },
  disabled: {
    type: Boolean,
    default: false
  },
  manualHost: {
    type: String,
    default: ''
  },
  errorMessage: {
    type: String,
    default: ''
  }
})

defineEmits(['refresh', 'select-device', 'update:manualHost', 'start-manual'])

const showManualFallback = computed(() => props.status === 'failed')
const statusText = computed(() => {
  if (props.status === 'searching') return '正在扫描同一局域网中的可用设备'
  if (props.status === 'ready') return `发现 ${props.devices.length} 台可同步设备`
  if (props.status === 'failed') return '未自动发现设备'
  return '点击重新扫描开始发现设备'
})
</script>

<style scoped>
.sync-radar-card {
  padding: 18px;
  border-radius: var(--radius-large);
  background: var(--app-surface);
  box-shadow: var(--app-shadow);
}

.sync-radar-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.sync-radar-label {
  color: var(--app-text-tertiary);
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.sync-radar-title {
  margin-top: 6px;
  font-size: 22px;
  font-weight: 600;
  letter-spacing: -0.03em;
}

.sync-radar-refresh {
  min-height: 36px;
  padding: 0 12px;
  border: none;
  border-radius: 999px;
  background: color-mix(in srgb, var(--app-surface-soft) 84%, transparent);
  color: var(--app-text);
  font-size: 13px;
  font-weight: 600;
}

.sync-radar-status {
  margin-top: 12px;
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--app-text-secondary);
  font-size: 13px;
}

.sync-radar-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: rgba(255, 162, 0, 0.78);
}

.status--ready .sync-radar-dot {
  background: rgba(40, 200, 128, 0.92);
}

.status--searching .sync-radar-dot {
  background: rgba(90, 120, 250, 0.88);
  animation: radar-pulse 1.2s ease-in-out infinite;
}

.sync-radar-list {
  margin-top: 14px;
  display: grid;
  gap: 10px;
}

.manual-fallback {
  margin-top: 14px;
  padding: 14px;
  border-radius: var(--radius-card);
  background: color-mix(in srgb, var(--app-surface-soft) 92%, transparent);
}

.manual-fallback__title {
  color: var(--app-text);
  font-size: 14px;
  font-weight: 600;
}

.manual-fallback__desc {
  margin-top: 6px;
  color: var(--app-text-secondary);
  font-size: 12px;
  line-height: 1.5;
}

.manual-fallback__row {
  margin-top: 10px;
  display: flex;
  gap: 8px;
}

.manual-fallback__input {
  flex: 1;
  min-width: 0;
  height: 40px;
  border: 1px solid color-mix(in srgb, var(--app-text) 12%, transparent);
  border-radius: var(--radius-small);
  background: var(--app-glass);
  color: var(--app-text);
  padding: 0 12px;
  font-size: 14px;
}

.manual-fallback__btn {
  height: 40px;
  padding: 0 14px;
  border: none;
  border-radius: var(--radius-small);
  background: #5a78fa;
  color: #fff;
  font-size: 13px;
  font-weight: 600;
}

.manual-fallback__error {
  margin-top: 8px;
  color: #c74444;
  font-size: 12px;
}

@keyframes radar-pulse {
  0% { transform: scale(0.9); opacity: 0.8; }
  100% { transform: scale(1.2); opacity: 0.35; }
}
</style>
