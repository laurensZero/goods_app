<template>
  <div class="page sub-page">
    <NavBar title="分类管理" show-back>
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
            maxlength="20"
            placeholder="输入分类名称"
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

      <section class="list-section">
        <div v-if="presets.categories.length > 0" class="row-list">
          <div
            v-for="(item, idx) in presets.categories"
            :key="item"
            class="row-item"
            :class="{ 'row-item--last': idx === presets.categories.length - 1 }"
          >
            <button class="row-main" type="button" @click="openEdit(item)">
              <span class="row-label">{{ item }}</span>
              <span class="row-meta">{{ getGoodsCount(item) }} 件收藏</span>
            </button>

            <button class="row-delete" type="button" aria-label="删除分类" @click="removeCategory(item)">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M18 6L6 18" />
                <path d="M6 6L18 18" />
              </svg>
            </button>
          </div>
        </div>

        <div class="list-footer">
          <button
            v-if="presets.categories.length === 0"
            class="restore-btn"
            type="button"
            @click="restoreDefaults"
          >
            恢复默认分类
          </button>
          <p v-if="presets.categories.length === 0" class="empty-hint">
            还没有分类，点击右上角新建，或恢复默认分类
          </p>
          <p v-else class="count-hint">共 {{ presets.categories.length }} 个分类</p>
        </div>
      </section>
    </main>

    <Teleport to="body">
      <Transition name="sheet-backdrop">
        <div v-if="editingName" class="edit-backdrop" @click="closeEdit" />
      </Transition>
      <Transition name="sheet-slide">
        <div v-if="editingName" class="edit-sheet" :style="editSheetStyle">
          <div class="edit-header">
            <span class="edit-title">修改分类名</span>
            <button type="button" class="edit-close" @click="closeEdit">×</button>
          </div>

          <p class="edit-caption">当前：{{ editingName }}</p>

          <input
            ref="editInputRef"
            v-model="editName"
            class="row-input"
            type="text"
            maxlength="20"
            placeholder="输入新的分类名称"
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
    field-label="该分类"
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

const DEFAULT_LIST = ['手办', '挂件', '立牌', '徽章', '卡牌', '明信片', '色纸', 'CD/专辑', '服饰', '毛绒', '赠品', '其他']

const presets = usePresetsStore()
const store = useGoodsStore()

const { showDeleteConfirm, pendingDeleteName, affectedCount, tryRemove: removeCategory, confirmDelete } = usePresetDelete({
  getAffected: (list, name) => list.filter((item) => item.category === name),
  patch: (item) => ({ ...item, category: '' }),
  removePreset: (name) => presets.removeCategory(name)
})

const showInput = ref(false)
const newName = ref('')
const inputRef = ref(null)
const editingName = ref('')
const editName = ref('')
const editError = ref('')
const editInputRef = ref(null)
const keyboardInset = ref(0)

const editSheetStyle = computed(() => ({
  '--edit-sheet-keyboard-offset': `${keyboardInset.value}px`
}))

const goodsCountMap = computed(() => {
  const map = new Map()
  for (const item of store.list) {
    if (!item.category) continue
    map.set(item.category, (map.get(item.category) || 0) + 1)
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
  if (await presets.addCategory(newName.value)) {
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
  editingName.value = name
  editName.value = name
  editError.value = ''
  nextTick(() => {
    editInputRef.value?.focus()
    editInputRef.value?.select()
  })
}

function closeEdit() {
  editingName.value = ''
  editName.value = ''
  editError.value = ''
}

function updateKeyboardInset() {
  if (!editingName.value) {
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
  if (!editingName.value) return
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

async function saveEdit() {
  const previous = editingName.value
  const nextName = String(editName.value || '').trim()

  if (!nextName) {
    editError.value = '请输入分类名称'
    return
  }

  if (previous === nextName) {
    closeEdit()
    return
  }

  const updated = await presets.updateCategoryName(previous, nextName)
  if (!updated) {
    editError.value = '分类名称已存在'
    return
  }

  await store.replaceCategoryName(previous, nextName)
  closeEdit()
}

async function restoreDefaults() {
  for (const category of DEFAULT_LIST) {
    await presets.addCategory(category)
  }
}

onMounted(() => {
  window.visualViewport?.addEventListener('resize', updateKeyboardInset)
  window.visualViewport?.addEventListener('scroll', updateKeyboardInset)
})

onBeforeUnmount(() => {
  window.visualViewport?.removeEventListener('resize', updateKeyboardInset)
  window.visualViewport?.removeEventListener('scroll', updateKeyboardInset)
})

watch(editingName, async (value) => {
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

.list-footer {
  margin-top: 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}

.restore-btn {
  display: inline-flex;
  align-items: center;
  height: 38px;
  padding: 0 18px;
  border: none;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.9);
  box-shadow: var(--app-shadow);
  color: var(--app-text-secondary);
  font-size: 14px;
  font-weight: 600;
}

.count-hint,
.empty-hint {
  color: var(--app-text-tertiary);
  font-size: 13px;
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

:global(html.theme-dark) .restore-btn {
    background: rgba(28, 28, 30, 0.88);
  }

:global(html.theme-dark) .edit-sheet {
    background: rgba(28, 28, 30, 0.95);
  }

:global(html.theme-dark) .row-input:focus {
    border-color: rgba(255, 255, 255, 0.15);
  }
</style>
