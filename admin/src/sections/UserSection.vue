<script setup>
import { computed, onMounted, ref } from 'vue'
import { fetchUsersList, clearUsersCache } from '../services/versionRules'
import { supabaseRequest } from '../services/supabase'
import { useConfirm } from '../composables/useConfirm'
import { formatTime } from '../utils/format'
import StatusPill from '../components/ui/StatusPill.vue'
import SearchInput from '../components/ui/SearchInput.vue'
import EmptyState from '../components/ui/EmptyState.vue'
import Skeleton from '../components/ui/Skeleton.vue'

const QQ_STATUS = {
  pending: { label: '待激活', tone: 'warn' },
  active: { label: '已绑定', tone: 'ok' },
  unbound: { label: '已解绑', tone: 'default' }
}

const users = ref([])
const loading = ref(false)
const keyword = ref('')
const status = ref({ text: '', type: 'default' })
const counts = ref({}) // user_id -> { goods, events, recharge, shares, mihoyo }
const qqMap = ref({}) // user_id -> binding row
const busyDelete = ref('') // 正在删除的用户 id

function setStatus(text, type = 'default') {
  status.value = { text, type }
}

async function load() {
  loading.value = true
  try {
    // 计数与 QQ 绑定走服务端 get_user_stats RPC 一次返回，避免全表拉取
    const [userRes, statsRes] = await Promise.allSettled([
      fetchUsersList(),
      supabaseRequest('/rest/v1/rpc/get_user_stats', { method: 'POST' })
    ])

    users.value = userRes.status === 'fulfilled' ? userRes.value : []

    const map = {}
    const qqById = {}
    if (statsRes.status === 'fulfilled' && Array.isArray(statsRes.value)) {
      for (const r of statsRes.value) {
        if (!r?.user_id) continue
        map[r.user_id] = {
          goods: Number(r.goods) || 0,
          events: Number(r.events) || 0,
          recharge: Number(r.recharge) || 0,
          shares: Number(r.shares) || 0,
          mihoyo: Number(r.mihoyo) || 0
        }
        if (r.qq_status) {
          qqById[r.user_id] = {
            status: r.qq_status,
            qq_nickname: r.qq_nickname || '',
            enabled: r.qq_enabled
          }
        }
      }
    }
    counts.value = map
    qqMap.value = qqById

    setStatus(`共 ${users.value.length} 个用户。`, 'ok')
  } catch (e) {
    setStatus(e?.message || '加载失败。', 'error')
  } finally {
    loading.value = false
  }
}

const { confirm } = useConfirm()

const short = (s) => String(s || '').slice(0, 8)

const filtered = computed(() => {
  const q = keyword.value.trim().toLowerCase()
  if (!q) return users.value
  return users.value.filter((u) =>
    String(u.display || '').toLowerCase().includes(q) ||
    String(u.email || '').toLowerCase().includes(q) ||
    String(u.id || '').toLowerCase().includes(q)
  )
})

function statFor(id) {
  return counts.value[id] || { goods: 0, events: 0, recharge: 0, shares: 0, mihoyo: 0 }
}

function qqInfo(id) {
  const row = qqMap.value[id]
  if (!row) return null
  const s = QQ_STATUS[row.status] || { label: row.status || '--', tone: 'default' }
  return { ...row, label: s.label, tone: s.tone }
}

async function patchQq(userId, body) {
  await supabaseRequest(`/rest/v1/user_qq_bindings?user_id=eq.${encodeURIComponent(userId)}`, {
    method: 'PATCH',
    body
  })
  await load()
}

async function toggleQqEnabled(id) {
  const row = qqMap.value[id]
  try {
    await patchQq(id, { enabled: !row.enabled })
  } catch (e) {
    setStatus(e?.message || '操作失败。', 'error')
  }
}

async function unbindQq(id) {
  const u = users.value.find((x) => x.id === id)
  const ok = await confirm({
    title: '解绑 QQ',
    message: `确认解绑用户 "${u?.display || short(id)}" 的 QQ 推送？解绑后该用户将不再收到 QQ 提醒。`,
    danger: true,
    confirmText: '解绑'
  })
  if (!ok) return
  try {
    await patchQq(id, { status: 'unbound', enabled: false, unbound_at: new Date().toISOString() })
    setStatus('已解绑。', 'ok')
  } catch (e) {
    setStatus(e?.message || '解绑失败。', 'error')
  }
}

async function removeUser(u) {
  const s = statFor(u.id)
  const first = await confirm({
    title: '删除用户',
    message: `将永久删除用户 "${u.display}"（${u.email || u.id}）及其全部数据：谷子 ${s.goods}、活动 ${s.events}、充值 ${s.recharge}、分享 ${s.shares}、米游铺监控 ${s.mihoyo}。此操作不可撤销。`,
    danger: true,
    confirmText: '继续'
  })
  if (!first) return

  const second = await confirm({
    title: '再次确认',
    message: `确定要永久删除 "${u.display}" 吗？删除后该用户的账号与全部数据无法恢复。`,
    danger: true,
    confirmText: '永久删除'
  })
  if (!second) return

  busyDelete.value = u.id
  try {
    // 1. 级联清理业务数据（service_role RPC）
    await supabaseRequest('/rest/v1/rpc/delete_user_cascade', {
      method: 'POST',
      body: { p_user_id: u.id }
    })
    // 2. 删除 auth 用户本体（GoTrue Admin API，硬删除）
    await supabaseRequest(`/auth/v1/admin/users/${encodeURIComponent(u.id)}`, {
      method: 'DELETE',
      params: { should_soft_delete: 'false' }
    })
    setStatus('已删除用户。', 'ok')
    clearUsersCache()
    await load()
  } catch (e) {
    setStatus(e?.message || '删除失败。', 'error')
  } finally {
    busyDelete.value = ''
  }
}

onMounted(load)
</script>

<template>
  <div class="user-toolbar">
    <SearchInput v-model="keyword" placeholder="搜索用户名 / 邮箱 / 用户 ID…" />
    <button class="btn" type="button" :disabled="loading" @click="load">{{ loading ? '加载中…' : '刷新' }}</button>
  </div>

  <p class="status-text" :class="status.type === 'ok' ? 'status-text--ok' : status.type === 'error' ? 'status-text--error' : ''">
    {{ status.text }}
  </p>

  <div class="list">
    <Skeleton v-if="loading" variant="list" count="6" />
    <EmptyState v-else-if="!filtered.length" title="暂无用户" />
    <article v-for="u in filtered" :key="u.id" class="user-card">
      <div class="user-head">
        <div class="user-main">
          <span class="user-name">{{ u.display }}</span>
          <span class="user-meta">
            <template v-if="u.email">{{ u.email }} · </template>
            <template v-if="u.phone">{{ u.phone }} · </template>
            注册 {{ formatTime(u.createdAt) }}
            <template v-if="u.lastSignInAt"> · 最近登录 {{ formatTime(u.lastSignInAt) }}</template>
          </span>
        </div>
        <div class="user-qq">
          <template v-if="qqInfo(u.id)">
            <StatusPill :status="qqInfo(u.id).tone" :label="qqInfo(u.id).label" />
            <span v-if="qqInfo(u.id).qq_nickname" class="qq-nick">{{ qqInfo(u.id).qq_nickname }}</span>
            <button
              v-if="qqInfo(u.id).status === 'active'"
              class="btn btn--sm btn--soft"
              type="button"
              @click="toggleQqEnabled(u.id)"
            >
              {{ qqInfo(u.id).enabled ? '关推送' : '开推送' }}
            </button>
            <button
              v-if="qqInfo(u.id).status !== 'unbound'"
              class="btn btn--sm btn--danger"
              type="button"
              @click="unbindQq(u.id)"
            >
              解绑
            </button>
          </template>
          <StatusPill v-else status="default" label="未绑定" />
        </div>
      </div>
      <div class="user-foot">
        <span class="stat-chip">谷子 {{ statFor(u.id).goods }}</span>
        <span class="stat-chip">活动 {{ statFor(u.id).events }}</span>
        <span class="stat-chip">充值 {{ statFor(u.id).recharge }}</span>
        <span class="stat-chip">分享 {{ statFor(u.id).shares }}</span>
        <span class="stat-chip">监控 {{ statFor(u.id).mihoyo }}</span>
        <span class="user-id" :title="u.id">{{ short(u.id) }}</span>
        <button
          class="btn btn--sm btn--danger delete-user-btn"
          type="button"
          :disabled="busyDelete === u.id"
          @click="removeUser(u)"
        >
          {{ busyDelete === u.id ? '删除中…' : '删除用户' }}
        </button>
      </div>
    </article>
  </div>
</template>

<style scoped>
.user-toolbar {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
}

.list {
  display: grid;
  gap: 8px;
}

.user-card {
  border: 1px solid var(--app-border);
  border-radius: var(--radius-xs);
  background: var(--app-surface-soft);
  padding: 12px;
  display: grid;
  gap: 10px;
}

.user-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  flex-wrap: wrap;
}

.user-main {
  display: grid;
  gap: 2px;
  min-width: 0;
  flex: 1;
}

.user-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--app-text);
  word-break: break-all;
}

.user-meta {
  font-size: 12px;
  color: var(--app-text-tertiary);
  word-break: break-all;
}

.user-qq {
  display: flex;
  gap: 6px;
  align-items: center;
  flex-wrap: wrap;
}

.qq-nick {
  font-size: 12px;
  color: var(--app-text-secondary);
}

.user-foot {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}

.stat-chip {
  font-size: 12px;
  padding: 3px 10px;
  border-radius: 999px;
  background: var(--app-surface);
  border: 1px solid var(--app-border);
  color: var(--app-text-secondary);
}

.user-id {
  font-size: 10px;
  color: var(--app-text-tertiary);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  word-break: break-all;
}

.delete-user-btn {
  margin-left: auto;
}
</style>
