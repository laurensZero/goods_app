<script setup>
import { onMounted, ref } from 'vue'
import { supabaseRequest } from '../services/supabase'
import { normalizeVersionRuleForForm, buildVersionRuleFromForm, normalizeHttpsUrl, formatTime } from '../services/versionRules'
import UserPicker from '../components/admin/UserPicker.vue'
import ConditionEditor from '../components/admin/ConditionEditor.vue'
import VersionRuleFields from '../components/admin/VersionRuleFields.vue'

const SHOW_MODES = [
  { value: 'once', label: 'once（仅一次）' },
  { value: 'daily', label: 'daily（每天一次）' },
  { value: 'per_version', label: 'per_version（每版本一次）' },
  { value: 'every_enter', label: 'every_enter（每次进入都弹）' }
]

const list = ref([])
const listStatus = ref({ text: '', type: 'default' })
const loading = ref(false)

const editorOpen = ref(false)
const editingId = ref(null)
const form = ref({
  id: '',
  enabled: true,
  priority: 100,
  title: '',
  message: '',
  imageUrl: '',
  customCss: '',
  showMode: 'once',
  channels: '',
  startAt: '',
  endAt: '',
  appRule: { mode: 'any', value: '' },
  bundleRule: { mode: 'any', value: '' },
  ctaText: '',
  ctaUrl: '',
  ctaAction: 'dismiss',
  targetUsers: [],
  conditionLogic: 'and',
  conditions: []
})
const editorStatus = ref({ text: '等待操作', type: 'default' })
const saving = ref(false)

function setListStatus(text, type = 'default') {
  listStatus.value = { text, type }
}

function setEditorStatus(text, type = 'default') {
  editorStatus.value = { text, type }
}

async function loadList() {
  loading.value = true
  setListStatus('正在加载公告列表…')
  try {
    const data = await supabaseRequest('/rest/v1/announcements', {
      params: { select: 'id,enabled,priority,title,show_rule,created_at', order: 'priority.desc,created_at.desc' }
    })
    list.value = Array.isArray(data) ? data : []
    setListStatus(`共 ${list.value.length} 条公告。`, 'ok')
  } catch (e) {
    list.value = []
    setListStatus(e?.message || '加载失败。', 'error')
  } finally {
    loading.value = false
  }
}

function openCreate() {
  editingId.value = null
  form.value = {
    id: '',
    enabled: true,
    priority: 100,
    title: '',
    message: '',
    imageUrl: '',
    customCss: '',
    showMode: 'once',
    channels: 'stable,beta',
    startAt: '',
    endAt: '',
    appRule: { mode: 'any', value: '' },
    bundleRule: { mode: 'any', value: '' },
    ctaText: '',
    ctaUrl: '',
    ctaAction: 'dismiss',
    targetUsers: [],
    conditionLogic: 'and',
    conditions: []
  }
  editorStatus.value = { text: '等待操作', type: 'default' }
  editorOpen.value = true
}

function openEdit(item) {
  const showRule = item.show_rule || {}
  const cta = item.cta || {}
  editingId.value = item.id
  const appRule = normalizeVersionRuleForForm(showRule.appVersionRule, showRule.appVersion, showRule.minAppVersion, showRule.maxAppVersion)
  const bundleRule = normalizeVersionRuleForForm(showRule.bundleVersionRule, showRule.bundleVersion, showRule.minBundleVersion, showRule.maxBundleVersion)
  form.value = {
    id: item.id,
    enabled: item.enabled !== false,
    priority: item.priority ?? 100,
    title: item.title || '',
    message: item.message || '',
    imageUrl: item.image_url || '',
    customCss: item.custom_css || '',
    showMode: showRule.showMode || 'once',
    channels: Array.isArray(showRule.channels) ? showRule.channels.join(',') : 'stable,beta',
    startAt: showRule.startAt || '',
    endAt: showRule.endAt || '',
    appRule,
    bundleRule,
    ctaText: cta.text || '',
    ctaUrl: cta.url || '',
    ctaAction: cta.action || 'dismiss',
    targetUsers: Array.isArray(item.target_users) ? item.target_users : [],
    conditionLogic: showRule.logic || 'and',
    conditions: Array.isArray(showRule.conditions) ? showRule.conditions.map(c => ({ ...c })) : []
  }
  editorStatus.value = { text: '等待操作', type: 'default' }
  editorOpen.value = true
}

function closeEditor() {
  editorOpen.value = false
  editingId.value = null
}

function buildRow() {
  const f = form.value
  const id = String(f.id || '').trim()
  const title = String(f.title || '').trim()
  const message = String(f.message || '').trim()
  if (!id) throw new Error('公告 ID 不能为空。')
  if (!title) throw new Error('公告标题不能为空。')
  if (!message) throw new Error('公告正文不能为空。')

  const channels = String(f.channels || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
  const appRule = buildVersionRuleFromForm(f.appRule.mode, f.appRule.value, 'App版本')
  const bundleRule = buildVersionRuleFromForm(f.bundleRule.mode, f.bundleRule.value, 'Bundle版本')
  const ctaUrl = normalizeHttpsUrl(f.ctaUrl)

  const showRule = {
    showMode: String(f.showMode || 'once').trim() || 'once',
    startAt: String(f.startAt || '').trim(),
    endAt: String(f.endAt || '').trim(),
    channels: channels.length ? channels : ['stable', 'beta'],
    logic: String(f.conditionLogic || 'and').trim(),
    conditions: f.conditions.filter(c => c && c.type)
  }
  if (appRule) {
    showRule.appVersionRule = appRule
    if (appRule.exact) showRule.appVersion = appRule.exact
    if (appRule.min) showRule.minAppVersion = appRule.min
    if (appRule.max) showRule.maxAppVersion = appRule.max
  }
  if (bundleRule) {
    showRule.bundleVersionRule = bundleRule
    if (bundleRule.exact) showRule.bundleVersion = bundleRule.exact
    if (bundleRule.min) showRule.minBundleVersion = bundleRule.min
    if (bundleRule.max) showRule.maxBundleVersion = bundleRule.max
  }

  return {
    id,
    enabled: f.enabled,
    priority: Number.isFinite(Number(f.priority)) ? Number(f.priority) : 100,
    title,
    message,
    image_url: String(f.imageUrl || '').trim(),
    custom_css: String(f.customCss || '').trim(),
    target_users: f.targetUsers.length ? f.targetUsers : [],
    cta: { text: String(f.ctaText || '').trim(), url: ctaUrl, action: String(f.ctaAction || 'dismiss').trim() },
    show_rule: showRule
  }
}

async function save() {
  saving.value = true
  setEditorStatus('正在保存…')
  try {
    const row = buildRow()
    if (editingId.value) {
      await supabaseRequest(`/rest/v1/announcements?id=eq.${encodeURIComponent(editingId.value)}`, { method: 'PATCH', body: row })
    } else {
      await supabaseRequest('/rest/v1/announcements', { method: 'POST', body: row })
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
  if (!confirm(`确认删除公告 "${id}"？`)) return
  try {
    await supabaseRequest(`/rest/v1/announcements?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' })
    await loadList()
  } catch (e) {
    setListStatus(e?.message || '删除失败。', 'error')
  }
}

async function toggleItem(item) {
  try {
    await supabaseRequest(`/rest/v1/announcements?id=eq.${encodeURIComponent(item.id)}`, {
      method: 'PATCH',
      body: { enabled: !item.enabled }
    })
    await loadList()
  } catch (e) {
    setListStatus(e?.message || '切换失败。', 'error')
  }
}

function showModeLabel(mode) {
  return SHOW_MODES.find(m => m.value === mode)?.label || mode || '--'
}

onMounted(loadList)
</script>

<template>
  <div class="actions">
    <button class="btn btn--primary" type="button" @click="openCreate">+ 新建公告</button>
    <button class="btn" type="button" :disabled="loading" @click="loadList">{{ loading ? '加载中…' : '刷新' }}</button>
  </div>

  <p class="status-text" :class="listStatus.type === 'ok' ? 'status-text--ok' : listStatus.type === 'error' ? 'status-text--error' : ''">
    {{ listStatus.text }}
  </p>

  <div class="list">
    <article v-if="!loading && list.length === 0" class="history-item">暂无公告</article>
    <article v-for="item in list" :key="item.id" class="list-item list-item--ann">
      <div class="list-item-main">
        <span class="list-item-title">{{ item.title || item.id }}</span>
        <span class="list-item-meta">
          ID: {{ item.id }} · 优先级: {{ item.priority ?? 0 }} · 模式: {{ showModeLabel(item.show_rule?.showMode) }} · {{ formatTime(item.created_at) }}
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

  <section v-if="editorOpen" class="card editor-card">
    <div class="card-header">
      <div>
        <p class="card-kicker">announcement editor</p>
        <h3 class="card-title">{{ editingId ? '编辑公告' : '新建公告' }}</h3>
      </div>
      <button class="btn btn--sm" type="button" @click="closeEditor">关闭</button>
    </div>

    <div class="editor-grid">
      <div class="field">
        <label class="field-label">公告 ID</label>
        <input v-model="form.id" class="input" type="text" :disabled="!!editingId" placeholder="如 notice-v1.4-update">
      </div>

      <div class="actions field-align">
        <label class="checkbox-row">
          <input v-model="form.enabled" type="checkbox">
          启用
        </label>
        <div class="field">
          <label class="field-label">优先级（数值越大越靠前）</label>
          <input v-model.number="form.priority" class="input" type="number">
        </div>
      </div>

      <div class="field field--full">
        <label class="field-label">标题</label>
        <input v-model="form.title" class="input" type="text" placeholder="公告标题">
      </div>

      <div class="field field--full">
        <label class="field-label">正文</label>
        <textarea v-model="form.message" class="textarea" placeholder="公告内容" />
      </div>

      <div class="field">
        <label class="field-label">图片 URL（可选）</label>
        <input v-model="form.imageUrl" class="input" type="text" placeholder="https://…">
      </div>

      <div class="field">
        <label class="field-label">自定义 CSS（可选）</label>
        <input v-model="form.customCss" class="input" type="text" placeholder="如 .ann-msg{color:#f00}">
      </div>

      <div class="field">
        <label class="field-label">展示模式</label>
        <select v-model="form.showMode" class="select">
          <option v-for="m in SHOW_MODES" :key="m.value" :value="m.value">{{ m.label }}</option>
        </select>
      </div>

      <div class="field">
        <label class="field-label">展示通道（逗号分隔）</label>
        <input v-model="form.channels" class="input" type="text" placeholder="stable,beta">
      </div>

      <div class="field">
        <label class="field-label">开始时间（可选）</label>
        <input v-model="form.startAt" class="input" type="datetime-local">
      </div>

      <div class="field">
        <label class="field-label">结束时间（可选）</label>
        <input v-model="form.endAt" class="input" type="datetime-local">
      </div>
    </div>

    <hr class="sep">

    <div class="rule-grid">
      <VersionRuleFields v-model="form.appRule" label="App 版本条件" />
      <VersionRuleFields v-model="form.bundleRule" label="Bundle 版本条件" />
    </div>

    <hr class="sep">

    <div class="cta-grid">
      <div class="field">
        <label class="field-label">按钮文字</label>
        <input v-model="form.ctaText" class="input" type="text" placeholder="如 前往更新">
      </div>
      <div class="field">
        <label class="field-label">按钮链接（可选）</label>
        <input v-model="form.ctaUrl" class="input" type="text" placeholder="https://…">
      </div>
      <div class="field">
        <label class="field-label">按钮动作</label>
        <select v-model="form.ctaAction" class="select">
          <option value="dismiss">直接关闭</option>
          <option value="link">打开链接</option>
        </select>
      </div>
    </div>

    <hr class="sep">

    <div class="field">
      <label class="field-label">目标用户</label>
      <UserPicker v-model="form.targetUsers" />
    </div>

    <div class="field">
      <label class="field-label">条件逻辑（AND / OR）</label>
      <select v-model="form.conditionLogic" class="select">
        <option value="and">and（全部满足）</option>
        <option value="or">or（任一满足）</option>
      </select>
    </div>

    <div class="field">
      <label class="field-label">附加条件</label>
      <ConditionEditor v-model:conditions="form.conditions" />
    </div>

    <div class="actions">
      <button class="btn btn--primary" type="button" :disabled="saving" @click="save">
        {{ saving ? '保存中…' : '保存公告' }}
      </button>
    </div>

    <p class="status-text" :class="editorStatus.type === 'ok' ? 'status-text--ok' : editorStatus.type === 'error' ? 'status-text--error' : ''">
      {{ editorStatus.text }}
    </p>
  </section>
</template>

<style scoped>
.list {
  display: grid;
  gap: 8px;
}

.editor-card {
  gap: 14px;
}

.editor-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
}

.actions.field-align {
  display: flex;
  align-items: flex-end;
  gap: 12px;
  flex-wrap: wrap;
}

.rule-grid,
.cta-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
}

@media (min-width: 860px) {
  .editor-grid {
    grid-template-columns: 1fr 1fr;
  }

  .rule-grid,
  .cta-grid {
    grid-template-columns: repeat(2, 1fr);
  }

  .cta-grid {
    grid-template-columns: 2fr 2fr 1fr;
  }
}
</style>