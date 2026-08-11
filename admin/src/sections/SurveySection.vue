<script setup>
import { onMounted, ref } from 'vue'
import { supabaseRequest } from '../services/supabase'
import { formatTime } from '../services/versionRules'
import UserPicker from '../components/admin/UserPicker.vue'
import ConditionEditor from '../components/admin/ConditionEditor.vue'
import AppSelect from '../components/admin/AppSelect.vue'
import AppDateField from '../components/admin/AppDateField.vue'

const SHOW_MODES = [
  { value: 'once', label: 'once（仅一次）' },
  { value: 'daily', label: 'daily（每天一次）' },
  { value: 'per_version', label: 'per_version（每版本一次）' },
  { value: 'every_enter', label: 'every_enter（每次进入都弹）' }
]

const TYPE_OPTIONS = [
  { value: 'single_choice', label: '单选' },
  { value: 'multiple_choice', label: '多选' },
  { value: 'text', label: '文本' },
  { value: 'rating', label: '评分' },
  { value: 'matrix', label: '矩阵' }
]
const TYPE_LABEL = Object.fromEntries(TYPE_OPTIONS.map(t => [t.value, t.label]))

const list = ref([])
const loading = ref(false)
const listStatus = ref({ text: '', type: 'default' })

const editorOpen = ref(false)
const editingId = ref(null)
const questions = ref([])
const form = ref({
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
const editorStatus = ref({ text: '等待操作', type: 'default' })
const saving = ref(false)

const responsesOpen = ref(false)
const responsesSurveyId = ref('')
const responsesQuestions = ref([])
const responsesList = ref([])
const responsesStatus = ref({ text: '', type: 'default' })
const responsesBusy = ref(false)

function genId(prefix) {
  return `${prefix}-${Math.random().toString(36).substring(2, 8)}`
}

function setListStatus(text, type = 'default') { listStatus.value = { text, type } }
function setEditorStatus(text, type = 'default') { editorStatus.value = { text, type } }
function setResponsesStatus(text, type = 'default') { responsesStatus.value = { text, type } }

// ── 列表 ──

async function loadList() {
  loading.value = true
  setListStatus('正在加载问卷列表…')
  try {
    const data = await supabaseRequest('/rest/v1/surveys', {
      params: { select: 'id,title,questions,enabled,show_rule,created_at,updated_at', order: 'created_at.desc' }
    })
    const surveys = Array.isArray(data) ? data : []
    await Promise.all(surveys.map(async (s) => {
      try {
        s._responseCount = await supabaseRequest('/rest/v1/survey_responses', {
          params: { select: 'id', survey_id: `eq.${s.id}` },
          returnCount: true
        })
      } catch {
        s._responseCount = 0
      }
    }))
    list.value = surveys
    setListStatus(`共 ${surveys.length} 份问卷。`, 'ok')
  } catch (e) {
    list.value = []
    setListStatus(e?.message || '加载失败。', 'error')
  } finally {
    loading.value = false
  }
}

// ── 题目构建 ──

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

function addQuestion() {
  questions.value.push(newQuestion('single_choice'))
}

function removeQuestion(qi) {
  questions.value.splice(qi, 1)
}

function changeType(q, newType) {
  if (q.type === newType) return
  const next = newQuestion(newType)
  next.id = q.id
  next.title = q.title
  next.description = q.description
  next.image = q.image
  next.required = q.required
  const qi = questions.value.indexOf(q)
  if (qi >= 0) questions.value[qi] = next
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

// ── 编辑器 ──

function openCreate() {
  editingId.value = null
  form.value = {
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
  }
  questions.value = [newQuestion('single_choice')]
  editorStatus.value = { text: '等待操作', type: 'default' }
  editorOpen.value = true
  responsesOpen.value = false
}

function openEdit(item) {
  const showRule = item.show_rule || {}
  editingId.value = item.id
  form.value = {
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
    conditions: Array.isArray(showRule.conditions) ? showRule.conditions.map(c => ({ ...c })) : [],
    enabled: item.enabled !== false
  }
  questions.value = (Array.isArray(item.questions) ? item.questions : []).map(q => ({
    id: q.id || genId('q'),
    type: q.type || 'text',
    title: q.title || '',
    description: q.description || '',
    image: q.image || '',
    required: q.required === true,
    options: (q.options || []).map(o => ({ ...o })),
    minSelect: q.minSelect || 0,
    maxSelect: q.maxSelect || 0,
    placeholder: q.placeholder || '',
    maxLength: q.maxLength || 0,
    multiline: q.multiline === true,
    maxRating: q.maxRating || 5,
    labels: q.labels ? { ...q.labels } : {},
    matrixType: q.matrixType || 'rating',
    rows: (q.rows || []).map(r => ({ ...r })),
    columns: (q.columns || []).map(c => ({ ...c }))
  }))
  editorStatus.value = { text: '等待操作', type: 'default' }
  editorOpen.value = true
  responsesOpen.value = false
}

function closeEditor() {
  editorOpen.value = false
  editingId.value = null
}

function buildRow() {
  const f = form.value
  const id = String(f.id || '').trim()
  const title = String(f.title || '').trim()
  if (!id) throw new Error('问卷 ID 不能为空。')
  if (!title) throw new Error('问卷标题不能为空。')

  const channels = String(f.channels || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
  const targetUsers = f.targetUsers.map(s => String(s).trim()).filter(Boolean)
  const cleanQuestions = questions.value.map(q => ({
    id: q.id,
    type: q.type || 'text',
    title: q.title || '',
    description: q.description || '',
    image: q.image || '',
    required: q.required === true,
    options: (q.options || []).filter(o => o && o.id),
    minSelect: q.minSelect || 0,
    maxSelect: q.maxSelect || 0,
    placeholder: q.placeholder || '',
    maxLength: q.maxLength || 0,
    multiline: q.multiline === true,
    maxRating: q.maxRating || 5,
    labels: q.labels || {},
    matrixType: q.matrixType || 'rating',
    rows: (q.rows || []).filter(r => r && r.id),
    columns: (q.columns || []).filter(c => c && c.id)
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
      conditions: f.conditions.filter(c => c && c.type)
    }
  }
}

async function save() {
  saving.value = true
  setEditorStatus('正在保存…')
  try {
    const row = buildRow()
    if (editingId.value) {
      await supabaseRequest(`/rest/v1/surveys?id=eq.${encodeURIComponent(editingId.value)}`, {
        method: 'PATCH',
        body: row
      })
    } else {
      await supabaseRequest('/rest/v1/surveys', { method: 'POST', body: row })
    }
    setEditorStatus('保存成功！', 'ok')
    closeEditor()
    await loadList()
  } catch (e) {
    setEditorStatus(e?.message || '保存失败。', 'error')
  } finally {
    saving.value = false
  }
}

async function deleteItem(id) {
  if (!confirm(`确认删除问卷 "${id}"？`)) return
  try {
    await supabaseRequest(`/rest/v1/surveys?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' })
    await loadList()
  } catch (e) {
    setListStatus(e?.message || '删除失败。', 'error')
  }
}

async function toggleItem(item) {
  try {
    await supabaseRequest(`/rest/v1/surveys?id=eq.${encodeURIComponent(item.id)}`, {
      method: 'PATCH',
      body: { enabled: !item.enabled }
    })
    await loadList()
  } catch (e) {
    setListStatus(e?.message || '切换失败。', 'error')
  }
}

// ── 回复 ──

function openResponses() {
  responsesOpen.value = true
  editorOpen.value = false
  if (!responsesSurveyId.value && list.value.length) {
    responsesSurveyId.value = list.value[0].id
  }
  if (responsesSurveyId.value) loadResponses()
}

function closeResponses() {
  responsesOpen.value = false
}

async function loadResponses() {
  const surveyId = responsesSurveyId.value
  if (!surveyId) {
    setResponsesStatus('请先选择问卷。', 'error')
    return
  }
  responsesBusy.value = true
  setResponsesStatus('正在加载回复…')
  try {
    const surveyData = await supabaseRequest('/rest/v1/surveys', {
      params: { select: 'questions', id: `eq.${surveyId}`, limit: 1 }
    })
    const survey = Array.isArray(surveyData) ? surveyData[0] : null
    responsesQuestions.value = survey?.questions || []

    const data = await supabaseRequest('/rest/v1/survey_responses', {
      params: { select: '*', survey_id: `eq.${surveyId}`, order: 'submitted_at.desc', limit: '500' }
    })
    responsesList.value = Array.isArray(data) ? data : []
    setResponsesStatus(`共 ${responsesList.value.length} 条回复。`, 'ok')
  } catch (e) {
    responsesList.value = []
    setResponsesStatus(e?.message || '加载失败。', 'error')
  } finally {
    responsesBusy.value = false
  }
}

function resolveAnswerDisplay(question, answer) {
  if (!question || !answer) return '--'
  const qType = question.type || 'text'
  const value = answer.value

  if (qType === 'single_choice') {
    const opt = (question.options || []).find(o => o.id === value)
    return opt?.label || value || '--'
  }
  if (qType === 'multiple_choice') {
    const vals = Array.isArray(value) ? value : []
    return vals.map(v => (question.options || []).find(o => o.id === v)?.label || v || '?').join(', ') || '--'
  }
  if (qType === 'text') return value || '(空)'
  if (qType === 'rating') {
    const max = question.maxRating || 5
    const num = Number(value) || 0
    const stars = []
    for (let i = 1; i <= max; i++) {
      stars.push({ filled: i <= num, char: i <= num ? '★' : '☆' })
    }
    const label = (question.labels || {})[String(num)] || ''
    return { stars, num, max, label }
  }
  if (qType === 'matrix') {
    const rows = question.rows || []
    const cols = question.columns || []
    const map = (value && typeof value === 'object' && !Array.isArray(value)) ? value : {}
    return rows.map((r) => {
      const colId = map[r.id]
      if (!colId) return null
      const colIdx = cols.findIndex(c => c.id === colId)
      const col = cols[colIdx]
      return {
        rowLabel: r.label || r.id,
        colLabel: col?.label || colId,
        num: colIdx >= 0 ? colIdx + 1 : 0,
        max: cols.length || 5,
        isRating: true
      }
    }).filter(Boolean)
  }
  return JSON.stringify(value)
}

function exportResponses() {
  if (!responsesList.value.length) {
    setResponsesStatus('没有可导出的数据。', 'error')
    return
  }
  const blob = new Blob([JSON.stringify(responsesList.value, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `survey-responses-${responsesSurveyId.value}-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
  setResponsesStatus('已导出 JSON 文件。', 'ok')
}

onMounted(loadList)
</script>

<template>
  <div class="actions">
    <button class="btn btn--primary" type="button" @click="openCreate">+ 新建问卷</button>
    <button class="btn" type="button" @click="openResponses">查看回复</button>
    <button class="btn" type="button" :disabled="loading" @click="loadList">{{ loading ? '加载中…' : '刷新' }}</button>
  </div>

  <p class="status-text" :class="listStatus.type === 'ok' ? 'status-text--ok' : listStatus.type === 'error' ? 'status-text--error' : ''">
    {{ listStatus.text }}
  </p>

  <div class="list">
    <article v-if="!loading && list.length === 0" class="history-item">暂无问卷</article>
    <article v-for="item in list" :key="item.id" class="list-item list-item--survey">
      <div class="list-item-main">
        <span class="list-item-title">{{ item.title || item.id }}</span>
        <span class="list-item-meta">
          ID: {{ item.id }} · {{ item.questions?.length || 0 }} 题 · {{ item._responseCount || 0 }} 回复 · 模式: {{ item.show_rule?.showMode || 'once' }} · {{ formatTime(item.created_at) }}
        </span>
      </div>
      <div class="list-actions">
        <span class="state" :class="item.enabled ? 'state--ok' : 'state--warn'">
          {{ item.enabled ? '已启用' : '已停用' }}
        </span>
        <button class="btn btn--sm" type="button" @click="openEdit(item)">编辑</button>
        <button class="btn btn--sm btn--soft" type="button" @click="toggleItem(item)">
          {{ item.enabled ? '禁用' : '启用' }}
        </button>
        <button class="btn btn--sm btn--danger" type="button" @click="deleteItem(item.id)">删除</button>
      </div>
    </article>
  </div>

  <!-- 编辑器 -->
  <section v-if="editorOpen" class="card editor-card">
    <div class="card-header">
      <div>
        <p class="card-kicker">survey editor</p>
        <h3 class="card-title">{{ editingId ? '编辑问卷' : '新建问卷' }}</h3>
      </div>
      <button class="btn btn--sm" type="button" @click="closeEditor">关闭</button>
    </div>

    <div class="editor-grid">
      <div class="field">
        <label class="field-label">问卷 ID</label>
        <input v-model="form.id" class="input" type="text" :disabled="!!editingId" placeholder="如 survey-20260724-1">
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

      <div class="field">
        <label class="field-label">展示模式</label>
        <AppSelect v-model="form.showMode" :options="SHOW_MODES" />
      </div>

      <div class="field">
        <label class="field-label">展示通道（逗号分隔）</label>
        <input v-model="form.channels" class="input" type="text" placeholder="stable,beta">
      </div>

      <div class="field">
        <label class="field-label">开始时间（可选）</label>
        <AppDateField v-model="form.startAt" type="datetime" placeholder="选择开始时间" />
      </div>

      <div class="field">
        <label class="field-label">结束时间（可选）</label>
        <AppDateField v-model="form.endAt" type="datetime" placeholder="选择结束时间" />
      </div>

      <div class="field field--full">
        <label class="field-label">定向用户（留空=所有用户可见）</label>
        <UserPicker v-model="form.targetUsers" />
      </div>

      <div class="field field--full">
        <label class="field-label">高级显示条件逻辑</label>
        <AppSelect
          v-model="form.conditionLogic"
          :options="[
            { value: 'and', label: 'AND（全部满足）' },
            { value: 'or', label: 'OR（任一满足）' }
          ]"
        />
      </div>

      <div class="field field--full">
        <label class="field-label">条件列表</label>
        <ConditionEditor v-model:conditions="form.conditions" />
      </div>

      <div class="field field--full">
        <label class="checkbox-row">
          <input v-model="form.enabled" type="checkbox">
          启用问卷（enabled=true）
        </label>
      </div>
    </div>

    <hr class="sep">

    <h3 class="card-subtitle">题目列表</h3>
    <div class="question-list">
      <div v-for="(q, qi) in questions" :key="q.id" class="question-card">
        <div class="question-head">
          <span class="question-index">题目 {{ qi + 1 }}</span>
          <button class="btn btn--sm btn--danger" type="button" @click="removeQuestion(qi)">删除题目</button>
        </div>

        <div class="question-title-row">
          <input v-model="q.title" class="input" type="text" placeholder="题目标题">
          <AppSelect v-model="q.type" :options="TYPE_OPTIONS" @change="(v) => changeType(q, v)" />
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
    </div>

    <div class="actions">
      <button class="btn btn--soft" type="button" @click="addQuestion">+ 添加题目</button>
    </div>

    <div class="actions">
      <button class="btn btn--primary" type="button" :disabled="saving" @click="save">
        {{ saving ? '保存中…' : '保存到 Supabase' }}
      </button>
      <button class="btn" type="button" @click="closeEditor">取消</button>
    </div>

    <p class="status-text" :class="editorStatus.type === 'ok' ? 'status-text--ok' : editorStatus.type === 'error' ? 'status-text--error' : ''">
      {{ editorStatus.text }}
    </p>
  </section>

  <!-- 回复查看 -->
  <section v-if="responsesOpen" class="card editor-card">
    <div class="card-header">
      <div>
        <p class="card-kicker">survey responses</p>
        <h3 class="card-title">问卷回复</h3>
      </div>
      <button class="btn btn--sm" type="button" @click="closeResponses">关闭</button>
    </div>

    <div class="responses-toolbar">
      <AppSelect
        v-model="responsesSurveyId"
        :options="[{ value: '', label: '选择问卷…' }, ...list.map(s => ({ value: s.id, label: `${s.title || s.id}（${s.questions?.length || 0} 题）` }))]"
        inline
        class="responses-select"
        @change="loadResponses"
      />
      <button class="btn" type="button" :disabled="responsesBusy" @click="loadResponses">
        {{ responsesBusy ? '加载中…' : '加载回复' }}
      </button>
      <button class="btn" type="button" @click="exportResponses">导出 JSON</button>
    </div>

    <p class="status-text" :class="responsesStatus.type === 'ok' ? 'status-text--ok' : responsesStatus.type === 'error' ? 'status-text--error' : ''">
      {{ responsesStatus.text }}
    </p>

    <div v-if="responsesList.length === 0" class="history-item">暂无回复</div>
    <div v-for="r in responsesList" :key="r.id" class="list-item response-item">
      <div class="response-header">
        <span>
          <span class="response-device">设备: {{ (r.device_id || '--').slice(0, 16) }}…</span>
          <span class="history-time">{{ formatTime(r.submitted_at) }}</span>
        </span>
        <button class="btn btn--sm" type="button" @click="r._expanded = !r._expanded">
          {{ r._expanded ? '收起' : '展开' }}
        </button>
      </div>
      <div v-if="r._expanded" class="response-detail">
        <template v-if="Array.isArray(r.answers) && r.answers.length">
          <div v-for="ans in r.answers" :key="ans.questionId" class="answer-row">
            <div class="answer-head">
              <span class="answer-title">{{ responsesQuestions.find(qq => qq.id === ans.questionId)?.title || ans.questionId || '?' }}</span>
              <span class="answer-type">{{ TYPE_LABEL[responsesQuestions.find(qq => qq.id === ans.questionId)?.type] || responsesQuestions.find(qq => qq.id === ans.questionId)?.type || '?' }}</span>
            </div>
            <img
              v-if="responsesQuestions.find(qq => qq.id === ans.questionId)?.image"
              :src="responsesQuestions.find(qq => qq.id === ans.questionId).image"
              class="answer-img"
              alt="题目图片"
            >
            <template v-if="(responsesQuestions.find(qq => qq.id === ans.questionId)?.type || 'text') === 'rating'">
              <div v-if="resolveAnswerDisplay(responsesQuestions.find(qq => qq.id === ans.questionId), ans)" class="rating-display">
                <span v-for="s in resolveAnswerDisplay(responsesQuestions.find(qq => qq.id === ans.questionId), ans).stars" :key="s.char" class="rating-star" :class="{ 'rating-star--on': s.filled }">{{ s.char }}</span>
                <span class="rating-num">{{ resolveAnswerDisplay(responsesQuestions.find(qq => qq.id === ans.questionId), ans).num }}<span class="rating-max">/{{ resolveAnswerDisplay(responsesQuestions.find(qq => qq.id === ans.questionId), ans).max }}</span></span>
                <span v-if="resolveAnswerDisplay(responsesQuestions.find(qq => qq.id === ans.questionId), ans).label" class="rating-label">
                  {{ resolveAnswerDisplay(responsesQuestions.find(qq => qq.id === ans.questionId), ans).label }}
                </span>
              </div>
            </template>
            <template v-else-if="(responsesQuestions.find(qq => qq.id === ans.questionId)?.type || 'text') === 'matrix'">
              <div class="matrix-display">
                <div v-for="row in resolveAnswerDisplay(responsesQuestions.find(qq => qq.id === ans.questionId), ans) || []" :key="row.rowLabel" class="matrix-row-display">
                  <span class="matrix-row-label">{{ row.rowLabel }}</span>
                  <template v-if="row.isRating">
                    <span v-for="s in Array.from({ length: row.max }, (_, i) => i + 1)" :key="s" class="rating-star" :class="{ 'rating-star--on': s <= row.num }">{{ s <= row.num ? '★' : '☆' }}</span>
                  </template>
                  <span v-else class="matrix-row-val">{{ row.colLabel }}</span>
                </div>
              </div>
            </template>
            <p v-else class="answer-value pre-wrap">
              {{ resolveAnswerDisplay(responsesQuestions.find(qq => qq.id === ans.questionId), ans) }}
            </p>
          </div>
        </template>
        <p v-else class="tip">无回答数据</p>
      </div>
    </div>
  </section>
</template>

<style scoped>
.actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
}

.list {
  display: grid;
  gap: 8px;
}

.editor-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.field {
  display: grid;
  gap: 4px;
}

.field--full {
  grid-column: 1 / -1;
}

.sep {
  border: none;
  border-top: 1px solid var(--app-border);
  margin: 16px 0;
}

.card-subtitle {
  font-size: 14px;
  font-weight: 600;
  margin: 0 0 10px;
  color: var(--app-text);
}

.question-list {
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
}

.question-index {
  font-weight: 600;
  font-size: 13px;
  color: var(--app-text-secondary);
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

.responses-toolbar {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}

.responses-toolbar .responses-select {
  min-width: 260px;
}

.response-item {
  flex-direction: column;
  align-items: stretch;
}

.response-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.response-device {
  font-size: 12px;
  color: var(--app-text-secondary);
  margin-right: 8px;
}

.response-detail {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--app-border);
}

.answer-row {
  margin-bottom: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--app-border);
}

.answer-head {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
}

.answer-title {
  font-size: 13px;
  font-weight: 600;
}

.answer-type {
  font-size: 10px;
  color: var(--app-text-tertiary);
  padding: 1px 5px;
  border-radius: 4px;
  background: var(--app-surface-soft);
}

.answer-img {
  max-width: 200px;
  max-height: 120px;
  border-radius: 6px;
  margin-bottom: 4px;
  display: block;
}

.answer-value {
  font-size: 13px;
  margin: 0;
  padding-left: 2px;
}

.rating-display {
  display: flex;
  align-items: center;
  gap: 4px;
  padding-left: 2px;
}

.rating-star {
  color: var(--app-text-tertiary);
  font-size: 18px;
}

.rating-star--on {
  color: #ce7c12;
}

.rating-num {
  font-size: 13px;
  font-weight: 600;
  margin-left: 4px;
}

.rating-max {
  font-size: 12px;
  color: var(--app-text-tertiary);
}

.rating-label {
  font-size: 12px;
  color: var(--app-text-secondary);
  margin-left: 6px;
}

.matrix-display {
  display: grid;
  gap: 2px;
  padding-left: 2px;
}

.matrix-row-display {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 3px 0;
}

.matrix-row-label {
  font-size: 12px;
  color: var(--app-text-secondary);
  min-width: 80px;
}

.matrix-row-display .rating-star {
  font-size: 13px;
}

.matrix-row-val {
  font-size: 13px;
  font-weight: 500;
}

.pre-wrap {
  white-space: pre-wrap;
}

.tip {
  font-size: 12px;
  color: var(--app-text-tertiary);
  margin: 4px 0 0;
}
</style>
