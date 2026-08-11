<script setup>
import { reactive } from 'vue'

const props = defineProps({
  conditions: { type: Array, required: true }
})

const emit = defineEmits(['update:conditions'])

const TYPE_OPTIONS = [
  { value: 'local', label: '本地存储' },
  { value: 'sync_configured', label: '同步配置' },
  { value: 'db', label: '数据库查询' },
  { value: 'flag', label: '标记值' }
]

const DB_OPS = ['exists', 'empty', 'count>=', 'count>', 'count=', 'count<', 'count<=']

const fresh = reactive({})

function update() {
  emit('update:conditions', props.conditions)
}

function addCondition() {
  const type = fresh.type || 'local'
  const c = { type }
  if (type === 'local') { c.key = ''; c.exists = true; c.equals = '' }
  else if (type === 'sync_configured') { /* no params */ }
  else if (type === 'db') { c.table = ''; c.op = 'count>='; c.value = 0 }
  else if (type === 'flag') { c.key = ''; c.value = '' }
  props.conditions.push(c)
  emit('update:conditions', props.conditions)
}

function removeCondition(i) {
  props.conditions.splice(i, 1)
  emit('update:conditions', props.conditions)
}

function setExists(c, which) {
  if (which === 'true') {
    c.exists = true
    delete c.equals
  } else {
    c.exists = false
    delete c.equals
  }
  update()
}

function typeLabel(type) {
  return TYPE_OPTIONS.find(t => t.value === type)?.label || type || '未知'
}
</script>

<template>
  <div class="cond-editor">
    <div v-if="props.conditions.length" class="cond-list">
      <div v-for="(c, i) in props.conditions" :key="i" class="cond-item">
        <div class="cond-head">
          <span class="cond-label">{{ typeLabel(c.type) }} #{{ i + 1 }}</span>
          <button class="btn btn--sm" type="button" @click="removeCondition(i)">删除</button>
        </div>

        <div v-if="c.type === 'local'" class="cond-fields">
          <input v-model="c.key" class="input" type="text" placeholder="localStorage key" @input="update">
          <div class="cond-exists">
            <label class="checkbox-row">
              <input type="checkbox" :checked="c.exists === true" @change="setExists(c, 'true')">
              exists=true
            </label>
            <label class="checkbox-row">
              <input type="checkbox" :checked="c.exists === false" @change="setExists(c, 'false')">
              exists=false
            </label>
          </div>
          <input v-model="c.equals" class="input" type="text" placeholder="equals（可选）" @input="update">
        </div>

        <p v-else-if="c.type === 'sync_configured'" class="tip">
          检查 Supabase 同步是否已配置（无需参数）
        </p>

        <div v-else-if="c.type === 'db'" class="cond-fields cond-fields--row">
          <input v-model="c.table" class="input" type="text" placeholder="表名" @input="update">
          <select v-model="c.op" class="select" @change="update">
            <option v-for="op in DB_OPS" :key="op" :value="op">{{ op }}</option>
          </select>
          <input v-model.number="c.value" class="input" type="number" placeholder="值" @input="update">
        </div>

        <div v-else-if="c.type === 'flag'" class="cond-fields cond-fields--row">
          <input v-model="c.key" class="input" type="text" placeholder="key" @input="update">
          <input v-model="c.value" class="input" type="text" placeholder="value" @input="update">
        </div>
      </div>
    </div>
    <p v-else class="tip">暂无条件（对所有命中版本/通道的用户生效）</p>

    <div class="add-row">
      <select v-model="fresh.type" class="select add-select">
        <option v-for="t in TYPE_OPTIONS" :key="t.value" :value="t.value">{{ t.label }}</option>
      </select>
      <button class="btn btn--soft" type="button" @click="addCondition">+ 添加条件</button>
    </div>
  </div>
</template>

<style scoped>
.cond-editor {
  display: grid;
  gap: 8px;
}

.cond-list {
  display: grid;
  gap: 8px;
}

.cond-item {
  border: 1px solid var(--app-border);
  border-radius: var(--radius-xs);
  padding: 10px 12px;
  background: var(--app-surface-soft);
  display: grid;
  gap: 8px;
}

.cond-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.cond-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--app-text-secondary);
}

.cond-fields {
  display: grid;
  gap: 6px;
}

.cond-fields--row {
  grid-template-columns: 1fr 110px 70px;
}

.cond-exists {
  display: flex;
  gap: 12px;
  align-items: center;
}

.cond-exists .checkbox-row {
  min-height: 24px;
  font-size: 11px;
}

.add-row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.add-select {
  width: 150px;
}
</style>