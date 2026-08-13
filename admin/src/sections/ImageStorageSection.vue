<script setup>
import { onMounted, ref } from 'vue'
import { listStorage, findOrphans, runGc } from '../services/storage'
import { useConfirm } from '../composables/useConfirm'
import { formatBytes, formatTime } from '../utils/format'
import Skeleton from '../components/ui/Skeleton.vue'

const { confirm } = useConfirm()

const loading = ref(false)
const busy = ref(false)
const status = ref({ text: '', type: 'default' })
const overview = ref(null) // { total_objects, total_bytes, buckets: [{bucket, objects, bytes}] }
const orphans = ref(null) // { count, bytes, samples, truncated }

function setStatus(text, type = 'default') {
  status.value = { text, type }
}

async function loadOverview() {
  loading.value = true
  try {
    overview.value = await listStorage()
    setStatus('已刷新。', 'ok')
  } catch (e) {
    setStatus(e?.message || '加载失败。', 'error')
  } finally {
    loading.value = false
  }
}

async function loadOrphans() {
  busy.value = true
  setStatus('正在计算孤儿图…')
  try {
    orphans.value = await findOrphans()
    const n = orphans.value?.count || 0
    setStatus(n ? `找到 ${n} 个孤儿对象（约 ${formatBytes(orphans.value?.bytes)}）。` : '未发现可回收的孤儿对象。', n ? 'default' : 'ok')
  } catch (e) {
    setStatus(e?.message || '计算失败。', 'error')
  } finally {
    busy.value = false
  }
}

async function doGc() {
  const count = orphans.value?.count || 0
  if (!count) return
  const ok = await confirm({
    title: '回收孤儿图',
    message: `将物理删除 ${count} 个孤儿对象（约 ${formatBytes(orphans.value?.bytes)}）。48h 内新建的对象不会被删。此操作不可撤销。`,
    danger: true,
    confirmText: '回收'
  })
  if (!ok) return
  busy.value = true
  try {
    const r = await runGc()
    orphans.value = null
    setStatus(`已回收 ${r.deleted} 个对象（约 ${formatBytes(r.bytes)}）。`, 'ok')
    await loadOverview()
  } catch (e) {
    setStatus(e?.message || '回收失败。', 'error')
  } finally {
    busy.value = false
  }
}

onMounted(loadOverview)
</script>

<template>
  <div class="storage-toolbar">
    <button class="btn" type="button" :disabled="loading" @click="loadOverview">{{ loading ? '加载中…' : '刷新' }}</button>
  </div>

  <p class="status-text" :class="status.type === 'ok' ? 'status-text--ok' : status.type === 'error' ? 'status-text--error' : ''">
    {{ status.text }}
  </p>

  <Skeleton v-if="loading && !overview" variant="card" count="3" />
  <template v-else-if="overview">
    <div class="stat-row">
      <div class="stat">
        <span class="stat-num">{{ formatBytes(overview.total_bytes) }}</span>
        <span class="stat-label">存储占用</span>
      </div>
      <div class="stat">
        <span class="stat-num">{{ overview.total_objects }}</span>
        <span class="stat-label">对象总数</span>
      </div>
    </div>

    <div class="bucket-list">
      <div v-for="b in overview.buckets" :key="b.bucket" class="bucket-item">
        <span class="bucket-name">{{ b.bucket }}</span>
        <span class="bucket-meta">{{ b.objects }} 个对象 · {{ formatBytes(b.bytes) }}</span>
      </div>
    </div>
  </template>

  <div class="card card--inner">
    <div class="card-header">
      <div>
        <p class="card-kicker">Orphan GC</p>
        <h3 class="card-title">孤儿图回收</h3>
      </div>
      <span class="state">{{ orphans ? `${orphans.count} 个` : '未计算' }}</span>
    </div>

    <p class="tip">
      回收逻辑复刻客户端同步内的孤儿回收：仅处理 <code>goods-image__</code> / <code>event-cover__</code> /
      <code>event-photo__</code> / <code>recharge-image__</code> 前缀文件，跳过 48h 内新建对象，单次上限 200。
      判定偏保守，不会误删仍存在实体的文件。
    </p>

    <div class="actions">
      <button class="btn btn--soft" type="button" :disabled="busy" @click="loadOrphans">
        {{ busy ? '处理中…' : '计算孤儿' }}
      </button>
      <button
        class="btn btn--danger"
        type="button"
        :disabled="busy || !orphans?.count"
        @click="doGc"
      >
        回收孤儿{{ orphans?.count ? `（${orphans.count}）` : '' }}
      </button>
    </div>

    <template v-if="orphans?.samples?.length">
      <hr class="sep">
      <div v-for="s in orphans.samples.slice(0, 20)" :key="s.path" class="list-item">
        <div class="list-item-main">
          <span class="list-item-title">{{ s.name }}</span>
          <span class="list-item-meta">{{ formatBytes(s.size) }} · {{ formatTime(s.created_at) }}</span>
        </div>
      </div>
      <p v-if="orphans.truncated" class="status-text">仅显示前 20 条（超出部分需分批回收）。</p>
    </template>
  </div>
</template>

<style scoped>
.storage-toolbar {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.stat-row {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}

.stat {
  display: grid;
  gap: 2px;
  padding: 14px 12px;
  border-radius: var(--radius-xs);
  background: var(--app-surface-soft);
  border: 1px solid var(--app-border);
  text-align: center;
}

.stat-num {
  font-size: 22px;
  font-weight: 700;
  color: var(--app-text);
  font-variant-numeric: tabular-nums;
}

.stat-label {
  font-size: 12px;
  color: var(--app-text-tertiary);
}

.bucket-list {
  display: grid;
  gap: 6px;
  margin-top: 8px;
}

.bucket-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  border-radius: var(--radius-xs);
  background: var(--app-surface);
  border: 1px solid var(--app-border);
}

.bucket-name {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  color: var(--app-text);
}

.bucket-meta {
  font-size: 12px;
  color: var(--app-text-tertiary);
}

.card--inner {
  gap: 12px;
  margin-top: 16px;
}

.list-item {
  font-size: 12px;
}
</style>
