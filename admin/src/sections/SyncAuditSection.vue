<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useAdminList } from '../composables/useAdminList'
import { useAdminNav } from '../composables/useAdminNav'
import { useConfirm } from '../composables/useConfirm'
import { listSyncAuditLogs, pruneSyncAuditLogs } from '../services/syncAudit'
import { fetchUsersList } from '../services/versionRules'
import { logAudit } from '../services/audit'
import { formatTime } from '../utils/format'
import AppSelect from '../components/admin/AppSelect.vue'
import StatusPill from '../components/ui/StatusPill.vue'
import SearchInput from '../components/ui/SearchInput.vue'
import EmptyState from '../components/ui/EmptyState.vue'
import Skeleton from '../components/ui/Skeleton.vue'

const { goToSection, consumeSectionPayload } = useAdminNav()
const { confirm } = useConfirm()

const deviceFilter = ref('')
const deviceFilterLabel = ref('')
const userFilter = ref('')
const directionFilter = ref('')
const statusFilter = ref('')
const sourceFilter = ref('')
const rangeFilter = ref('7d')
const pruning = ref(false)
const userOptions = ref([{ value: '', label: '全部用户' }])

const DIRECTION_OPTIONS = [
  { value: '', label: '全部方向' },
  { value: 'push', label: '推送 push' },
  { value: 'pull', label: '拉取 pull' }
]

const STATUS_OPTIONS = [
  { value: '', label: '全部状态' },
  { value: 'ok', label: '成功' },
  { value: 'error', label: '失败' }
]

const SOURCE_OPTIONS = [
  { value: '', label: '全部触发源' },
  { value: 'manual', label: 'manual' },
  { value: 'auto', label: 'auto' },
  { value: 'pull', label: 'pull' },
  { value: 'fullSync', label: 'fullSync' },
  { value: 'quickPush', label: 'quickPush' },
  { value: 'forcePush', label: 'forcePush' },
  { value: 'schemaResync', label: 'schemaResync' }
]

const CHANGE_OPTIONS = [
  { value: '', label: '全部' },
  { value: 'has', label: '仅有变更' }
]

const RANGE_OPTIONS = [
  { value: '24h', label: '近 24 小时' },
  { value: '7d', label: '近 7 天' },
  { value: '30d', label: '近 30 天' },
  { value: 'all', label: '不限时间' }
]

const changeFilter = ref('')

const DIRECTION_LABEL = { push: '推送', pull: '拉取' }
const STATUS_LABEL = { ok: '成功', error: '失败' }
const STATUS_PILL = { ok: 'ok', error: 'error' }

const COUNT_LABELS = {
  goods: '谷子',
  goods_trash: '谷子删',
  groups: '分组',
  groups_trash: '分组删',
  group_items: '组员',
  group_items_trash: '组员删',
  recharge: '充值',
  recharge_trash: '充值删',
  events: '活动',
  events_trash: '活动删',
  batch_drafts: '草稿',
  batch_drafts_trash: '草稿删',
  delete_goods: '删谷子',
  delete_groups: '删分组',
  delete_group_items: '删组员',
  delete_recharge: '删充值',
  delete_events: '删活动',
  delete_batch_drafts: '删草稿',
  presets: '预设'
}

function hasAnyCount(counts) {
  if (!counts || typeof counts !== 'object') return false
  return Object.values(counts).some((v) => Number(v) > 0)
}

function rangeToSince(range) {
  if (!range || range === 'all') return ''
  const hours = range === '24h' ? 24 : range === '7d' ? 24 * 7 : 24 * 30
  return new Date(Date.now() - hours * 3600 * 1000).toISOString()
}

const { items, loading, keyword, status, load, setStatus } = useAdminList({
  loader: () =>
    listSyncAuditLogs({
      limit: 200,
      deviceId: deviceFilter.value,
      userId: userFilter.value,
      direction: directionFilter.value,
      status: statusFilter.value,
      source: sourceFilter.value,
      since: rangeToSince(rangeFilter.value)
    }),
  showLoadStatus: false
})

watch(
  [deviceFilter, userFilter, directionFilter, statusFilter, sourceFilter, rangeFilter, changeFilter],
  () => { load() }
)

function platformLabel(p) {
  return p === 'native' ? '原生' : p === 'web' ? '网页' : (p || '--')
}

function shortId(id) {
  const s = String(id || '')
  return s.length > 12 ? `${s.slice(0, 8)}…` : s || '--'
}

/** counts 全 0 也返回明确文案，避免「像没记」 */
function countsSummary(counts) {
  if (!counts || typeof counts !== 'object') return '无变更（0）'
  const parts = []
  for (const [key, name] of Object.entries(COUNT_LABELS)) {
    const n = Number(counts[key])
    if (Number.isFinite(n) && n > 0) parts.push(`${name} ${n}`)
  }
  return parts.length ? parts.join(' · ') : '无变更（0）'
}

function flags(row) {
  const out = []
  if (!hasAnyCount(row.counts)) out.push('无变更')
  if (row.incremental) out.push('增量')
  if (row.schema_resync) out.push('格式回填')
  if (row.force_push) out.push('强推')
  return out
}

function watermarkHint(row) {
  const after = String(row.watermark_after || '')
  if (!after) return ''
  return shortId(after)
}

const stats = computed(() => {
  const list = items.value
  return {
    total: list.length,
    push: list.filter((r) => r.direction === 'push').length,
    pull: list.filter((r) => r.direction === 'pull').length,
    empty: list.filter((r) => !hasAnyCount(r.counts)).length,
    error: list.filter((r) => r.status === 'error').length
  }
})

/** 服务端已筛选；此处按关键词 + 变更有无做本页二次过滤 */
const filtered = computed(() => {
  const q = keyword.value.trim().toLowerCase()
  return items.value.filter((row) => {
    if (changeFilter.value === 'has' && !hasAnyCount(row.counts)) return false
    if (!q) return true
    return (
      String(row.device_id || '').toLowerCase().includes(q) ||
      String(row.user_id || '').toLowerCase().includes(q) ||
      String(row.userName || '').toLowerCase().includes(q) ||
      String(row.action || '').toLowerCase().includes(q) ||
      String(row.source || '').toLowerCase().includes(q) ||
      String(row.error_message || '').toLowerCase().includes(q) ||
      String(row.apk_version || '').toLowerCase().includes(q) ||
      String(row.bundle_version || '').toLowerCase().includes(q) ||
      String(row.model || '').toLowerCase().includes(q)
    )
  })
})

function clearDeviceFilter() {
  deviceFilter.value = ''
  deviceFilterLabel.value = ''
}

function openDeviceFor(row) {
  goToSection('device', {
    keyword: row.device_id || '',
    userName: row.userName || ''
  })
}

async function loadUserOptions() {
  try {
    const users = await fetchUsersList()
    userOptions.value = [
      { value: '', label: '全部用户' },
      ...users.map((u) => ({ value: u.id, label: u.display || u.email || u.id }))
    ]
  } catch {
    userOptions.value = [{ value: '', label: '全部用户' }]
  }
}

async function doPrune() {
  const ok = await confirm({
    title: '清理同步日志',
    message: '确认删除 30 天前的同步审计日志？此操作不可撤销。',
    danger: true,
    confirmText: '清理'
  })
  if (!ok) return
  pruning.value = true
  try {
    const deleted = await pruneSyncAuditLogs(30)
    logAudit('sync_audit.prune', `deleted=${deleted}`)
    setStatus(`已清理 ${deleted} 条（30 天前）。`, 'ok')
    await load()
  } catch (e) {
    setStatus(e?.message || '清理失败。', 'error')
  } finally {
    pruning.value = false
  }
}

onMounted(async () => {
  const payload = consumeSectionPayload('syncaudit')
  const hasIncoming = !!(payload?.device_id || payload?.user_id || payload?.direction)
  if (payload?.device_id) {
    deviceFilter.value = payload.device_id
    deviceFilterLabel.value = payload.userName || payload.device_id
  }
  if (payload?.user_id) userFilter.value = payload.user_id
  if (payload?.direction) directionFilter.value = payload.direction
  await loadUserOptions()
  // 有跨页筛选时由 watch 触发 load，避免 mount 阶段双请求
  if (!hasIncoming) await load()
})
</script>

<template>
  <div class="sync-audit-toolbar">
    <SearchInput v-model="keyword" placeholder="本页筛选：设备 / 用户 / 版本 / 机型…" />
    <AppSelect v-model="userFilter" :options="userOptions" placeholder="用户" inline />
    <AppSelect v-model="directionFilter" :options="DIRECTION_OPTIONS" placeholder="方向" inline />
    <AppSelect v-model="statusFilter" :options="STATUS_OPTIONS" placeholder="状态" inline />
    <AppSelect v-model="sourceFilter" :options="SOURCE_OPTIONS" placeholder="触发源" inline />
    <AppSelect v-model="changeFilter" :options="CHANGE_OPTIONS" placeholder="变更" inline />
    <AppSelect v-model="rangeFilter" :options="RANGE_OPTIONS" placeholder="时间" inline />
    <button class="btn" type="button" :disabled="loading" @click="load">{{ loading ? '加载中…' : '刷新' }}</button>
    <button class="btn btn--soft" type="button" :disabled="pruning || loading" @click="doPrune">
      {{ pruning ? '清理中…' : '清理 30 天前' }}
    </button>
  </div>

  <div v-if="deviceFilter" class="filter-chips">
    <span class="filter-chip">
      设备：{{ deviceFilterLabel || shortId(deviceFilter) }}
      <button class="filter-chip__clear" type="button" aria-label="清除设备筛选" @click="clearDeviceFilter">×</button>
    </span>
  </div>

  <div class="stat-row">
    <div class="stat">
      <span class="stat-num">{{ stats.total }}</span>
      <span class="stat-label">本页条数</span>
    </div>
    <div class="stat">
      <span class="stat-num">{{ stats.push }}</span>
      <span class="stat-label">推送</span>
    </div>
    <div class="stat">
      <span class="stat-num">{{ stats.pull }}</span>
      <span class="stat-label">拉取</span>
    </div>
    <div class="stat">
      <span class="stat-num">{{ stats.empty }}</span>
      <span class="stat-label">无变更</span>
    </div>
    <div class="stat">
      <span class="stat-num">{{ stats.error }}</span>
      <span class="stat-label">失败</span>
    </div>
  </div>

  <p
    class="status-text"
    :class="status.type === 'ok' ? 'status-text--ok' : status.type === 'error' ? 'status-text--error' : ''"
  >
    {{ status.text || '仅记录有变更的 push/pull；数量为 0 的同步不入库，设备活性看「设备管理」心跳。' }}
  </p>

  <div class="list">
    <Skeleton v-if="loading" variant="list" count="6" />
    <EmptyState
      v-else-if="!filtered.length"
      title="暂无同步日志"
      description="仅登记有数据变更的同步；零变更不同步入库。若始终为空，请确认已执行 RPC 审计迁移"
    />
    <article v-for="row in filtered" :key="row.id" class="list-item">
      <div class="list-item-main">
        <span class="list-item-title">
          {{ DIRECTION_LABEL[row.direction] || row.direction || '--' }}
          · {{ row.action || '--' }}
          <template v-if="row.userName"> · {{ row.userName }}</template>
        </span>
        <span class="list-item-meta">
          <button
            class="linkish"
            type="button"
            title="按该设备筛选并查看设备管理"
            @click="openDeviceFor(row)"
          >
            {{ shortId(row.device_id) }}
          </button>
          · {{ platformLabel(row.platform) }}
          <template v-if="row.model || row.manufacturer">
            · {{ row.manufacturer ? row.manufacturer + ' ' : '' }}{{ row.model || '' }}
          </template>
          <template v-if="row.apk_version || row.bundle_version">
            · APK v{{ row.apk_version || '--' }} · Bundle v{{ row.bundle_version || '--' }}
          </template>
          · {{ formatTime(row.created_at) }}
        </span>
        <span
          class="list-item-meta list-item-meta--counts"
          :class="{ 'list-item-meta--empty': !hasAnyCount(row.counts) }"
        >
          {{ countsSummary(row.counts) }}
        </span>
        <span v-if="flags(row).length || watermarkHint(row) || row.source" class="list-item-meta list-item-meta--extra">
          <template v-if="flags(row).length">{{ flags(row).join(' · ') }} · </template>
          <template v-if="row.source">触发 {{ row.source }}</template>
          <template v-if="watermarkHint(row)"> · 水位 {{ watermarkHint(row) }}</template>
        </span>
      </div>
      <div class="list-actions">
        <StatusPill
          :status="STATUS_PILL[row.status] || 'info'"
          :label="STATUS_LABEL[row.status] || row.status || '--'"
        />
        <button class="btn btn--sm btn--soft" type="button" @click="deviceFilter = row.device_id; deviceFilterLabel = row.userName || row.device_id">
          只看此设备
        </button>
        <button class="btn btn--sm btn--soft" type="button" @click="openDeviceFor(row)">
          查看设备
        </button>
      </div>
    </article>
  </div>
</template>

<style scoped>
.sync-audit-toolbar {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
}

.filter-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.filter-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 28px;
  padding: 0 10px;
  border-radius: 999px;
  background: var(--app-surface-soft);
  border: 1px solid var(--app-border);
  font-size: 12px;
  color: var(--app-text);
}

.filter-chip__clear {
  border: none;
  background: transparent;
  color: var(--app-text-tertiary);
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
  padding: 0 2px;
}

.filter-chip__clear:hover {
  color: var(--app-text);
}

.stat-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
  gap: 8px;
}

.stat {
  display: grid;
  gap: 2px;
  padding: 12px;
  border-radius: var(--radius-xs);
  background: var(--app-surface-soft);
  border: 1px solid var(--app-border);
  text-align: center;
}

.stat-num {
  font-size: 20px;
  font-weight: 700;
  color: var(--app-text);
}

.stat-label {
  font-size: 12px;
  color: var(--app-text-tertiary);
}

.list {
  display: grid;
  gap: 8px;
}

.list-item-meta--counts {
  color: var(--app-text-secondary);
}

.list-item-meta--empty {
  color: var(--app-text-tertiary);
  font-style: italic;
}

.list-item-meta--extra {
  font-size: 12px;
  word-break: break-all;
}

.linkish {
  border: none;
  background: transparent;
  padding: 0;
  color: var(--app-text);
  font: inherit;
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 2px;
}

.linkish:hover {
  color: var(--app-text);
  opacity: 0.85;
}

.list-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  justify-content: flex-end;
}
</style>
