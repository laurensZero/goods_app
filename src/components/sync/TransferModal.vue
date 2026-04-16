<template>
  <div v-if="show" class="transfer-modal" role="dialog" aria-modal="true" aria-label="局域网同步进度">
    <div class="transfer-modal__panel">
      <p class="transfer-modal__label">LAN Transfer</p>
      <h3 class="transfer-modal__title">局域网同步中</h3>
      <p class="transfer-modal__desc">接收端确认后才会提交数据。请保持两台设备在前台并连接同一局域网。</p>

      <div class="transfer-modal__bar-track" aria-hidden="true">
        <div class="transfer-modal__bar" :style="{ width: `${progressRatio}%` }" />
      </div>
      <p class="transfer-modal__message">{{ progress.message || '正在准备传输...' }}</p>
      <p class="transfer-modal__meta">{{ progress.completedFiles || 0 }} / {{ progress.totalFiles || 0 }} 文件</p>
      <p v-if="sessionId" class="transfer-modal__session">会话：{{ sessionId }}</p>
      <p v-if="errorMessage" class="transfer-modal__error">{{ errorMessage }}</p>

      <button type="button" class="transfer-modal__close" @click="$emit('close')">关闭</button>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  show: {
    type: Boolean,
    default: false
  },
  progress: {
    type: Object,
    default: () => ({ totalFiles: 0, completedFiles: 0, message: '' })
  },
  sessionId: {
    type: String,
    default: ''
  },
  errorMessage: {
    type: String,
    default: ''
  }
})

defineEmits(['close'])

const progressRatio = computed(() => {
  const total = Number(props.progress?.totalFiles || 0)
  const done = Number(props.progress?.completedFiles || 0)
  if (total <= 0) return 12
  return Math.min(100, Math.round((done / total) * 100))
})
</script>

<style scoped>
.transfer-modal {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: color-mix(in srgb, var(--app-overlay) 86%, transparent);
  backdrop-filter: blur(10px);
}

.transfer-modal__panel {
  width: min(100%, 420px);
  padding: 20px;
  border-radius: var(--radius-large);
  background: var(--app-surface);
  box-shadow: var(--app-shadow);
}

.transfer-modal__label {
  color: var(--app-text-tertiary);
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.transfer-modal__title {
  margin-top: 6px;
  color: var(--app-text);
  font-size: 21px;
  font-weight: 600;
  letter-spacing: -0.03em;
}

.transfer-modal__desc {
  margin-top: 8px;
  color: var(--app-text-secondary);
  font-size: 13px;
  line-height: 1.5;
}

.transfer-modal__bar-track {
  margin-top: 14px;
  height: 8px;
  border-radius: 999px;
  overflow: hidden;
  background: color-mix(in srgb, var(--app-text) 10%, transparent);
}

.transfer-modal__bar {
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #5a78fa 0%, #1f9a8a 100%);
  transition: width var(--motion-medium) var(--motion-emphasis);
}

.transfer-modal__message,
.transfer-modal__meta,
.transfer-modal__session {
  margin-top: 10px;
  color: var(--app-text-secondary);
  font-size: 13px;
}

.transfer-modal__error {
  margin-top: 8px;
  color: #c74444;
  font-size: 13px;
}

.transfer-modal__close {
  margin-top: 16px;
  width: 100%;
  height: 42px;
  border: none;
  border-radius: var(--radius-small);
  background: color-mix(in srgb, var(--app-surface-soft) 88%, transparent);
  color: var(--app-text);
  font-size: 14px;
  font-weight: 600;
}
</style>
