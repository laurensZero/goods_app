<template>
  <AppSheet
    :model-value="modelValue"
    sheet-class="batch-defaults-sheet"
    @update:model-value="(v) => { if (!v) close() }"
  >
    <p class="sheet-title">{{ t('common.aria.setDefaults') }}</p>

    <div class="sheet-options">
      <label class="field">
        <span class="field-label">IP</span>
        <AppSelect v-model="local.ip" :options="ipOptions" :placeholder="t('goods.editor.ipPlaceholder')" />
      </label>
      <label class="field">
        <span class="field-label">{{ t('common.category') }}</span>
        <AppSelect v-model="local.category" :options="categoryOptions" :placeholder="t('goods.editor.categoryPlaceholder')" />
      </label>
      <label class="field">
        <span class="field-label">{{ t('common.price') }}</span>
        <input v-model="local.price" type="text" inputmode="decimal" placeholder="0.00" />
      </label>
    </div>

    <p class="sheet-hint">{{ t('goods.batch.defaultsScopeHint') }}</p>

    <button class="sheet-apply" type="button" @click="apply">{{ t('goods.batch.applyChanges') }}</button>
    <button class="sheet-cancel" type="button" @click="close">{{ t('common.cancel') }}</button>
  </AppSheet>
</template>

<script setup>
import { reactive, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import AppSheet from '@/components/common/AppSheet.vue'
import AppSelect from '@/components/common/AppSelect.vue'
import { useDialogBackButton } from '@/composables/useDialogBackButton'

const { t } = useI18n()

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  ipOptions: { type: Array, default: () => [] },
  categoryOptions: { type: Array, default: () => [] },
  defaults: { type: Object, default: () => ({ ip: '', category: '', price: '' }) }
})

const emit = defineEmits(['update:modelValue', 'apply'])

const local = reactive({ ip: '', category: '', price: '' })

watch(() => props.modelValue, (open) => {
  if (open) {
    local.ip = props.defaults.ip || ''
    local.category = props.defaults.category || ''
    local.price = props.defaults.price || ''
  }
})

function close() {
  emit('update:modelValue', false)
}

useDialogBackButton(close, () => props.modelValue)

function apply() {
  emit('apply', { ip: local.ip, category: local.category, price: local.price })
  close()
}
</script>

<style scoped>
/* 外壳由 AppSheet 提供；此处只保留内容样式 */

/* 宽屏 center 时覆盖 AppSheet 默认宽度（原 480px） */
:global(.app-sheet-overlay--center .batch-defaults-sheet.app-sheet--center) {
  width: min(480px, calc(100vw - 48px)) !important;
}

/* 标题 */
.sheet-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--app-text-tertiary, #8e8e93);
  text-align: center;
  margin: 0 0 14px;
}

/* ---- 字段卡片 ---- */
.sheet-options {
  background: color-mix(in srgb, var(--app-glass) 76%, var(--app-surface));
  border: 1px solid color-mix(in srgb, var(--app-border) 78%, transparent);
  border-radius: 18px;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 10px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--app-text);
}

.field input {
  width: 100%;
  height: 48px;
  border: 1px solid transparent;
  border-radius: 14px;
  background: var(--app-surface);
  color: var(--app-text);
  font-size: 16px;
  padding: 0 14px;
  outline: none;
  transition: border-color 0.16s ease, background 0.16s ease;
  box-sizing: border-box;
}

.field input::placeholder {
  color: var(--app-placeholder, rgba(142, 142, 147, 0.6));
}

.field input:focus {
  border-color: color-mix(in srgb, var(--app-text) 16%, transparent);
  background: var(--app-surface);
}

/* ---- 作用范围说明 ---- */
.sheet-hint {
  margin: 0 4px 12px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--app-text-tertiary, #8e8e93);
}

/* ---- 应用按钮 ---- */
.sheet-apply {
  height: 54px;
  width: 100%;
  border: none;
  border-radius: 18px;
  background: var(--app-text);
  color: var(--app-surface);
  font-size: 16px;
  font-weight: 600;
  letter-spacing: -0.02em;
  transition: background 0.14s ease;
  margin-bottom: 8px;
}

.sheet-apply:active {
  opacity: 0.85;
}

/* ---- 取消按钮 ---- */
.sheet-cancel {
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

.sheet-cancel:active {
  background: rgba(142, 142, 147, 0.18);
}

/* 宽屏 center 时隐藏取消按钮（与原 900px 断点行为一致） */
:global(.app-sheet-overlay--center) .sheet-cancel {
  display: none;
}

/* ---- 暗色模式 ---- */
:global(html.theme-dark) .sheet-options {
  background: color-mix(in srgb, var(--app-glass) 58%, var(--app-surface));
}

:global(html.theme-dark) .field input {
  background: color-mix(in srgb, var(--app-surface) 96%, var(--app-glass));
}

:global(html.theme-dark) .sheet-apply {
  background: #f5f5f7;
  color: #141416;
}

:global(html.theme-dark) .sheet-cancel {
  background: color-mix(in srgb, var(--app-glass) 58%, var(--app-surface));
}
</style>
