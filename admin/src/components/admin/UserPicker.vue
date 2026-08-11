<script setup>
import { computed, ref } from 'vue'
import { fetchUsersList } from '../../services/versionRules'

const props = defineProps({
  modelValue: { type: Array, default: () => [] }
})

const emit = defineEmits(['update:modelValue'])

const users = ref([])
const loading = ref(false)
const open = ref(false)
const query = ref('')
const error = ref('')

const selectedIds = computed(() => new Set(props.modelValue))

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return users.value
  return users.value.filter(u => (u.display || '').toLowerCase().includes(q))
})

async function ensureUsers() {
  loading.value = true
  error.value = ''
  try {
    users.value = await fetchUsersList()
  } catch (e) {
    error.value = e?.message || '获取用户列表失败。'
  } finally {
    loading.value = false
  }
}

function openPanel() {
  open.value = true
  if (users.value.length === 0) ensureUsers()
}

function closePanel() {
  open.value = false
  query.value = ''
}

function toggle() {
  if (open.value) closePanel()
  else openPanel()
}

function toggleUser(id) {
  const next = new Set(selectedIds.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  emit('update:modelValue', Array.from(next))
}

function remove(id) {
  const next = new Set(selectedIds.value)
  next.delete(id)
  emit('update:modelValue', Array.from(next))
}

function displayFor(id) {
  return users.value.find(u => u.id === id)?.display || id.slice(0, 12)
}
</script>

<template>
  <div class="user-picker">
    <div v-if="props.modelValue.length" class="selected-tags">
      <span v-for="id in props.modelValue" :key="id" class="chip tag">
        {{ displayFor(id) }}
        <button type="button" class="tag-remove" aria-label="移除" @click="remove(id)">×</button>
      </span>
    </div>
    <p v-else class="tip">未指定目标用户（对所有用户生效）</p>

    <div class="picker-head">
      <input
        class="input picker-query"
        type="text"
        :placeholder="open ? '搜索邮箱 / 手机号…' : '选择目标用户…'"
        v-model="query"
        :readonly="!open"
        @click="toggle"
      >
      <button class="btn btn--sm" type="button" @click="toggle">{{ open ? '完成' : '选择' }}</button>
    </div>

    <div v-if="loading" class="picker-body"><span class="history-item">加载中…</span></div>
    <p v-else-if="error" class="tip tip--warn">{{ error }}</p>
    <div v-else-if="open" class="picker-body">
      <div v-if="filtered.length === 0" class="history-item">无匹配用户</div>
      <label v-for="u in filtered" :key="u.id" class="checkbox-row">
        <input type="checkbox" :checked="selectedIds.has(u.id)" @change="toggleUser(u.id)">
        <span class="user-display">{{ u.display }}</span>
        <span class="user-id">{{ u.id.slice(0, 8) }}</span>
      </label>
    </div>
  </div>
</template>

<style scoped>
.user-picker {
  display: grid;
  gap: 8px;
}

.selected-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.tag {
  padding: 4px 10px;
  gap: 6px;
}

.tag-remove {
  border: none;
  background: none;
  color: var(--app-text-tertiary);
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
}

.picker-head {
  display: flex;
  gap: 8px;
  align-items: center;
}

.picker-query {
  flex: 1;
}

.picker-body {
  display: grid;
  gap: 4px;
  max-height: 220px;
  overflow-y: auto;
  padding: 8px;
  border: 1px solid var(--app-border);
  border-radius: var(--radius-xs);
  background: var(--app-surface-soft);
}

.user-display {
  color: var(--app-text);
  font-size: 13px;
}

.user-id {
  margin-left: auto;
  font-size: 10px;
  color: var(--app-text-tertiary);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
</style>