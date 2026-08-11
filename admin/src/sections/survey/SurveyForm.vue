<script setup>
import { reactive, ref, watch } from 'vue'
import { SHOW_MODES } from '../../constants'
import UserPicker from '../../components/admin/UserPicker.vue'
import ConditionEditor from '../../components/admin/ConditionEditor.vue'
import AppSelect from '../../components/admin/AppSelect.vue'
import QuestionBuilder from './QuestionBuilder.vue'

const CONDITION_LOGIC_OPTIONS = [
  { value: 'and', label: 'and（全部满足）' },
  { value: 'or', label: 'or（任一满足）' }
]

const props = defineProps({
  editing: { type: Object, default: null }
})

const emit = defineEmits(['submit', 'close'])

const form = reactive({
  id: '',
  image: '',
  title: '',
  description: '',
  showMode: 'once',
  channels: 'stable,beta',
  startAt: '',
  endAt: '',
  targetUsers: [],
  conditionLogic: 'and',
  conditions: [],
  enabled: true
})

const questions = ref([])
const saving = ref(false)
const error = ref('')

watch(
  () => props.editing,
  (item) => {
    error.value = ''
    if (!item) {
      Object.assign(form, {
        id: '',
        image: '',
        title: '',
        description: '',
        showMode: 'once',
        channels: 'stable,beta',
        startAt: '',
        endAt: '',
        targetUsers: [],
        conditionLogic: 'and',
        conditions: [],
        enabled: true
      })
      questions.value = [newQuestion()]
      return
    }
    const showRule = item.show_rule || {}
    Object.assign(form, {
      id: item.id,
      image: item.image || '',
      title: item.title || '',
      description: item.description || '',
      showMode: showRule.showMode || 'once',
      channels: Array.isArray(showRule.channels) ? showRule.channels.join(',') : 'stable,beta',
      startAt: showRule.startAt || '',
      endAt: showRule.endAt || '',
      targetUsers: Array.isArray(item.target_users) ? item.target_users : [],
      conditionLogic: showRule.logic || 'and',
      conditions: Array.isArray(showRule.conditions) ? showRule.conditions.map((c) => ({ ...c })) : [],
      enabled: item.enabled !== false
    })
    questions.value = (Array.isArray(item.questions) ? item.questions : []).map((q) => ({
      id: q.id || `q-${Math.random().toString(36).substring(2, 8)}`,
      type: q.type || 'text',
      title: q.title || '',
      description: q.description || '',
      image: q.image || '',
      required: q.required === true,
      options: (q.options || []).map((o) => ({ ...o })),
      minSelect: q.minSelect || 0,
      maxSelect: q.maxSelect || 0,
      placeholder: q.placeholder || '',
      maxLength: q.maxLength || 0,
      multiline: q.multiline === true,
      maxRating: q.maxRating || 5,
      labels: q.labels ? { ...q.labels } : {},
      matrixType: q.matrixType || 'rating',
      rows: (q.rows || []).map((r) => ({ ...r })),
      columns: (q.columns || []).map((c) => ({ ...c }))
    }))
  },
  { immediate: true }
)

function newQuestion() {
  return {
    id: `q-${Math.random().toString(36).substring(2, 8)}`,
    type: 'single_choice',
    title: '',
    description: '',
    image: '',
    required: false,
    options: [{ id: `opt-${Math.random().toString(36).substring(2, 8)}`, label: '' }],
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
}

function buildRow() {
  const f = form
  const id = String(f.id || '').trim()
  const title = String(f.title || '').trim()
  if (!id) throw new Error('问卷 ID 不能为空。')
  if (!title) throw new Error('问卷标题不能为空。')
  if (!questions.value.length) throw new Error('至少需要一个题目。')

  const channels = String(f.channels || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
  const targetUsers = f.targetUsers.map((s) => String(s).trim()).filter(Boolean)
  const cleanQuestions = questions.value.map((q) => ({
    id: q.id,
    type: q.type || 'text',
    title: q.title || '',
    description: q.description || '',
    image: q.image || '',
    required: q.required === true,
    options: (q.options || []).filter((o) => o && o.id),
    minSelect: q.minSelect || 0,
    maxSelect: q.maxSelect || 0,
    placeholder: q.placeholder || '',
    maxLength: q.maxLength || 0,
    multiline: q.multiline === true,
    maxRating: q.maxRating || 5,
    labels: q.labels || {},
    matrixType: q.matrixType || 'rating',
    rows: (q.rows || []).filter((r) => r && r.id),
    columns: (q.columns || []).filter((c) => c && c.id)
  }))

  return {
    id,
    title,
    description: String(f.description || '').trim(),
    image: String(f.image || '').trim(),
    questions: cleanQuestions,
    enabled: f.enabled,
    target_users: targetUsers.length ? targetUsers : [],
    show_rule: {
      showMode: String(f.showMode || 'once').trim(),
      startAt: String(f.startAt || '').trim(),
      endAt: String(f.endAt || '').trim(),
      channels: channels.length ? channels : ['stable', 'beta'],
      logic: String(f.conditionLogic || 'and').trim(),
      conditions: f.conditions.filter((c) => c && c.type)
    }
  }
}

async function submit() {
  saving.value = true
  error.value = ''
  try {
    const row = buildRow()
    emit('submit', row)
  } catch (e) {
    error.value = e?.message || '保存失败。'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="survey-form">
    <div class="form-group">
      <h4 class="group-title">基本信息</h4>
      <div class="group-grid">
        <div class="field">
          <label class="field-label">问卷 ID</label>
          <input v-model="form.id" class="input" type="text" :disabled="!!editing" placeholder="如 survey-20260724-1">
        </div>
        <div class="field">
          <label class="field-label">图片 URL（可选）</label>
          <input v-model="form.image" class="input" type="text" placeholder="https://…">
        </div>
        <div class="field field--full">
          <label class="field-label">标题</label>
          <input v-model="form.title" class="input" type="text" placeholder="问卷标题">
        </div>
        <div class="field field--full">
          <label class="field-label">描述</label>
          <textarea v-model="form.description" class="textarea" placeholder="问卷描述" />
        </div>
        <div class="field field--full">
          <label class="checkbox-row">
            <input v-model="form.enabled" type="checkbox">
            启用问卷
          </label>
        </div>
      </div>
    </div>

    <div class="form-group">
      <h4 class="group-title">展示规则</h4>
      <div class="group-grid">
        <div class="field">
          <label class="field-label">展示模式</label>
          <AppSelect v-model="form.showMode" :options="SHOW_MODES" placeholder="选择展示模式" />
        </div>
        <div class="field">
          <label class="field-label">展示通道（逗号分隔）</label>
          <input v-model="form.channels" class="input" type="text" placeholder="stable,beta">
        </div>
        <div class="field">
          <label class="field-label">开始时间（可选）</label>
          <input v-model="form.startAt" class="input" type="text" placeholder="2026-07-24T00:00:00Z">
        </div>
        <div class="field">
          <label class="field-label">结束时间（可选）</label>
          <input v-model="form.endAt" class="input" type="text" placeholder="2026-08-31T23:59:59Z">
        </div>
      </div>
    </div>

    <div class="form-group">
      <h4 class="group-title">定向</h4>
      <div class="field">
        <label class="field-label">定向用户（留空 = 所有用户）</label>
        <UserPicker v-model="form.targetUsers" />
      </div>
      <div class="field">
        <label class="field-label">条件逻辑（AND / OR）</label>
        <AppSelect v-model="form.conditionLogic" :options="CONDITION_LOGIC_OPTIONS" placeholder="选择条件逻辑" />
      </div>
      <div class="field">
        <label class="field-label">条件列表</label>
        <ConditionEditor v-model:conditions="form.conditions" />
      </div>
    </div>

    <div class="form-group">
      <h4 class="group-title">题目（{{ questions.length }}）</h4>
      <QuestionBuilder v-model="questions" />
    </div>

    <p v-if="error" class="status-text status-text--error">{{ error }}</p>

    <div class="form-actions">
      <button class="btn btn--primary" type="button" :disabled="saving" @click="submit">
        {{ saving ? '保存中…' : '保存问卷' }}
      </button>
      <button class="btn" type="button" @click="emit('close')">取消</button>
    </div>
  </div>
</template>

<style scoped>
.survey-form {
  display: grid;
  gap: 16px;
}

.form-group {
  display: grid;
  gap: 12px;
}

.group-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--app-text-secondary);
  margin: 0;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--app-border);
}

.group-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
}

.form-actions {
  display: flex;
  gap: 10px;
}

.form-actions .btn {
  flex: 1;
}

@media (min-width: 560px) {
  .group-grid {
    grid-template-columns: 1fr 1fr;
  }
}
</style>
