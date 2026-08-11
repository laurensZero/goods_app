<script setup>
defineProps({
  sections: { type: Array, required: true },
  activeId: { type: String, required: true }
})

defineEmits(['select'])
</script>

<template>
  <nav class="admin-topnav" aria-label="分区切换">
    <button
      v-for="section in sections"
      :key="section.id"
      type="button"
      class="nav-item"
      :class="{ active: activeId === section.id }"
      @click="$emit('select', section.id)"
    >
      {{ section.short }}
    </button>
  </nav>
</template>

<style scoped>
.admin-topnav {
  position: sticky;
  top: 8px;
  z-index: 30;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  padding: 14px 0 0;
}

.nav-item {
  min-height: 34px;
  padding: 0 14px;
  border-radius: 999px;
  background: var(--app-surface-soft);
  border: 1px solid var(--app-border);
  color: var(--app-text-secondary);
  font-size: 13px;
  font-weight: 600;
}

.nav-item.active {
  background: var(--app-text);
  color: var(--app-bg);
  border-color: transparent;
}

@media (min-width: 1180px) {
  .admin-topnav {
    display: none;
  }
}
</style>