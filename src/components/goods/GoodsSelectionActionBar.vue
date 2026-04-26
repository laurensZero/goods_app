<template>
  <Teleport to="body">
    <Transition name="sel-bar">
      <div v-if="show" class="selection-action-bar">
        <button
          class="sel-action-btn sel-action-btn--danger"
          type="button"
          :disabled="selectedCount === 0"
          @click="$emit('delete')"
        >
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6l-1 14H6L5 6" />
            <path d="M10 11v6M14 11v6" />
          </svg>
          删除{{ selectedCount > 0 ? ` (${selectedCount})` : '' }}
        </button>
        <button class="sel-action-btn" type="button" :disabled="selectedCount === 0" @click="$emit('share')">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
            <polyline points="16 6 12 2 8 6" />
            <line x1="12" y1="2" x2="12" y2="15" />
          </svg>
          分享{{ selectedCount > 0 ? ` (${selectedCount})` : '' }}
        </button>
        <button class="sel-action-btn" type="button" :disabled="selectedCount === 0" @click="$emit('edit')">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
          批量修改
        </button>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
defineProps({
  show: { type: Boolean, default: false },
  selectedCount: { type: Number, default: 0 }
})

defineEmits(['delete', 'edit', 'share'])
</script>

<style scoped>
.selection-action-bar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  gap: 10px;
  padding: 12px 16px calc(env(safe-area-inset-bottom) + 12px);
  background: var(--app-glass-strong);
  border-top: 1px solid var(--app-glass-border);
  backdrop-filter: blur(22px) saturate(145%);
  -webkit-backdrop-filter: blur(22px) saturate(145%);
  box-shadow: 0 -1px 0 color-mix(in srgb, var(--app-glass-border) 60%, transparent), 0 -16px 36px rgba(0, 0, 0, 0.12);
  z-index: 80;
}

.sel-action-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 50px;
  border: none;
  border-radius: 14px;
  background: color-mix(in srgb, var(--app-glass) 72%, var(--app-surface));
  color: var(--app-text-secondary);
  font-size: 15px;
  font-weight: 600;
  letter-spacing: -0.02em;
  transition: transform 0.14s ease, opacity 0.14s ease;
}

.sel-action-btn:active {
  transform: scale(0.97);
}

.sel-action-btn:disabled {
  opacity: 0.38;
  pointer-events: none;
}

.sel-action-btn svg {
  width: 18px;
  height: 18px;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
  flex-shrink: 0;
}

.sel-action-btn--danger {
  color: var(--app-text);
}

.sel-bar-enter-active,
.sel-bar-leave-active {
  transition: transform 0.24s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.2s ease;
}

.sel-bar-enter-from,
.sel-bar-leave-to {
  transform: translateY(100%);
  opacity: 0;
}

@media (min-width: 600px) {
  .selection-action-bar {
    left: 50%;
    right: auto;
    bottom: max(12px, env(safe-area-inset-bottom));
    width: min(100vw, 430px);
    padding: 10px var(--page-padding);
    border: 1px solid var(--app-glass-border);
    border-radius: 22px;
    transform: translateX(-50%);
  }
}

:global(html.theme-dark) .selection-action-bar {
    background: var(--app-glass-strong);
    border-top-color: var(--app-glass-border);
    box-shadow: 0 -1px 0 rgba(255, 255, 255, 0.06), 0 -14px 34px rgba(0, 0, 0, 0.34);
  }

:global(html.theme-dark) .sel-action-btn {
    background: rgba(255, 255, 255, 0.07);
    color: var(--app-text-secondary);
  }
</style>
