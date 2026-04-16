<template>
  <button
    type="button"
    class="device-card"
    :disabled="disabled"
    @click="$emit('select', device)"
  >
    <div class="device-card__copy">
      <p class="device-card__name">{{ device.deviceName }}</p>
      <p class="device-card__meta">{{ device.host }}:{{ device.port }} <span v-if="device.latencyMs">· {{ device.latencyMs }}ms</span></p>
    </div>
    <span class="device-card__action">连接</span>
  </button>
</template>

<script setup>
defineProps({
  device: {
    type: Object,
    required: true
  },
  disabled: {
    type: Boolean,
    default: false
  }
})

defineEmits(['select'])
</script>

<style scoped>
.device-card {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px;
  border: none;
  border-radius: var(--radius-card);
  background: color-mix(in srgb, var(--app-surface-soft) 88%, transparent);
  color: var(--app-text);
  text-align: left;
  transition: transform var(--motion-fast) var(--motion-emphasis);
}

.device-card:active:not(:disabled) {
  transform: scale(var(--press-scale-card));
}

.device-card:disabled {
  opacity: 0.56;
}

.device-card__name {
  font-size: 15px;
  font-weight: 600;
  letter-spacing: -0.02em;
}

.device-card__meta {
  margin-top: 5px;
  color: var(--app-text-secondary);
  font-size: 12px;
}

.device-card__action {
  flex-shrink: 0;
  padding: 6px 10px;
  border-radius: 999px;
  background: rgba(40, 200, 128, 0.16);
  color: #1f9a64;
  font-size: 12px;
  font-weight: 600;
}
</style>
