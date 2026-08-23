<script setup>
import { computed } from 'vue'
import { SECTION_GROUPS } from '../../config/sections'

const props = defineProps({
  sections: { type: Array, required: true },
  activeId: { type: String, required: true }
})

defineEmits(['select'])

// 与侧栏同一套分组：组间插入细分隔线，未登记 group 的分区兜底到最后
const groups = computed(() => {
  const known = SECTION_GROUPS
    .map((g) => ({ ...g, items: props.sections.filter((s) => s.group === g.id) }))
    .filter((g) => g.items.length)
  const orphans = props.sections.filter((s) => !SECTION_GROUPS.some((g) => g.id === s.group))
  return orphans.length ? [...known, { id: '_other', label: '其他', items: orphans }] : known
})
</script>

<template>
  <nav class="admin-topnav" aria-label="分区切换">
    <template v-for="(group, gi) in groups" :key="group.id">
      <span v-if="gi > 0" class="nav-sep" aria-hidden="true" />
      <button
        v-for="section in group.items"
        :key="section.id"
        type="button"
        class="nav-item"
        :class="{ active: activeId === section.id }"
        @click="$emit('select', section.id)"
      >
        {{ section.short }}
      </button>
    </template>
  </nav>
</template>

<style scoped>
.admin-topnav {
  position: sticky;
  top: 0;
  z-index: 30;
  display: flex;
  gap: 8px;
  flex-wrap: nowrap;
  overflow-x: auto;
  scrollbar-width: none;
  margin: 0 calc(var(--page-padding) * -1);
  padding: 12px var(--page-padding);
  background: color-mix(in srgb, var(--app-bg) 78%, transparent);
  -webkit-backdrop-filter: blur(16px) saturate(1.4);
  backdrop-filter: blur(16px) saturate(1.4);
}

.admin-topnav::-webkit-scrollbar {
  display: none;
}

.nav-sep {
  flex-shrink: 0;
  align-self: stretch;
  width: 1px;
  margin: 2px 3px;
  background: var(--app-border);
}

.nav-item {
  flex-shrink: 0;
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
