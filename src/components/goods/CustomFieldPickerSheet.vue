<!--
  CustomFieldPickerSheet.vue
  谷子编辑页：选择要添加到当前商品的「自定义字段」，或就地快速新建。
  版式对齐 AddMethodSheet（sheet-title / sheet-options / sheet-option / sheet-cancel）。
-->
<template>
  <AppSheet
    :model-value="modelValue"
    sheet-class="custom-field-picker-sheet"
    @update:model-value="(v) => { if (!v) close() }"
    @closed="resetView"
  >
    <!-- ============ 选择已有字段 ============ -->
    <template v-if="view === 'pick'">
      <p class="sheet-title">{{ t('goods.editor.customFieldPickerTitle') }}</p>

      <div v-if="available.length > 0" class="sheet-options">
        <template v-for="(def, idx) in available" :key="def.id">
          <button class="sheet-option" type="button" @click="onPick(def)">
            <span class="option-icon">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M4 6h16" />
                <path d="M4 12h10" />
                <path d="M4 18h7" />
              </svg>
            </span>
            <div class="option-body">
              <p class="option-title">{{ def.name }}</p>
              <p class="option-desc">{{ typeLabel(def.type) }}</p>
            </div>
            <svg class="option-arrow" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M9 6l6 6-6 6" />
            </svg>
          </button>
          <div v-if="idx < available.length - 1" class="sheet-divider" />
        </template>
      </div>
      <p v-else class="sheet-empty">{{ t('goods.editor.customFieldPickerEmpty') }}</p>

      <button class="sheet-cancel" type="button" @click="view = 'create'">
        {{ t('goods.editor.customFieldQuickCreate') }}
      </button>
      <button v-if="available.length > 0" class="sheet-cancel sheet-cancel--ghost" type="button" @click="close">
        {{ t('common.cancel') }}
      </button>
    </template>

    <!-- ============ 快速新建 ============ -->
    <template v-else>
      <p class="sheet-title">{{ t('goods.editor.customFieldQuickCreate') }}</p>

      <div class="create-body">
        <input
          ref="nameInputRef"
          v-model="draftName"
          class="sheet-input"
          type="text"
          :maxlength="CUSTOM_FIELD_NAME_MAX"
          :placeholder="t('goods.editor.customFieldQuickName')"
        />

        <div class="type-grid">
          <button
            v-for="type in CUSTOM_FIELD_TYPES"
            :key="type"
            class="type-chip"
            :class="{ 'type-chip--active': draftType === type }"
            type="button"
            @click="draftType = type"
          >
            {{ typeLabel(type) }}
          </button>
        </div>

        <input
          v-if="draftType === 'select'"
          v-model="draftOptionsText"
          class="sheet-input"
          type="text"
          :placeholder="t('goods.editor.customFieldQuickOptions')"
        />

        <p v-if="errorMessage" class="sheet-error">{{ errorMessage }}</p>
      </div>

      <button class="sheet-confirm" type="button" @click="submitCreate">
        {{ t('goods.editor.customFieldQuickSubmit') }}
      </button>
      <button v-if="available.length > 0 || hasAttached" class="sheet-cancel" type="button" @click="view = 'pick'">
        {{ t('common.back') }}
      </button>
    </template>
  </AppSheet>
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { usePresetsStore } from '@/stores/presets'
import { useDialogBackButton } from '@/composables/useDialogBackButton'
import {
  CUSTOM_FIELD_NAME_MAX,
  CUSTOM_FIELD_TYPES
} from '@/utils/goods/customFields'
import AppSheet from '@/components/common/AppSheet.vue'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  /** 当前商品已添加的字段 id（用于过滤掉不可再选的定义） */
  attachedIds: { type: Array, default: () => [] }
})

const emit = defineEmits(['update:modelValue', 'pick'])

const { t } = useI18n()
const presets = usePresetsStore()

const view = ref('pick')
const draftName = ref('')
const draftType = ref('text')
const draftOptionsText = ref('')
const errorMessage = ref('')
const nameInputRef = ref(null)

const hasAttached = computed(() => props.attachedIds.length > 0)

const available = computed(() => {
  const attached = new Set(props.attachedIds)
  return presets.customFieldDefs.filter((def) => !attached.has(def.id))
})

function typeLabel(type) {
  return t(`manage.customField.type.${type}`)
}

function close() {
  emit('update:modelValue', false)
}

function resetView() {
  view.value = 'pick'
  draftName.value = ''
  draftType.value = 'text'
  draftOptionsText.value = ''
  errorMessage.value = ''
}

function onPick(def) {
  emit('pick', def.id)
  close()
}

async function submitCreate() {
  const name = String(draftName.value || '').trim()
  if (!name) {
    errorMessage.value = t('manage.customField.errorEmpty')
    return
  }

  const options = draftType.value === 'select'
    ? String(draftOptionsText.value || '').split(/[,，、]/).map((item) => item.trim()).filter(Boolean)
    : []

  try {
    const created = await presets.addCustomFieldDef({ name, type: draftType.value, options })
    if (!created) {
      errorMessage.value = t('manage.customField.errorExists')
      return
    }
    emit('pick', created.id)
    close()
  } catch (error) {
    console.error('[custom fields] quick create failed:', error)
    errorMessage.value = String(error?.message || error)
  }
}

watch(() => props.modelValue, (open) => {
  if (!open) return
  // 一个可选项都没有时直接进新建视图，少一次点击
  view.value = available.value.length === 0 ? 'create' : 'pick'
  if (view.value === 'create') {
    nextTick(() => nameInputRef.value?.focus())
  }
})

useDialogBackButton(close, () => props.modelValue)
</script>

<style scoped>
/* 外壳由 AppSheet 提供；此处只保留内容样式（对齐 AddMethodSheet） */
:global(.app-sheet-overlay--center .custom-field-picker-sheet.app-sheet--center) {
  width: min(480px, calc(100vw - 48px)) !important;
}

.sheet-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--app-text-tertiary, #8e8e93);
  text-align: center;
  margin: 0 0 14px;
}

.sheet-options {
  background: color-mix(in srgb, var(--app-glass) 76%, var(--app-surface));
  border: 1px solid color-mix(in srgb, var(--app-border) 78%, transparent);
  border-radius: 18px;
  overflow: hidden;
  margin-bottom: 10px;
  max-height: 46vh;
  overflow-y: auto;
}

.sheet-divider {
  height: 1px;
  margin: 0 16px;
  background: rgba(142, 142, 147, 0.15);
}

.sheet-option {
  display: flex;
  align-items: center;
  width: 100%;
  gap: 14px;
  padding: 14px 16px;
  background: transparent;
  border: none;
  text-align: left;
  transition: background 0.14s ease;
}

.sheet-option:active {
  background: rgba(142, 142, 147, 0.12);
}

.option-icon {
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(150, 100, 250, 0.12);
}

.option-icon svg {
  width: 20px;
  height: 20px;
  stroke: #7c4dcc;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.option-body {
  flex: 1;
  min-width: 0;
}

.option-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--app-text, #141416);
  margin: 0 0 2px;
}

.option-desc {
  font-size: 13px;
  color: var(--app-text-tertiary, #8e8e93);
  margin: 0;
}

.option-arrow {
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  stroke: var(--app-text-tertiary, #8e8e93);
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.sheet-empty {
  margin: 0 0 12px;
  padding: 14px 16px;
  border-radius: 18px;
  background: color-mix(in srgb, var(--app-glass) 76%, var(--app-surface));
  border: 1px solid color-mix(in srgb, var(--app-border) 78%, transparent);
  color: var(--app-text-tertiary);
  font-size: 13px;
  line-height: 1.5;
  text-align: center;
}

.sheet-cancel,
.sheet-confirm {
  height: 54px;
  width: 100%;
  border: none;
  border-radius: 18px;
  background: color-mix(in srgb, var(--app-glass) 78%, var(--app-surface));
  border: 1px solid color-mix(in srgb, var(--app-border) 72%, transparent);
  font-size: 16px;
  font-weight: 600;
  color: var(--app-text, #141416);
  transition: background 0.14s ease;
}

.sheet-cancel:active,
.sheet-confirm:active {
  background: rgba(142, 142, 147, 0.18);
}

.sheet-cancel + .sheet-cancel,
.sheet-confirm + .sheet-cancel {
  margin-top: 8px;
}

.sheet-cancel--ghost {
  background: transparent;
  border-color: transparent;
  color: var(--app-text-tertiary);
}

.sheet-confirm {
  margin-top: 10px;
  background: var(--app-text, #141416);
  color: var(--app-surface, #fff);
  border-color: transparent;
}

.sheet-confirm:active {
  background: color-mix(in srgb, var(--app-text) 84%, transparent);
}

.create-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.sheet-input {
  width: 100%;
  height: 48px;
  padding: 0 14px;
  border: 1px solid color-mix(in srgb, var(--app-border) 72%, transparent);
  border-radius: 14px;
  background: color-mix(in srgb, var(--app-surface-soft) 86%, var(--app-surface));
  color: var(--app-text);
  font-size: 15px;
  outline: none;
}

.sheet-input:focus {
  border-color: color-mix(in srgb, var(--app-text) 18%, transparent);
}

.type-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}

.type-chip {
  height: 40px;
  border: 1px solid rgba(20, 20, 22, 0.08);
  border-radius: 999px;
  background: var(--app-surface);
  color: var(--app-text-secondary);
  font-size: 13px;
  font-weight: 600;
}

.type-chip--active {
  border-color: color-mix(in srgb, var(--app-chip-accent-text) 42%, transparent);
  background: color-mix(in srgb, var(--app-chip-accent-text) 12%, var(--app-surface));
  color: var(--app-chip-accent-text);
}

.sheet-error {
  margin: 0;
  color: var(--app-danger, #d64545);
  font-size: 13px;
}

:global(html.theme-dark) .sheet-options,
:global(html.theme-dark) .sheet-empty,
:global(html.theme-dark) .sheet-cancel {
  background: color-mix(in srgb, var(--app-glass) 58%, var(--app-surface));
}

:global(html.theme-dark) .sheet-option:active,
:global(html.theme-dark) .sheet-cancel:active {
  background: rgba(255, 255, 255, 0.06);
}

:global(html.theme-dark) .sheet-input {
  background: color-mix(in srgb, var(--app-surface) 94%, var(--app-glass));
}

:global(html.theme-dark) .sheet-confirm {
  background: #f5f5f7;
  color: #141416;
}
</style>
