<template>
  <Teleport to="body">
    <Transition name="confirm-modal">
      <div v-if="show" class="confirm-overlay" @click="updateShow(false)">
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
          <h2 class="confirm-title">移到回收站？</h2>
          <p class="confirm-desc">这些收藏会从清单中移除，但之后可以在回收站里恢复。</p>
          <div class="confirm-actions">
            <button class="confirm-btn confirm-btn--ghost" type="button" @click="updateShow(false)">取消</button>
            <button class="confirm-btn confirm-btn--danger" type="button" @click="$emit('confirm')">移入回收站</button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
const props = defineProps({
  show: { type: Boolean, default: false },
  selectedCount: { type: Number, default: 0 }
})

const emit = defineEmits(['update:show', 'confirm'])

function updateShow(value) {
  if (value === props.show) return
  emit('update:show', value)
}
</script>

<style scoped>
.confirm-overlay {
  position: fixed;
  inset: 0;
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: var(--app-overlay);
  backdrop-filter: blur(18px) saturate(125%);
  -webkit-backdrop-filter: blur(18px) saturate(125%);
}

.confirm-card {
  width: min(100%, 360px);
  padding: 22px;
  border-radius: 24px;
  background: color-mix(in srgb, var(--app-surface) 92%, transparent);
  border: 1px solid var(--app-glass-border);
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.12);
}

.confirm-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 14px;
  background: rgba(199, 68, 68, 0.1);
  color: #c74444;
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
  background: #141416;
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
