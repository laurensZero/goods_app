<template>
  <Transition name="overlay-fade">
    <div v-if="show" class="overlay" @click.self="cancel">
      <div class="dialog nfc-dialog" role="dialog" aria-modal="true" aria-label="绑定 NFC 标签">
        <p class="dialog-label">NFC 绑定</p>
        <h3 class="dialog-title">绑定 NFC 标签</h3>

        <div class="nfc-content">
          <div class="nfc-animation" :class="{ 'is-scanning': status === 'scanning', 'is-success': status === 'success', 'is-error': status === 'error' }">
            <svg viewBox="0 0 24 24" fill="none" class="nfc-icon">
              <path v-if="status !== 'success' && status !== 'error'" d="M4.68 18C2.5 16 1.34 13.9 1 12M8.9 15C7.75 13.3 7.55 12.3 7.8 10M13.1 12.1C13.5 11 13.9 10 14.5 9M18.3 9.4C19.5 8 20.6 6.8 21.6 5.8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
              <path v-if="status === 'success'" d="M5 13L9 17L19 7" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
              <path v-if="status === 'error'" d="M18 6L6 18M6 6L18 18" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>
          <p class="dialog-desc">{{ promptMessage }}</p>
        </div>

        <div class="dialog-actions">
          <button
            type="button"
            class="dialog-btn dialog-btn--secondary"
            @click="cancel"
          >
            {{ status === 'scanning' ? '取消' : '关闭' }}
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  show: Boolean,
  status: { type: String, default: 'scanning' }, // 'scanning' | 'success' | 'error'
  message: { type: String, default: '' },
  nodeName: { type: String, default: '' }
})

const emit = defineEmits(['cancel'])

const promptMessage = computed(() => {
  if (props.message) return props.message
  if (props.status === 'success') return `写入成功！\n现在碰一碰即可筛选 ${props.nodeName} 的物品。`
  if (props.status === 'error') return '写入失败，请检查标签或重试。'
  return `请将手机背面靠近 NFC 贴纸以写入\n${props.nodeName}`
})

function cancel() {
  emit('cancel')
}
</script>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  z-index: 1150;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  padding-bottom: calc(24px + env(safe-area-inset-bottom));
  background: rgba(14, 18, 28, 0.38);
}

.nfc-dialog {
  width: min(100%, 480px);
  padding: 24px;
  overflow: hidden;
  border-radius: var(--radius-large);
  border: 1px solid var(--app-glass-border);
  background: color-mix(in srgb, var(--app-glass-strong) 90%, transparent);
  box-shadow: var(--app-shadow);
  text-align: center;
}

.dialog-label {
  color: var(--app-text-tertiary);
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.dialog-title {
  margin: 6px 0 0;
  color: var(--app-text);
  font-size: 19px;
  font-weight: 600;
  letter-spacing: -0.03em;
}

.nfc-content {
  padding: 22px 0 6px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 18px;
}

.nfc-animation {
  width: 76px;
  height: 76px;
  border-radius: 50%;
  border: 1px solid color-mix(in srgb, var(--app-glass-border) 86%, transparent);
  background:
    radial-gradient(circle at 30% 30%, color-mix(in srgb, var(--app-glass) 82%, transparent), transparent 68%),
    color-mix(in srgb, var(--app-glass) 76%, var(--app-surface-soft));
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--app-text-secondary);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.24),
    0 12px 28px color-mix(in srgb, var(--app-text) 8%, transparent);
  transition:
    transform var(--motion-medium) var(--motion-emphasis),
    background var(--motion-medium) var(--motion-emphasis),
    color var(--motion-medium) var(--motion-emphasis),
    box-shadow var(--motion-medium) var(--motion-emphasis);
}

.nfc-animation.is-scanning {
  color: var(--app-primary);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.26),
    0 16px 36px color-mix(in srgb, var(--app-primary) 18%, transparent);
}

.nfc-animation.is-scanning .nfc-icon {
  animation: pulse-nfc 1.5s infinite ease-in-out;
}

.nfc-animation.is-success {
  background:
    radial-gradient(circle at 30% 30%, rgba(52, 199, 89, 0.22), transparent 68%),
    color-mix(in srgb, var(--app-glass) 76%, rgba(52, 199, 89, 0.10));
  color: #34C759;
}

.nfc-animation.is-error {
  background:
    radial-gradient(circle at 30% 30%, rgba(255, 59, 48, 0.22), transparent 68%),
    color-mix(in srgb, var(--app-glass) 76%, rgba(255, 59, 48, 0.10));
  color: #FF3B30;
}

.nfc-icon {
  width: 36px;
  height: 36px;
}

@keyframes pulse-nfc {
  0% { transform: scale(0.9); opacity: 0.7; }
  50% { transform: scale(1.1); opacity: 1; }
  100% { transform: scale(0.9); opacity: 0.7; }
}

.dialog-desc {
  white-space: pre-wrap;
  margin: 0;
  color: var(--app-text-secondary);
  font-size: 14px;
  line-height: 1.6;
}

.dialog-actions {
  display: flex;
  justify-content: center;
  margin-top: 20px;
}

.dialog-btn {
  min-height: 42px;
  min-width: 140px;
  padding: 0 18px;
  border: none;
  border-radius: 12px;
  font-size: 14px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--app-surface-soft);
  color: var(--app-text-secondary);
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.dialog-btn--secondary {
  background: color-mix(in srgb, var(--app-glass) 78%, var(--app-surface-soft));
  color: var(--app-text-secondary);
}

.dialog-btn:active {
  opacity: 0.8;
}

.overlay-fade-enter-active,
.overlay-fade-leave-active {
  transition: opacity 0.25s ease;
}

.overlay-fade-enter-active .dialog,
.overlay-fade-leave-active .dialog {
  transition: transform 0.25s ease;
}

.overlay-fade-enter-from,
.overlay-fade-leave-to {
  opacity: 0;
}

.overlay-fade-enter-from .dialog,
.overlay-fade-leave-to .dialog {
  transform: scale(0.95) translateY(8px);
}

@media (max-width: 767px) {
  .overlay {
    align-items: flex-end;
    padding: 16px;
    padding-bottom: calc(var(--tabbar-height) + 24px + env(safe-area-inset-bottom));
  }

  .nfc-dialog {
    width: 100%;
    padding: 20px;
    border-bottom-left-radius: 28px;
    border-bottom-right-radius: 28px;
  }

  .dialog-actions {
    margin-inline: -20px;
    padding: 14px 20px calc(4px + max(env(safe-area-inset-bottom), 0px));
  }

  .dialog-btn {
    flex: 1 1 0;
    min-width: 0;
    width: 100%;
  }
}
</style>
