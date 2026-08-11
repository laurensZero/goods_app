<script setup>
defineProps({
  title: { type: String, default: '暂无数据' },
  description: { type: String, default: '' }
})
</script>

<template>
  <div class="empty-state">
    <div class="empty-icon">∅</div>
    <p class="empty-title">{{ title }}</p>
    <p v-if="description" class="empty-desc">{{ description }}</p>
  </div>
</template>

<style scoped>
.empty-state {
  display: grid;
  justify-items: center;
  gap: 6px;
  padding: 28px 16px;
  text-align: center;
}

.empty-icon {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  color: var(--app-text-tertiary);
  background: var(--app-surface-soft);
  border: 1px solid var(--app-border);
}

.empty-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--app-text-secondary);
}

.empty-desc {
  font-size: 12px;
  color: var(--app-text-tertiary);
}
</style>
