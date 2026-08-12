<script setup>
import { onMounted, ref } from 'vue'
import { supabaseRequest } from '../../services/supabase'
import { useAdminList } from '../../composables/useAdminList'
import { useConfirm } from '../../composables/useConfirm'
import { formatTime } from '../../utils/format'
import { FEEDBACK_STATUS, FEEDBACK_STATUS_LABEL, FEEDBACK_TYPE, FEEDBACK_TYPE_LABEL } from '../../constants'
import StatusPill from '../../components/ui/StatusPill.vue'
import TypeBadge from '../../components/ui/TypeBadge.vue'
import SearchInput from '../../components/ui/SearchInput.vue'
import EmptyState from '../../components/ui/EmptyState.vue'
import Skeleton from '../../components/ui/Skeleton.vue'
import AppSelect from '../../components/admin/AppSelect.vue'

const emit = defineEmits(['open-detail'])

const PAGE_SIZE = 50

const { items, loading, keyword, status, load, loadMore, hasMore, setStatus, setItems } = useAdminList({
  loader: async ({ page, pageSize }) => {
    const params = {
      select: 'id,type,title,status,device_id,app_version,created_at,updated_at',
      order: 'created_at.desc',
      limit: pageSize,
      offset: (page - 1) * pageSize
    }
    if (filters.value.status) params.status = `eq.${filters.value.status}`
    if (filters.value.type) params.type = `eq.${filters.value.type}`
    if (keyword.value.trim()) {
      const q = keyword.value.trim()
      params.or = `title.ilike.*${q}*,content.ilike.*${q}*,device_id.ilike.*${q}*`
    }
    const data = await supabaseRequest('/rest/v1/feedbacks', { params })
    return Array.isArray(data) ? data : []
  },
  pageSize: PAGE_SIZE
})

const { confirm } = useConfirm()

const filters = ref({ status: '', type: '' })

const selected = ref([])
const selectedSet = ref(new Set())
const batchBusy = ref(false)
const batchTarget = ref('')

function toggleSelect(id) {
  const next = new Set(selectedSet.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selectedSet.value = next
  selected.value = Array.from(next)
}

function selectPage() {
  const ids = items.value.map((i) => i.id)
  selectedSet.value = new Set(ids)
  selected.value = ids
}

function clearSelection() {
  selectedSet.value = new Set()
  selected.value = []
}

function onBatchStatusChange(value) {
  if (!value) return
  batchSetStatus(value)
  batchTarget.value = ''
}

function changeFilter() {
  selectedSet.value = new Set()
  selected.value = []
  setItems([])
  load()
}

function clearFilters() {
  filters.value = { status: '', type: '' }
  changeFilter()
}

function statusTone(value) {
  if (value === 'resolved') return 'ok'
  if (value === 'reviewing') return 'info'
  if (value === 'closed') return 'default'
  return 'warn'
}

function typeTone(value) {
  if (value === 'bug') return 'error'
  if (value === 'feature') return 'info'
  return 'default'
}

function openDetail(id) {
  emit('open-detail', id)
}

async function batchSetStatus(nextStatus) {
  if (!selected.value.length) return
  const ok = await confirm({
    title: '批量修改状态',
    message: `将 ${selected.value.length} 条反馈的状态改为「${FEEDBACK_STATUS_LABEL[nextStatus]}」？`,
    confirmText: '确认'
  })
  if (!ok) return
  batchBusy.value = true
  try {
    const ids = selected.value
    for (const id of ids) {
      await supabaseRequest(`/rest/v1/feedbacks?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: { status: nextStatus }
      })
    }
    selectedSet.value = new Set()
    selected.value = []
    setStatus(`已更新 ${ids.length} 条。`, 'ok')
    await load()
  } catch (e) {
    setStatus(e?.message || '批量更新失败。', 'error')
  } finally {
    batchBusy.value = false
  }
}

async function refresh() {
  selectedSet.value = new Set()
  selected.value = []
  await load()
}

onMounted(load)

defineExpose({ load })
</script>

<template>
  <div class="fb-toolbar">
    <AppSelect v-model="filters.status" :options="[{ value: '', label: '全部状态' }, ...FEEDBACK_STATUS]" :inline="true" placeholder="全部状态" @change="changeFilter" />
    <AppSelect v-model="filters.type" :options="[{ value: '', label: '全部类型' }, ...FEEDBACK_TYPE]" :inline="true" placeholder="全部类型" @change="changeFilter" />
    <SearchInput v-model="keyword" placeholder="搜索标题 / 内容 / 设备…" @search="changeFilter" />
    <button class="btn btn--soft" type="button" :disabled="!filters.status && !filters.type && !keyword" @click="clearFilters">清除筛选</button>
    <button class="btn" type="button" :disabled="loading" @click="refresh">{{ loading ? '加载中…' : '刷新' }}</button>
  </div>

  <!-- 批量操作栏 -->
  <div v-if="selected.length" class="batch-bar">
    <span class="batch-count">已选 {{ selected.length }} 条</span>
    <button class="btn btn--sm" type="button" @click="selectPage">全选本页</button>
    <button class="btn btn--sm" type="button" @click="clearSelection">取消选择</button>
    <AppSelect v-model="batchTarget" :options="FEEDBACK_STATUS" :inline="true" placeholder="批量修改状态…" @change="onBatchStatusChange" />
  </div>

  <p class="status-text" :class="status.type === 'ok' ? 'status-text--ok' : status.type === 'error' ? 'status-text--error' : ''">
    {{ status.text }}
  </p>

  <div class="list">
    <Skeleton v-if="loading" variant="list" count="6" />
    <EmptyState v-else-if="!items.length" title="暂无反馈" description="调整筛选条件试试" />
    <article v-for="item in items" :key="item.id" class="list-item fb-item">
      <label class="select-box" @click.stop>
        <input type="checkbox" :checked="selectedSet.has(item.id)" @change="toggleSelect(item.id)">
      </label>
      <div class="list-item-main">
        <div class="badge-row">
          <TypeBadge :tone="typeTone(item.type)" :label="FEEDBACK_TYPE_LABEL[item.type] || item.type || '--'" />
          <StatusPill :status="statusTone(item.status)" :label="FEEDBACK_STATUS_LABEL[item.status] || item.status || '待处理'" />
        </div>
        <span class="list-item-title">{{ item.title || item.id }}</span>
        <span class="list-item-meta">
          v{{ item.app_version || '--' }} · {{ formatTime(item.created_at) }}
          <template v-if="item.device_id"> · {{ item.device_id.substring(0, 12) }}…</template>
        </span>
      </div>
      <div class="list-actions">
        <button class="btn btn--sm" type="button" @click="openDetail(item.id)">查看</button>
      </div>
    </article>
  </div>

  <button v-if="hasMore" class="btn btn--soft load-more" type="button" :disabled="loading" @click="loadMore">
    {{ loading ? '加载中…' : `加载更多（已 ${items.length} 条）` }}
  </button>
</template>

<style scoped>
.fb-toolbar {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
}

.batch-bar {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 10px 12px;
  border-radius: var(--radius-xs);
  background: var(--status-info-bg);
  border: 1px solid var(--app-border);
}

.batch-count {
  font-size: 13px;
  font-weight: 600;
  color: var(--app-text);
}

.list {
  display: grid;
  gap: 8px;
}

.fb-item {
  display: flex;
  gap: 8px;
  align-items: center;
}

.select-box {
  display: flex;
  align-items: center;
}

.select-box input[type='checkbox'] {
  width: 16px;
  height: 16px;
  accent-color: var(--app-text);
}

.badge-row {
  display: flex;
  gap: 6px;
  align-items: center;
}

.load-more {
  width: 100%;
}
</style>
