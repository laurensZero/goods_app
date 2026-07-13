<template>
  <div class="preset-sort-bar">
    <div class="sort-tabs">
      <button
        type="button"
        :class="['sort-tab', { 'sort-tab--active': sortMode === 'default' }]"
        @click="$emit('update:sortMode', 'default')"
      >
        {{ t('manage.sort.default') }}
      </button>
      <button
        type="button"
        :class="['sort-tab', { 'sort-tab--active': sortMode === 'name' }]"
        @click="$emit('update:sortMode', 'name')"
      >
        {{ t('manage.sort.name') }}
      </button>
      <button
        type="button"
        :class="['sort-tab', { 'sort-tab--active': sortMode === 'goodsCount' }]"
        @click="$emit('update:sortMode', 'goodsCount')"
      >
        {{ t('manage.sort.goodsCount') }}
      </button>
    </div>

    <button
      type="button"
      class="sort-dir-btn"
      :aria-label="sortDirection === 'asc' ? t('manage.sort.asc') : t('manage.sort.desc')"
      @click="$emit('toggle-direction')"
    >
      <svg
        class="sort-dir-icon"
        :class="{ 'sort-dir-icon--desc': sortDirection === 'desc' }"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
      >
        <path d="M7 14l5-5 5 5" />
      </svg>
    </button>
  </div>
</template>

<script setup>
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

defineProps({
  sortMode: { type: String, required: true },
  sortDirection: { type: String, required: true }
})

defineEmits(['update:sortMode', 'toggle-direction'])
</script>

<style scoped>
.preset-sort-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 0 16px;
  margin-bottom: 12px;
}

.sort-tabs {
  display: flex;
  gap: 4px;
  padding: 3px;
  border-radius: 10px;
  background: rgba(142, 142, 147, 0.12);
}

.sort-tab {
  height: 30px;
  padding: 0 12px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--app-text-secondary);
  font-size: 13px;
  font-weight: 600;
  transition: background 0.16s ease, color 0.16s ease, box-shadow 0.16s ease;
}

.sort-tab--active {
  background: var(--app-surface);
  color: var(--app-text);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
}

.sort-dir-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border: none;
  border-radius: 8px;
  background: rgba(142, 142, 147, 0.12);
  color: var(--app-text-secondary);
  transition: background 0.16s ease, color 0.16s ease;
}

.sort-dir-btn:active {
  background: rgba(142, 142, 147, 0.22);
}

.sort-dir-icon {
  width: 16px;
  height: 16px;
  stroke: currentColor;
  stroke-width: 2.2;
  stroke-linecap: round;
  stroke-linejoin: round;
  transition: transform 0.2s ease;
}

.sort-dir-icon--desc {
  transform: rotate(180deg);
}

:global(html.theme-dark) .sort-tab--active {
  background: rgba(255, 255, 255, 0.12);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.22);
}
</style>
