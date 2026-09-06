<template>
  <div class="page locations-page">
    <NavBar :title="t('manage.storageLocations')" show-back />

    <main class="page-body page-entry">
      <section class="hero-section">
        <div class="hero-copy">
          <p class="hero-label">Storage Presets</p>
          <h1 class="hero-title">{{ t('manage.storage.heroTitle') }}</h1>
          <p class="hero-desc">{{ t('manage.storage.heroDesc') }}</p>
        </div>

        <div class="summary-grid">
          <article class="summary-card">
            <span class="summary-kicker">{{ t('manage.storage.locationNodes') }}</span>
            <strong class="summary-value">{{ presets.storageLocations.length }}</strong>
          </article>
          <article class="summary-card">
            <span class="summary-kicker">{{ t('manage.storage.unassigned') }}</span>
            <strong class="summary-value">{{ unassignedCount }}</strong>
          </article>
        </div>
      </section>

      <section class="editor-section">
        <div class="section-head">
          <p class="section-label">{{ t('manage.storage.editPresets') }}</p>
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
            {{ t('manage.storage.addRoot') }}
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
          <p class="section-label">{{ t('manage.storage.locationTree') }}</p>
          <h2 class="section-title">{{ t('manage.storage.manageHierarchy') }}</h2>
        </div>

        <div v-if="presets.storageLocationTree.length > 0" class="tree-list">
          <StorageLocationTreeNode
            v-for="node in presets.storageLocationTree"
            :key="node.id"
            :node="node"
            :stats-by-id="statsById"
            @show-qr="handleShowQr"
            @write-nfc="handleWriteNfc"
            @add-child="openCreateChild"
            @rename="openRename"
            @remove="removeNode"
          />
        </div>

        <EmptyState
          v-else
          icon="柜"
          :title="t('manage.storage.emptyTitle')"
          :description="t('manage.storage.emptyDesc')"
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

    <StorageQrDialog
      :show="showQrDialog"
      :node="currentQrNode"
      @close="closeQrDialog"
    />

    <PresetDeleteConfirm
      :show="showDeleteConfirm"
      :name="pendingDeleteNode?.path || ''"
      :count="affectedCount"
      :field-label="t('manage.storage.fieldLabel')"
      @cancel="cancelDeleteNode"
      @confirm="confirmDeleteNode"
    />
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useGoodsStore } from '@/stores/goods'
import { usePresetsStore } from '@/stores/presets'
import { isStorageLocationUnderPrefix } from '@/utils/storageLocations'
import NavBar from '@/components/common/NavBar.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import QuickPresetCreator from '@/components/preset/QuickPresetCreator.vue'
import PresetDeleteConfirm from '@/components/preset/PresetDeleteConfirm.vue'
import StorageLocationTreeNode from '@/components/storage/StorageLocationTreeNode.vue'
import NfcWriteDialog from '@/components/storage/NfcWriteDialog.vue'
import StorageQrDialog from '@/components/storage/StorageQrDialog.vue'
import { buildStorageDeepLink } from '@/utils/storageQr'

const { t } = useI18n()
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
const showQrDialog = ref(false)
const currentQrNode = ref(null)

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
  if (editorMode.value === 'create-root') return t('manage.storage.createRootTitle')
  if (editorMode.value === 'create-child') return t('manage.storage.createChildTitle')
  if (editorMode.value === 'rename') return t('manage.storage.renameTitle')
  return t('manage.storage.defaultTitle')
})

const editorHint = computed(() => {
  if (editorMode.value === 'create-child') {
    return t('manage.storage.createChildHint', { path: editorTargetPath.value })
  }

  if (editorMode.value === 'rename') {
    return t('manage.storage.renameHint', { path: editorTargetPath.value })
  }

  return t('manage.storage.defaultHint')
})

const editorPlaceholder = computed(() => {
  if (editorMode.value === 'create-root') return t('manage.storage.createRootPlaceholder')
  if (editorMode.value === 'create-child') return t('manage.storage.createChildPlaceholder')
  if (editorMode.value === 'rename') return t('manage.storage.renamePlaceholder')
  return ''
})

const editorSubmitText = computed(() =>
  editorMode.value === 'rename' ? t('manage.storage.saveName') : t('storage.addLocation')
)

const NFC_ANDROID_READER_MODE_FLAGS = 0x01 | 0x02 | 0x04 | 0x08 | 0x100
const NFC_ANDROID_AAR_TYPE = 'android.com:pkg'
const NFC_APP_PACKAGE_NAME = 'com.goodsapp.collector'

async function handleWriteNfc(node) {
  const { Capacitor } = await import('@capacitor/core')

  if (!Capacitor.isNativePlatform()) {
    showNfcDialog.value = true
    nfcDialogStatus.value = 'error'
    nfcDialogMessage.value = t('manage.storage.nfcPreviewOnly')
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
      nfcDialogMessage.value = t('manage.storage.nfcNotSupported')
      nfcDialogStatus.value = 'error'
      return
    }

    nfcDialogMessage.value = t('manage.storage.nfcPreparing')

    let nfcScannedListener = null
    const tagDetected = new Promise((resolve, reject) => {
      let timeoutId = setTimeout(() => {
        if (nfcScannedListener) nfcScannedListener.remove()
        reject(new Error(t('manage.storage.nfcTimeout')))
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
        alertMessage: t('manage.storage.nfcAlertMessage', { name: node.name }),
        androidReaderModeFlags: NFC_ANDROID_READER_MODE_FLAGS
      })
    } catch {
       // Ignore if scanning is already active
    }

    // Wait until the phone physically touches a tag
    await tagDetected
    nfcDialogMessage.value = t('manage.storage.nfcWriting')
    
    // Write URI + Android Application Record to improve app launch reliability.
    const encoder = new TextEncoder()
    const uri = buildStorageDeepLink(node.path)
    const uriPayload = [0x00, ...Array.from(encoder.encode(uri))]
    const aarType = Array.from(encoder.encode(NFC_ANDROID_AAR_TYPE))
    const packagePayload = Array.from(encoder.encode(NFC_APP_PACKAGE_NAME))
    const records = [{
      tnf: 0x01, // TNF_WELL_KNOWN
      type: [0x55], // 'U'
      id: [],
      payload: uriPayload
    }, {
      tnf: 0x04, // TNF_EXTERNAL_TYPE
      type: aarType,
      id: [],
      payload: packagePayload
    }]

    await CapacitorNfc.write({
      allowFormat: true,
      records
    }).catch(async (e) => {
      // Fallback for tags that might not support formatting or are already formatted.
      console.warn('NFC Write Error (with format), retrying without format:', e)
      await CapacitorNfc.write({
        allowFormat: false,
        records
      })
    })

    nfcDialogStatus.value = 'success'
    nfcDialogMessage.value = t('manage.storage.nfcSuccess', { name: node.name })
    await CapacitorNfc.stopScanning()
  } catch (error) {
    console.error('Nfc Write Error:', error)
    nfcDialogStatus.value = 'error'
    nfcDialogMessage.value = t('manage.storage.nfcFailed', { error: error.message || '' })
    try { await CapacitorNfc.stopScanning() } catch {}
  }
}

function handleShowQr(node) {
  currentQrNode.value = node
  showQrDialog.value = true
}

function closeQrDialog() {
  showQrDialog.value = false
  currentQrNode.value = null
}

async function cancelNfc() {
  showNfcDialog.value = false
  const { CapacitorNfc } = await import('@capgo/capacitor-nfc')
  try { await CapacitorNfc.stopScanning() } catch {}
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
