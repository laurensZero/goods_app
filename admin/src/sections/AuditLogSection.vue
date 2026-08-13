<script setup>
import { computed } from 'vue'
import { supabaseRequest } from '../services/supabase'
import { useAdminList } from '../composables/useAdminList'
import { formatTime } from '../utils/format'
import StatusPill from '../components/ui/StatusPill.vue'
import SearchInput from '../components/ui/SearchInput.vue'
import EmptyState from '../components/ui/EmptyState.vue'
import Skeleton from '../components/ui/Skeleton.vue'

const { items, loading, keyword, status, load } = useAdminList({
  loader: async () => {
    const data = await supabaseRequest('/rest/v1/audit_logs', {
      params: { order: 'created_at.desc', limit: 200 }
    })
    return Array.isArray(data) ? data : []
  }
})

const ACTION_LABEL = {
  publish: '发布',
  rollback: '回档',
  apk_build: 'APK 构建',
  'backup.restore': '备份回档',
  'announcement.create': '新建公告',
  'announcement.update': '更新公告',
  'announcement.delete': '删除公告',
  'user.delete': '删除用户',
  'qq.unbind': '解绑 QQ',
  'device.force_resync': '强制重同步'
}

const DANGEROUS = new Set(['rollback', 'backup.restore', 'announcement.delete', 'user.delete', 'qq.unbind'])

function actionLabel(action) {
  return ACTION_LABEL[action] || action || '--'
}

const filtered = computed(() => {
  const q = keyword.value.trim().toLowerCase()
  if (!q) return items.value
  return items.value.filter((i) =>
    String(i.actor || '').toLowerCase().includes(q) ||
    String(i.action || '').toLowerCase().includes(q) ||
    String(i.target || '').toLowerCase().includes(q)
  )
})
</script>

<template>
  <div class="audit-toolbar">
    <SearchInput v-model="keyword" placeholder="搜索操作人 / 动作 / 目标…" />
    <button class="btn" type="button" :disabled="loading" @click="load">{{ loading ? '加载中…' : '刷新' }}</button>
  </div>

  <p class="status-text" :class="status.type === 'ok' ? 'status-text--ok' : status.type === 'error' ? 'status-text--error' : ''">
    {{ status.text }}
  </p>

  <div class="list">
    <Skeleton v-if="loading" variant="list" count="6" />
    <EmptyState v-else-if="!filtered.length" title="暂无审计记录" description="高危后台操作会在此留痕" />
    <article v-for="log in filtered" :key="log.id" class="list-item">
      <div class="list-item-main">
        <span class="list-item-title">
          {{ actionLabel(log.action) }}
          <template v-if="log.target"> · {{ log.target }}</template>
        </span>
        <span class="list-item-meta">{{ log.actor }} · {{ formatTime(log.created_at) }}</span>
      </div>
      <StatusPill
        :status="DANGEROUS.has(log.action) ? 'error' : 'ok'"
        :label="DANGEROUS.has(log.action) ? '高危' : '操作'"
      />
    </article>
  </div>
</template>

<style scoped>
.audit-toolbar {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
}

.list {
  display: grid;
  gap: 8px;
}
</style>
