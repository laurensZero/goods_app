<script setup>
import { computed, ref } from 'vue'
import { supabaseRequest } from '../services/supabase'
import { useAdminList } from '../composables/useAdminList'
import { useConfirm } from '../composables/useConfirm'
import { formatTime } from '../utils/format'
import { showModeLabel } from '../constants'
import PanelDrawer from '../components/ui/PanelDrawer.vue'
import StatusPill from '../components/ui/StatusPill.vue'
import SearchInput from '../components/ui/SearchInput.vue'
import EmptyState from '../components/ui/EmptyState.vue'
import AnnouncementForm from './announcement/AnnouncementForm.vue'

const { items, loading, keyword, status, load, setStatus } = useAdminList({
  loader: async () => {
    const data = await supabaseRequest('/rest/v1/announcements', {
      params: { select: 'id,enabled,priority,title,show_rule,created_at', order: 'priority.desc,created_at.desc' }
    })
    return Array.isArray(data) ? data : []
  }
})

const { confirm } = useConfirm()

const filtered = computed(() => {
  const q = keyword.value.trim().toLowerCase()
  if (!q) return items.value
  return items.value.filter((i) =>
    String(i.title || '').toLowerCase().includes(q) || String(i.id || '').toLowerCase().includes(q)
  )
})

const drawerOpen = ref(false)
const editingItem = ref(null)

function openCreate() {
  editingItem.value = null
  drawerOpen.value = true
}

function openEdit(item) {
  editingItem.value = item
  drawerOpen.value = true
}

function closeDrawer() {
  drawerOpen.value = false
  editingItem.value = null
}

async function onSubmit(row) {
  try {
    if (editingItem.value) {
      await supabaseRequest(`/rest/v1/announcements?id=eq.${encodeURIComponent(row.id)}`, { method: 'PATCH', body: row })
    } else {
      await supabaseRequest('/rest/v1/announcements', { method: 'POST', body: row })
    }
    closeDrawer()
    setStatus('保存成功。', 'ok')
    await load()
  } catch (e) {
    setStatus(e?.message || '保存失败。', 'error')
  }
}

async function toggleItem(item) {
  try {
    await supabaseRequest(`/rest/v1/announcements?id=eq.${encodeURIComponent(item.id)}`, {
      method: 'PATCH',
      body: { enabled: !item.enabled }
    })
    await load()
  } catch (e) {
    setStatus(e?.message || '切换失败。', 'error')
  }
}

async function removeItem(item) {
  const ok = await confirm({
    title: '删除公告',
    message: `确认删除公告 "${item.title || item.id}"？此操作不可撤销。`,
    danger: true,
    confirmText: '删除'
  })
  if (!ok) return
  try {
    await supabaseRequest(`/rest/v1/announcements?id=eq.${encodeURIComponent(item.id)}`, { method: 'DELETE' })
    setStatus('已删除。', 'ok')
    await load()
  } catch (e) {
    setStatus(e?.message || '删除失败。', 'error')
  }
}

async function refresh() {
  await load()
}

import { onMounted } from 'vue'
onMounted(load)
</script>

<template>
  <div class="ann-toolbar">
    <SearchInput v-model="keyword" placeholder="搜索标题 / ID…" />
    <button class="btn btn--primary" type="button" @click="openCreate">+ 新建公告</button>
    <button class="btn" type="button" :disabled="loading" @click="refresh">{{ loading ? '加载中…' : '刷新' }}</button>
  </div>

  <p class="status-text" :class="status.type === 'ok' ? 'status-text--ok' : status.type === 'error' ? 'status-text--error' : ''">
    {{ status.text }}
  </p>

  <div class="list">
    <EmptyState v-if="!loading && filtered.length === 0" title="暂无公告" description="点击「新建公告」创建第一条" />
    <article v-for="item in filtered" :key="item.id" class="list-item">
      <div class="list-item-main">
        <span class="list-item-title">{{ item.title || item.id }}</span>
        <span class="list-item-meta">
          ID: {{ item.id }} · 优先级: {{ item.priority ?? 0 }} · {{ showModeLabel(item.show_rule?.showMode) }} · {{ formatTime(item.created_at) }}
        </span>
      </div>
      <div class="list-actions">
        <StatusPill :status="item.enabled ? 'ok' : 'warn'" :label="item.enabled ? '已启用' : '已停用'" />
        <button class="btn btn--sm" type="button" @click="openEdit(item)">编辑</button>
        <button class="btn btn--sm btn--soft" type="button" @click="toggleItem(item)">
          {{ item.enabled ? '禁用' : '启用' }}
        </button>
        <button class="btn btn--sm btn--danger" type="button" @click="removeItem(item)">删除</button>
      </div>
    </article>
  </div>

  <PanelDrawer
    :open="drawerOpen"
    :title="editingItem ? '编辑公告' : '新建公告'"
    kicker="announcement editor"
    @close="closeDrawer"
  >
    <AnnouncementForm :editing="editingItem" @submit="onSubmit" @close="closeDrawer" />
  </PanelDrawer>
</template>

<style scoped>
.ann-toolbar {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
}

.list {
  display: grid;
  gap: 8px;
}

.list-item {
  font-size: 12px;
}
</style>
