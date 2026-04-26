<template>
  <article class="tree-node">
    <div class="tree-node__row">
      <div class="tree-node__copy">
        <h3 class="tree-node__name">{{ node.name }}</h3>
        <p class="tree-node__path">{{ node.path }}</p>
        <p class="tree-node__meta">
          {{ stats.itemCount }} 件记录 · {{ stats.quantity }} 个
        </p>
      </div>

      <div class="tree-node__actions">
        <button type="button" class="tree-node__action tree-node__action--nfc" @click="$emit('write-nfc', node)">绑定 NFC</button>
        <button type="button" class="tree-node__action" @click="$emit('add-child', node)">新增子级</button>
        <button type="button" class="tree-node__action" @click="$emit('rename', node)">重命名</button>
        <button type="button" class="tree-node__action tree-node__action--danger" @click="$emit('remove', node)">删除</button>
      </div>
    </div>

    <div v-if="node.children?.length" class="tree-node__children">
      <StorageLocationTreeNode
        v-for="child in node.children"
        :key="child.id"
        :node="child"
        :stats-by-id="statsById"
        @write-nfc="$emit('write-nfc', $event)"
        @add-child="$emit('add-child', $event)"
        @rename="$emit('rename', $event)"
        @remove="$emit('remove', $event)"
      />
    </div>
  </article>
</template>

<script setup>
import { computed } from 'vue'

defineOptions({
  name: 'StorageLocationTreeNode'
})

const props = defineProps({
  node: {
    type: Object,
    required: true
  },
  statsById: {
    type: Object,
    default: () => ({})
  }
})

defineEmits(['write-nfc', 'add-child', 'rename', 'remove'])

const stats = computed(() =>
  props.statsById[props.node.id] || { itemCount: 0, quantity: 0 }
)
</script>

<style scoped>
.tree-node {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  border-radius: 20px;
  background: var(--app-surface);
  box-shadow: var(--app-shadow);
}

.tree-node__row {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.tree-node__copy {
  min-width: 0;
}

.tree-node__name {
  color: var(--app-text);
  font-size: 17px;
  font-weight: 700;
  line-height: 1.3;
}

.tree-node__path,
.tree-node__meta {
  margin-top: 6px;
  color: var(--app-text-secondary);
  font-size: 13px;
  line-height: 1.5;
}

.tree-node__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.tree-node__action {
  border: none;
  border-radius: 999px;
  padding: 7px 12px;
  background: rgba(20, 20, 22, 0.07);
  color: var(--app-text-secondary);
  font-size: 12px;
  font-weight: 600;
}

.tree-node__action:active {
  transform: scale(0.96);
}

.tree-node__action--danger {
  color: #c74444;
}

.tree-node__action--nfc {
  color: var(--app-primary);
}

.tree-node__children {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-left: 14px;
  border-left: 2px solid rgba(20, 20, 22, 0.08);
}

@media (min-width: 720px) {
  .tree-node__row {
    flex-direction: row;
    align-items: flex-start;
    justify-content: space-between;
    gap: 18px;
  }

  .tree-node__actions {
    justify-content: flex-end;
    flex-shrink: 0;
  }
}

:global(html.theme-dark) .tree-node__action {
    background: rgba(255, 255, 255, 0.08);
    color: var(--app-text);
  }

:global(html.theme-dark) .tree-node__children {
    border-left-color: rgba(255, 255, 255, 0.08);
  }
</style>
