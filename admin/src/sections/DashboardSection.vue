<script setup>
import { computed, onMounted, ref } from 'vue'
import { supabaseRequest } from '../services/supabase'
import { formatBytes } from '../utils/format'
import Skeleton from '../components/ui/Skeleton.vue'

const loading = ref(false)
const status = ref({ text: '', type: 'default' })
const stats = ref(null)

function setStatus(text, type = 'default') {
  status.value = { text, type }
}

async function load() {
  loading.value = true
  try {
    const res = await supabaseRequest('/rest/v1/rpc/get_admin_dashboard', { method: 'POST' })
    stats.value = Array.isArray(res) ? res[0] : res
    setStatus('已刷新。', 'ok')
  } catch (e) {
    setStatus(e?.message || '加载失败。', 'error')
  } finally {
    loading.value = false
  }
}

const num = (v) => (v == null ? 0 : Number(v)).toLocaleString('zh-CN')

const cards = computed(() => {
  const s = stats.value || {}
  return [
    { label: '总用户', value: num(s.total_users) },
    { label: '总商品', value: num(s.total_goods) },
    { label: '总活动', value: num(s.total_events) },
    { label: '总充值', value: num(s.total_recharge) },
    { label: '总分享', value: num(s.total_shares) },
    { label: '监控条目', value: num(s.total_mihoyo) },
    { label: '近 24h 同步', value: num(s.synced_24h) },
    { label: '近 7d 同步', value: num(s.synced_7d) },
    { label: '存储占用', value: formatBytes(s.storage_bytes) },
    { label: '存储对象', value: num(s.storage_objects) }
  ]
})

onMounted(load)
</script>

<template>
  <div class="dash-toolbar">
    <button class="btn" type="button" :disabled="loading" @click="load">{{ loading ? '加载中…' : '刷新' }}</button>
  </div>

  <p class="status-text" :class="status.type === 'ok' ? 'status-text--ok' : status.type === 'error' ? 'status-text--error' : ''">
    {{ status.text }}
  </p>

  <Skeleton v-if="loading && !stats" variant="card" count="6" />
  <div v-else class="stat-grid">
    <div v-for="c in cards" :key="c.label" class="stat">
      <span class="stat-num">{{ c.value }}</span>
      <span class="stat-label">{{ c.label }}</span>
    </div>
  </div>
</template>

<style scoped>
.dash-toolbar {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

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
  font-size: 22px;
  font-weight: 700;
  color: var(--app-text);
  font-variant-numeric: tabular-nums;
}

.stat-label {
  font-size: 12px;
  color: var(--app-text-tertiary);
}
</style>
