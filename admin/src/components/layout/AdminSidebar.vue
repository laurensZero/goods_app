<script setup>
import { computed } from 'vue'
import AppIcon from '../ui/AppIcon.vue'
import { SECTION_GROUPS } from '../../config/sections'

const props = defineProps({
  sections: { type: Array, required: true },
  activeId: { type: String, required: true },
  collapsed: { type: Boolean, default: false }
})

defineEmits(['toggle', 'select'])

// 按 SECTION_GROUPS 顺序归类；未登记 group 的分区兜底到最后
const groups = computed(() => {
  const known = SECTION_GROUPS
    .map((g) => ({ ...g, items: props.sections.filter((s) => s.group === g.id) }))
    .filter((g) => g.items.length)
  const orphans = props.sections.filter((s) => !SECTION_GROUPS.some((g) => g.id === s.group))
  return orphans.length ? [...known, { id: '_other', label: '其他', items: orphans }] : known
})
</script>

<template>
  <aside
    class="admin-sidebar"
    :class="{ 'admin-sidebar--collapsed': collapsed }"
    aria-label="功能分区"
  >
    <button
      type="button"
      class="nav-item nav-item--brand"
      :title="collapsed ? '展开侧栏' : '收起侧栏'"
      @click="$emit('toggle')"
    >
      <AppIcon class="nav-icon" name="package" :size="18" />
      <span v-if="!collapsed" class="nav-label">Goods APP 管理台</span>
    </button>

    <template v-for="group in groups" :key="group.id">
      <p v-if="!collapsed" class="admin-sidebar__divider">{{ group.label }}</p>

      <button
        v-for="section in group.items"
        :key="section.id"
        type="button"
        class="nav-item"
        :class="{ active: activeId === section.id }"
        :title="section.label"
        @click="$emit('select', section.id)"
      >
        <AppIcon class="nav-icon" :name="section.icon" :size="16" />
        <span v-if="!collapsed" class="nav-label">{{ section.label }}</span>
      </button>
    </template>
  </aside>
</template>

<style scoped>
.admin-sidebar {
  display: none;
}

@media (min-width: 1180px) {
  .admin-sidebar {
    display: flex;
    flex-direction: column;
    gap: 4px;
    position: sticky;
    top: 16px;
    z-index: 20;
    flex: 0 0 auto;
    width: 196px;
    margin: 16px 18px 16px clamp(12px, 2vw, 24px);
    padding: 10px 8px;
    background: color-mix(in srgb, var(--app-surface) 88%, transparent);
    border: 1px solid var(--app-border);
    border-radius: var(--radius-small);
    box-shadow: var(--app-shadow-sm);
    backdrop-filter: blur(var(--app-frost-blur));
    -webkit-backdrop-filter: blur(var(--app-frost-blur));
    overflow-y: auto;
    max-height: calc(100vh - 32px);
    transition:
      width var(--motion-medium) var(--motion-ease-default),
      margin var(--motion-medium) var(--motion-ease-default);
  }

  .admin-sidebar--collapsed {
    width: 60px;
    margin-right: 10px;
    padding-left: 6px;
    padding-right: 6px;
  }

  .admin-sidebar__divider {
    margin: 10px 10px 6px;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--app-text-tertiary);
    user-select: none;
  }

  .admin-sidebar--collapsed .admin-sidebar__divider {
    display: none;
  }

  .nav-item {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 38px;
    padding: 0 10px;
    border-radius: 10px;
    background: transparent;
    color: var(--app-text-secondary);
    font-size: 13px;
    font-weight: 600;
    white-space: nowrap;
    text-align: left;
    flex: 0 0 auto;
  }

  .nav-item:hover {
    background: var(--app-surface-soft);
  }

  .nav-item.active {
    background: var(--app-text);
    color: var(--app-bg);
  }

  .nav-item:hover:not(.active) {
    color: var(--app-text);
  }

  .nav-icon {
    flex-shrink: 0;
    display: inline-flex;
  }

  .nav-label {
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .nav-item--brand {
    font-weight: 700;
    color: var(--app-text);
    font-size: 14px;
    margin-bottom: 6px;
  }

  .admin-sidebar--collapsed .nav-item {
    justify-content: center;
    padding: 0;
    min-height: 40px;
  }

  .admin-sidebar--collapsed .nav-item--brand {
    justify-content: center;
  }
}
</style>