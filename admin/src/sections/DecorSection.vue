<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import {
  DECOR_GAMES,
  DECOR_SOURCES,
  decorPreviewLevels,
  decorPreviewSrc,
  fetchDecorRows,
  patchDecorRow,
  createDecorRow
} from '../services/decorAdmin'
import { logAudit } from '../services/audit'
import { formatTime } from '../utils/format'
import PanelDrawer from '../components/ui/PanelDrawer.vue'
import StatusPill from '../components/ui/StatusPill.vue'
import SearchInput from '../components/ui/SearchInput.vue'
import EmptyState from '../components/ui/EmptyState.vue'
import Skeleton from '../components/ui/Skeleton.vue'
import DecorForm from './decor/DecorForm.vue'

const KIND_META = {
  pendant: { label: '头像框' },
  bubble: { label: '评论装扮' }
}

const kind = ref('pendant')
const loading = ref(false)
const allRows = ref([])
const status = ref({ text: '', type: 'default' })

const filters = reactive({
  keyword: '',
  game: '',
  source: '',
  state: 'all' // all | on | tombstone
})

async function load() {
  loading.value = true
  try {
    allRows.value = await fetchDecorRows(kind.value)
    status.value = { text: `共 ${allRows.value.length} 条`, type: 'default' }
  } catch (e) {
    status.value = { text: e?.message || '加载失败。', type: 'error' }
  } finally {
    loading.value = false
  }
}

function switchKind(next) {
  if (kind.value === next) return
  kind.value = next
  filters.keyword = ''
  filters.game = ''
  filters.source = ''
  filters.state = 'all'
  load()
}

const filtered = computed(() => {
  const q = filters.keyword.trim().toLowerCase()
  return allRows.value.filter((row) => {
    if (filters.game && row.game !== filters.game) return false
    if (filters.source && row.source !== filters.source) return false
    if (filters.state === 'on' && !row.enabled) return false
    if (filters.state === 'tombstone' && row.enabled) return false
    if (filters.state === 'similar' && !similarMap.value.has(row.id)) return false
    if (q) {
      const hay = `${row.name || ''}\n${row.id}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })
})

const counts = computed(() => {
  const total = allRows.value.length
  const on = allRows.value.filter((r) => r.enabled).length
  return { total, on, tombstone: total - on }
})

// ── 同图组标注：pixel_hash（感知哈希）或 content_key（URL 内容键）相同的行互为相似 ──
const similarMap = computed(() => {
  const parent = new Map()
  function find(key) {
    if (!parent.has(key)) parent.set(key, key)
    const rootKey = key
    if (parent.get(key) !== key) return find(parent.get(key))
    return rootKey
  }
  function union(a, b) {
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent.set(rb, ra)
  }
  const byPixel = new Map()
  const byKey = new Map()
  allRows.value.forEach((row, index) => {
    if (row.pixel_hash) {
      const k = 'px:' + row.pixel_hash
      if (byPixel.has(k)) union(byPixel.get(k), String(index))
      else byPixel.set(k, String(index))
    }
    if (row.content_key) {
      const k = 'ck:' + row.content_key
      if (byKey.has(k)) union(byKey.get(k), String(index))
      else byKey.set(k, String(index))
    }
  })
  const groups = new Map()
  allRows.value.forEach((row, index) => {
    if (!row.pixel_hash && !row.content_key) return
    const root = find(String(index))
    if (!groups.has(root)) groups.set(root, [])
    groups.get(root).push(row)
  })
  // 只标「还可操作的」组：≥2 行仍启用（其余是历史墓碑的组不再刷屏）
  const map = new Map()
  for (const members of groups.values()) {
    const enabledRows = members.filter((row) => row.enabled)
    if (enabledRows.length < 2) continue
    for (const row of members) map.set(row.id, members)
  }
  return map
})

function similarSiblings(row) {
  return (similarMap.value.get(row.id) || []).filter((x) => x.id !== row.id)
}

// ── 预览图降级链（thumb → mirror → origin），失败层级按行记忆 ──
const previewLevels = reactive({})
function previewSrc(row) {
  const level = previewLevels[row.id] || 0
  return decorPreviewSrc(row, level)
}
function onPreviewError(row) {
  const levels = decorPreviewLevels(row)
  previewLevels[row.id] = Math.min((previewLevels[row.id] || 0) + 1, Math.max(levels - 1, 0))
}

// ── 编辑 / 新增 ──
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
  const isEdit = !!editingItem.value
  try {
    if (isEdit) {
      await patchDecorRow(kind.value, row.id, row)
      logAudit(`decor.${kind.value}.update`, `${row.id} ${row.name}`)
    } else {
      await createDecorRow(kind.value, row)
      logAudit(`decor.${kind.value}.create`, `${row.id} ${row.name}`)
    }
    closeDrawer()
    status.value = { text: '保存成功。', type: 'ok' }
    await load()
  } catch (e) {
    status.value = { text: e?.message || '保存失败。', type: 'error' }
  }
}

async function toggleItem(item) {
  try {
    await patchDecorRow(kind.value, item.id, { enabled: !item.enabled })
    logAudit(`decor.${kind.value}.${item.enabled ? 'disable' : 'enable'}`, `${item.id} ${item.name}`)
    await load()
  } catch (e) {
    status.value = { text: e?.message || '切换失败。', type: 'error' }
  }
}

onMounted(load)</script>

<template>
  <div class="decor-tabs">
    <button
      v-for="(meta, key) in KIND_META"
      :key="key"
      type="button"
      class="decor-tab"
      :class="{ 'decor-tab--active': kind === key }"
      @click="switchKind(key)"
    >
      {{ meta.label }}
    </button>
    <span class="decor-tabs__spacer" />
    <button class="btn btn--primary" type="button" @click="openCreate">+ 新增{{ KIND_META[kind].label }}</button>
    <button class="btn" type="button" :disabled="loading" @click="load">{{ loading ? '加载中…' : '刷新' }}</button>
  </div>

  <div class="decor-filters">
    <SearchInput v-model="filters.keyword" placeholder="搜索名称 / ID…" />
    <select v-model="filters.game" class="decor-select">
      <option value="">全部 IP</option>
      <option v-for="game in DECOR_GAMES" :key="game" :value="game">{{ game }}</option>
    </select>
    <select v-model="filters.source" class="decor-select">
      <option value="">全部来源</option>
      <option v-for="src in DECOR_SOURCES" :key="src" :value="src">{{ src }}</option>
    </select>
    <select v-model="filters.state" class="decor-select">
      <option value="all">全部状态</option>
      <option value="on">启用中</option>
      <option value="tombstone">墓碑（下架）</option>
      <option value="similar">只看同图组</option>
    </select>
    <span class="decor-counts">
      显示 {{ filtered.length }} / {{ counts.total }} · 启用 {{ counts.on }} · 墓碑 {{ counts.tombstone }}
    </span>
  </div>

  <p class="status-text" :class="status.type === 'ok' ? 'status-text--ok' : status.type === 'error' ? 'status-text--error' : ''">
    {{ status.text }}
  </p>

  <div class="decor-list">
    <Skeleton v-if="loading" variant="list" count="6" />
    <EmptyState v-else-if="!filtered.length" title="没有匹配的条目" description="调整筛选条件或新增一条" />
    <article v-for="item in filtered" :key="item.id" class="decor-item">
      <div class="decor-item__preview">
        <img
          v-if="previewSrc(item)"
          :src="previewSrc(item)"
          alt=""
          loading="lazy"
          @error="onPreviewError(item)"
        />
        <span v-else class="decor-item__preview-empty">无图</span>
      </div>
      <div class="decor-item__main">
        <span class="decor-item__title">{{ item.name || item.id }}</span>
        <span class="decor-item__meta">
          ID: {{ item.id }} · {{ item.source }} · {{ item.game }} · 排序 {{ item.sort ?? 0 }}
          <template v-if="item.animated"> · 动图</template>
          · {{ formatTime(item.updated_at) }}
        </span>
      </div>
      <div class="decor-item__actions">
        <span
          v-if="similarMap.has(item.id)"
          class="decor-item__similar"
          :title="'同图组：' + similarSiblings(item).map((x) => x.id).join(', ')"
        >
          同图×{{ similarMap.get(item.id).length }}
        </span>
        <StatusPill :status="item.enabled ? 'ok' : 'warn'" :label="item.enabled ? '启用' : '墓碑'" />
        <button class="btn btn--sm" type="button" @click="openEdit(item)">编辑</button>
        <button class="btn btn--sm btn--soft" type="button" @click="toggleItem(item)">
          {{ item.enabled ? '下架' : '恢复' }}
        </button>
      </div>
    </article>
  </div>

  <PanelDrawer
    :open="drawerOpen"
    :title="`${editingItem ? '编辑' : '新增'}${KIND_META[kind].label}`"
    kicker="decor editor"
    @close="closeDrawer"
  >
    <DecorForm :kind="kind" :editing="editingItem" @submit="onSubmit" @close="closeDrawer" />

    <div v-if="editingItem && similarMap.has(editingItem.id)" class="decor-siblings">
      <p class="decor-siblings__title">同图组（{{ similarMap.get(editingItem.id).length }} 条，含本条）</p>
      <div v-for="sib in similarMap.get(editingItem.id)" :key="sib.id" class="decor-siblings__row">
        <img v-if="previewSrc(sib)" :src="previewSrc(sib)" alt="" class="decor-siblings__thumb" @error="onPreviewError(sib)" />
        <span class="decor-siblings__name">{{ sib.name || sib.id }}</span>
        <span class="decor-siblings__id">{{ sib.id }}</span>
        <StatusPill :status="sib.enabled ? 'ok' : 'warn'" :label="sib.enabled ? '启用' : '墓碑'" />
        <button
          v-if="sib.enabled && sib.id !== editingItem.id"
          class="btn btn--sm btn--soft"
          type="button"
          @click="toggleItem(sib)"
        >
          禁用
        </button>
      </div>
    </div>
  </PanelDrawer>
</template>

<style scoped>
.decor-tabs {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}

.decor-tab {
  padding: 6px 14px;
  border: 1px solid var(--admin-border, rgba(127, 127, 127, 0.3));
  border-radius: 999px;
  background: transparent;
  color: inherit;
  font-size: 12px;
  cursor: pointer;
}

.decor-tab--active {
  background: var(--admin-accent, rgba(99, 143, 255, 0.2));
  border-color: transparent;
}

.decor-tabs__spacer {
  flex: 1;
}

.decor-filters {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
}

.decor-select {
  padding: 7px 10px;
  border: 1px solid var(--admin-border, rgba(127, 127, 127, 0.3));
  border-radius: 8px;
  background: transparent;
  color: inherit;
  font-size: 12px;
}

.decor-counts {
  font-size: 11px;
  opacity: 0.65;
}

.decor-list {
  display: grid;
  gap: 8px;
}

.decor-item {
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 8px 10px;
  border: 1px solid var(--admin-border, rgba(127, 127, 127, 0.2));
  border-radius: 10px;
  font-size: 12px;
}

.decor-item__preview {
  width: 72px;
  height: 40px;
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  background: var(--admin-surface-soft, rgba(127, 127, 127, 0.12));
  overflow: hidden;
}

.decor-item__preview img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}

.decor-item__preview-empty {
  font-size: 10px;
  opacity: 0.5;
}

.decor-item__main {
  min-width: 0;
  flex: 1;
  display: grid;
  gap: 2px;
}

.decor-item__title {
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.decor-item__meta {
  opacity: 0.65;
  font-size: 11px;
}

.decor-item__actions {
  display: flex;
  gap: 6px;
  align-items: center;
  flex: 0 0 auto;
}

.decor-item__similar {
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(230, 162, 60, 0.18);
  color: #e6a23c;
  font-size: 11px;
  white-space: nowrap;
  cursor: help;
}

.decor-siblings {
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px dashed var(--admin-border, rgba(127, 127, 127, 0.3));
  display: grid;
  gap: 6px;
}

.decor-siblings__title {
  margin: 0;
  font-size: 12px;
  font-weight: 600;
  opacity: 0.85;
}

.decor-siblings__row {
  display: flex;
  gap: 8px;
  align-items: center;
  font-size: 12px;
}

.decor-siblings__thumb {
  width: 56px;
  height: 20px;
  object-fit: contain;
  border-radius: 4px;
  background: var(--admin-surface-soft, rgba(127, 127, 127, 0.12));
}

.decor-siblings__name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.decor-siblings__id {
  opacity: 0.6;
  font-family: monospace;
}
</style>
