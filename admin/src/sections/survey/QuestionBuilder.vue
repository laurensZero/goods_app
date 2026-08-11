<script setup>
import { SURVEY_QUESTION_TYPES } from '../../constants'
import AppSelect from '../../components/admin/AppSelect.vue'

const props = defineProps({
  modelValue: { type: Array, default: () => [] }
})

const emit = defineEmits(['update:modelValue'])

function genId(prefix) {
  return `${prefix}-${Math.random().toString(36).substring(2, 8)}`
}

function newQuestion(type = 'single_choice') {
  const q = {
    id: genId('q'),
    type,
    title: '',
    description: '',
    image: '',
    required: false,
    options: [],
    minSelect: 0,
    maxSelect: 0,
    placeholder: '',
    maxLength: 0,
    multiline: false,
    maxRating: 5,
    labels: {},
    matrixType: 'rating',
    rows: [],
    columns: []
  }
  if (type === 'single_choice' || type === 'multiple_choice') {
    q.options.push({ id: genId('opt'), label: '' })
  }
  if (type === 'matrix') {
    q.rows.push({ id: genId('row'), label: '' })
    q.columns = [{ id: 'col-1', label: '' }]
  }
  return q
}

function update(list) {
  emit('update:modelValue', list)
}

function addQuestion() {
  update([...props.modelValue, newQuestion('single_choice')])
}

function removeQuestion(qi) {
  update(props.modelValue.filter((_, idx) => idx !== qi))
}

function duplicateQuestion(qi) {
  const copy = JSON.parse(JSON.stringify(props.modelValue[qi]))
  copy.id = genId('q')
  if (Array.isArray(copy.options)) copy.options = copy.options.map((o) => ({ ...o, id: genId('opt') }))
  if (Array.isArray(copy.rows)) copy.rows = copy.rows.map((r) => ({ ...r, id: genId('row') }))
  if (Array.isArray(copy.columns)) copy.columns = copy.columns.map((c) => ({ ...c, id: genId('col') }))
  const next = [...props.modelValue]
  next.splice(qi + 1, 0, copy)
  update(next)
}

function moveQuestion(qi, dir) {
  const target = qi + dir
  if (target < 0 || target >= props.modelValue.length) return
  const next = [...props.modelValue]
  const [item] = next.splice(qi, 1)
  next.splice(target, 0, item)
  update(next)
}

function changeType(q, newType) {
  if (q.type === newType) return
  // 保留公共字段，重建题型专属字段
  const next = newQuestion(newType)
  next.id = q.id
  next.title = q.title
  next.description = q.description
  next.image = q.image
  next.required = q.required
  const qi = props.modelValue.indexOf(q)
  if (qi >= 0) {
    const list = [...props.modelValue]
    list[qi] = next
    update(list)
  }
}

function addOption(q) {
  q.options.push({ id: genId('opt'), label: '' })
}

function removeOption(q, oi) {
  q.options.splice(oi, 1)
}

function addMatrixRow(q) {
  q.rows.push({ id: genId('row'), label: '' })
}

function removeMatrixRow(q, ri) {
  q.rows.splice(ri, 1)
}

function setMatrixColCount(q, count) {
  const n = Math.max(1, Math.min(10, Number(count) || 1))
  const current = q.columns || []
  if (n > current.length) {
    for (let i = current.length; i < n; i++) {
      current.push({ id: `col-${i + 1}`, label: '' })
    }
  } else if (n < current.length) {
    current.splice(n)
  }
}
</script>

<template>
  <div class="qb">
    <div v-if="!modelValue.length" class="tip">还没有题目。点击下方「+ 添加题目」开始构建。</div>

    <div v-for="(q, qi) in modelValue" :key="q.id" class="question-card">
      <div class="question-head">
        <span class="question-index">题目 {{ qi + 1 }}</span>
        <div class="question-ops">
          <button class="btn btn--sm btn--soft" type="button" :disabled="qi === 0" @click="moveQuestion(qi, -1)">↑</button>
          <button class="btn btn--sm btn--soft" type="button" :disabled="qi === modelValue.length - 1" @click="moveQuestion(qi, 1)">↓</button>
          <button class="btn btn--sm" type="button" @click="duplicateQuestion(qi)">复制</button>
          <button class="btn btn--sm btn--danger" type="button" @click="removeQuestion(qi)">删除</button>
        </div>
      </div>

      <div class="question-title-row">
        <input v-model="q.title" class="input" type="text" placeholder="题目标题">
        <AppSelect v-model="q.type" :options="SURVEY_QUESTION_TYPES" placeholder="题型" @change="changeType(q, $event)" />
      </div>

      <input v-model="q.description" class="input" type="text" placeholder="题目描述（可选）">
      <input v-model="q.image" class="input" type="text" placeholder="题目图片 URL（可选）">

      <label class="checkbox-row">
        <input v-model="q.required" type="checkbox">
        必填
      </label>

      <div v-if="q.type === 'single_choice' || q.type === 'multiple_choice'" class="options-editor">
        <span class="field-label">选项</span>
        <div v-for="(opt, oi) in q.options" :key="opt.id" class="option-row">
          <input v-model="opt.label" class="input" type="text" :placeholder="`选项 ${oi + 1}`">
          <button class="btn btn--sm" type="button" @click="removeOption(q, oi)">删除</button>
        </div>
        <button class="btn btn--soft btn--sm" type="button" @click="addOption(q)">+ 添加选项</button>
      </div>

      <div v-else-if="q.type === 'rating'" class="rating-editor">
        <label class="field-label">最大评分</label>
        <input v-model.number="q.maxRating" class="input rating-input" type="number" min="1" max="10">
      </div>

      <div v-else-if="q.type === 'matrix'" class="matrix-editor">
        <div>
          <span class="field-label">行（评分项目）</span>
          <div v-for="(row, ri) in q.rows" :key="row.id" class="option-row">
            <input v-model="row.label" class="input" type="text" :placeholder="`行 ${ri + 1}（如：画风、性价比）`">
            <button class="btn btn--sm" type="button" @click="removeMatrixRow(q, ri)">删除</button>
          </div>
          <button class="btn btn--soft btn--sm" type="button" @click="addMatrixRow(q)">+ 添加行</button>
        </div>
        <div class="matrix-cols">
          <span class="field-label">评分等级数（{{ q.columns?.length || 0 }} 颗星）</span>
          <div class="col-stepper">
            <button class="btn btn--sm" type="button" @click="setMatrixColCount(q, (q.columns?.length || 0) - 1)">−</button>
            <input class="input col-count" type="number" min="1" max="10" :value="q.columns?.length || 0" @change="setMatrixColCount(q, Number($event.target.value))">
            <button class="btn btn--sm" type="button" @click="setMatrixColCount(q, (q.columns?.length || 0) + 1)">+</button>
          </div>
          <p class="tip">每行显示这些星星，点击第 N 颗星即评 N 分</p>
        </div>
      </div>
    </div>

    <div class="actions">
      <button class="btn btn--soft" type="button" @click="addQuestion">+ 添加题目</button>
    </div>
  </div>
</template>

<style scoped>
.qb {
  display: grid;
  gap: 10px;
}

.question-card {
  border: 1px solid var(--app-border);
  border-radius: var(--radius-xs);
  padding: 12px;
  background: var(--app-surface-soft);
  display: grid;
  gap: 8px;
}

.question-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.question-index {
  font-weight: 600;
  font-size: 13px;
  color: var(--app-text-secondary);
}

.question-ops {
  display: flex;
  gap: 4px;
  align-items: center;
}

.question-title-row {
  display: grid;
  grid-template-columns: 1fr 120px;
  gap: 8px;
}

.options-editor,
.matrix-editor {
  display: grid;
  gap: 6px;
}

.option-row {
  display: flex;
  gap: 6px;
  align-items: center;
}

.rating-editor {
  display: flex;
  gap: 8px;
  align-items: center;
}

.rating-input {
  width: 80px;
}

.matrix-editor {
  grid-template-columns: 1fr auto;
  gap: 12px;
  align-items: start;
}

.matrix-cols {
  display: grid;
  gap: 4px;
}

.col-stepper {
  display: flex;
  gap: 4px;
  align-items: center;
}

.col-count {
  width: 56px;
  text-align: center;
}

.tip {
  font-size: 12px;
  color: var(--app-text-tertiary);
  margin: 4px 0 0;
}

.actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
}
</style>
