<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import {
  DATA_KINDS,
  KIND_FIELDS,
  buildQueryParams,
  fetchRows,
  fetchCount,
  patchRow,
  patchRowsByIds,
  deleteRowsByIds
} from '../services/goodsAdmin'
import { logAudit } from '../services/audit'
import { fetchUsersList } from '../services/versionRules'
import { useAdminList } from '../composables/useAdminList'
import { useConfirm } from '../composables/useConfirm'
import { formatTime } from '../utils/format'
import PanelDrawer from '../components/ui/PanelDrawer.vue'
import StatusPill from '../components/ui/StatusPill.vue'
import SearchInput from '../components/ui/SearchInput.vue'
import EmptyState from '../components/ui/EmptyState.vue'
import Skeleton from '../components/ui/Skeleton.vue'
import AppSelect from '../components/admin/AppSelect.vue'
import RecordEditDrawer from './goods/RecordEditDrawer.vue'

const KIND_IDS = Object.keys(DATA_KINDS)

const kind = ref('goods')
const userId = ref('')
const scope = ref(DATA_KINDS.goods.defaultScope)
const keyword = ref('')

const totalCount = ref(0)
const selection = ref([])
const allSelected = computed(() =>
  list.items.value.length > 0 && selection.value.length >= list.items.value.length
)

// ── 用户筛选 ──

const users = ref([])
const userOptions = computed(() => [
  { value: '', label: '全部用户' },
  ...users.value.map((u) => ({ value: u.id, label: u.display }))
])
const userNameMap = computed(() => new Map(users.value.map((u) => [u.id, u.display])))

function userLabel(id) {
  return userNameMap.value.get(id) || (id ? id.slice(0, 8) : '--')
}

// ── 列表 ──

const list = useAdminList({
  pageSize: 50,
  emptyText: '没有匹配的记录',
  showLoadStatus: false,
  loader: async ({ page, pageSize }) => {
    const params = currentParams()
    return fetchRows(kind.value, params, { limit: pageSize, offset: (page - 1) * pageSize })
  }
})

function currentParams() {
  return buildQueryParams(kind.value, {
    userId: userId.value,
    scope: scope.value,
    keyword: keyword.value
  })
}

async function refreshCount() {
  try {
    totalCount.value = await fetchCount(kind.value, currentParams())
  } catch {
    totalCount.value = -1
  }
}

async function reload() {
  selection.value = []
  await Promise.all([list.reset(), refreshCount()])
}

const scopeDef = computed(() => DATA_KINDS[kind.value])
const scopeOptions = computed(() => scopeDef.value.scopes.map((s) => ({ value: s.value, label: s.label })))

watch(kind, () => {
  keyword.value = ''
  scope.value = DATA_KINDS[kind.value].defaultScope
})
watch([userId, scope], reload)

let searchTimer = null
watch(keyword, () => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(reload, 350)
})

onMounted(async () => {
  reload()
  try {
    users.value = await fetchUsersList()
  } catch {
    // serviceKey 缺失等情况：仅失去用户名展示，不阻塞列表
  }
})

// ── 行展示 ──

function rowTitle(item) {
  if (kind.value === 'goods') return item.name || '(未命名)'
  if (kind.value === 'events') return item.name || '(未命名)'
  return item.item_name || '(未命名)'
}

function rowMeta(item) {
  const parts = []
  const price = (value, currency) => {
    if (!value && value !== 0) return ''
    return `${currency || ''}${value}`
  }
  if (kind.value === 'goods') {
    if (item.ip) parts.push(item.ip)
    if (item.category) parts.push(item.category)
    if (item.storage_location) parts.push(`位置：${item.storage_location}`)
    const p = price(item.price, item.currency)
    if (p) parts.push(`标价 ${p}`)
    if (Number(item.quantity) > 1) parts.push(`×${item.quantity}`)
    if (item.collect_status && !item.is_wishlist) parts.push(item.collect_status)
  } else if (kind.value === 'events') {
    if (item.type) parts.push(item.type)
    if (item.start_date) parts.push(`${item.start_date} ~ ${item.end_date || '?'}`)
    if (item.location) parts.push(item.location)
    if (item.ticket_price) parts.push(`票价 ${item.ticket_price}`)
  } else {
    if (item.game) parts.push(item.game)
    if (item.amount !== null && item.amount !== undefined) parts.push(`¥${item.amount}`)
    if (item.charged_at) parts.push(item.charged_at)
  }
  parts.push(userLabel(item.user_id))
  parts.push(formatTime(item.updated_at))
  return parts.join(' · ')
}

function rowPill(item) {
  if (kind.value === 'goods') {
    if (item.trashed) return { status: 'warn', label: '回收站' }
    if (item.is_wishlist) return { status: 'info', label: '心愿单' }
    return null
  }
  if (item.deleted) return { status: 'warn', label: '已删除' }
  return null
}

// ── 单条操作 ──

const { confirm } = useConfirm()

const drawerOpen = ref(false)
const editingRecord = ref(null)

function openEdit(item) {
  editingRecord.value = item
  drawerOpen.value = true
}

function onSaved(payload) {
  const index = list.items.value.findIndex((i) => i.id === payload.id)
  if (index >= 0) list.items.value[index] = { ...list.items.value[index], ...payload }
  refreshCount()
}

async function toggleTrash(item) {
  const next = item.trashed ? 0 : 1
  try {
    await patchRow('goods', item.id, { trashed: next })
    logAudit('goods.update', item.id, { kind: 'goods', changed: ['trashed'], to: next })
    item.trashed = next
    list.setStatus(next ? '已移入回收站。' : '已移出回收站。', 'ok')
  } catch (e) {
    list.setStatus(e?.message || '操作失败。', 'error')
  }
}

async function toggleDeleted(item) {
  const next = item.deleted ? 0 : 1
  try {
    await patchRow(kind.value, item.id, { deleted: next })
    logAudit(`${kind.value}.update`, item.id, { kind: kind.value, changed: ['deleted'], to: next })
    item.deleted = next
    list.setStatus(next ? '已标记删除。' : '已恢复。', 'ok')
  } catch (e) {
    list.setStatus(e?.message || '操作失败。', 'error')
  }
}

async function removeRow(item) {
  const ok = await confirm({
    title: `删除${scopeDef.value.label}记录`,
    message: `确认从数据库永久删除 "${rowTitle(item)}"（ID: ${item.id.slice(0, 12)}…）？此操作不可撤销，用户设备同步后也会消失。`,
    danger: true,
    confirmText: '永久删除'
  })
  if (!ok) return
  try {
    await deleteRowsByIds(kind.value, [item.id])
    logAudit(`${kind.value}.delete`, item.id, { kind: kind.value })
    list.setStatus('已删除。', 'ok')
    await reload()
  } catch (e) {
    list.setStatus(e?.message || '删除失败。', 'error')
  }
}

// ── 批量选择与操作 ──

function toggleSelect(id) {
  selection.value = selection.value.includes(id)
    ? selection.value.filter((v) => v !== id)
    : [...selection.value, id]
}

function toggleSelectAll() {
  selection.value = allSelected.value ? [] : list.items.value.map((i) => i.id)
}

const trashLabel = computed(() => (kind.value === 'goods' ? '移入回收站' : '标记删除'))
const restoreLabel = computed(() => (kind.value === 'goods' ? '移出回收站' : '恢复'))

const batchBusy = ref(false)

async function runBatch(body, auditDetail) {
  if (batchBusy.value) return
  batchBusy.value = true
  try {
    await patchRowsByIds(kind.value, selection.value, body)
    logAudit(`${kind.value}.batch_update`, `${selection.value.length} 条记录`, {
      kind: kind.value,
      ids: selection.value.slice(0, 20),
      ...auditDetail
    })
    list.setStatus(`已更新 ${selection.value.length} 条记录，将随下次同步下发。`, 'ok')
    await reload()
  } catch (e) {
    list.setStatus(e?.message || '批量操作失败。', 'error')
  } finally {
    batchBusy.value = false
  }
}

async function batchTrash() {
  const body = kind.value === 'goods' ? { trashed: 1 } : { deleted: 1 }
  const ok = await confirm({
    title: trashLabel.value,
    message: `确认对选中的 ${selection.value.length} 条记录执行「${trashLabel.value}」？`,
    confirmText: trashLabel.value
  })
  if (!ok) return
  await runBatch(body, { op: trashLabel.value })
}

async function batchRestore() {
  const body = kind.value === 'goods' ? { trashed: 0 } : { deleted: 0 }
  const ok = await confirm({
    title: restoreLabel.value,
    message: `确认对选中的 ${selection.value.length} 条记录执行「${restoreLabel.value}」？`,
    confirmText: restoreLabel.value
  })
  if (!ok) return
  await runBatch(body, { op: restoreLabel.value })
}

async function batchDelete() {
  const ok = await confirm({
    title: '批量永久删除',
    message: `确认从数据库永久删除选中的 ${selection.value.length} 条记录？此操作不可撤销。`,
    danger: true,
    confirmText: '永久删除'
  })
  if (!ok) return
  if (batchBusy.value) return
  batchBusy.value = true
  try {
    await deleteRowsByIds(kind.value, selection.value)
    logAudit(`${kind.value}.batch_delete`, `${selection.value.length} 条记录`, {
      kind: kind.value,
      ids: selection.value.slice(0, 20)
    })
    list.setStatus(`已删除 ${selection.value.length} 条记录。`, 'ok')
    await reload()
  } catch (e) {
    list.setStatus(e?.message || '批量删除失败。', 'error')
  } finally {
    batchBusy.value = false
  }
}

// ── 批量修改字段 ──

const batchOpen = ref(false)
const batchFieldKey = ref('')
const batchValue = ref('')

const batchFieldOptions = computed(() =>
  (KIND_FIELDS[kind.value] || []).map((f) => ({ value: f.key, label: f.label }))
)
const batchField = computed(() => (KIND_FIELDS[kind.value] || []).find((f) => f.key === batchFieldKey.value))

watch(batchFieldKey, () => {
  batchValue.value = ''
})

function normalizeBatchValue(field, raw) {
  if (!field) return undefined
  if (field.type === 'boolean') return Number(raw)
  if (field.type === 'number') {
    if (raw === '' || raw === null || raw === undefined) return null
    const num = Number(raw)
    return Number.isFinite(num) ? num : null
  }
  return String(raw ?? '')
}

async function applyBatchField() {
  const field = batchField.value
  if (!field || !selection.value.length) return
  const value = normalizeBatchValue(field, batchValue.value)
  const preview = field.type === 'boolean' ? (value ? '是' : '否') : value === null ? '(空)' : String(value)
  const ok = await confirm({
    title: '批量修改字段',
    message: `确认把选中 ${selection.value.length} 条记录的「${field.label}」统一改为：${preview}？改动会同步到用户设备。`,
    confirmText: '批量修改'
  })
  if (!ok) return
  await runBatch({ [field.key]: value }, { op: '批量修改字段', field: field.key, value })
}

async function copyIds() {
  try {
    await navigator.clipboard.writeText(selection.value.join('\n'))
    list.setStatus('已复制所选 ID。', 'ok')
  } catch {
    list.setStatus('复制失败。', 'error')
  }
}
</script>

<template>
  <div class="gd-tabs">
    <button
      v-for="id in KIND_IDS"
      :key="id"
      class="btn gd-tab"
      :class="{ 'gd-tab--active': kind === id }"
      type="button"
      @click="kind = id"
    >
      {{ DATA_KINDS[id].label }}
    </button>
  </div>

  <div class="gd-toolbar">
    <AppSelect v-model="userId" :options="userOptions" placeholder="全部用户" class="gd-user-select" />
    <AppSelect v-model="scope" :options="scopeOptions" placeholder="范围" class="gd-scope-select" />
    <SearchInput v-model="keyword" placeholder="搜索名称 / IP / 编号…" />
    <button class="btn" type="button" @click="toggleSelectAll">
      {{ allSelected ? '取消全选' : '全选本页' }}
    </button>
    <button class="btn" type="button" :disabled="list.loading.value" @click="reload">
      {{ list.loading.value ? '加载中…' : '刷新' }}
    </button>
  </div>

  <p class="count-line">
    共 {{ totalCount >= 0 ? totalCount : '?' }} 条 · 已加载 {{ list.items.value.length }} 条
  </p>

  <div v-if="selection.length" class="batch-bar">
    <span class="batch-count">已选 {{ selection.length }}</span>
    <button class="btn btn--sm" type="button" @click="batchOpen = true">批量修改字段</button>
    <button class="btn btn--sm btn--soft" type="button" :disabled="batchBusy" @click="batchTrash">{{ trashLabel }}</button>
    <button class="btn btn--sm btn--soft" type="button" :disabled="batchBusy" @click="batchRestore">{{ restoreLabel }}</button>
    <button class="btn btn--sm" type="button" @click="copyIds">复制 ID</button>
    <button class="btn btn--sm btn--danger" type="button" :disabled="batchBusy" @click="batchDelete">永久删除</button>
    <button class="btn btn--sm" type="button" @click="selection = []">取消选择</button>
  </div>

  <p
    class="status-text"
    :class="list.status.value.type === 'ok' ? 'status-text--ok' : list.status.value.type === 'error' ? 'status-text--error' : ''"
  >
    {{ list.status.value.text }}
  </p>

  <div class="list">
    <!-- 骨架仅在首次/重置加载（列表为空）时显示；追加加载保留已有列表，避免高度塌陷导致滚动跳顶 -->
    <Skeleton v-if="list.loading.value && !list.items.value.length" variant="list" count="5" />
    <EmptyState
      v-else-if="!list.loading.value && !list.items.value.length"
      title="没有匹配的记录"
      description="调整筛选条件后重试"
    />

    <template v-else>
      <article v-for="item in list.items.value" :key="item.id" class="list-item">
        <input
          class="row-check"
          type="checkbox"
          :checked="selection.includes(item.id)"
          @change="toggleSelect(item.id)"
        >
        <div class="list-item-main">
          <span class="list-item-title">{{ rowTitle(item) }}</span>
          <span class="list-item-meta">{{ rowMeta(item) }}</span>
          <code class="list-item-id">{{ item.id }}</code>
        </div>
        <div class="list-actions">
          <StatusPill v-if="rowPill(item)" :status="rowPill(item).status" :label="rowPill(item).label" />
          <button class="btn btn--sm" type="button" @click="openEdit(item)">编辑</button>
          <button
            v-if="kind === 'goods'"
            class="btn btn--sm btn--soft"
            type="button"
            @click="toggleTrash(item)"
          >
            {{ item.trashed ? '移出回收站' : '移入回收站' }}
          </button>
          <button
            v-else
            class="btn btn--sm btn--soft"
            type="button"
            @click="toggleDeleted(item)"
          >
            {{ item.deleted ? '恢复' : '标记删除' }}
          </button>
          <button class="btn btn--sm btn--danger" type="button" @click="removeRow(item)">删除</button>
        </div>
      </article>

      <button
        v-if="list.hasMore.value"
        class="btn load-more"
        type="button"
        :disabled="list.loading.value"
        @click="list.loadMore()"
      >
        {{ list.loading.value ? '加载中…' : '加载更多' }}
      </button>
    </template>
  </div>

  <PanelDrawer
    :open="drawerOpen"
    :title="`编辑${scopeDef.label}记录`"
    kicker="record editor"
    :width="640"
    @close="drawerOpen = false"
  >
    <RecordEditDrawer
      :open="drawerOpen"
      :kind="kind"
      :record="editingRecord"
      @close="drawerOpen = false"
      @saved="onSaved"
    />
  </PanelDrawer>

  <PanelDrawer
    :open="batchOpen"
    title="批量修改字段"
    kicker="batch editor"
    :width="420"
    @close="batchOpen = false"
  >
    <div class="batch-form">
      <p class="tip">对已选的 {{ selection.length }} 条记录统一写入一个字段的值。</p>
      <label class="form-item">
        <span class="form-label">目标字段</span>
        <AppSelect v-model="batchFieldKey" :options="batchFieldOptions" placeholder="选择要修改的字段…" />
      </label>

      <template v-if="batchField">
        <label v-if="batchField.type === 'select'" class="form-item">
          <span class="form-label">新值</span>
          <select v-model="batchValue" class="input">
            <option value="">--</option>
            <option v-for="opt in batchField.options" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
          </select>
        </label>

        <label v-else-if="batchField.type === 'boolean'" class="form-item">
          <span class="form-label">新值</span>
          <select v-model.number="batchValue" class="input">
            <option :value="1">是</option>
            <option :value="0">否</option>
          </select>
        </label>

        <label v-else-if="batchField.type === 'number'" class="form-item">
          <span class="form-label">新值（留空写 null）</span>
          <input v-model="batchValue" class="input" type="number" step="any">
        </label>

        <label v-else class="form-item">
          <span class="form-label">新值（留空写空字符串）</span>
          <textarea v-if="batchField.type === 'textarea'" v-model="batchValue" class="input" rows="3" />
          <input v-else v-model="batchValue" class="input" type="text">
        </label>

        <button class="btn btn--primary" type="button" @click="applyBatchField">应用到 {{ selection.length }} 条记录</button>
      </template>
    </div>
  </PanelDrawer>
</template>

<style scoped>
.gd-tabs {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.gd-tab--active {
  border-color: var(--app-input-focus-border);
  color: var(--app-text);
  font-weight: 600;
}

.gd-toolbar {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
}

.gd-user-select {
  max-width: 220px;
}

.gd-scope-select {
  max-width: 130px;
}

.count-line {
  margin: 0;
  color: var(--app-text-tertiary);
  font-size: 13px;
}

.batch-bar {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  align-items: center;
  padding: 8px 10px;
  border: 1px solid var(--app-border);
  border-radius: var(--radius-xs);
  background: var(--app-surface-soft);
}

.batch-count {
  color: var(--app-text);
  font-size: 13px;
  font-weight: 600;
  margin-right: 4px;
}

.row-check {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  cursor: pointer;
}

.list-item-main {
  min-width: 0;
}

.list-item-id {
  display: block;
  overflow: hidden;
  color: var(--app-text-tertiary);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.load-more {
  justify-self: center;
}

.list {
  display: grid;
  gap: 8px;
}

.list-item {
  align-items: flex-start;
}

.batch-form {
  display: grid;
  gap: 12px;
}

.form-item {
  display: grid;
  gap: 4px;
}

.form-label {
  color: var(--app-text-tertiary);
  font-size: 12px;
}
</style>
