<script setup>
import { computed, onMounted } from 'vue'
import { supabaseRequest } from '../../services/supabase'
import { useAdminList } from '../../composables/useAdminList'
import { useConfirm } from '../../composables/useConfirm'
import { formatTime } from '../../utils/format'
import { showModeLabel } from '../../constants'
import StatusPill from '../../components/ui/StatusPill.vue'
import SearchInput from '../../components/ui/SearchInput.vue'
import EmptyState from '../../components/ui/EmptyState.vue'

const emit = defineEmits(['create', 'edit', 'view-responses', 'updated'])

const { items, loading, keyword, status, load, setStatus } = useAdminList({
  loader: async () => {
    const data = await supabaseRequest('/rest/v1/surveys', {
      params: { select: 'id,title,questions,enabled,show_rule,created_at,updated_at', order: 'created_at.desc' }
    })
    const surveys = Array.isArray(data) ? data : []
    await attachResponseCounts(surveys)
    return surveys
  }
})

// 一次聚合查询拉取所有问卷回复数，替代逐条 count 的 N+1
async function attachResponseCounts(surveys) {
  if (!surveys.length) return
  try {
    const rows = await supabaseRequest('/rest/v1/survey_responses', {
      params: { select: 'survey_id,count()' },
      useServiceKey: true
    })
    const counts = {}
    for (const r of Array.isArray(rows) ? rows : []) {
      const key = String(r?.survey_id || '')
      if (key) counts[key] = Number(r?.count) || 0
    }
    for (const s of surveys) s._responseCount = counts[String(s.id)] || 0
  } catch {
    for (const s of surveys) s._responseCount = 0
  }
}

const { confirm } = useConfirm()

const filtered = computed(() => {
  const q = keyword.value.trim().toLowerCase()
  if (!q) return items.value
  return items.value.filter((i) =>
    String(i.title || '').toLowerCase().includes(q) || String(i.id || '').toLowerCase().includes(q)
  )
})

async function toggleItem(item) {
  try {
    await supabaseRequest(`/rest/v1/surveys?id=eq.${encodeURIComponent(item.id)}`, {
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
    title: '删除问卷',
    message: `确认删除问卷 "${item.title || item.id}"？其全部回复数据也会一并删除。`,
    danger: true,
    confirmText: '删除'
  })
  if (!ok) return
  try {
    await supabaseRequest(`/rest/v1/surveys?id=eq.${encodeURIComponent(item.id)}`, { method: 'DELETE' })
    setStatus('已删除。', 'ok')
    await load()
  } catch (e) {
    setStatus(e?.message || '删除失败。', 'error')
  }
}

onMounted(load)

defineExpose({ items, load })
</script>

<template>
  <div class="survey-toolbar">
    <SearchInput v-model="keyword" placeholder="搜索标题 / ID…" />
    <button class="btn" type="button" @click="emit('view-responses')">查看回复</button>
    <button class="btn btn--primary" type="button" @click="emit('create')">+ 新建问卷</button>
    <button class="btn" type="button" :disabled="loading" @click="load">{{ loading ? '加载中…' : '刷新' }}</button>
  </div>

  <p class="status-text" :class="status.type === 'ok' ? 'status-text--ok' : status.type === 'error' ? 'status-text--error' : ''">
    {{ status.text }}
  </p>

  <div class="list">
    <EmptyState v-if="!loading && filtered.length === 0" title="暂无问卷" description="点击「新建问卷」创建第一份" />
    <article v-for="item in filtered" :key="item.id" class="list-item">
      <div class="list-item-main">
        <span class="list-item-title">{{ item.title || item.id }}</span>
        <span class="list-item-meta">
          ID: {{ item.id }} · {{ item.questions?.length || 0 }} 题 · {{ item._responseCount || 0 }} 回复 · {{ showModeLabel(item.show_rule?.showMode) }} · {{ formatTime(item.created_at) }}
        </span>
      </div>
      <div class="list-actions">
        <StatusPill :status="item.enabled ? 'ok' : 'warn'" :label="item.enabled ? '已启用' : '已停用'" />
        <button class="btn btn--sm" type="button" @click="emit('edit', item)">编辑</button>
        <button class="btn btn--sm btn--soft" type="button" @click="toggleItem(item)">
          {{ item.enabled ? '禁用' : '启用' }}
        </button>
        <button class="btn btn--sm btn--danger" type="button" @click="removeItem(item)">删除</button>
      </div>
    </article>
  </div>
</template>

<style scoped>
.survey-toolbar {
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
