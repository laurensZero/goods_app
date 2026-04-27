<template>
  <Transition name="overlay-fade">
    <div v-if="showPrompt" class="overlay" @click.self="dismissImport">
      <div class="dialog">
        <p class="dialog-kicker">剪贴板</p>
        <h3 class="dialog-title">发现分享链接</h3>
        <p class="dialog-desc">检测到您复制了包含商品分享口令的内容，是否立即前往导入？</p>

        <div class="dialog-actions">
          <button
            type="button"
            class="dialog-btn dialog-btn--secondary"
            @click="dismissImport"
          >
            忽略
          </button>
          <button
            type="button"
            class="dialog-btn dialog-btn--primary"
            @click="confirmImport"
          >
            去导入
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup>
import { useClipboardImport } from '@/composables/useClipboardImport'

const { showPrompt, confirmImport, dismissImport } = useClipboardImport()
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
  background: rgba(0, 0, 0, 0.45);
}

.dialog {
  width: min(100%, 480px);
  padding: 24px;
  border-radius: var(--radius-large);
  background: var(--app-surface);
  box-shadow: var(--app-shadow);
  border: 1px solid var(--app-glass-border);
}

.dialog-kicker {
  margin: 0 0 6px;
  color: var(--app-text-tertiary);
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.dialog-title {
  margin: 0 0 12px;
  color: var(--app-text);
  font-size: 24px;
  font-weight: 700;
  line-height: 1.2;
  letter-spacing: -0.02em;
}

.dialog-desc {
  margin: 0 0 20px;
  color: var(--app-text-secondary);
  font-size: 15px;
  line-height: 1.5;
}

.dialog-actions {
  display: flex;
  gap: 12px;
  margin-top: 24px;
}

.dialog-btn {
  flex: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 44px;
  padding: 0 16px;
  border-radius: var(--radius-button);
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.25, 1, 0.5, 1); border-radius: 999px;
}

.dialog-btn:active {
  transform: scale(0.96);
}

.dialog-btn--secondary {
  border: none;
  background: var(--app-surface-muted);
  color: var(--app-text-secondary);
}

.dialog-btn--secondary:hover {
  background: var(--app-surface-soft);
  color: var(--app-text);
}

.dialog-btn--primary {
  border: none;
  background: var(--app-text);
  color: var(--app-bg);
}

.dialog-btn--primary:hover {
  opacity: 0.9;
}

.overlay-fade-enter-active,
.overlay-fade-leave-active {
  transition: opacity 0.2s ease, backdrop-filter 0.2s ease;
}

.overlay-fade-enter-from,
.overlay-fade-leave-to {
  opacity: 0;
}

.overlay-fade-enter-active .dialog,
.overlay-fade-leave-active .dialog {
  transition: transform 0.3s cubic-bezier(0.25, 1, 0.5, 1), opacity 0.3s ease;
}

.overlay-fade-enter-from .dialog {
  opacity: 0;
  transform: scale(0.95) translateY(10px);
}

.overlay-fade-leave-to .dialog {
  opacity: 0;
  transform: scale(0.95);
}
</style>
