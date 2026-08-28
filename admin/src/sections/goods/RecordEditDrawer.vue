<script setup>
import { computed, ref, watch } from 'vue'
import { DATA_KINDS, KIND_FIELDS, patchRow } from '../../services/goodsAdmin'
import { logAudit } from '../../services/audit'
import { useConfirm } from '../../composables/useConfirm'
import { formatTime } from '../../utils/format'

const props = defineProps({
  open: { type: Boolean, default: false },
  kind: { type: String, default: 'goods' },
  record: { type: Object, default: null }
})

const emit = defineEmits(['close', 'saved'])

const { confirm } = useConfirm()

const fields = computed(() => KIND_FIELDS[props.kind] || [])
const form = ref({})
const status = ref({ text: '', type: 'default' })
const saving = ref(false)

// 原始 JSON 区
const jsonText = ref('')
// 记录哪些字段在原始数据里是「以字符串形式存储的 JSON」，保存时需重新序列化回字符串
const jsonStringKeys = ref(new Set())

function defaultValue(field) {
  if (field.type === 'boolean') return 0
  if (field.type === 'number') return ''
  return ''
}

// 判断字符串是否为合法的 JSON 对象/数组字面量（用于自动展开显示）
function isJsonString(v) {
  if (typeof v !== 'string') return false
  const s = v.trim()
  if (!s) return false
  if (!((s[0] === '{' && s.endsWith('}')) || (s[0] === '[' && s.endsWith(']')))) return false
  try {
    JSON.parse(s)
    return true
  } catch {
    return false
  }
}

// 将记录中「以字符串存储的 JSON 列」解析为嵌套对象，便于阅读/编辑
function buildDisplayJson(record) {
  if (!record) return ''
  const keys = new Set(DATA_KINDS[props.kind]?.jsonStringColumns || [])
  const out = {}
  const jsonKeys = new Set()
  for (const [k, v] of Object.entries(record)) {
    if (keys.has(k) && isJsonString(v)) {
      try {
        out[k] = JSON.parse(v)
        jsonKeys.add(k)
        continue
      } catch {
        /* 解析失败保留原值 */
      }
    }
    out[k] = v
  }
  jsonStringKeys.value = jsonKeys
  return JSON.stringify(out, null, 2)
}

function buildForm(record) {
  const next = {}
  for (const field of fields.value) {
    const raw = record?.[field.key]
    next[field.key] = raw === undefined || raw === null ? defaultValue(field) : raw
  }
  form.value = next
}

// ── 曲目（tracks）编辑器：仅活动类型 ──
const isEvents = computed(() => props.kind === 'events')
const TRACK_SOURCES = ['bilibili', 'netease', 'qq', 'manual']
const tracksDraft = ref([])

function initTracks(record) {
  const raw = Array.isArray(record?.tracks) ? record.tracks : []
  // 深拷贝，避免直接改动 props
  tracksDraft.value = raw.map((t) => ({ ...t }))
}

function tracksEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b)
}

function newTrack() {
  return {
    id: `track_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    title: '',
    artist: '',
    album: '',
    source: 'manual',
    coverUrl: '',
    durationMs: 0,
    qqSongId: '',
    neteaseSongId: '',
    bilibiliVideoId: '',
    lyricSongId: '',
    lyricSource: ''
  }
}

function addTrack() {
  tracksDraft.value.push(newTrack())
}

function removeTrack(i) {
  tracksDraft.value.splice(i, 1)
}

function moveTrack(i, dir) {
  const j = i + dir
  if (j < 0 || j >= tracksDraft.value.length) return
  const arr = tracksDraft.value
  ;[arr[i], arr[j]] = [arr[j], arr[i]]
}

watch(
  [() => props.open, () => props.kind, () => props.record],
  ([open]) => {
    if (!open) return
    buildForm(props.record)
    initTracks(props.record)
    jsonText.value = buildDisplayJson(props.record)
    status.value = { text: '', type: 'default' }
  },
  { immediate: true }
)

function normalizeValue(field, value) {
  if (field.type === 'boolean') return value ? 1 : 0
  if (field.type === 'number') {
    if (value === '' || value === null || value === undefined) return null
    const num = Number(value)
    return Number.isFinite(num) ? num : null
  }
  return String(value ?? '')
}

function diffBody() {
  const body = {}
  for (const field of fields.value) {
    const before = normalizeValue(field, props.record?.[field.key])
    const after = normalizeValue(field, form.value[field.key])
    if (before !== after) body[field.key] = after
  }
  return body
}

async function onSave() {
  if (!props.record || saving.value) return
  const body = diffBody()
  if (isEvents.value && !tracksEqual(tracksDraft.value, props.record?.tracks || [])) {
    body.tracks = tracksDraft.value
  }
  if (!Object.keys(body).length) {
    status.value = { text: '没有改动。', type: 'default' }
    return
  }
  saving.value = true
  try {
    await patchRow(props.kind, props.record.id, body)
    logAudit(`${props.kind}.update`, `${props.record.id}（${props.record.name || props.record.item_name || ''}）`, {
      kind: props.kind,
      changed: Object.keys(body)
    })
    status.value = { text: '已保存，改动将随下次同步下发。', type: 'ok' }
    emit('saved', { ...props.record, ...body })
  } catch (e) {
    status.value = { text: e?.message || '保存失败。', type: 'error' }
  } finally {
    saving.value = false
  }
}

async function onApplyJson() {
  if (!props.record || saving.value) return
  let parsed
  try {
    parsed = JSON.parse(jsonText.value)
  } catch (e) {
    status.value = { text: `JSON 解析失败：${e.message}`, type: 'error' }
    return
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    status.value = { text: 'JSON 必须是对象。', type: 'error' }
    return
  }
  const ok = await confirm({
    title: '按 JSON 覆盖整行',
    message: `将用 JSON 内容覆盖该记录的全部字段（共 ${Object.keys(parsed).length} 个字段），此操作不可撤销。确认继续？`,
    danger: true,
    confirmText: '覆盖保存'
  })
  if (!ok) return
  saving.value = true
  try {
    // 把显示时已展开的 JSON 对象重新序列化为字符串，保持 TEXT(JSON) 列格式
    for (const key of jsonStringKeys.value) {
      if (parsed[key] != null && typeof parsed[key] === 'object') {
        parsed[key] = JSON.stringify(parsed[key])
      }
    }
    delete parsed.updated_at
    await patchRow(props.kind, props.record.id, parsed)
    logAudit(`${props.kind}.update_json`, props.record.id, { kind: props.kind, keys: Object.keys(parsed) })
    status.value = { text: '已按 JSON 保存。', type: 'ok' }
    emit('saved', { ...props.record, ...parsed })
  } catch (e) {
    status.value = { text: e?.message || '保存失败。', type: 'error' }
  } finally {
    saving.value = false
  }
}

async function copyJson() {
  try {
    await navigator.clipboard.writeText(jsonText.value)
    status.value = { text: 'JSON 已复制到剪贴板。', type: 'ok' }
  } catch {
    status.value = { text: '复制失败，请手动选择文本复制。', type: 'error' }
  }
}
</script>

<template>
  <div class="record-editor">
    <section class="meta-box">
      <div class="meta-row">
        <span class="meta-label">ID</span>
        <code class="meta-value">{{ record?.id }}</code>
      </div>
      <div class="meta-row">
        <span class="meta-label">用户</span>
        <code class="meta-value">{{ record?.user_id || '--' }}</code>
      </div>
      <div class="meta-row">
        <span class="meta-label">更新时间</span>
        <span class="meta-value">{{ formatTime(record?.updated_at) }}</span>
      </div>
    </section>

    <div class="form-grid">
      <label v-for="field in fields" :key="field.key" class="form-item" :class="`form-item--${field.type}`">
        <span class="form-label">{{ field.label }}</span>

        <select
          v-if="field.type === 'select'"
          v-model="form[field.key]"
          class="input"
        >
          <option value="">--</option>
          <option v-for="opt in field.options" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
        </select>

        <label v-else-if="field.type === 'boolean'" class="checkbox-row">
          <input
            type="checkbox"
            :checked="!!form[field.key]"
            @change="form[field.key] = $event.target.checked ? 1 : 0"
          >
          <span>{{ form[field.key] ? '是' : '否' }}</span>
        </label>

        <textarea
          v-else-if="field.type === 'textarea'"
          v-model="form[field.key]"
          class="input"
          rows="3"
        />

        <input
          v-else-if="field.type === 'number'"
          v-model="form[field.key]"
          class="input"
          type="number"
          step="any"
        >

        <input v-else v-model="form[field.key]" class="input" type="text">
      </label>
    </div>

    <details v-if="isEvents" class="tracks-editor" open>
      <summary>曲目列表（{{ tracksDraft.length }}）</summary>
      <div class="tracks-body">
        <div class="tracks-head">
          <button class="btn btn--sm" type="button" @click="addTrack">+ 添加曲目</button>
        </div>

        <p v-if="!tracksDraft.length" class="tracks-empty">暂无曲目</p>

        <div v-for="(t, i) in tracksDraft" :key="t.id || i" class="track-card">
          <div class="track-card-head">
            <span class="track-index">#{{ i + 1 }}</span>
            <span class="track-id">{{ t.id }}</span>
            <div class="track-ops">
              <button class="btn btn--xs" type="button" :disabled="i === 0" @click="moveTrack(i, -1)">↑</button>
              <button class="btn btn--xs" type="button" :disabled="i === tracksDraft.length - 1" @click="moveTrack(i, 1)">↓</button>
              <button class="btn btn--xs btn--danger" type="button" @click="removeTrack(i)">✕</button>
            </div>
          </div>
          <div class="track-grid">
            <label class="track-field track-field--wide">
              <span>标题</span>
              <input v-model="t.title" class="input" type="text">
            </label>
            <label class="track-field">
              <span>艺术家</span>
              <input v-model="t.artist" class="input" type="text">
            </label>
            <label class="track-field">
              <span>专辑</span>
              <input v-model="t.album" class="input" type="text">
            </label>
            <label class="track-field">
              <span>来源</span>
              <select v-model="t.source" class="input">
                <option v-for="s in TRACK_SOURCES" :key="s" :value="s">{{ s }}</option>
              </select>
            </label>
            <label class="track-field">
              <span>时长(ms)</span>
              <input v-model.number="t.durationMs" class="input" type="number" step="any">
            </label>
            <label class="track-field track-field--wide">
              <span>封面 URL</span>
              <input v-model="t.coverUrl" class="input" type="text">
            </label>
            <div class="track-field track-field--wide track-ids">
              <span class="track-ids-label">各平台 ID</span>
              <div class="track-ids-grid">
                <label v-if="t.source === 'bilibili'" class="track-id-field">
                  <span>Bilibili</span>
                  <input v-model="t.bilibiliVideoId" class="input" type="text" placeholder="BV...">
                </label>
                <label v-if="t.source === 'qq'" class="track-id-field">
                  <span>QQ</span>
                  <input v-model="t.qqSongId" class="input" type="text">
                </label>
                <label v-if="t.source === 'netease'" class="track-id-field">
                  <span>网易云</span>
                  <input v-model="t.neteaseSongId" class="input" type="text">
                </label>
              <label class="track-id-field">
                <span>歌词来源</span>
                <select v-model="t.lyricSource" class="input">
                  <option value="">--</option>
                  <option v-for="s in TRACK_SOURCES" :key="s" :value="s">{{ s }}</option>
                </select>
              </label>
              <label v-if="t.lyricSource" class="track-id-field">
                <span>歌词 ID（{{ t.lyricSource }}）</span>
                <input v-model="t.lyricSongId" class="input" type="text">
              </label>
              </div>
            </div>
          </div>
        </div>
      </div>
    </details>

    <details class="json-box">
      <summary>原始数据（JSON）</summary>
      <textarea v-model="jsonText" class="input json-textarea" rows="14" spellcheck="false" />
      <div class="json-actions">
        <button class="btn btn--sm" type="button" @click="copyJson">复制 JSON</button>
        <button class="btn btn--sm btn--danger" type="button" :disabled="saving" @click="onApplyJson">
          按 JSON 覆盖保存
        </button>
      </div>
      <p class="tip tip--warn">覆盖保存会替换整行全部字段，仅用于修复损坏数据。</p>
    </details>

    <p
      class="status-text"
      :class="status.type === 'ok' ? 'status-text--ok' : status.type === 'error' ? 'status-text--error' : ''"
    >
      {{ status.text }}
    </p>

    <div class="editor-footer">
      <button class="btn" type="button" @click="emit('close')">取消</button>
      <button class="btn btn--primary" type="button" :disabled="saving" @click="onSave">
        {{ saving ? '保存中…' : '保存改动' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.record-editor {
  display: grid;
  gap: 14px;
}

.meta-box {
  display: grid;
  gap: 6px;
  padding: 10px 12px;
  border: 1px solid var(--app-border);
  border-radius: var(--radius-xs);
  background: var(--app-surface-soft);
}

.meta-row {
  display: flex;
  gap: 10px;
  align-items: baseline;
  min-width: 0;
}

.meta-label {
  flex-shrink: 0;
  width: 56px;
  color: var(--app-text-tertiary);
  font-size: 12px;
}

.meta-value {
  overflow-wrap: anywhere;
  font-size: 12px;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px 12px;
}

.form-item {
  display: grid;
  gap: 4px;
  align-content: start;
}

.form-item--textarea,
.form-item--boolean {
  grid-column: 1 / -1;
}

.form-label {
  color: var(--app-text-tertiary);
  font-size: 12px;
}

.checkbox-row {
  display: flex;
  gap: 8px;
  align-items: center;
  cursor: pointer;
}

.json-box {
  display: grid;
  gap: 8px;
  padding: 10px 12px;
  border: 1px solid var(--app-border);
  border-radius: var(--radius-xs);
}

.tracks-editor {
  border: 1px solid var(--app-border);
  border-radius: var(--radius-xs);
  background: var(--app-surface-soft);
}

.tracks-editor summary {
  cursor: pointer;
  padding: 10px 12px;
  color: var(--app-text-secondary);
  font-size: 13px;
  font-weight: 600;
  user-select: none;
}

.tracks-body {
  display: grid;
  gap: 10px;
  padding: 0 12px 12px;
}

.tracks-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.tracks-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--app-text-secondary);
}

.tracks-empty {
  font-size: 12px;
  color: var(--app-text-tertiary);
}

.track-card {
  display: grid;
  gap: 8px;
  padding: 10px;
  border: 1px solid var(--app-border);
  border-radius: var(--radius-xs);
  background: var(--app-surface);
}

.track-card-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.track-index {
  font-size: 12px;
  font-weight: 600;
  color: var(--app-text-secondary);
}

.track-id {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
  font-size: 11px;
  color: var(--app-text-tertiary);
}

.track-ops {
  display: flex;
  gap: 4px;
}

.track-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px 10px;
}

.track-field {
  display: grid;
  gap: 3px;
  align-content: start;
}

.track-field--wide {
  grid-column: 1 / -1;
}

.track-field > span {
  font-size: 11px;
  color: var(--app-text-tertiary);
}

.track-ids {
  gap: 6px;
}

.track-ids-label {
  font-size: 11px;
  color: var(--app-text-tertiary);
}

.track-ids-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 8px 10px;
}

.track-id-field {
  display: grid;
  gap: 3px;
  align-content: start;
}

.track-id-field > span {
  font-size: 11px;
  color: var(--app-text-tertiary);
}

.btn--xs {
  padding: 2px 8px;
  font-size: 12px;
  line-height: 1.6;
}

.json-box summary {
  cursor: pointer;
  color: var(--app-text-secondary);
  font-size: 13px;
  user-select: none;
}

.json-textarea {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  line-height: 1.5;
}

.json-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.editor-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
