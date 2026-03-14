<template>
  <article class="location-node" :class="{ 'location-node--child-active': hasSelectedDescendant }">
    <div class="location-node__row">
      <button
        v-if="hasChildren"
        type="button"
        class="location-node__expander"
        :aria-expanded="expanded"
        @click="toggleExpanded"
      >
        <svg :class="{ 'location-node__expander-icon--open': expanded }" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M9 6L15 12L9 18" />
        </svg>
      </button>
      <span v-else class="location-node__expander location-node__expander--placeholder" aria-hidden="true"></span>

      <button
        type="button"
        :class="['location-node__chip', { 'location-node__chip--active': isSelected }]"
        @click="$emit('toggle', node.path)"
      >
        <span class="location-node__name">{{ node.name }}</span>
        <span class="location-node__count">{{ node.itemCount }}</span>
      </button>
    </div>

    <div v-if="hasChildren && expanded" class="location-node__children">
      <StorageLocationFilterTree
        v-for="child in node.children"
        :key="child.path"
        :node="child"
        :selected-values="selectedValues"
        @toggle="$emit('toggle', $event)"
      />
    </div>
  </article>
</template>

<script setup>
import { computed, ref, watch } from 'vue'

defineOptions({
  name: 'StorageLocationFilterTree'
})

const props = defineProps({
  node: {
    type: Object,
    required: true
  },
  selectedValues: {
    type: Array,
    default: () => []
  }
})

defineEmits(['toggle'])

const hasChildren = computed(() => Array.isArray(props.node.children) && props.node.children.length > 0)
const isSelected = computed(() => props.selectedValues.includes(props.node.path))

function hasSelectedChild(nodes) {
  return nodes.some((child) => (
    props.selectedValues.includes(child.path) || hasSelectedChild(child.children || [])
  ))
}

const hasSelectedDescendant = computed(() =>
  hasChildren.value && hasSelectedChild(props.node.children || [])
)

const expanded = ref(Boolean(isSelected.value || hasSelectedDescendant.value))

watch(
  [isSelected, hasSelectedDescendant],
  ([selected, descendantSelected]) => {
    if (selected || descendantSelected) {
      expanded.value = true
    }
  }
)

function toggleExpanded() {
  expanded.value = !expanded.value
}
</script>

<style scoped>
.location-node {
  display: inline-grid;
  align-content: start;
  gap: 6px;
  max-width: 100%;
}

.location-node__row {
  display: flex;
  align-items: center;
  gap: 6px;
  width: fit-content;
  max-width: 100%;
}

.location-node__expander {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--app-text-tertiary);
}

.location-node__expander:active,
.location-node__chip:active {
  transform: scale(0.988);
}

.location-node__expander--placeholder {
  opacity: 0;
  pointer-events: none;
}

.location-node__expander svg {
  width: 14px;
  height: 14px;
  stroke: currentColor;
  stroke-width: 2.2;
  stroke-linecap: round;
  stroke-linejoin: round;
  transition: transform 0.18s ease;
}

.location-node__expander-icon--open {
  transform: rotate(90deg);
}

.location-node__chip {
  display: inline-flex;
  align-items: center;
  justify-content: flex-start;
  gap: 8px;
  min-width: 0;
  flex: 0 1 auto;
  width: fit-content;
  max-width: min(100%, 420px);
  padding: 8px 12px;
  border: none;
  border-radius: 14px;
  background: var(--app-surface-soft);
  color: var(--app-text-secondary);
  text-align: left;
  transition: transform 0.16s ease, background 0.16s ease, color 0.16s ease;
}

.location-node__chip--active {
  background: #141416;
  color: #fff;
}

.location-node__name {
  min-width: 0;
  max-width: min(52vw, 260px);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  font-weight: 600;
}

.location-node__count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  min-width: 22px;
  height: 22px;
  padding: 0 7px;
  border-radius: 999px;
  background: rgba(20, 20, 22, 0.06);
  font-size: 12px;
  font-weight: 700;
}

.location-node__chip--active .location-node__count {
  background: rgba(255, 255, 255, 0.16);
}

.location-node__children {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 8px;
  margin-left: 8px;
  padding-left: 10px;
  border-left: 1px solid rgba(20, 20, 22, 0.08);
}

.location-node--child-active > .location-node__row .location-node__chip:not(.location-node__chip--active) {
  background: rgba(20, 20, 22, 0.08);
}

:global(html.theme-dark) .location-node__chip--active {
    background: #f5f5f7;
    color: #141416;
  }

:global(html.theme-dark) .location-node__count {
    background: rgba(255, 255, 255, 0.08);
  }

:global(html.theme-dark) .location-node__children {
    border-left-color: rgba(255, 255, 255, 0.08);
  }

:global(html.theme-dark) .location-node--child-active > .location-node__row .location-node__chip:not(.location-node__chip--active) {
    background: rgba(255, 255, 255, 0.08);
  }
</style>
