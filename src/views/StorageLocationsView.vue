<template>
  <div class="page page--transition locations-page" :class="{ 'page--leaving': isPageLeaving }">
    <NavBar title="收纳位置" show-back />

    <main class="page-body">
      <section class="hero-section">
        <div class="hero-copy">
          <p class="hero-label">Storage Presets</p>
          <h1 class="hero-title">把收纳位置整理成层级结构</h1>
          <p class="hero-desc">支持新增一级位置、子级位置，重命名后会同步更新已有商品的路径。</p>
        </div>

        <div class="summary-grid">
          <article class="summary-card">
            <span class="summary-kicker">位置节点</span>
            <strong class="summary-value">{{ presets.storageLocations.length }}</strong>
          </article>
          <article class="summary-card">
            <span class="summary-kicker">未设置位置</span>
            <strong class="summary-value">{{ unassignedCount }}</strong>
          </article>
        </div>
      </section>

      <section class="editor-section">
        <div class="section-head">
          <p class="section-label">编辑预设</p>
          <h2 class="section-title">{{ editorTitle }}</h2>
          <p v-if="editorHint" class="section-desc">{{ editorHint }}</p>
        </div>

        <div class="editor-card">
          <button
            v-if="!editorMode"
            type="button"
            class="editor-primary-btn"
            @click="openCreateRoot"
          >
            新增一级位置
          </button>

          <QuickPresetCreator
            v-else
            :show="Boolean(editorMode)"
            v-model="editorName"
            :placeholder="editorPlaceholder"
            :maxlength="20"
            :submit-text="editorSubmitText"
            @cancel="resetEditor"
            @submit="submitEditor"
          />
        </div>
      </section>

      <section class="list-section">
        <div class="section-head">
          <p class="section-label">位置树</p>
          <h2 class="section-title">管理层级</h2>
        </div>

        <div v-if="presets.storageLocationTree.length > 0" class="tree-list">
          <StorageLocationTreeNode
            v-for="node in presets.storageLocationTree"
            :key="node.id"
            :node="node"
            :stats-by-id="statsById"
            @add-child="openCreateChild"
            @rename="openRename"
            @remove="removeNode"
          />
        </div>

        <EmptyState
          v-else
          icon="柜"
          title="还没有收纳位置"
          description="先新增一级位置，比如柜子、抽屉、活页册，后面再逐级细分。"
        />
      </section>
    </main>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useGoodsStore } from '@/stores/goods'
import { usePresetsStore } from '@/stores/presets'
import { usePageLeaveAnimation } from '@/composables/usePageLeaveAnimation'
import NavBar from '@/components/NavBar.vue'
import EmptyState from '@/components/EmptyState.vue'
import QuickPresetCreator from '@/components/QuickPresetCreator.vue'
import StorageLocationTreeNode from '@/components/StorageLocationTreeNode.vue'

const store = useGoodsStore()
const presets = usePresetsStore()
const { isPageLeaving } = usePageLeaveAnimation()

const editorMode = ref('')
const editorNodeId = ref('')
const editorName = ref('')

const statsById = computed(() => {
  const stats = {}

  for (const node of presets.storageLocations) {
    stats[node.id] = {
      itemCount: 0,
      quantity: 0
    }
  }

  for (const item of store.viewList) {
    const location = String(item.storageLocation || '').trim()
    if (!location) continue

    const pathIds = presets.findStorageLocationPathIds(location)
    for (const id of pathIds) {
      if (!stats[id]) {
        stats[id] = {
          itemCount: 0,
          quantity: 0
        }
      }

      stats[id].itemCount += 1
      stats[id].quantity += item.quantityNumber
    }
  }

  return stats
})

const unassignedCount = computed(() =>
  store.viewList.filter((item) => !String(item.storageLocation || '').trim()).length
)

const editorTargetPath = computed(() =>
  editorNodeId.value ? presets.buildStorageLocationPathById(editorNodeId.value) : ''
)

const editorTitle = computed(() => {
  if (editorMode.value === 'create-root') return '新增一级位置'
  if (editorMode.value === 'create-child') return '新增子级位置'
  if (editorMode.value === 'rename') return '重命名位置'
  return '快速维护你的收纳层级'
})

const editorHint = computed(() => {
  if (editorMode.value === 'create-child') {
    return `当前会新增到 ${editorTargetPath.value} 下`
  }

  if (editorMode.value === 'rename') {
    return `当前正在编辑 ${editorTargetPath.value}`
  }

  return '建议先建一级位置，再逐级细分到层、页、格。'
})

const editorPlaceholder = computed(() => {
  if (editorMode.value === 'create-root') return '例如：柜子 A'
  if (editorMode.value === 'create-child') return '例如：第 2 层'
  if (editorMode.value === 'rename') return '输入新的位置名称'
  return ''
})

const editorSubmitText = computed(() =>
  editorMode.value === 'rename' ? '保存名称' : '新增位置'
)

function resetEditor() {
  editorMode.value = ''
  editorNodeId.value = ''
  editorName.value = ''
}

function openCreateRoot() {
  editorMode.value = 'create-root'
  editorNodeId.value = ''
  editorName.value = ''
}

function openCreateChild(node) {
  editorMode.value = 'create-child'
  editorNodeId.value = node.id
  editorName.value = ''
}

function openRename(node) {
  editorMode.value = 'rename'
  editorNodeId.value = node.id
  editorName.value = node.name
}

async function submitEditor() {
  const name = String(editorName.value || '').trim()
  if (!name) return

  if (editorMode.value === 'create-root') {
    await presets.addStorageLocation(name, '')
    resetEditor()
    return
  }

  if (editorMode.value === 'create-child') {
    await presets.addStorageLocation(name, editorNodeId.value)
    resetEditor()
    return
  }

  if (editorMode.value === 'rename') {
    const oldPath = presets.buildStorageLocationPathById(editorNodeId.value)
    const changed = await presets.renameStorageLocation(editorNodeId.value, name)
    if (!changed) return

    const newPath = presets.buildStorageLocationPathById(editorNodeId.value)
    if (oldPath && newPath && oldPath !== newPath) {
      await store.replaceStorageLocationPrefix(oldPath, newPath)
    }
    resetEditor()
  }
}

async function removeNode(node) {
  const confirmed = window.confirm(`删除“${node.path}”后，使用这个位置的商品会被清空收纳位置。确定删除吗？`)
  if (!confirmed) return

  await presets.removeStorageLocation(node.id)
  await store.clearStorageLocationPrefix(node.path)

  if (editorNodeId.value === node.id) {
    resetEditor()
  }
}
</script>

<style scoped>
.locations-page {
  background:
    radial-gradient(circle at top left, rgba(93, 226, 160, 0.14), transparent 26%),
    var(--app-bg);
}

.hero-section,
.editor-section,
.list-section {
  margin-top: var(--section-gap);
  padding: 0 var(--page-padding);
}

.hero-label,
.section-label {
  color: var(--app-text-tertiary);
  font-size: 13px;
}

.hero-title,
.section-title {
  margin-top: 4px;
  color: var(--app-text);
  font-size: 24px;
  font-weight: 700;
  letter-spacing: -0.04em;
}

.hero-desc,
.section-desc {
  margin-top: 8px;
  color: var(--app-text-secondary);
  font-size: 14px;
  line-height: 1.6;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin-top: 14px;
}

.summary-card,
.editor-card {
  padding: 18px;
  border-radius: var(--radius-card);
  background: var(--app-surface);
  box-shadow: var(--app-shadow);
}

.summary-kicker {
  color: var(--app-text-tertiary);
  font-size: 12px;
}

.summary-value {
  display: block;
  margin-top: 10px;
  color: var(--app-text);
  font-size: 28px;
  font-weight: 700;
  letter-spacing: -0.04em;
}

.section-head {
  margin-bottom: 14px;
}

.editor-primary-btn {
  width: 100%;
  min-height: 48px;
  border: none;
  border-radius: 16px;
  background: #141416;
  color: #ffffff;
  font-size: 15px;
  font-weight: 600;
}

.editor-primary-btn:active {
  transform: scale(0.98);
}

.tree-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

@media (prefers-color-scheme: dark) {
  .editor-primary-btn {
    background: #f5f5f7;
    color: #141416;
  }
}
</style>
