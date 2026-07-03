<template>
  <Teleport to="body">
    <Transition name="confirm-modal">
      <div v-if="show" class="confirm-overlay" @click="handleCancel">
        <div class="confirm-card" role="alertdialog" aria-modal="true" @click.stop>
          <div class="confirm-icon">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M3 6H21" />
              <path d="M8 6V4H16V6" />
              <path d="M19 6L18 20H6L5 6" />
              <path d="M10 11V17" />
              <path d="M14 11V17" />
            </svg>
          </div>
          <h2 class="confirm-title">{{ title }}</h2>
          <p class="confirm-desc">{{ description }}</p>
          <div class="confirm-actions">
            <button class="confirm-btn confirm-btn--ghost" type="button" @click="handleCancel">
              {{ cancelText }}
            </button>
            <button class="confirm-btn confirm-btn--danger" type="button" @click="handleConfirm">
              {{ confirmText }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
const props = defineProps({
  show: { type: Boolean, default: false },
  title: { type: String, default: '' },
  description: { type: String, default: '' },
  confirmText: { type: String, default: '确认' },
  cancelText: { type: String, default: '取消' }
})

const emit = defineEmits(['update:show', 'cancel', 'confirm'])

function handleCancel() {
  emit('update:show', false)
  emit('cancel')
}

function handleConfirm() {
  emit('update:show', false)
  emit('confirm')
}
</script>

<style scoped>
.confirm-overlay {
  position: fixed;
  inset: 0;
  z-index: 3000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--app-overlay, rgba(20, 20, 22, 0.22));
  backdrop-filter: blur(var(--app-overlay-blur, 8px)) saturate(var(--app-overlay-saturate, 120%));
  -webkit-backdrop-filter: blur(var(--app-overlay-blur, 8px)) saturate(var(--app-overlay-saturate, 120%));
  padding: 24px;
}

.confirm-card {
  width: min(100%, 320px);
  padding: 28px 24px 24px;
  border-radius: 24px;
  background: var(--app-surface);
  box-shadow: 0 22px 56px rgba(0, 0, 0, 0.18);
  text-align: center;
}

.confirm-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: rgba(255, 59, 48, 0.1);
  color: #ff3b30;
}

.confirm-icon svg {
  width: 20px;
  height: 20px;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.confirm-title {
  margin-top: 16px;
  color: var(--app-text);
  font-size: 20px;
  font-weight: 600;
  letter-spacing: -0.03em;
}

.confirm-desc {
  margin-top: 8px;
  color: var(--app-text-secondary);
  font-size: 14px;
  line-height: 1.6;
}

.confirm-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-top: 20px;
}

.confirm-btn {
  height: 48px;
  border: none;
  border-radius: 16px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.16s ease, opacity 0.16s ease, background 0.16s ease;
}

.confirm-btn:active {
  transform: scale(0.96);
}

.confirm-btn--ghost {
  background: var(--app-surface-soft);
  color: var(--app-text);
}

.confirm-btn--danger {
  background: var(--app-primary);
  color: #ffffff;
}

.confirm-modal-enter-active,
.confirm-modal-leave-active {
  transition: opacity 180ms ease;
}

.confirm-modal-enter-from,
.confirm-modal-leave-to {
  opacity: 0;
}

:global(html.theme-dark) .confirm-card {
  background: rgba(24, 24, 28, 0.78);
  box-shadow: 0 22px 56px rgba(0, 0, 0, 0.42);
}

:global(html.theme-dark) .confirm-btn--ghost {
  background: rgba(255, 255, 255, 0.06);
}

:global(html.theme-dark) .confirm-btn--danger {
  background: #f5f5f7;
  color: #d32f2f;
}
</style>
