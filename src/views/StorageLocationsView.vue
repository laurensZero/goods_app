<template>
  <div class="page locations-page">
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
            @write-nfc="handleWriteNfc"
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

    <NfcWriteDialog
      :show="showNfcDialog"
      :status="nfcDialogStatus"
      :message="nfcDialogMessage"
      :node-name="currentNfcNode?.name"
      @cancel="cancelNfc"
    />

    <PresetDeleteConfirm
      :show="showDeleteConfirm"
      :name="pendingDeleteNode?.path || ''"
      :count="affectedCount"
      field-label="该收纳位置"
      @cancel="cancelDeleteNode"
      @confirm="confirmDeleteNode"
    />
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useGoodsStore } from '@/stores/goods'
import { usePresetsStore } from '@/stores/presets'
import { isStorageLocationUnderPrefix } from '@/utils/storageLocations'
import NavBar from '@/components/common/NavBar.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import QuickPresetCreator from '@/components/preset/QuickPresetCreator.vue'
import PresetDeleteConfirm from '@/components/preset/PresetDeleteConfirm.vue'
import StorageLocationTreeNode from '@/components/storage/StorageLocationTreeNode.vue'
import NfcWriteDialog from '@/components/storage/NfcWriteDialog.vue'

const store = useGoodsStore()
const presets = usePresetsStore()

const editorMode = ref('')
const editorNodeId = ref('')
const editorName = ref('')
const showDeleteConfirm = ref(false)
const pendingDeleteNode = ref(null)

const showNfcDialog = ref(false)
const nfcDialogStatus = ref('scanning')
const nfcDialogMessage = ref('')
const currentNfcNode = ref(null)

const statsById = computed(() => {
  const stats = {}

  for (const node of presets.storageLocations) {
    stats[node.id] = {
      itemCount: 0,
      quantity: 0
    }
  }

  for (const item of store.collectionViewList) {
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
  store.collectionViewList.filter((item) => !String(item.storageLocation || '').trim()).length
)

const affectedCount = computed(() => {
  const path = pendingDeleteNode.value?.path || ''
  if (!path) return 0
  return store.list.filter((item) => isStorageLocationUnderPrefix(item.storageLocation, path)).length
})

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

const NFC_ANDROID_READER_MODE_FLAGS = 0x01 | 0x02 | 0x04 | 0x08 | 0x100

async function handleWriteNfc(node) {
  const { Capacitor } = await import('@capacitor/core')

  if (!Capacitor.isNativePlatform()) {
    showNfcDialog.value = true
    nfcDialogStatus.value = 'error'
    nfcDialogMessage.value = '您现在正在电脑/网页端预览，NFC 需要打包到手机才能真实执行物理读写哦。'
    currentNfcNode.value = node
    return
  }

  const { CapacitorNfc } = await import('@capgo/capacitor-nfc')

  showNfcDialog.value = true
  nfcDialogStatus.value = 'scanning'
  nfcDialogMessage.value = ''
  currentNfcNode.value = node

  try {
    const isAvailable = await CapacitorNfc.isSupported()
    if (!isAvailable.supported) {
      nfcDialogMessage.value = '当前设备不支持 NFC 或未开启功能'
      nfcDialogStatus.value = 'error'
      return
    }

    nfcDialogMessage.value = '准备写入，请将手机靠近贴纸...'

    let nfcScannedListener = null
    const tagDetected = new Promise((resolve, reject) => {
      let timeoutId = setTimeout(() => {
        if (nfcScannedListener) nfcScannedListener.remove()
        reject(new Error('等待超时，请重新点击绑定'))
      }, 15000)

      CapacitorNfc.addListener('nfcEvent', () => {
        clearTimeout(timeoutId)
        if (nfcScannedListener) nfcScannedListener.remove()
        resolve()
      }).then(res => {
        nfcScannedListener = res
      }).catch(reject)
    })

    try {
      await CapacitorNfc.startScanning({
         invalidateAfterFirstRead: false,
        alertMessage: `靠近首饰盒 NFC 标签以将 ${node.name} 写入...`,
        androidReaderModeFlags: NFC_ANDROID_READER_MODE_FLAGS
      })
    } catch {
       // Ignore if scanning is already active
    }

    // Wait until the phone physically touches a tag
    await tagDetected
    nfcDialogMessage.value = '已靠近标签，正在写入...'
    
    // NDEF URI format
    const uri = `goodsapp://storage/${encodeURIComponent(node.path)}`
    const uriBytes = Array.from(new TextEncoder().encode(uri))
    const payload = [0x00, ...uriBytes]

    await CapacitorNfc.write({
      allowFormat: true,
      records: [{
        tnf: 0x01, // TNF_WELL_KNOWN
        type: [0x55], // 'U'
        id: [],
        payload
      }]
    }).catch(async (e) => {
      // Fallback for tags that might not support formatting or are already formatted
      console.warn('NFC Write Error (with format), retrying without format:', e)
      await CapacitorNfc.write({
        allowFormat: false,
        records: [{
          tnf: 0x01,
          type: [0x55],
          id: [],
          payload
        }]
      })
    })

    nfcDialogStatus.value = 'success'
    nfcDialogMessage.value = `写入成功！\n现在只要碰一碰就自动筛选 ${node.name} 的内容。`
    await CapacitorNfc.stopScanSession()
  } catch (error) {
    console.error('Nfc Write Error:', error)
    nfcDialogStatus.value = 'error'
    nfcDialogMessage.value = `写入被取消或失败\n${error.message || ''}`
    try { await CapacitorNfc.stopScanSession() } catch {}
  }
}

async function cancelNfc() {
  showNfcDialog.value = false
  const { CapacitorNfc } = await import('@capgo/capacitor-nfc')
  try { await CapacitorNfc.stopScanSession() } catch {}
}

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
  pendingDeleteNode.value = node
  showDeleteConfirm.value = true
}

async function confirmDeleteNode() {
  const node = pendingDeleteNode.value
  if (!node) return

  await presets.removeStorageLocation(node.id)
  await store.clearStorageLocationPrefix(node.path)

  if (editorNodeId.value === node.id) {
    resetEditor()
  }

  pendingDeleteNode.value = null
  showDeleteConfirm.value = false
}

function cancelDeleteNode() {
  showDeleteConfirm.value = false
  pendingDeleteNode.value = null
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

:global(html.theme-dark) .editor-primary-btn {
    background: #f5f5f7;
    color: #141416;
  }
</style>
