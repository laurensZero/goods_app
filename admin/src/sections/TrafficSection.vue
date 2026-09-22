<script setup>
import { onMounted, ref } from 'vue'
import { getTraffic } from '../services/backup'
import { formatBytes } from '../utils/format'
import StatusPill from '../components/ui/StatusPill.vue'
import Skeleton from '../components/ui/Skeleton.vue'
import EmptyState from '../components/ui/EmptyState.vue'

const loading = ref(false)
const status = ref({ text: '等待加载', type: 'default' })
const data = ref(null)
const days = ref(7)

const DAY_OPTIONS = [
  { value: 1, label: '近 1 天' },
  { value: 7, label: '近 7 天' },
  { value: 30, label: '近 30 天' }
]

function setStatus(text, type = 'default') {
  status.value = { text, type }
}

const num = (v) => (v == null ? 0 : Number(v)).toLocaleString('zh-CN')

async function load() {
  loading.value = true
  setStatus('正在读取反代流量日志…')
  try {
    data.value = await getTraffic(days.value)
    if (data.value?.log_exists === false) {
      setStatus('日志文件尚不存在（配置 access_log 并产生请求后出现）。', 'warn')
    } else {
      setStatus('已刷新。', 'ok')
    }
  } catch (e) {
    setStatus(e?.message || '加载失败。', 'error')
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="traffic-toolbar">
    <label class="traffic-days">
      <span>范围</span>
      <select v-model.number="days" class="traffic-select" @change="load">
        <option v-for="o in DAY_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
      </select>
    </label>
    <button class="btn" type="button" :disabled="loading" @click="load">
      {{ loading ? '加载中…' : '刷新' }}
    </button>
  </div>

  <p
    class="status-text"
    :class="status.type === 'ok' ? 'status-text--ok' : status.type === 'error' ? 'status-text--error' : ''"
  >
    {{ status.text }}
  </p>

  <Skeleton v-if="loading && !data" variant="card" count="4" />

  <template v-else-if="data">
    <div class="stat-grid">
      <div class="stat">
        <span class="stat-num">{{ num(data.total_requests) }}</span>
        <span class="stat-label">请求总数</span>
      </div>
      <div class="stat">
        <span class="stat-num">{{ formatBytes(data.total_bytes) }}</span>
        <span class="stat-label">出网字节</span>
      </div>
      <div class="stat">
        <span class="stat-num">{{ num(data.by_day?.length || 0) }}</span>
        <span class="stat-label">有流量天数</span>
      </div>
      <div class="stat">
        <span class="stat-num">{{ formatBytes(data.log_size || 0) }}</span>
        <span class="stat-label">日志文件</span>
      </div>
    </div>

    <p class="meta-line">
      日志路径：<code>{{ data.log_path }}</code>
      <StatusPill :status="data.log_exists ? 'ok' : 'error'" :label="data.log_exists ? '存在' : '缺失'" />
    </p>

    <h3 class="subhead">按天</h3>
    <div v-if="data.by_day?.length" class="table-wrap">
      <table class="table">
        <thead>
          <tr>
            <th>日期</th>
            <th>请求数</th>
            <th>字节</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in data.by_day" :key="row.day">
            <td>{{ row.day }}</td>
            <td>{{ num(row.requests) }}</td>
            <td>{{ formatBytes(row.bytes) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <EmptyState v-else title="该时间范围内暂无流量" description="确认 nginx 已启用 access_log 且有备用线路请求" />

    <h3 class="subhead">路径前缀 Top</h3>
    <div v-if="Object.keys(data.by_path_prefix || {}).length" class="table-wrap">
      <table class="table">
        <thead>
          <tr>
            <th>前缀</th>
            <th>请求数</th>
            <th>字节</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(agg, prefix) in data.by_path_prefix" :key="prefix">
            <td><code>{{ prefix }}</code></td>
            <td>{{ num(agg.requests) }}</td>
            <td>{{ formatBytes(agg.bytes) }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <h3 class="subhead">状态码</h3>
    <div class="status-row" v-if="Object.keys(data.by_status || {}).length">
      <span v-for="(count, code) in data.by_status" :key="code" class="status-chip">
        {{ code }} · {{ num(count) }}
      </span>
    </div>

    <h3 class="subhead">最近请求</h3>
    <div v-if="data.sample?.length" class="table-wrap">
      <table class="table">
        <thead>
          <tr>
            <th>时间</th>
            <th>状态</th>
            <th>字节</th>
            <th>URI</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, i) in data.sample" :key="i">
            <td class="nowrap">{{ row.time }}</td>
            <td>{{ row.status }}</td>
            <td>{{ formatBytes(row.bytes) }}</td>
            <td class="uri-cell"><code>{{ row.uri }}</code></td>
          </tr>
        </tbody>
      </table>
    </div>
  </template>
</template>

<style scoped>
.traffic-toolbar {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 12px;
}

.traffic-days {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--app-text-secondary);
}

.traffic-select {
  padding: 6px 10px;
  border-radius: var(--radius-xs);
  border: 1px solid var(--app-border);
  background: var(--app-surface);
  color: var(--app-text);
  font-size: 13px;
}

.status-text {
  margin: 0;
  font-size: 13px;
  color: var(--app-text-tertiary);
}

.status-text--ok { color: var(--app-success, #16a34a); }
.status-text--error { color: var(--app-danger, #dc2626); }

.stat-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
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
  font-size: 20px;
  font-weight: 700;
  color: var(--app-text);
  font-variant-numeric: tabular-nums;
}

.stat-label {
  font-size: 12px;
  color: var(--app-text-tertiary);
}

.meta-line {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin: 0;
  font-size: 12px;
  color: var(--app-text-tertiary);
}

.meta-line code {
  font-size: 11px;
  word-break: break-all;
}

.subhead {
  margin: 16px 0 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--app-text-secondary);
}

.table-wrap {
  overflow-x: auto;
  border: 1px solid var(--app-border);
  border-radius: var(--radius-xs);
}

.table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.table th,
.table td {
  padding: 8px 10px;
  text-align: left;
  border-bottom: 1px solid var(--app-border);
}

.table th {
  font-weight: 600;
  color: var(--app-text-tertiary);
  background: var(--app-surface-soft);
}

.table tr:last-child td {
  border-bottom: none;
}

.nowrap { white-space: nowrap; }

.uri-cell {
  max-width: 360px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.status-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.status-chip {
  padding: 4px 8px;
  border-radius: 999px;
  border: 1px solid var(--app-border);
  background: var(--app-surface-soft);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  color: var(--app-text-secondary);
}
</style>
