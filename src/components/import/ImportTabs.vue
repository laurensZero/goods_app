<template>
  <div class="import-tabs" role="tablist" :aria-label="ariaLabel">
    <button
      v-for="tab in tabs"
      :key="tab.key"
      class="import-tab"
      type="button"
      role="tab"
      :class="{ 'import-tab--active': modelValue === tab.key }"
      :aria-selected="modelValue === tab.key"
      @click="$emit('update:modelValue', tab.key)"
    >
      {{ tab.label }}
      <span v-if="tab.badge" class="import-tab-badge">{{ tab.badge }}</span>
    </button>
  </div>
</template>

<script setup>
defineOptions({ name: 'ImportTabs' })

defineProps({
  /** [{ key, label, badge? }]，badge 为空串/0 时不渲染 */
  tabs: { type: Array, required: true },
  modelValue: { type: String, default: '' },
  ariaLabel: { type: String, default: '' },
})

defineEmits(['update:modelValue'])
</script>

<style scoped>
/* 分段式页内切换（淘宝枢纽 / 米游铺导入共用），原 hub-tabs 抽至此处 */
.import-tabs {
  display: flex;
  gap: 6px;
  padding: 4px;
  border-radius: 14px;
  background: var(--app-surface-soft, rgba(120, 120, 128, 0.1));
}

.import-tab {
  flex: 1;
  min-height: 36px;
  border: none;
  border-radius: 10px;
  background: transparent;
  color: var(--app-text-secondary);
  font-size: 13px;
  font-weight: 500;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 0 6px;
}

.import-tab--active {
  background: var(--app-surface, #fff);
  color: var(--app-text);
  font-weight: 600;
  box-shadow: var(--app-shadow-sm, 0 1px 3px rgba(0, 0, 0, 0.08));
}

.import-tab-badge {
  font-size: 10px;
  line-height: 1;
  padding: 3px 5px;
  border-radius: 6px;
  background: var(--app-chip-accent-bg, rgba(255, 80, 0, 0.12));
  color: var(--app-chip-accent-text, #ff5000);
}
</style>
