<script setup>
import { computed, onMounted, ref } from 'vue'
import { useAdminList } from '../composables/useAdminList'
import { useConfirm } from '../composables/useConfirm'
import { listDevices, forceDeviceResync } from '../services/device'
import { logAudit } from '../services/audit'
import { formatTime } from '../utils/format'
import StatusPill from '../components/ui/StatusPill.vue'
import SearchInput from '../components/ui/SearchInput.vue'
import EmptyState from '../components/ui/EmptyState.vue'
import Skeleton from '../components/ui/Skeleton.vue'

const { items, loading, keyword, status, load } = useAdminList({
  loader: () => listDevices()
})

const { confirm } = useConfirm()

const short = (s) => String(s || '').slice(0, 12)

function platformLabel(p) {
  return p === 'native' ? '原生' : p === 'web' ? '网页' : (p || '--')
}

const filtered = computed(() => {
  const q = keyword.value.trim().toLowerCase()
  if (!q) return items.value
  return items.value.filter((d) =>
    String(d.device_id || '').toLowerCase().includes(q) ||
    String(d.userName || '').toLowerCase().includes(q) ||
    String(d.app_version || '').toLowerCase().includes(q)
  )
})

const stats = computed(() => {
  const list = items.value
  const native = list.filter((d) => d.platform === 'native').length
  const web = list.filter((d) => d.platform === 'web').length
  const versions = new Set(list.map((d) => String(d.app_version || '').trim()).filter(Boolean)).size
  return { total: list.length, native, web, versions }
})

// 版本分布：按数量倒序，取前 8
const versionDist = computed(() => {
  const map = new Map()
  for (const d of items.value) {
    const v = String(d.app_version || '').trim()
    if (!v) continue
    map.set(v, (map.get(v) || 0) + 1)
  }
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
})

const busyResync = ref('')

async function doForceResync(device) {
  const ok = await confirm({
    title: '强制重同步',
    message: `确认让设备 "${short(device.device_id)}" 下次同步时整量重拉全部数据？`,
    confirmText: '触发'
  })
  if (!ok) return
  busyResync.value = device.device_id
  try {
    await forceDeviceResync(device.device_id)
    logAudit('device.force_resync', device.device_id)
    setStatus('已触发。该设备下次同步将整量重拉。', 'ok')
  } catch (e) {
    setStatus(e?.message || '触发失败。', 'error')
  } finally {
    busyResync.value = ''
  }
}

function setStatus(text, type = 'default') {
  status.value = { text, type }
}

onMounted(load)
</script>

<template>
  <div class="device-toolbar">
    <SearchInput v-model="keyword" placeholder="搜索设备 ID / 用户名 / 版本…" />
    <button class="btn" type="button" :disabled="loading" @click="load">{{ loading ? '加载中…' : '刷新' }}</button>
  </div>

  <div class="stat-row">
    <div class="stat">
      <span class="stat-num">{{ stats.total }}</span>
      <span class="stat-label">设备总数</span>
    </div>
    <div class="stat">
      <span class="stat-num">{{ stats.native }}</span>
      <span class="stat-label">原生端</span>
    </div>
    <div class="stat">
      <span class="stat-num">{{ stats.web }}</span>
      <span class="stat-label">网页端</span>
    </div>
    <div class="stat">
      <span class="stat-num">{{ stats.versions }}</span>
      <span class="stat-label">版本数</span>
    </div>
  </div>

  <template v-if="versionDist.length">
    <div class="version-dist">
      <span v-for="[v, n] in versionDist" :key="v" class="version-chip">
        <span class="version-name">{{ v }}</span>
        <span class="version-count">{{ n }}</span>
      </span>
    </div>
  </template>

  <p class="status-text" :class="status.type === 'ok' ? 'status-text--ok' : status.type === 'error' ? 'status-text--error' : ''">
    {{ status.text }}
  </p>

  <div class="list">
    <Skeleton v-if="loading" variant="list" count="6" />
    <EmptyState v-else-if="!filtered.length" title="暂无设备" description="用户同步后会自动上报设备心跳" />
    <article v-for="d in filtered" :key="d.device_id" class="list-item">
      <div class="list-item-main">
        <span class="list-item-title">
          {{ short(d.device_id) }}
          <template v-if="d.force_resync_at"> · 待重同步</template>
        </span>
        <span class="list-item-meta">
          {{ d.userName || d.user_id }} · {{ platformLabel(d.platform) }} · v{{ d.app_version || '--' }} · 最近活跃 {{ formatTime(d.last_seen_at) }}
        </span>
      </div>
      <div class="list-actions">
        <StatusPill :status="d.platform === 'native' ? 'ok' : 'info'" :label="platformLabel(d.platform)" />
        <button
          class="btn btn--sm btn--soft"
          type="button"
          :disabled="busyResync === d.device_id"
          @click="doForceResync(d)"
        >
          {{ busyResync === d.device_id ? '触发中…' : '强制重同步' }}
        </button>
      </div>
    </article>
  </div>
</template>

<style scoped>
.device-toolbar {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
}

.stat-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
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

.version-dist {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.version-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 999px;
  background: var(--app-surface);
  border: 1px solid var(--app-border);
  font-size: 12px;
}

.version-name {
  color: var(--app-text);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}

.version-count {
  color: var(--app-text-tertiary);
}

.list {
  display: grid;
  gap: 8px;
}
</style>
