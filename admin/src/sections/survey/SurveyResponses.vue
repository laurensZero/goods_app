<script setup>
import { computed, ref, watch } from 'vue'
import { supabaseRequest } from '../../services/supabase'
import { formatTime, toCsv, downloadBlob } from '../../utils/format'
import { SURVEY_QUESTION_TYPE_LABEL } from '../../constants'
import EmptyState from '../../components/ui/EmptyState.vue'
import Skeleton from '../../components/ui/Skeleton.vue'
import AppSelect from '../../components/admin/AppSelect.vue'

const props = defineProps({
  surveys: { type: Array, default: () => [] }
})

const surveyOptions = computed(() =>
  props.surveys.map((s) => ({
    value: s.id,
    label: `${s.title || s.id}（${s.questions?.length || 0} 题）`
  }))
)

const selectedId = ref('')
const questions = ref([])
const list = ref([])
const status = ref({ text: '', type: 'default' })
const busy = ref(false)
const hasMore = ref(false)
const page = ref(0)
const viewMode = ref('table')
const PAGE_SIZE = 50

function setStatus(text, type = 'default') {
  status.value = { text, type }
}

function setSurvey(id) {
  selectedId.value = id
  list.value = []
  page.value = 0
  hasMore.value = false
  questions.value = []
  if (id) loadResponses(true)
}

async function loadResponses(reset = true) {
  if (!selectedId.value) return
  busy.value = true
  if (reset) setStatus('正在加载回复…')
  try {
    if (reset || !questions.value.length) {
      const surveyData = await supabaseRequest('/rest/v1/surveys', {
        params: { select: 'questions', id: `eq.${selectedId.value}`, limit: 1 }
      })
      const survey = Array.isArray(surveyData) ? surveyData[0] : null
      questions.value = survey?.questions || []
    }
    const from = reset ? 0 : list.value.length
    const data = await supabaseRequest('/rest/v1/survey_responses', {
      params: {
        select: '*',
        survey_id: `eq.${selectedId.value}`,
        order: 'submitted_at.desc',
        limit: PAGE_SIZE,
        offset: from
      }
    })
    const batch = Array.isArray(data) ? data : []
    list.value = reset ? batch : [...list.value, ...batch]
    hasMore.value = batch.length >= PAGE_SIZE
    page.value = Math.floor(list.value.length / PAGE_SIZE)
    setStatus(`已加载 ${list.value.length} 条回复。`, 'ok')
  } catch (e) {
    setStatus(e?.message || '加载失败。', 'error')
  } finally {
    busy.value = false
  }
}

function loadMore() {
  loadResponses(false)
}

watch(() => props.surveys, (surveys) => {
  if (surveys?.length && !selectedId.value) {
    setSurvey(surveys[0].id)
  }
}, { immediate: true })

// ── 值解析 ──

function resolveValue(question, answer) {
  if (!question || !answer) return ''
  const qType = question.type || 'text'
  const value = answer.value

  if (qType === 'single_choice') {
    return (question.options || []).find((o) => o.id === value)?.label || value || ''
  }
  if (qType === 'multiple_choice') {
    const vals = Array.isArray(value) ? value : []
    return vals.map((v) => (question.options || []).find((o) => o.id === v)?.label || v).join('、')
  }
  if (qType === 'text') return value || ''
  if (qType === 'rating') {
    const num = Number(value) || 0
    const label = (question.labels || {})[String(num)] || ''
    return `${num}/${question.maxRating || 5}${label ? `（${label}）` : ''}`
  }
  if (qType === 'matrix') {
    const rows = question.rows || []
    const cols = question.columns || []
    const map = (value && typeof value === 'object' && !Array.isArray(value)) ? value : {}
    return rows.map((r) => {
      const colId = map[r.id]
      if (!colId) return ''
      const col = cols.find((c) => c.id === colId)
      const idx = cols.findIndex((c) => c.id === colId)
      return `${r.label || r.id}: ${col?.label || colId}${idx >= 0 ? `(${idx + 1}/${cols.length})` : ''}`
    }).filter(Boolean).join('；')
  }
  return JSON.stringify(value)
}

function answersFor(row) {
  return questions.value.map((q) => {
    const ans = (Array.isArray(row.answers) ? row.answers : []).find((a) => a.questionId === q.id)
    return { q, value: resolveValue(q, ans) }
  })
}

// ── 聚合摘要 ──

const aggregate = computed(() => {
  if (!questions.value.length || !list.value.length) return []
  return questions.value.map((q) => {
    const qType = q.type || 'text'
    const rows = list.value.map((r) => {
      const ans = (Array.isArray(r.answers) ? r.answers : []).find((a) => a.questionId === q.id)
      return ans?.value
    })

    if (qType === 'single_choice') {
      const counts = {}
      for (const v of rows) {
        const label = (q.options || []).find((o) => o.id === v)?.label || v || '(空)'
        counts[label] = (counts[label] || 0) + 1
      }
      return { q, kind: 'choice', entries: Object.entries(counts).sort((a, b) => b[1] - a[1]) }
    }
    if (qType === 'multiple_choice') {
      const counts = {}
      for (const v of rows) {
        for (const vv of Array.isArray(v) ? v : []) {
          const label = (q.options || []).find((o) => o.id === vv)?.label || vv || '(空)'
          counts[label] = (counts[label] || 0) + 1
        }
      }
      return { q, kind: 'choice', entries: Object.entries(counts).sort((a, b) => b[1] - a[1]) }
    }
    if (qType === 'rating') {
      const nums = rows.map((v) => Number(v) || 0).filter((n) => n > 0)
      const max = q.maxRating || 5
      const avg = nums.length ? (nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(1) : 0
      const dist = Array.from({ length: max }, (_, i) => i + 1).map((n) => ({
        value: n,
        count: nums.filter((x) => x === n).length
      }))
      return { q, kind: 'rating', avg, count: nums.length, dist }
    }
    if (qType === 'matrix') {
      const rowTotals = (q.rows || []).map((r) => {
        const vals = rows.map((v) => {
          const map = (v && typeof v === 'object' && !Array.isArray(v)) ? v : {}
          return map[r.id]
        }).filter(Boolean)
        const nums = vals.map((c) => (q.columns || []).findIndex((x) => x.id === c) + 1).filter((n) => n > 0)
        return {
          rowLabel: r.label || r.id,
          count: nums.length,
          avg: nums.length ? (nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(1) : 0
        }
      })
      return { q, kind: 'matrix', rows: rowTotals }
    }
    // text
    const answered = rows.filter((v) => v !== undefined && v !== null && String(v).trim())
    return { q, kind: 'text', count: answered.length }
  })
})

// ── 导出 ──

function exportCsv() {
  if (!list.value.length) {
    setStatus('没有可导出的数据。', 'error')
    return
  }
  const headers = ['提交时间', '设备', ...questions.value.map((q) => q.title || q.id)]
  const rows = list.value.map((r) => [
    formatTime(r.submitted_at),
    String(r.device_id || '')
  ].concat(questions.value.map((q) => {
    const ans = (Array.isArray(r.answers) ? r.answers : []).find((a) => a.questionId === q.id)
    return resolveValue(q, ans)
  })))
  downloadBlob(toCsv(rows, headers), `survey-responses-${selectedId.value}-${new Date().toISOString().slice(0, 10)}.csv`, 'text/csv;charset=utf-8')
  setStatus('已导出 CSV 文件。', 'ok')
}

function exportJson() {
  if (!list.value.length) {
    setStatus('没有可导出的数据。', 'error')
    return
  }
  downloadBlob(JSON.stringify(list.value, null, 2), `survey-responses-${selectedId.value}-${new Date().toISOString().slice(0, 10)}.json`, 'application/json')
  setStatus('已导出 JSON 文件。', 'ok')
}
</script>

<template>
  <div class="responses">
    <div class="resp-toolbar">
      <AppSelect
        v-model="selectedId"
        :options="surveyOptions"
        placeholder="选择问卷…"
        @change="setSurvey"
      />
      <button class="btn" type="button" :disabled="busy" @click="loadResponses(true)">
        {{ busy ? '加载中…' : '刷新' }}
      </button>
      <button class="btn" type="button" :disabled="!list.length" @click="exportCsv">导出 CSV</button>
      <button class="btn" type="button" :disabled="!list.length" @click="exportJson">导出 JSON</button>
      <div v-if="list.length" class="view-toggle">
        <button class="btn btn--sm" :class="viewMode === 'table' ? 'btn--primary' : ''" type="button" @click="viewMode = 'table'">表格</button>
        <button class="btn btn--sm" :class="viewMode === 'detail' ? 'btn--primary' : ''" type="button" @click="viewMode = 'detail'">详情</button>
      </div>
    </div>

    <p class="status-text" :class="status.type === 'ok' ? 'status-text--ok' : status.type === 'error' ? 'status-text--error' : ''">
      {{ status.text }}
    </p>

    <template v-if="selectedId">
      <!-- 首次加载骨架 -->
      <Skeleton v-if="busy && !list.length" variant="list" count="5" />

      <!-- 聚合摘要 -->
      <div v-if="aggregate.length" class="agg-grid">
        <div v-for="agg in aggregate" :key="agg.q.id" class="card agg-card">
          <p class="agg-title">{{ agg.q.title || agg.q.id }} <span class="agg-type">{{ SURVEY_QUESTION_TYPE_LABEL[agg.q.type] || agg.q.type }}</span></p>

          <div v-if="agg.kind === 'choice'" class="agg-bars">
            <div v-for="[label, count] in agg.entries" :key="label" class="agg-bar-row">
              <span class="agg-bar-label">{{ label }}</span>
              <div class="agg-bar-track">
                <div class="agg-bar-fill" :style="{ width: (count / list.length * 100) + '%' }" />
              </div>
              <span class="agg-bar-count">{{ count }}</span>
            </div>
          </div>

          <div v-else-if="agg.kind === 'rating'" class="agg-rating">
            <p class="agg-rating-avg">平均 {{ agg.avg }} / {{ agg.q.maxRating || 5 }}<span class="agg-count">（{{ agg.count }} 次）</span></p>
            <div v-for="d in agg.dist" :key="d.value" class="agg-bar-row">
              <span class="agg-bar-label">{{ d.value }}★</span>
              <div class="agg-bar-track">
                <div class="agg-bar-fill" :style="{ width: (agg.count ? d.count / agg.count * 100 : 0) + '%' }" />
              </div>
              <span class="agg-bar-count">{{ d.count }}</span>
            </div>
          </div>

          <div v-else-if="agg.kind === 'matrix'" class="agg-matrix">
            <div v-for="row in agg.rows" :key="row.rowLabel" class="agg-bar-row">
              <span class="agg-bar-label">{{ row.rowLabel }}</span>
              <div class="agg-bar-track">
                <div class="agg-bar-fill" :style="{ width: (row.count ? row.avg / (agg.q.columns?.length || 5) * 100 : 0) + '%' }" />
              </div>
              <span class="agg-bar-count">{{ row.avg }}<span class="agg-count">（{{ row.count }}）</span></span>
            </div>
          </div>

          <p v-else class="agg-text">共 {{ agg.count }} 条文本回答（展开详情查看）</p>
        </div>
      </div>

      <!-- 表格视图 -->
      <div v-if="list.length && viewMode === 'table'" class="table-wrap">
        <table class="resp-table">
          <thead>
            <tr>
              <th>提交时间</th>
              <th>设备</th>
              <th v-for="q in questions" :key="q.id">
                <img v-if="q.image" :src="q.image" class="th-img" alt="" />
                <span>{{ q.title || q.id }}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in list" :key="r.id">
              <td class="cell-time">{{ formatTime(r.submitted_at) }}</td>
              <td class="cell-mono">{{ String(r.device_id || '--').slice(0, 18) }}</td>
              <td v-for="a in answersFor(r)" :key="a.q.id" class="cell-ans">{{ a.value || '—' }}</td>
            </tr>
          </tbody>
        </table>
        <button v-if="hasMore" class="btn btn--soft load-more" type="button" :disabled="busy" @click="loadMore">
          {{ busy ? '加载中…' : `加载更多（已 ${list.length} 条）` }}
        </button>
      </div>

      <!-- 详情视图 -->
      <div v-else-if="list.length && viewMode === 'detail'" class="detail-list">
        <article v-for="r in list" :key="r.id" class="detail-card">
          <header class="detail-head">
            <span class="detail-id">#{{ r.id }}</span>
            <span class="detail-time">{{ formatTime(r.submitted_at) }}</span>
            <span class="detail-device">{{ String(r.device_id || '--').slice(0, 18) }}</span>
          </header>
          <dl class="detail-answers">
            <div v-for="a in answersFor(r)" :key="a.q.id" class="detail-answer">
              <dt class="detail-q">
                <img v-if="a.q.image" :src="a.q.image" class="detail-q-img" alt="" />
                {{ a.q.title || a.q.id }}<span class="detail-type">{{ SURVEY_QUESTION_TYPE_LABEL[a.q.type] || a.q.type }}</span>
              </dt>
              <dd class="detail-v">{{ a.value || '—' }}</dd>
            </div>
          </dl>
        </article>
        <button v-if="hasMore" class="btn btn--soft load-more" type="button" :disabled="busy" @click="loadMore">
          {{ busy ? '加载中…' : `加载更多（已 ${list.length} 条）` }}
        </button>
      </div>

      <EmptyState v-else-if="!busy" title="暂无回复" description="等待用户填写问卷" />
    </template>

    <EmptyState v-else title="选择问卷" description="从上方下拉框选择要查看的问卷" />
  </div>
</template>

<style scoped>
.responses {
  display: grid;
  gap: 12px;
}

.resp-toolbar {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}

.resp-select {
  min-width: 240px;
}

.agg-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
}

.agg-card {
  gap: 10px;
  padding: 14px;
}

.agg-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--app-text);
  margin: 0;
  display: flex;
  gap: 8px;
  align-items: center;
}

.agg-type {
  font-size: 10px;
  color: var(--app-text-tertiary);
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--app-surface-soft);
}

.agg-bars,
.agg-rating,
.agg-matrix {
  display: grid;
  gap: 4px;
}

.agg-bar-row {
  display: grid;
  grid-template-columns: 96px 1fr 40px;
  gap: 8px;
  align-items: center;
  font-size: 12px;
}

.agg-bar-label {
  color: var(--app-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agg-bar-track {
  height: 8px;
  border-radius: 999px;
  background: var(--app-surface-soft);
  overflow: hidden;
}

.agg-bar-fill {
  height: 100%;
  border-radius: 999px;
  background: var(--app-pending-bg);
}

.agg-bar-count {
  text-align: right;
  color: var(--app-text-secondary);
}

.agg-count {
  color: var(--app-text-tertiary);
  font-size: 11px;
}

.agg-rating-avg {
  font-size: 13px;
  font-weight: 600;
  color: var(--app-text);
  margin: 0;
}

.agg-text {
  font-size: 12px;
  color: var(--app-text-tertiary);
  margin: 0;
}

.table-wrap {
  overflow-x: auto;
  border: 1px solid var(--app-border);
  border-radius: var(--radius-xs);
}

.resp-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
  min-width: 720px;
}

.resp-table th,
.resp-table td {
  padding: 8px 10px;
  border-bottom: 1px solid var(--app-border);
  text-align: left;
  vertical-align: top;
}

.resp-table th {
  background: var(--app-surface-soft);
  font-weight: 600;
  color: var(--app-text-secondary);
  white-space: nowrap;
}

.th-img {
  display: block;
  width: 44px;
  height: 44px;
  object-fit: cover;
  border-radius: var(--radius-xxs);
  margin-bottom: 6px;
  background: var(--app-surface);
}

.resp-table tbody tr:last-child td {
  border-bottom: none;
}

.cell-time {
  white-space: nowrap;
  color: var(--app-text-secondary);
}

.cell-mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
  color: var(--app-text-tertiary);
  white-space: nowrap;
}

.cell-ans {
  color: var(--app-text);
  min-width: 120px;
  max-width: 240px;
  white-space: pre-wrap;
}

.load-more {
  width: 100%;
  margin-top: 8px;
}

.view-toggle {
  display: flex;
  gap: 4px;
  margin-left: auto;
}

.detail-list {
  display: grid;
  gap: 10px;
}

.detail-card {
  padding: 14px;
  border: 1px solid var(--app-border);
  border-radius: var(--radius-xs);
  background: var(--app-surface-soft);
  display: grid;
  gap: 10px;
}

.detail-head {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
  font-size: 12px;
  color: var(--app-text-tertiary);
}

.detail-id {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  color: var(--app-text-secondary);
}

.detail-answers {
  display: grid;
  gap: 8px;
  margin: 0;
}

.detail-answer {
  display: grid;
  gap: 2px;
}

.detail-q {
  font-size: 12px;
  font-weight: 600;
  color: var(--app-text-secondary);
  display: flex;
  gap: 6px;
  align-items: center;
}

.detail-q-img {
  width: 28px;
  height: 28px;
  object-fit: cover;
  border-radius: var(--radius-xxs);
  background: var(--app-surface);
  flex-shrink: 0;
}

.detail-type {
  font-size: 10px;
  font-weight: 400;
  color: var(--app-text-tertiary);
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--app-surface);
}

.detail-v {
  margin: 0;
  font-size: 13px;
  color: var(--app-text);
  white-space: pre-wrap;
  word-break: break-word;
}

@media (min-width: 860px) {
  .agg-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
