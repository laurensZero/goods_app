<script setup>
import { computed, onMounted, ref } from 'vue'
import { supabaseRequest } from '../services/supabase'
import { useAdminList } from '../composables/useAdminList'
import { formatTime } from '../utils/format'
import { fetchUsersList } from '../services/versionRules'
import StatusPill from '../components/ui/StatusPill.vue'
import SearchInput from '../components/ui/SearchInput.vue'
import EmptyState from '../components/ui/EmptyState.vue'
import Skeleton from '../components/ui/Skeleton.vue'

const { items, loading, keyword, status, load } = useAdminList({
  loader: async () => {
    const data = await supabaseRequest('/rest/v1/mihoyo_monitor_goods', {
      params: { order: 'added_at.desc' }
    })
    return Array.isArray(data) ? data : []
  }
})

const short = (s) => String(s || '').slice(0, 8)

// 用户名映射：user_id → 用户名（display_name/full_name/email）
const userMap = ref({})
function displayName(id) {
  return userMap.value[id] || short(id)
}
async function loadUsers() {
  try {
    const users = await fetchUsersList()
    const map = {}
    for (const u of users) map[u.id] = u.display
    userMap.value = map
  } catch {
    /* 用户列表拉取失败时退回 uuid */
  }
}

const stats = computed(() => {
  const total = items.value.length
  const inStock = items.value.filter((i) => i.in_stock).length
  const users = new Set(items.value.map((i) => i.user_id).filter(Boolean)).size
  return { total, inStock, users }
})

const filtered = computed(() => {
  const q = keyword.value.trim().toLowerCase()
  if (!q) return items.value
  return items.value.filter((i) =>
    String(i.name || '').toLowerCase().includes(q) ||
    String(i.goods_id || '').toLowerCase().includes(q)
  )
})

function priceLabel(cents) {
  if (!cents) return '--'
  return `¥${(Number(cents) / 100).toFixed(2)}`
}

onMounted(() => {
  load()
  loadUsers()
})
</script>

<template>
  <div class="mihoyo-toolbar">
    <SearchInput v-model="keyword" placeholder="搜索商品名 / 商品 ID…" />
    <button class="btn" type="button" :disabled="loading" @click="load">{{ loading ? '加载中…' : '刷新' }}</button>
  </div>

  <div class="stat-row">
    <div class="stat">
      <span class="stat-num">{{ stats.total }}</span>
      <span class="stat-label">监控条目</span>
    </div>
    <div class="stat">
      <span class="stat-num">{{ stats.inStock }}</span>
      <span class="stat-label">当前有货</span>
    </div>
    <div class="stat">
      <span class="stat-num">{{ stats.users }}</span>
      <span class="stat-label">监控用户</span>
    </div>
  </div>

  <p class="status-text" :class="status.type === 'ok' ? 'status-text--ok' : status.type === 'error' ? 'status-text--error' : ''">
    {{ status.text }}
  </p>

  <div class="list">
    <Skeleton v-if="loading" variant="list" count="5" />
    <EmptyState v-else-if="!filtered.length" title="暂无监控条目" description="用户尚未在 App 内添加米游铺监控" />
    <article v-for="item in filtered" :key="item.id" class="list-item">
      <div class="list-item-main">
        <span class="list-item-title">{{ item.name || item.goods_id }}</span>
        <span class="list-item-meta">
          ID: {{ item.goods_id }} · {{ item.sku_name || '整件商品' }} ·
          价格 {{ priceLabel(item.price_cents) }} · 库存 {{ item.stock_count ?? 0 }} · 用户 {{ displayName(item.user_id) }}
        </span>
        <span class="list-item-meta">添加 {{ formatTime(item.added_at) }} · 最近检测 {{ formatTime(item.last_checked_at) }}</span>
      </div>
      <StatusPill :status="item.in_stock ? 'ok' : 'warn'" :label="item.in_stock ? '有货' : '缺货'" />
    </article>
  </div>
</template>

<style scoped>
.mihoyo-toolbar {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
}

.stat-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
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
</style>
