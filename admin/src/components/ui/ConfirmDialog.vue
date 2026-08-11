<script setup>
defineProps({
  visible: { type: Boolean, default: false },
  title: { type: String, default: '确认' },
  message: { type: String, default: '' },
  confirmText: { type: String, default: '确定' },
  cancelText: { type: String, default: '取消' },
  danger: { type: Boolean, default: false }
})

const emit = defineEmits(['confirm', 'cancel'])
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="confirm-overlay" @click.self="emit('cancel')">
      <div class="confirm-dialog" role="dialog" aria-modal="true">
        <div class="confirm-icon" :class="{ 'confirm-icon--danger': danger }">
          {{ danger ? '!' : '?' }}
        </div>
        <h3 class="confirm-title">{{ title }}</h3>
        <p v-if="message" class="confirm-message">{{ message }}</p>
        <div class="confirm-actions">
          <button class="btn" type="button" @click="emit('cancel')">{{ cancelText }}</button>
          <button
            class="btn"
            :class="danger ? 'btn--danger' : 'btn--primary'"
            type="button"
            @click="emit('confirm')"
          >
            {{ confirmText }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.confirm-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: var(--app-overlay);
  animation: confirm-fade var(--motion-fast) var(--motion-ease-default);
}

.confirm-dialog {
  width: 100%;
  max-width: 320px;
  background: var(--app-surface);
  border: 1px solid var(--app-border);
  border-radius: var(--radius-large);
  padding: 24px;
  box-shadow: var(--app-shadow);
  display: grid;
  gap: 10px;
  text-align: center;
  animation: confirm-pop var(--motion-medium) var(--motion-ease-emphasis);
}

.confirm-icon {
  width: 40px;
  height: 40px;
  margin: 0 auto;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  font-weight: 700;
  background: var(--app-surface-soft);
  color: var(--app-text-secondary);
}

.confirm-icon--danger {
  background: var(--status-error-bg);
  color: var(--status-error);
}

.confirm-title {
  font-size: 17px;
  font-weight: 600;
  color: var(--app-text);
}

.confirm-message {
  font-size: 13px;
  line-height: 1.6;
  color: var(--app-text-secondary);
  word-break: break-word;
}

.confirm-actions {
  display: flex;
  gap: 10px;
  margin-top: 6px;
}

.confirm-actions .btn {
  flex: 1;
}

@keyframes confirm-fade {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes confirm-pop {
  from { opacity: 0; transform: scale(0.92) translateY(8px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}
</style>
