<script setup>
import { computed, onMounted, ref } from 'vue'
import { supabaseRequest } from '../services/supabase'
import { useAdminList } from '../composables/useAdminList'
import { useConfirm } from '../composables/useConfirm'
import { formatTime } from '../utils/format'
import { fetchUsersList } from '../services/versionRules'
import StatusPill from '../components/ui/StatusPill.vue'
import SearchInput from '../components/ui/SearchInput.vue'
import EmptyState from '../components/ui/EmptyState.vue'
import Skeleton from '../components/ui/Skeleton.vue'

const { items, loading, keyword, status, load, setStatus } = useAdminList({
  loader: async () => {
    const data = await supabaseRequest('/rest/v1/shares', {
      params: { select: 'share_id,user_id,payload,disabled,created_at', order: 'created_at.desc' }
    })
    return Array.isArray(data) ? data : []
  }
})

const { confirm } = useConfirm()

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

function payloadSummary(payload) {
  const goods = payload?.goods
  if (!Array.isArray(goods) || !goods.length) return '--'
  const names = goods.slice(0, 3).map((g) => g?.name || '?').join('、')
  return `${goods.length} 件：${names}${goods.length > 3 ? '…' : ''}`
}

const filtered = computed(() => {
  const q = keyword.value.trim().toLowerCase()
  if (!q) return items.value
  return items.value.filter((i) =>
    String(i.share_id || '').toLowerCase().includes(q) ||
    String(i.user_id || '').toLowerCase().includes(q)
  )
})

async function toggleDisabled(item) {
  try {
    await supabaseRequest(`/rest/v1/shares?share_id=eq.${encodeURIComponent(item.share_id)}`, {
      method: 'PATCH',
      body: { disabled: !item.disabled }
    })
    await load()
  } catch (e) {
    setStatus(e?.message || '操作失败。', 'error')
  }
}

async function removeItem(item) {
  const ok = await confirm({
    title: '删除分享',
    message: `确认删除分享 "${short(item.share_id)}"？此操作不可撤销。`,
    danger: true,
    confirmText: '删除'
  })
  if (!ok) return
  try {
    await supabaseRequest(`/rest/v1/shares?share_id=eq.${encodeURIComponent(item.share_id)}`, { method: 'DELETE' })
    setStatus('已删除。', 'ok')
    await load()
  } catch (e) {
    setStatus(e?.message || '删除失败。', 'error')
  }
}

onMounted(() => {
  load()
  loadUsers()
})
</script>

<template>
  <div class="share-toolbar">
    <SearchInput v-model="keyword" placeholder="搜索分享码 / 用户 ID…" />
    <button class="btn" type="button" :disabled="loading" @click="load">{{ loading ? '加载中…' : '刷新' }}</button>
  </div>

  <p class="status-text" :class="status.type === 'ok' ? 'status-text--ok' : status.type === 'error' ? 'status-text--error' : ''">
    {{ status.text }}
  </p>

  <div class="list">
    <Skeleton v-if="loading" variant="list" count="5" />
    <EmptyState v-else-if="!filtered.length" title="暂无分享链接" />
    <article v-for="item in filtered" :key="item.share_id" class="list-item">
      <div class="list-item-main">
        <span class="list-item-title">{{ short(item.share_id) }}<span class="code-hint">{{ item.share_id }}</span></span>
        <span class="list-item-meta">
          用户: {{ displayName(item.user_id) }} · {{ payloadSummary(item.payload) }} · {{ formatTime(item.created_at) }}
        </span>
      </div>
      <div class="list-actions">
        <StatusPill :status="item.disabled ? 'error' : 'ok'" :label="item.disabled ? '已停用' : '正常'" />
        <button class="btn btn--sm btn--soft" type="button" @click="toggleDisabled(item)">
          {{ item.disabled ? '启用' : '停用' }}
        </button>
        <button class="btn btn--sm btn--danger" type="button" @click="removeItem(item)">删除</button>
      </div>
    </article>
  </div>
</template>

<style scoped>
.share-toolbar {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
}

.list {
  display: grid;
  gap: 8px;
}

.code-hint {
  display: block;
  font-size: 11px;
  font-weight: 400;
  color: var(--app-text-tertiary);
  word-break: break-all;
}
</style>
