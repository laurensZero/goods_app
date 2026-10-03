<template>
  <div class="route-page">
    <div class="page sub-page">
      <NavBar :title="t('manage.customFields')" show-back>
        <template #right>
          <button class="add-btn" type="button" :aria-label="t('manage.customField.addField')" @click="openCreate">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 5V19" />
              <path d="M5 12H19" />
            </svg>
          </button>
        </template>
      </NavBar>

      <main class="page-body page-entry">
        <section class="list-section">
          <p class="section-caption">{{ t('manage.customField.sectionCaption') }}</p>

          <div v-if="presets.customFieldDefs.length > 0" class="row-list">
            <div
              v-for="(def, idx) in presets.customFieldDefs"
              :key="def.id"
              class="row-item"
              :class="{ 'row-item--last': idx === presets.customFieldDefs.length - 1 }"
            >
              <button class="row-main" type="button" @click="openEdit(def)">
                <span class="row-label">{{ def.name }}</span>
                <span class="row-meta">{{ rowMeta(def) }}</span>
              </button>
              <span class="type-chip" :class="`type-${def.type}`">{{ typeLabel(def.type) }}</span>
              <button
                class="row-delete"
                type="button"
                :aria-label="t('manage.customField.deleteField')"
                @click="tryRemove(def)"
              >
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M18 6L6 18" />
                  <path d="M6 6L18 18" />
                </svg>
              </button>
            </div>
          </div>

          <div class="list-footer">
            <p v-if="presets.customFieldDefs.length === 0" class="empty-hint">
              {{ t('manage.customField.emptyHint') }}
            </p>
            <p v-else class="count-hint">
              {{ t('manage.customField.count', { count: presets.customFieldDefs.length }) }}
            </p>
          </div>
        </section>
      </main>

      <AppSheet
        v-model="editSheetVisible"
        :lock-scroll="false"
        sheet-class="manage-edit-sheet"
      >
        <div class="edit-form" :style="editSheetStyle">
          <div class="edit-header">
            <span class="edit-title">
              {{ isCreating ? t('manage.customField.createTitle') : t('manage.customField.editTitle') }}
            </span>
            <button type="button" class="edit-close" @click="closeSheet">×</button>
          </div>

          <p class="field-caption">{{ t('manage.customField.nameCaption') }}</p>
          <input
            ref="nameInputRef"
            v-model="draftName"
            class="row-input"
            type="text"
            :maxlength="CUSTOM_FIELD_NAME_MAX"
            :placeholder="t('manage.customField.namePlaceholder')"
            @focus="handleEditInputFocus"
          />

          <p class="field-caption field-caption--gap">{{ t('manage.customField.typeCaption') }}</p>
          <div class="type-grid">
            <button
              v-for="type in CUSTOM_FIELD_TYPES"
              :key="type"
              type="button"
              class="type-option"
              :class="{ 'type-option--active': draftType === type }"
              @click="draftType = type"
            >
              {{ typeLabel(type) }}
            </button>
          </div>

          <template v-if="draftType === 'select'">
            <p class="field-caption field-caption--gap">{{ t('manage.customField.optionsCaption') }}</p>
            <div v-for="(option, index) in draftOptions" :key="index" class="option-row">
              <input
                v-model="draftOptions[index]"
                class="row-input option-input"
                type="text"
                :maxlength="CUSTOM_FIELD_OPTION_LABEL_MAX"
                :placeholder="t('manage.customField.optionPlaceholder')"
              />
              <button
                class="option-remove"
                type="button"
                :aria-label="t('manage.customField.removeOption')"
                @click="removeDraftOption(index)"
              >
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M18 6L6 18" />
                  <path d="M6 6L18 18" />
                </svg>
              </button>
            </div>
            <button
              v-if="draftOptions.length < CUSTOM_FIELD_OPTION_MAX"
              class="option-add"
              type="button"
              @click="addDraftOption"
            >
              {{ t('manage.customField.addOption') }}
            </button>
            <p class="field-hint">{{ t('manage.customField.optionsHint') }}</p>
          </template>

          <p v-if="formError" class="edit-error">{{ formError }}</p>

          <button class="save-btn" type="button" @click="saveSheet">
            {{ t('manage.customField.saveField') }}
          </button>
        </div>
      </AppSheet>
    </div>

    <DangerConfirmDialog
      :show="showDeleteConfirm"
      :title="t('manage.customField.deleteTitle', { name: pendingDeleteName })"
      :description="t('manage.customField.deleteDesc', { count: affectedCount })"
      :confirm-text="t('common.delete')"
      :cancel-text="t('common.cancel')"
      @cancel="cancelDelete"
      @confirm="confirmDelete"
    />
  </div>
</template>

<script setup>
import { computed, nextTick, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useGoodsStore } from '@/stores/goods'
import { usePresetsStore } from '@/stores/presets'
import { useDialogBackButton } from '@/composables/useDialogBackButton'
import { useEditSheet } from '@/composables/manage/useEditSheet'
import {
  CUSTOM_FIELD_NAME_MAX,
  CUSTOM_FIELD_OPTION_LABEL_MAX,
  CUSTOM_FIELD_OPTION_MAX,
  CUSTOM_FIELD_TYPES,
  normalizeCustomFieldDefs
} from '@/utils/goods/customFields'
import NavBar from '@/components/common/NavBar.vue'
import AppSheet from '@/components/common/AppSheet.vue'
import DangerConfirmDialog from '@/components/common/DangerConfirmDialog.vue'

const { t } = useI18n()
const presets = usePresetsStore()
const store = useGoodsStore()

// 每个字段的已填数量：一次遍历算完，避免在模板里对 700+ 商品重复扫描
const fillCountMap = computed(() => {
  const map = new Map()
  for (const item of store.list || []) {
    const fields = item?.customFields
    if (!fields || typeof fields !== 'object') continue
    for (const [defId, value] of Object.entries(fields)) {
      if (!String(value || '').trim()) continue
      map.set(defId, (map.get(defId) || 0) + 1)
    }
  }
  return map
})

function filledCount(defId) {
  return fillCountMap.value.get(defId) || 0
}

function typeLabel(type) {
  return t(`manage.customField.type.${type}`)
}

function rowMeta(def) {
  const filled = t('manage.customField.filledCount', { count: filledCount(def.id) })
  if (def.type !== 'select' || def.options.length === 0) return filled
  return `${filled} · ${def.options.join(' / ')}`
}

// ── 表单（新建 / 编辑共用）──
const editingDefId = ref('')
const draftName = ref('')
const draftType = ref('text')
const draftOptions = ref([])
const formError = ref('')
const nameInputRef = ref(null)

// editingDefId：'' = 关闭；'new' = 新建；其它 = 正在编辑该定义
const isCreating = computed(() => editingDefId.value === 'new')
// 非空即视为打开：复用 useEditSheet 的软键盘 inset 与可见性绑定
const sheetKey = computed(() => editingDefId.value)

function closeSheet() {
  editingDefId.value = ''
  draftName.value = ''
  draftType.value = 'text'
  draftOptions.value = []
  formError.value = ''
}

const { editSheetStyle, editSheetVisible, handleEditInputFocus } = useEditSheet({
  editingKey: sheetKey,
  editInputRef: nameInputRef,
  closeEdit: closeSheet
})

useDialogBackButton(closeSheet, () => sheetKey.value !== '')

async function openCreate() {
  closeSheet()
  editingDefId.value = 'new'
  draftType.value = 'text'
  await nextTick()
  nameInputRef.value?.focus()
}

async function openEdit(def) {
  closeSheet()
  editingDefId.value = def.id
  draftName.value = def.name
  draftType.value = def.type
  draftOptions.value = [...def.options]
  await nextTick()
  nameInputRef.value?.focus()
}

function addDraftOption() {
  if (draftOptions.value.length >= CUSTOM_FIELD_OPTION_MAX) return
  draftOptions.value.push('')
}

function removeDraftOption(index) {
  draftOptions.value.splice(index, 1)
}

/** 只有长度不变时才按位置判定「改名」，否则按「删除旧选项」处理（与用户逐条编辑的习惯一致） */
function resolveOptionChanges(oldOptions, nextOptions) {
  const renames = []
  const removals = []

  if (oldOptions.length === nextOptions.length) {
    oldOptions.forEach((oldOption, index) => {
      if (oldOption !== nextOptions[index]) renames.push([oldOption, nextOptions[index]])
    })
    return { renames, removals }
  }

  const nextSet = new Set(nextOptions)
  for (const oldOption of oldOptions) {
    if (!nextSet.has(oldOption)) removals.push(oldOption)
  }
  return { renames, removals }
}

async function saveSheet() {
  const name = String(draftName.value || '').trim()
  if (!name) {
    formError.value = t('manage.customField.errorEmpty')
    return
  }

  if (isCreating.value) {
    const created = await presets.addCustomFieldDef({
      name,
      type: draftType.value,
      options: draftOptions.value
    })
    if (!created) {
      formError.value = t('manage.customField.errorExists')
      return
    }
    closeSheet()
    return
  }

  const defId = editingDefId.value
  const current = presets.customFieldDefs.find((item) => item.id === defId)
  if (!current) {
    closeSheet()
    return
  }

  if (current.name !== name) {
    const renamed = await presets.updateCustomFieldDefName(defId, name)
    if (!renamed) {
      formError.value = t('manage.customField.errorExists')
      return
    }
  }

  const oldOptions = [...current.options]
  if (current.type !== draftType.value) {
    await presets.updateCustomFieldDefType(defId, draftType.value)
  }

  if (draftType.value === 'select') {
    // 先落定义，再按差异改写已填值（改名级联 / 删选项清值）
    await presets.updateCustomFieldDefOptions(defId, draftOptions.value)
    const nextOptions = normalizeCustomFieldDefs([
      { ...current, type: 'select', options: draftOptions.value }
    ])[0]?.options || []
    const { renames, removals } = resolveOptionChanges(oldOptions, nextOptions)
    for (const [from, to] of renames) {
      await store.renameCustomFieldOptionValue(defId, from, to)
    }
    for (const option of removals) {
      await store.clearCustomFieldValues(defId, option)
    }
  }

  closeSheet()
}

// ── 删除 ──
const showDeleteConfirm = ref(false)
const pendingDelete = ref(null)
const pendingDeleteName = ref('')
const affectedCount = ref(0)

function tryRemove(def) {
  pendingDelete.value = def
  pendingDeleteName.value = def.name
  affectedCount.value = filledCount(def.id)
  showDeleteConfirm.value = true
}

function cancelDelete() {
  showDeleteConfirm.value = false
  pendingDelete.value = null
  pendingDeleteName.value = ''
  affectedCount.value = 0
}

async function confirmDelete() {
  const def = pendingDelete.value
  showDeleteConfirm.value = false
  if (!def) return

  await presets.removeCustomFieldDef(def.id)
  // 值不清理会变成永久孤儿键（不展示但一直随行同步），删除时一并清除
  await store.clearCustomFieldValues(def.id)

  if (editingDefId.value === def.id) closeSheet()
  pendingDelete.value = null
  pendingDeleteName.value = ''
  affectedCount.value = 0
}
</script>

<style scoped>
.page-body { padding-top: 6px; }

.list-section { padding: 0 16px 120px; }

.section-caption {
  margin: 4px 4px 8px;
  color: var(--app-text-tertiary);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.02em;
}

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
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.type-chip {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  background: rgba(142, 142, 147, 0.14);
  color: #6a6e77;
}

.type-text { background: rgba(90, 120, 250, 0.14); color: #355be0; }
.type-select { background: rgba(150, 100, 250, 0.14); color: #7c4dcc; }
.type-number { background: rgba(250, 149, 90, 0.14); color: #d26f20; }
.type-date { background: rgba(52, 168, 130, 0.16); color: #1f8a68; }

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

.row-delete svg { width: 14px; height: 14px; stroke: currentColor; stroke-width: 2.2; stroke-linecap: round; }

.list-footer {
  margin-top: 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}

.count-hint,
.empty-hint {
  color: var(--app-text-tertiary);
  font-size: 13px;
  text-align: center;
}

/* 外壳由 AppSheet 提供；内容区用 padding 补偿键盘高度 */
.edit-form {
  padding-bottom: var(--edit-sheet-keyboard-offset, 0px);
  transition: padding-bottom 0.18s ease;
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

.row-input {
  width: 100%;
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

.field-caption {
  margin-bottom: 8px;
  color: var(--app-text-tertiary);
  font-size: 12px;
  font-weight: 600;
}

.field-caption--gap { margin-top: 16px; }

.field-hint {
  margin-top: 8px;
  color: var(--app-text-tertiary);
  font-size: 12px;
  line-height: 1.5;
}

.type-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}

.type-option {
  height: 38px;
  border: 1px solid transparent;
  border-radius: 12px;
  background: var(--app-surface-soft);
  color: var(--app-text-secondary);
  font-size: 13px;
  font-weight: 600;
}

.type-option--active {
  border-color: rgba(124, 77, 204, 0.4);
  background: rgba(150, 100, 250, 0.14);
  color: #7c4dcc;
}

.option-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.option-input { flex: 1; }

.option-remove {
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

.option-remove svg { width: 13px; height: 13px; stroke: currentColor; stroke-width: 2.2; stroke-linecap: round; }

.option-add {
  width: 100%;
  height: 38px;
  border: 1px dashed rgba(142, 142, 147, 0.4);
  border-radius: 12px;
  background: transparent;
  color: var(--app-text-secondary);
  font-size: 13px;
  font-weight: 600;
}

.edit-error {
  margin-top: 10px;
  font-size: 13px;
  color: #d64545;
}

.save-btn {
  width: 100%;
  min-width: 72px;
  height: 44px;
  margin-top: 14px;
  padding: 0 16px;
  border: none;
  border-radius: 14px;
  background: #141416;
  color: #fff;
  font-size: 14px;
  font-weight: 600;
}

:global(html.theme-dark) .save-btn {
  background: #f5f5f7;
  color: #141416;
}

:global(html.theme-dark) .row-input:focus {
  border-color: rgba(255, 255, 255, 0.15);
}

:global(html.theme-dark) .type-chip {
  background: rgba(142, 142, 147, 0.2);
  color: #a7acb8;
}

:global(html.theme-dark) .type-text { background: rgba(90, 120, 250, 0.2); color: #9db4ff; }
:global(html.theme-dark) .type-select { background: rgba(150, 100, 250, 0.2); color: #c4a1ff; }
:global(html.theme-dark) .type-number { background: rgba(250, 149, 90, 0.2); color: #f2a869; }
:global(html.theme-dark) .type-date { background: rgba(52, 168, 130, 0.22); color: #6fd5b2; }
</style>
