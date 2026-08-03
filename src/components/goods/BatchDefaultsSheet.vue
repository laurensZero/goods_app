<template>
  <Teleport to="body">
    <Transition name="sheet-pop">
      <div v-if="modelValue" class="sheet-backdrop" @click="close" />
    </Transition>
    <Transition name="sheet-pop" @after-leave="onAfterLeave">
      <div v-if="modelValue" class="sheet-panel" role="dialog" aria-modal="true" :aria-label="t('common.aria.setDefaults')">
        <div class="sheet-handle" aria-hidden="true" />
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
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { reactive, watch } from 'vue'
import { useI18n } from 'vue-i18n'
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

function onAfterLeave() {}

function apply() {
  emit('apply', { ip: local.ip, category: local.category, price: local.price })
  close()
}
</script>

<style scoped>
/* ---- 遮罩 ---- */
.sheet-backdrop {
  position: fixed;
  inset: 0;
  z-index: 80;
  background: var(--app-overlay);
  backdrop-filter: blur(14px) saturate(120%);
  -webkit-backdrop-filter: blur(14px) saturate(120%);
}

/* ---- 面板 ---- */
.sheet-panel {
  position: fixed;
  left: 50%;
  bottom: 0;
  transform: translateX(-50%);
  width: min(100vw, 480px);
  z-index: 90;
  background: color-mix(in srgb, var(--app-glass-strong) 92%, var(--app-surface));
  border: 1px solid var(--app-glass-border);
  box-shadow:
    0 22px 54px color-mix(in srgb, var(--app-text) 14%, transparent),
    0 0 0 1px color-mix(in srgb, var(--app-text) 4%, transparent);
  border-radius: 24px 24px 0 0;
  padding: 12px 16px max(24px, env(safe-area-inset-bottom));
  display: flex;
  flex-direction: column;
  gap: 0;
  max-height: 90dvh;
  overflow-y: auto;
  scrollbar-width: none;
}

.sheet-panel::-webkit-scrollbar {
  display: none;
}

/* 顶部手柄 */
.sheet-handle {
  width: 36px;
  height: 4px;
  border-radius: 4px;
  background: rgba(142, 142, 147, 0.28);
  margin: 0 auto 16px;
  flex-shrink: 0;
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

/* ── 平板：居中对话框 ── */
@media (min-width: 900px) {
  .sheet-panel {
    bottom: auto;
    top: 50%;
    transform: translateX(-50%) translateY(-50%);
    border-radius: 24px;
    max-height: 90dvh;
    overflow: visible;
  }

  .sheet-options {
    overflow: visible;
  }

  .sheet-handle {
    display: none;
  }

  .sheet-cancel {
    display: none;
  }

  .sheet-slide-enter-from,
  .sheet-slide-leave-to {
    transform: translateX(-50%) translateY(-50%) scale(0.94);
    opacity: 0;
  }
}

/* ---- 暗色模式 ---- */
:global(html.theme-dark) .sheet-panel {
  background: color-mix(in srgb, var(--app-glass-strong) 94%, var(--app-surface));
  box-shadow:
    0 24px 56px rgba(0, 0, 0, 0.42),
    0 0 0 1px rgba(255, 255, 255, 0.04);
}

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
