<template>
  <div class="route-page">
    <div class="page sub-page">
    <NavBar :title="t('manage.categoryManage')" show-back>
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
            :placeholder="t('manage.category.inputPlaceholder')"
            @input="syncName"
            @blur="syncName"
            @change="syncName"
            @compositionend="syncName"
            @paste="syncNameLater"
            @keyup.enter="doAdd"
          />
          <button class="confirm-btn" type="button" @pointerdown="flushActiveInput" @click="doAdd">
            {{ t('common.save') }}
          </button>
        </div>
      </Transition>

      <PresetSortBar
        :sort-mode="sortMode"
        :sort-direction="sortDirection"
        @update:sort-mode="setSortMode"
        @toggle-direction="toggleSortDirection"
      />

      <section class="list-section">
        <div v-if="sortedCategories.length > 0" class="row-list">
          <div
            v-for="(item, idx) in sortedCategories"
            :key="item"
            class="row-item"
            :class="{ 'row-item--last': idx === sortedCategories.length - 1 }"
          >
            <button
              class="row-fav"
              :class="{ 'row-fav--active': isFavorite(item) }"
              :aria-label="isFavorite(item) ? t('manage.favoriteRemove') : t('manage.favoriteAdd')"
              @click.stop="toggleFavorite(item)"
            >
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
                  :fill="isFavorite(item) ? '#f5a623' : 'none'"
                  :stroke="isFavorite(item) ? '#f5a623' : 'currentColor'"
                  stroke-width="1.8"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
            </button>

            <button class="row-main" type="button" @click="openEdit(item)">
              <span class="row-label">{{ item }}</span>
              <span class="row-meta">{{ t('manage.category.goodsCount', getGoodsCount(item)) }}</span>
            </button>

            <button class="row-delete" type="button" :aria-label="t('manage.category.delete')" @click="removeCategory(item)">
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
            {{ t('manage.category.restoreDefaults') }}
          </button>
          <p v-if="presets.categories.length === 0" class="empty-hint">
            {{ t('manage.category.emptyHint') }}
          </p>
          <p v-else class="count-hint">{{ t('manage.category.count', { count: presets.categories.length }) }}</p>
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
            <span class="edit-title">{{ t('manage.category.editTitle') }}</span>
            <button type="button" class="edit-close" @click="closeEdit">×</button>
          </div>

          <p class="edit-caption">{{ t('manage.category.current', { name: editingName }) }}</p>

          <input
            ref="editInputRef"
            v-model="editName"
            class="row-input"
            type="text"
            maxlength="20"
            :placeholder="t('manage.category.newPlaceholder')"
            @focus="handleEditInputFocus"
            @keyup.enter="saveEdit"
          />

          <p v-if="editError" class="edit-error">{{ editError }}</p>

          <button class="save-btn" type="button" @click="saveEdit">{{ t('manage.category.saveEdit') }}</button>
        </div>
      </Transition>
    </Teleport>
    </div>

  <PresetDeleteConfirm
    :show="showDeleteConfirm"
    :name="pendingDeleteName"
    :count="affectedCount"
    :field-label="t('manage.category.fieldLabel')"
    @cancel="showDeleteConfirm = false"
    @confirm="confirmDelete"
  />
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { usePresetsStore } from '@/stores/presets'
import { useGoodsStore } from '@/stores/goods'
import { commitActiveInput, flushActiveInput } from '@/utils/commitActiveInput'
import { usePresetDelete } from '@/composables/preset/usePresetDelete'
import { usePresetPreferences } from '@/composables/preset/usePresetPreferences'
import { sortPresetList } from '@/utils/presets/sort'
import NavBar from '@/components/common/NavBar.vue'
import PresetDeleteConfirm from '@/components/preset/PresetDeleteConfirm.vue'
import PresetSortBar from '@/components/preset/PresetSortBar.vue'

const DEFAULT_LIST = ['手办', '挂件', '立牌', '徽章', '卡牌', '明信片', '色纸', 'CD/专辑', '服饰', '毛绒', '赠品', '其他']

const { t } = useI18n()
const presets = usePresetsStore()
const store = useGoodsStore()

const { sortMode, sortDirection, toggleSortDirection, setSortMode } = usePresetPreferences('categories')

const sortedCategories = computed(() => {
  return sortPresetList(
    presets.categories,
    sortMode.value,
    sortDirection.value,
    goodsCountMap.value,
    presets.favoriteCategorySet,
    { alwaysLast: (item) => item === '其他' }
  )
})

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
    const entry = map.get(item.category) || { collection: 0, wishlist: 0 }
    if (item.isWishlist) {
      entry.wishlist++
    } else {
      entry.collection++
    }
    map.set(item.category, entry)
  }
  return map
})

function getGoodsCount(name) {
  return goodsCountMap.value.get(name) || { collection: 0, wishlist: 0 }
}

function isFavorite(name) {
  return presets.favoriteCategorySet.has(name)
}

function toggleFavorite(name) {
  presets.toggleFavoriteCategory(name)
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
    editError.value = t('manage.category.errorEmpty')
    return
  }

  if (previous === nextName) {
    closeEdit()
    return
  }

  const updated = await presets.updateCategoryName(previous, nextName)
  if (!updated) {
    editError.value = t('manage.category.errorExists')
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
  border-bottom: 1px solid rgba(142, 142, 147, 0.12);
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
  min-height: 40px;
  justify-content: center;
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

.row-fav {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 50%;
  background: rgba(142, 142, 147, 0.1);
  color: var(--app-text-tertiary);
  flex-shrink: 0;
  transition: background 0.16s ease, color 0.16s ease, transform 0.16s ease;
}

.row-fav svg {
  width: 16px;
  height: 16px;
}

.row-fav--active {
  background: rgba(245, 166, 35, 0.12);
  color: #f5a623;
}

.row-fav:active {
  transform: scale(0.9);
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

.sheet-slide-enter-active {
  transition: opacity 220ms ease, transform 280ms var(--motion-ease-spring);
}

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

:global(html.theme-dark) .restore-btn {
    background: rgba(28, 28, 30, 0.88);
  }

:global(html.theme-dark) .edit-sheet {
    background: rgba(24, 24, 28, 0.94);
    border: 1px solid rgba(255, 255, 255, 0.06);
    box-shadow: 0 24px 56px rgba(0, 0, 0, 0.42);
  }

:global(html.theme-dark) .row-input:focus {
    border-color: rgba(255, 255, 255, 0.15);
  }
</style>
