<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { supabaseRequest } from '../services/supabase'
import { useAdminList } from '../composables/useAdminList'
import { useConfirm } from '../composables/useConfirm'
import StatusPill from '../components/ui/StatusPill.vue'
import SearchInput from '../components/ui/SearchInput.vue'
import EmptyState from '../components/ui/EmptyState.vue'
import Skeleton from '../components/ui/Skeleton.vue'
import PanelDrawer from '../components/ui/PanelDrawer.vue'
import BirthdayForm from './birthday/BirthdayForm.vue'

const { items, loading, keyword, status, load, setStatus } = useAdminList({
  loader: async () => {
    const data = await supabaseRequest('/rest/v1/character_birthdays', {
      params: { order: 'ip.asc,birth_month.asc,birth_day.asc' }
    })
    return Array.isArray(data) ? data : []
  }
})

const { confirm } = useConfirm()

const drawerOpen = ref(false)
const editingItem = ref(null)

const filtered = computed(() => {
  const q = keyword.value.trim().toLowerCase()
  if (!q) return items.value
  return items.value.filter((i) =>
    String(i.name || '').toLowerCase().includes(q) ||
    String(i.ip || '').toLowerCase().includes(q) ||
    (Array.isArray(i.aliases) && i.aliases.some((a) => String(a).toLowerCase().includes(q)))
  )
})

// 中文按拼音、拉丁按字母序排序；先 IP 后名字
const collator = new Intl.Collator('zh-CN', { sensitivity: 'base', numeric: true })

const sorted = computed(() => {
  return [...filtered.value].sort((a, b) => {
    const ipCmp = collator.compare(a.ip || '', b.ip || '')
    if (ipCmp !== 0) return ipCmp
    return collator.compare(a.name || '', b.name || '')
  })
})

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

function pad(n) {
  return String(n).padStart(2, '0')
}

function dateLabel(item) {
  return `${pad(item.birth_month)}-${pad(item.birth_day)}`
}

async function onSubmit(row) {
  try {
    if (editingItem.value) {
      await supabaseRequest(`/rest/v1/character_birthdays?id=eq.${encodeURIComponent(editingItem.value.id)}`, {
        method: 'PATCH',
        body: row
      })
    } else {
      await supabaseRequest('/rest/v1/character_birthdays', { method: 'POST', body: row })
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
    await supabaseRequest(`/rest/v1/character_birthdays?id=eq.${encodeURIComponent(item.id)}`, {
      method: 'PATCH',
      body: { enabled: !item.enabled }
    })
    await load()
  } catch (e) {
    setStatus(e?.message || '操作失败。', 'error')
  }
}

async function removeItem(item) {
  const ok = await confirm({
    title: '删除角色',
    message: `确认删除角色 "${item.name}"（${item.ip || '未分类'}）？此操作不可撤销。`,
    danger: true,
    confirmText: '删除'
  })
  if (!ok) return
  try {
    await supabaseRequest(`/rest/v1/character_birthdays?id=eq.${encodeURIComponent(item.id)}`, { method: 'DELETE' })
    setStatus('已删除。', 'ok')
    await load()
  } catch (e) {
    setStatus(e?.message || '删除失败。', 'error')
  }
}

// ── IP 分组编辑：改一份，批量应用到该 IP 下全部角色 ──
const ipDrawerOpen = ref(false)
const editingIp = ref('') // 正在编辑的原始 ip
const ipSaving = ref(false)
const ipForm = reactive({ ip: '', ipAliases: '' })

const ipGroups = computed(() => {
  const map = new Map()
  for (const it of items.value) {
    const key = it.ip || ''
    if (!map.has(key)) {
      map.set(key, { ip: key, ipAliases: Array.isArray(it.ip_aliases) ? it.ip_aliases : [], count: 0 })
    }
    map.get(key).count++
  }
  return [...map.values()].sort((a, b) => collator.compare(a.ip, b.ip))
})

function startIpEdit(group) {
  editingIp.value = group.ip
  ipForm.ip = group.ip
  ipForm.ipAliases = group.ipAliases.join(', ')
}

function cancelIpEdit() {
  editingIp.value = ''
}

async function saveIpEdit(group) {
  const newIp = String(ipForm.ip || '').trim()
  if (!newIp) {
    setStatus('IP 名称不能为空。', 'error')
    return
  }
  const aliases = String(ipForm.ipAliases || '')
    .split(/[,，]/)
    .map((s) => s.trim())
    .filter(Boolean)
  ipSaving.value = true
  try {
    await supabaseRequest(`/rest/v1/character_birthdays?ip=eq.${encodeURIComponent(editingIp.value)}`, {
      method: 'PATCH',
      body: { ip: newIp, ip_aliases: aliases }
    })
    setStatus(`已更新 ${group.count} 个角色。`, 'ok')
    cancelIpEdit()
    await load()
  } catch (e) {
    setStatus(e?.message || '保存失败。', 'error')
  } finally {
    ipSaving.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="bd-toolbar">
    <SearchInput v-model="keyword" placeholder="搜索角色名 / IP / 别名…" />
    <button class="btn btn--primary" type="button" @click="openCreate">+ 新建角色</button>
    <button class="btn" type="button" @click="ipDrawerOpen = true">IP 管理</button>
    <button class="btn" type="button" :disabled="loading" @click="load">{{ loading ? '加载中…' : '刷新' }}</button>
  </div>

  <p class="status-text" :class="status.type === 'ok' ? 'status-text--ok' : status.type === 'error' ? 'status-text--error' : ''">
    {{ status.text }}
  </p>

  <div class="list">
    <Skeleton v-if="loading" variant="list" count="6" />
    <EmptyState v-else-if="!sorted.length" title="暂无角色生日" description="点击「新建角色」添加第一条" />
    <article v-for="item in sorted" :key="item.id" class="list-item">
      <div class="list-item-main">
        <span class="list-item-title">
          {{ item.name }}
          <span v-if="item.color" class="dot" :style="{ background: item.color }" />
        </span>
        <span class="list-item-meta">
          {{ item.ip || '未分类' }} · 生日 {{ dateLabel(item) }} · 别名 {{ (item.aliases || []).join('、') || '--' }}
          <template v-if="item.message"> · {{ item.message }}</template>
        </span>
      </div>
      <div class="list-actions">
        <StatusPill :status="item.enabled ? 'ok' : 'warn'" :label="item.enabled ? '已启用' : '已停用'" />
        <button class="btn btn--sm" type="button" @click="openEdit(item)">编辑</button>
        <button class="btn btn--sm btn--soft" type="button" @click="toggleItem(item)">
          {{ item.enabled ? '停用' : '启用' }}
        </button>
        <button class="btn btn--sm btn--danger" type="button" @click="removeItem(item)">删除</button>
      </div>
    </article>
  </div>

  <PanelDrawer
    :open="drawerOpen"
    :title="editingItem ? '编辑角色' : '新建角色'"
    kicker="character birthday"
    @close="closeDrawer"
  >
    <BirthdayForm :editing="editingItem" @submit="onSubmit" @close="closeDrawer" />
  </PanelDrawer>

  <PanelDrawer
    :open="ipDrawerOpen"
    title="IP 管理"
    kicker="ip groups"
    @close="ipDrawerOpen = false; editingIp = ''"
  >
    <p class="tip">按 IP 分组批量维护：改一处名称/别名，即可应用到该 IP 下全部角色。</p>
    <div class="ip-list">
      <div v-for="g in ipGroups" :key="g.ip" class="ip-card">
        <template v-if="editingIp !== g.ip">
          <div class="ip-card-main">
            <span class="ip-name">{{ g.ip || '(未分类)' }}</span>
            <span class="ip-aliases">别名：{{ g.ipAliases.join('、') || '--' }} · {{ g.count }} 个角色</span>
          </div>
          <button class="btn btn--sm" type="button" @click="startIpEdit(g)">编辑</button>
        </template>
        <template v-else>
          <div class="ip-edit">
            <div class="field">
              <label class="field-label">IP 名称</label>
              <input v-model="ipForm.ip" class="input" type="text">
            </div>
            <div class="field">
              <label class="field-label">IP 别名（逗号分隔）</label>
              <input v-model="ipForm.ipAliases" class="input" type="text" placeholder="Genshin Impact, Genshin">
            </div>
            <div class="ip-edit-actions">
              <button class="btn btn--primary btn--sm" type="button" :disabled="ipSaving" @click="saveIpEdit(g)">
                {{ ipSaving ? '保存中…' : `应用到 ${g.count} 个角色` }}
              </button>
              <button class="btn btn--sm" type="button" @click="cancelIpEdit">取消</button>
            </div>
          </div>
        </template>
      </div>
    </div>
  </PanelDrawer>
</template>

<style scoped>
.bd-toolbar {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
}

.list {
  display: grid;
  gap: 8px;
}

.dot {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  margin-left: 6px;
  vertical-align: middle;
  border: 1px solid var(--app-border);
}

.ip-list {
  display: grid;
  gap: 8px;
}

.ip-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--app-border);
  border-radius: var(--radius-xs);
  background: var(--app-surface-soft);
}

.ip-card-main {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.ip-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--app-text);
}

.ip-aliases {
  font-size: 12px;
  color: var(--app-text-tertiary);
  word-break: break-all;
}

.ip-edit {
  display: grid;
  gap: 10px;
  width: 100%;
}

.ip-edit-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
</style>
