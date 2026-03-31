<template>
  <template v-if="show">
    <section class="selection-header-spacer" aria-hidden="true" />

    <section class="selection-header" :style="headerStyle">
      <button class="sel-back-btn" type="button" aria-label="退出多选" @click="$emit('back')">
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M15 18l-6-6 6-6" />
        </svg>
      </button>

      <span class="sel-title">已选择 {{ selectedCount }} 项</span>

      <button class="sel-all-btn" type="button" @click="$emit('toggle-all')">
        {{ allSelected ? '取消全选' : '全选' }}
      </button>
    </section>
  </template>
</template>

<script setup>
defineProps({
  show: { type: Boolean, default: false },
  selectedCount: { type: Number, required: true },
  allSelected: { type: Boolean, default: false },
  headerStyle: { type: Object, default: () => ({}) }
})

defineEmits(['back', 'toggle-all'])
</script>

<style scoped>
.selection-header-spacer {
  height: calc(64px + env(safe-area-inset-top));
}

.selection-header {
  position: fixed;
  top: var(--selection-header-top, 0px);
  left: 50%;
  z-index: 70;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: min(100vw, 430px);
  padding: calc(env(safe-area-inset-top) + 10px) var(--page-padding) 10px;
  border-radius: 22px;
  background: var(--app-glass-strong);
  border: 1px solid var(--app-glass-border);
  box-shadow: 0 10px 26px rgba(20, 20, 22, 0.08);
  backdrop-filter: blur(24px) saturate(145%);
  -webkit-backdrop-filter: blur(24px) saturate(145%);
  transform: translateX(-50%);
}

.sel-back-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: none;
  border-radius: 50%;
  background: var(--app-glass);
  border: 1px solid var(--app-glass-border);
  color: var(--app-text);
  flex-shrink: 0;
  cursor: pointer;
  transition: opacity 0.16s ease;
}

.sel-back-btn svg {
  width: 18px;
  height: 18px;
  stroke: currentColor;
  stroke-width: 2.2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.sel-back-btn:active {
  opacity: 0.6;
}

.sel-all-btn {
  border: none;
  background: color-mix(in srgb, var(--app-glass) 76%, var(--app-surface));
  color: var(--app-text-secondary);
  font-size: 13px;
  font-weight: 500;
  padding: 4px 10px;
  border-radius: 12px;
  min-width: 48px;
  cursor: pointer;
  flex-shrink: 0;
  transition: opacity 0.16s ease;
}

.sel-all-btn:active {
  opacity: 0.6;
}

.sel-title {
  flex: 1;
  text-align: center;
  color: var(--app-text);
  font-size: 16px;
  font-weight: 600;
  letter-spacing: -0.02em;
}

:global(html.theme-dark) .selection-header {
    background: var(--app-glass-strong);
    border-color: var(--app-glass-border);
    box-shadow: 0 14px 34px rgba(0, 0, 0, 0.34);
  }

:global(html.theme-dark) .sel-back-btn {
    background: var(--app-glass);
    border-color: var(--app-glass-border);
  }

:global(html.theme-dark) .sel-all-btn {
    background: rgba(255, 255, 255, 0.07);
    color: var(--app-text-secondary);
  }
</style>
