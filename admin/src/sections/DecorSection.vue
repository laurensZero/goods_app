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
  // 全部 ≥2 成员的组都标：可操作的（≥2 行启用）橙色徽标，已处理的（只剩 1 行启用）
  // 灰色徽标——查阅历史时能一眼分辨
  const map = new Map()
  for (const members of groups.values()) {
    if (members.length < 2) continue
    for (const row of members) map.set(row.id, members)
  }
  return map
})

function similarSiblings(row) {
  return (similarMap.value.get(row.id) || []).filter((x) => x.id !== row.id)
}

/** 同组里除本行外还有别的启用行 = 还有重复展示待处理 */
function similarPending(row) {
  const members = similarMap.value.get(row.id) || []
  return members.filter((x) => x.enabled && x.id !== row.id).length > 0
}

const naturalKey = (row) => `${row.source}|${row.game}|${row.sort ?? 0}|${row.id}`

/**
 * 列表渲染序：同图组的成员排在一起成一个「块」，不同块之间由模板插入组头隔开；
 * 非同图的行按自然序排在组块之后。
 */
const displayRows = computed(() => {
  const rows = filtered.value
  const idToRow = new Map(rows.map((row) => [row.id, row]))
  const blockIdOf = new Map()
  const blocks = new Map()
  for (const row of rows) {
    const members = similarMap.value.get(row.id)
    let blockId
    if (members && members.length > 1) {
      const present = members.filter((m) => idToRow.has(m.id)).map((m) => m.id)
      blockId = 'g:' + (present.length ? present.slice().sort()[0] : row.id)
    } else {
      blockId = 's:' + row.id
    }
    blockIdOf.set(row.id, blockId)
    if (!blocks.has(blockId)) blocks.set(blockId, [])
    blocks.get(blockId).push(row)
  }
  const blockList = [...blocks.values()]
  // 组块按组内最小自然键排；行块按自身自然键排——整体保持接近自然序
  blockList.sort((a, b) => naturalKey(a[0]).localeCompare(naturalKey(b[0]), 'zh'))
  const out = []
  for (const block of blockList) {
    const isGroup = block.length > 1
    block.sort((a, b) => {
      const ea = a.enabled ? 0 : 1
      const eb = b.enabled ? 0 : 1
      return ea - eb || naturalKey(a).localeCompare(naturalKey(b))
    })
    block.forEach((row, index) => {
      out.push({
        row,
        inGroup: isGroup,
        groupHead: isGroup && index === 0 ? `同图组 · ${block.length} 条` : '',
      })
    })
  }
  return out
})

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
    <p
      v-else-if="filters.state === 'similar' && !filtered.length"
      class="status-text"
    >
      当前没有待处理的同图组（历史重复已清理为墓碑，切到「全部状态」可查）。
    </p>
    <EmptyState v-else-if="!filtered.length" title="没有匹配的条目" description="调整筛选条件或新增一条" />
    <template v-for="entry in displayRows" :key="entry.row.id">
      <div v-if="entry.groupHead" class="decor-group-head">{{ entry.groupHead }}</div>
      <article
        :class="['decor-item', { 'decor-item--grouped': entry.inGroup }]"
      >
        <div class="decor-item__preview">
          <img
            v-if="previewSrc(entry.row)"
            :src="previewSrc(entry.row)"
            alt=""
            loading="lazy"
            @error="onPreviewError(entry.row)"
          />
          <span v-else class="decor-item__preview-empty">无图</span>
        </div>
        <div class="decor-item__main">
          <span class="decor-item__title">{{ entry.row.name || entry.row.id }}</span>
          <span class="decor-item__meta">
            ID: {{ entry.row.id }} · {{ entry.row.source }} · {{ entry.row.game }} · 排序 {{ entry.row.sort ?? 0 }}
            <template v-if="entry.row.animated"> · 动图</template>
            · {{ formatTime(entry.row.updated_at) }}
          </span>
        </div>
        <div class="decor-item__actions">
          <span
            v-if="similarMap.has(entry.row.id)"
            class="decor-item__similar"
            :class="{ 'decor-item__similar--pending': similarPending(entry.row) }"
            :title="'同图组：' + similarSiblings(entry.row).map((x) => (x.id + (x.enabled ? '' : '(墓碑)'))).join(', ')"
          >
            {{ similarPending(entry.row) ? '同图×' + similarMap.get(entry.row.id).length : '同图已清×' + similarMap.get(entry.row.id).length }}
          </span>
          <StatusPill :status="entry.row.enabled ? 'ok' : 'warn'" :label="entry.row.enabled ? '启用' : '墓碑'" />
          <button class="btn btn--sm" type="button" @click="openEdit(entry.row)">编辑</button>
          <button class="btn btn--sm btn--soft" type="button" @click="toggleItem(entry.row)">
            {{ entry.row.enabled ? '下架' : '恢复' }}
          </button>
        </div>
      </article>
    </template>
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

/* 同图组：组头 + 组内行的浅色底，组与组之间用组头的外边距拉开 */
.decor-group-head {
  margin-top: 18px;
  font-size: 11px;
  font-weight: 600;
  opacity: 0.6;
  letter-spacing: 0.04em;
}

.decor-item--grouped {
  background: var(--admin-surface-soft, rgba(127, 127, 127, 0.08));
  margin-top: -4px;
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
  background: rgba(127, 127, 127, 0.16);
  color: var(--admin-text-secondary, rgba(127, 127, 127, 0.9));
  font-size: 11px;
  white-space: nowrap;
  cursor: help;
}

.decor-item__similar--pending {
  background: rgba(230, 162, 60, 0.18);
  color: #e6a23c;
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
