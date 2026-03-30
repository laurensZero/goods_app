<template>
  <Teleport to="body">
    <Transition name="sheet-backdrop">
      <div v-if="modelValue" class="sheet-backdrop" @click="close" />
    </Transition>

    <Transition name="sheet-slide">
      <div v-if="modelValue" class="sheet-panel" role="dialog" aria-modal="true" aria-label="选择添加方式">
        <div class="sheet-handle" aria-hidden="true" />
        <p class="sheet-title">选择添加方式</p>

        <div class="sheet-options">
          <button class="sheet-option" type="button" @click="onManual">
            <span class="option-icon option-icon--manual">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <rect x="4" y="4" width="16" height="16" rx="3" />
                <path d="M8 12H16" />
                <path d="M12 8V16" />
              </svg>
            </span>
            <div class="option-body">
              <p class="option-title">手动添加</p>
              <p class="option-desc">手动填写游戏、项目和金额</p>
            </div>
            <svg class="option-arrow" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M9 6l6 6-6 6" />
            </svg>
          </button>

          <div class="sheet-divider" />

          <button class="sheet-option" type="button" @click="onPreset">
            <span class="option-icon option-icon--import">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="12" cy="12" r="8" />
                <path d="M12 8v4l3 3" />
              </svg>
            </span>
            <div class="option-body">
              <p class="option-title">从数据源选择</p>
              <p class="option-desc">从抓取到的充值档位中快速选择</p>
            </div>
            <svg class="option-arrow" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M9 6l6 6-6 6" />
            </svg>
          </button>
        </div>

        <button class="sheet-cancel" type="button" @click="close">取消</button>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
defineProps({
  modelValue: { type: Boolean, default: false }
})

const emit = defineEmits(['update:modelValue', 'manual', 'preset'])

function close() {
  emit('update:modelValue', false)
}

function onManual() {
  emit('manual')
  close()
}

function onPreset() {
  emit('preset')
  close()
}
</script>

<style scoped>
.sheet-backdrop {
  position: fixed;
  inset: 0;
  z-index: 100;
  background: var(--app-overlay);
  backdrop-filter: blur(var(--app-overlay-blur)) saturate(var(--app-overlay-saturate));
  -webkit-backdrop-filter: blur(var(--app-overlay-blur)) saturate(var(--app-overlay-saturate));
}

.sheet-panel {
  position: fixed;
  left: 50%;
  bottom: 0;
  transform: translateX(-50%);
  width: min(100vw, 480px);
  z-index: 110;
  padding: 12px 16px max(24px, env(safe-area-inset-bottom));
  border-radius: 24px 24px 0 0;
  background: color-mix(in srgb, var(--app-surface) 94%, transparent);
  border: 1px solid var(--app-glass-border);
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.12);
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
}

.sheet-handle {
  width: 36px;
  height: 4px;
  margin: 0 auto 16px;
  border-radius: 999px;
  background: rgba(142, 142, 147, 0.28);
}

.sheet-title {
  margin: 0 0 14px;
  text-align: center;
  color: var(--app-text-tertiary);
  font-size: 13px;
}

.sheet-options {
  margin-bottom: 10px;
  overflow: hidden;
  border-radius: 18px;
  background: color-mix(in srgb, var(--app-bg) 88%, var(--app-glass));
}

.sheet-option {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 16px;
  border: none;
  background: transparent;
  text-align: left;
  transition: background 0.14s ease;
}

.sheet-option:active {
  background: rgba(142, 142, 147, 0.12);
}

.sheet-divider {
  height: 1px;
  margin: 0 16px;
  background: rgba(142, 142, 147, 0.15);
}

.option-icon {
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.option-icon--manual {
  background: rgba(90, 120, 250, 0.12);
}

.option-icon--manual svg {
  width: 22px;
  height: 22px;
  stroke: #5a78fa;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.option-icon--import {
  background: rgba(50, 200, 140, 0.12);
}

.option-icon--import svg {
  width: 22px;
  height: 22px;
  stroke: #28c880;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.option-body {
  flex: 1;
  min-width: 0;
}

.option-title {
  margin: 0 0 2px;
  color: var(--app-text);
  font-size: 16px;
  font-weight: 600;
}

.option-desc {
  margin: 0;
  color: var(--app-text-tertiary);
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.option-arrow {
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  stroke: var(--app-text-tertiary);
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.sheet-cancel {
  width: 100%;
  height: 54px;
  border: none;
  border-radius: 18px;
  background: var(--app-bg, #f5f5f7);
  color: var(--app-text);
  font-size: 16px;
  font-weight: 600;
  transition: background 0.14s ease;
}

.sheet-cancel:active {
  background: rgba(142, 142, 147, 0.18);
}

.sheet-backdrop-enter-active,
.sheet-backdrop-leave-active {
  transition: opacity 0.28s ease;
}

.sheet-backdrop-enter-from,
.sheet-backdrop-leave-to {
  opacity: 0;
}

.sheet-slide-enter-active {
  transition: transform 0.32s cubic-bezier(0.34, 1.1, 0.64, 1), opacity 0.22s ease;
}

.sheet-slide-leave-active {
  transition: transform 0.24s ease, opacity 0.18s ease;
}

.sheet-slide-enter-from,
.sheet-slide-leave-to {
  transform: translateX(-50%) translateY(100%);
  opacity: 0.6;
}

@media (min-width: 900px) {
  .sheet-panel {
    bottom: auto;
    top: 50%;
    transform: translateX(-50%) translateY(-50%);
    border-radius: 24px;
    max-height: 90dvh;
    overflow-y: auto;
  }

  .sheet-handle {
    display: none;
  }

  .sheet-cancel {
    display: none;
  }

  .sheet-slide-enter-from,
  .sheet-slide-leave-to {
    transform: translateX(-50%) translateY(-50%) scale(0.94);
    opacity: 0;
  }
}

:global(html.theme-dark) .sheet-panel {
  background: rgba(24, 24, 28, 0.8);
  box-shadow: 0 24px 56px rgba(0, 0, 0, 0.42);
}

:global(html.theme-dark) .sheet-options,
:global(html.theme-dark) .sheet-cancel {
  background: rgba(255, 255, 255, 0.05);
}

:global(html.theme-dark) .sheet-option:active {
  background: rgba(255, 255, 255, 0.06);
}
</style>
