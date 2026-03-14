<template>
  <div class="page sub-page">
    <NavBar title="IP 管理" show-back>
      <template #right>
        <button class="add-btn" type="button" @click="toggleInput">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 5V19" />
            <path d="M5 12H19" />
          </svg>
        </button>
      </template>
    </NavBar>

    <main class="page-body">
      <Transition name="panel-fade">
        <div v-if="showInput" class="input-card">
          <input
            ref="inputRef"
            v-model="newName"
            class="row-input"
            type="text"
            maxlength="40"
            placeholder="输入 IP 名称"
            @input="syncName"
            @blur="syncName"
            @change="syncName"
            @compositionend="syncName"
            @paste="syncNameLater"
            @keyup.enter="doAdd"
          />
          <button class="confirm-btn" type="button" @pointerdown="flushActiveInput" @click="doAdd">
            保存
          </button>
        </div>
      </Transition>

      <div class="search-wrap">
        <div class="search-bar">
          <svg viewBox="0 0 24 24" fill="none" class="s-icon" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20L16.65 16.65" />
          </svg>
          <input
            v-model="searchKey"
            class="s-input"
            type="search"
            placeholder="搜索 IP 名称"
          />
          <button v-if="searchKey" class="s-clear" type="button" @click="searchKey = ''">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M18 6L6 18" />
              <path d="M6 6L18 18" />
            </svg>
          </button>
        </div>
      </div>

      <section class="list-section">
        <template v-if="filteredIps.length > 0">
          <div class="row-list">
            <div
              v-for="(item, idx) in filteredIps"
              :key="item"
              class="row-item"
              :class="{ 'row-item--last': idx === filteredIps.length - 1 }"
            >
              <button class="row-main" type="button" @click="openEdit(item)">
                <span class="row-label">{{ item }}</span>
                <span class="row-meta">{{ getGoodsCount(item) }} 件收藏</span>
              </button>

              <button class="row-delete" type="button" aria-label="删除 IP" @click="removeIp(item)">
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M18 6L6 18" />
                  <path d="M6 6L18 18" />
                </svg>
              </button>
            </div>
          </div>
          <p class="count-hint">共 {{ presets.ips.length }} 个 IP</p>
        </template>

        <p v-else-if="searchKey && presets.ips.length > 0" class="empty-hint">
          没有匹配“{{ searchKey }}”的 IP
        </p>
        <p v-else class="empty-hint">还没有 IP，点击右上角新建</p>
      </section>
    </main>

    <Teleport to="body">
      <Transition name="sheet-backdrop">
        <div v-if="editingIp" class="edit-backdrop" @click="closeEdit" />
      </Transition>
      <Transition name="sheet-slide">
        <div v-if="editingIp" class="edit-sheet" :style="editSheetStyle">
          <div class="edit-header">
            <span class="edit-title">修改 IP 名称</span>
            <button type="button" class="edit-close" @click="closeEdit">×</button>
          </div>

          <p class="edit-caption">当前：{{ editingIp }}</p>

          <input
            ref="editInputRef"
            v-model="editName"
            class="row-input"
            type="text"
            maxlength="40"
            placeholder="输入新的 IP 名称"
            @focus="handleEditInputFocus"
            @keyup.enter="saveEdit"
          />

          <p v-if="editError" class="edit-error">{{ editError }}</p>

          <button class="save-btn" type="button" @click="saveEdit">保存修改</button>
        </div>
      </Transition>
    </Teleport>
  </div>

  <PresetDeleteConfirm
    :show="showDeleteConfirm"
    :name="pendingDeleteName"
    :count="affectedCount"
    field-label="该 IP"
    @cancel="showDeleteConfirm = false"
    @confirm="confirmDelete"
  />
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { usePresetsStore } from '@/stores/presets'
import { useGoodsStore } from '@/stores/goods'
import { commitActiveInput, flushActiveInput } from '@/utils/commitActiveInput'
import { usePresetDelete } from '@/composables/usePresetDelete'
import NavBar from '@/components/NavBar.vue'
import PresetDeleteConfirm from '@/components/PresetDeleteConfirm.vue'

const presets = usePresetsStore()
const store = useGoodsStore()

const { showDeleteConfirm, pendingDeleteName, affectedCount, tryRemove: removeIp, confirmDelete } = usePresetDelete({
  getAffected: (list, name) => list.filter((item) => item.ip === name),
  patch: (item) => ({ ...item, ip: '' }),
  removePreset: (name) => presets.removeIp(name)
})

const showInput = ref(false)
const newName = ref('')
const inputRef = ref(null)
const searchKey = ref('')
const editingIp = ref('')
const editName = ref('')
const editError = ref('')
const editInputRef = ref(null)
const keyboardInset = ref(0)

const editSheetStyle = computed(() => ({
  '--edit-sheet-keyboard-offset': `${keyboardInset.value}px`
}))

const filteredIps = computed(() => {
  if (!searchKey.value.trim()) return presets.ips
  const keyword = searchKey.value.trim().toLowerCase()
  return presets.ips.filter((ip) => ip.toLowerCase().includes(keyword))
})

const goodsCountMap = computed(() => {
  const map = new Map()
  for (const item of store.list) {
    if (!item.ip) continue
    map.set(item.ip, (map.get(item.ip) || 0) + 1)
  }
  return map
})

function getGoodsCount(name) {
  return goodsCountMap.value.get(name) || 0
}

async function toggleInput() {
  showInput.value = !showInput.value
  if (showInput.value) {
    await nextTick()
    inputRef.value?.focus()
  }
}

async function doAdd() {
  await commitActiveInput()
  syncDomField()
  if (await presets.addIp(newName.value)) {
    newName.value = ''
    showInput.value = false
  }
}

function syncName(event) {
  newName.value = event.target.value ?? ''
}

function syncNameLater() {
  requestAnimationFrame(syncDomField)
}

function syncDomField() {
  if (inputRef.value) {
    newName.value = inputRef.value.value ?? ''
  }
}

function openEdit(name) {
  editingIp.value = name
  editName.value = name
  editError.value = ''
  nextTick(() => {
    editInputRef.value?.focus()
    editInputRef.value?.select()
  })
}

function closeEdit() {
  editingIp.value = ''
  editName.value = ''
  editError.value = ''
}

function updateKeyboardInset() {
  if (!editingIp.value) {
    keyboardInset.value = 0
    return
  }

  const viewport = window.visualViewport
  if (!viewport) {
    keyboardInset.value = 0
    return
  }

  keyboardInset.value = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)
}

function ensureEditInputVisible() {
  if (!editingIp.value) return
  editInputRef.value?.scrollIntoView?.({
    block: 'center',
    inline: 'nearest',
    behavior: 'smooth'
  })
}

function handleEditInputFocus() {
  window.setTimeout(() => {
    updateKeyboardInset()
    ensureEditInputVisible()
  }, 80)
  window.setTimeout(ensureEditInputVisible, 220)
}

async function migrateCharacterIps(oldIp, newIp) {
  const relatedCharacters = presets.characters.filter((character) => character.ip === oldIp)
  for (const character of relatedCharacters) {
    await presets.updateCharacterIp(character.name, newIp)
  }
}

async function saveEdit() {
  const previous = editingIp.value
  const nextName = String(editName.value || '').trim()

  if (!nextName) {
    editError.value = '请输入 IP 名称'
    return
  }

  if (previous === nextName) {
    closeEdit()
    return
  }

  const updated = await presets.updateIpName(previous, nextName)
  if (!updated) {
    editError.value = 'IP 名称已存在'
    return
  }

  await Promise.all([
    store.replaceIpName(previous, nextName),
    migrateCharacterIps(previous, nextName)
  ])
  closeEdit()
}

onMounted(() => {
  window.visualViewport?.addEventListener('resize', updateKeyboardInset)
  window.visualViewport?.addEventListener('scroll', updateKeyboardInset)
})

onBeforeUnmount(() => {
  window.visualViewport?.removeEventListener('resize', updateKeyboardInset)
  window.visualViewport?.removeEventListener('scroll', updateKeyboardInset)
})

watch(editingIp, async (value) => {
  if (!value) {
    keyboardInset.value = 0
    return
  }

  await nextTick()
  updateKeyboardInset()
  window.setTimeout(ensureEditInputVisible, 120)
})
</script>

<style scoped>
.page-body { padding-top: 6px; }

.input-card {
  display: flex;
  gap: 10px;
  margin: 0 16px 12px;
  padding: 12px;
  border-radius: var(--radius-card);
  background: var(--app-surface);
  box-shadow: var(--app-shadow);
}

.row-input {
  flex: 1;
  min-width: 0;
  height: 44px;
  padding: 0 12px;
  border: 1px solid transparent;
  border-radius: var(--radius-small);
  background: var(--app-surface-soft);
  color: var(--app-text);
  font-size: 15px;
  outline: none;
}

.row-input:focus { border-color: rgba(20, 20, 22, 0.16); }

.confirm-btn,
.save-btn {
  min-width: 72px;
  height: 44px;
  padding: 0 16px;
  border: none;
  border-radius: 14px;
  background: #141416;
  color: #fff;
  font-size: 14px;
  font-weight: 600;
}

.search-wrap {
  padding: 0 16px;
  margin-bottom: 12px;
}

.search-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 40px;
  padding: 0 12px;
  background: rgba(142, 142, 147, 0.12);
  border-radius: 12px;
}

.s-icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  stroke: var(--app-text-tertiary);
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.s-input {
  flex: 1;
  min-width: 0;
  border: none;
  background: transparent;
  color: var(--app-text);
  font-size: 15px;
  outline: none;
}

.s-input::-webkit-search-cancel-button { display: none; }

.s-clear {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border: none;
  background: #aeaeb2;
  border-radius: 50%;
  flex-shrink: 0;
}

.s-clear svg {
  width: 10px;
  height: 10px;
  stroke: #fff;
  stroke-width: 2.5;
  stroke-linecap: round;
}

.list-section { padding: 0 16px 120px; }

.row-list {
  background: var(--app-surface);
  border-radius: var(--radius-card);
  box-shadow: var(--app-shadow);
  overflow: hidden;
}

.row-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-bottom: 1px solid #f2f2f7;
}

.row-item--last { border-bottom: none; }

.row-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 0;
  border: none;
  background: transparent;
  text-align: left;
  appearance: none;
  -webkit-appearance: none;
}

.row-label {
  font-size: 16px;
  font-weight: 600;
  color: var(--app-text);
}

.row-meta {
  font-size: 13px;
  color: var(--app-text-tertiary);
}

.row-delete {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 50%;
  background: rgba(199, 68, 68, 0.12);
  color: #c74444;
  flex-shrink: 0;
}

.row-delete svg {
  width: 14px;
  height: 14px;
  stroke: currentColor;
  stroke-width: 2.2;
  stroke-linecap: round;
}

.count-hint,
.empty-hint {
  margin-top: 12px;
  font-size: 13px;
  color: var(--app-text-tertiary);
  text-align: center;
}

.edit-backdrop {
  position: fixed;
  inset: 0;
  z-index: 59;
  background: rgba(20, 20, 22, 0.12);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
}

.edit-sheet {
  position: fixed;
  left: 50%;
  bottom: calc(max(env(safe-area-inset-bottom), 16px) + 16px + var(--edit-sheet-keyboard-offset, 0px));
  transform: translateX(-50%);
  width: min(calc(100vw - 32px), 420px);
  max-height: calc(100dvh - var(--edit-sheet-keyboard-offset, 0px) - 32px);
  padding: 16px;
  z-index: 60;
  border-radius: var(--radius-card);
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.14);
  overflow-y: auto;
  overscroll-behavior: contain;
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
}

.edit-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.edit-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--app-text);
}

.edit-close {
  width: 26px;
  height: 26px;
  border: none;
  border-radius: 50%;
  background: rgba(142, 142, 147, 0.15);
  color: var(--app-text-tertiary);
  font-size: 18px;
  line-height: 1;
}

.edit-caption {
  margin-bottom: 12px;
  font-size: 13px;
  color: var(--app-text-tertiary);
}

.edit-error {
  margin-top: 8px;
  font-size: 13px;
  color: #d64545;
}

.save-btn {
  width: 100%;
  margin-top: 12px;
}

.panel-fade-enter-active,
.panel-fade-leave-active {
  transition: opacity 180ms ease, transform 180ms ease;
}

.panel-fade-enter-from,
.panel-fade-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

.sheet-backdrop-enter-active,
.sheet-backdrop-leave-active {
  transition: opacity 180ms ease;
}

.sheet-backdrop-enter-from,
.sheet-backdrop-leave-to {
  opacity: 0;
}

.sheet-slide-enter-active,
.sheet-slide-leave-active {
  transition: opacity 220ms ease, transform 220ms ease;
}

.sheet-slide-enter-from,
.sheet-slide-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(28px);
}

:global(html.theme-dark) .confirm-btn,
  :global(html.theme-dark) .save-btn {
    background: #f5f5f7;
    color: #141416;
  }

:global(html.theme-dark) .row-item {
    border-bottom-color: var(--app-border);
  }

:global(html.theme-dark) .edit-sheet {
    background: rgba(28, 28, 30, 0.95);
  }

:global(html.theme-dark) .row-input:focus {
    border-color: rgba(255, 255, 255, 0.15);
  }

:global(html.theme-dark) .s-clear {
    background: rgba(255, 255, 255, 0.2);
  }
</style>
