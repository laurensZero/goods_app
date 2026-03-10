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

defineEmits(['delete', 'edit'])
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
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  box-shadow: 0 -1px 0 rgba(0, 0, 0, 0.08), 0 -8px 24px rgba(0, 0, 0, 0.06);
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
  background: #f2f2f7;
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
</style>
