<!--
  EventAddMethodSheet.vue
  底部弹出的「添加活动」方式选择面板（样式对齐谷子 AddMethodSheet）
  用法：<EventAddMethodSheet v-model="showSheet" @manual="..." @import-link="..." />
  解析成功后 emit('import-link', { title, location, coverUrl })，由调用方跳转
  /events/add 预填。
-->
<template>
  <AppSheet
    :model-value="modelValue"
    sheet-class="event-add-method-sheet"
    @update:model-value="(v) => { if (!v) close() }"
    @closed="view = 'options'"
  >
    <!-- ============ 方式选择 ============ -->
    <template v-if="view === 'options'">
      <p class="sheet-title">{{ t('events.addMethod.title') }}</p>

      <div class="sheet-options">
        <!-- 手动添加 -->
        <button class="sheet-option" type="button" @click="onManual">
          <span class="option-icon option-icon--manual">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <rect x="4" y="4" width="16" height="16" rx="3" />
              <path d="M8 12H16" />
              <path d="M12 8V16" />
            </svg>
          </span>
          <div class="option-body">
            <p class="option-title">{{ t('events.addMethod.manualAdd') }}</p>
            <p class="option-desc">{{ t('events.addMethod.manualAddDesc') }}</p>
          </div>
          <svg class="option-arrow" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M9 6l6 6-6 6" />
          </svg>
        </button>

        <div class="sheet-divider" />

        <!-- 从链接导入 -->
        <button class="sheet-option" type="button" @click="view = 'link-import'">
          <span class="option-icon option-icon--link">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
              stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
            </svg>
          </span>
          <div class="option-body">
            <p class="option-title">{{ t('events.addMethod.importFromLink') }}</p>
            <p class="option-desc">{{ t('events.addMethod.importFromLinkDesc') }}</p>
          </div>
          <svg class="option-arrow" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M9 6l6 6-6 6" />
          </svg>
        </button>
      </div>

      <button class="sheet-cancel" type="button" @click="close">{{ t('common.cancel') }}</button>
    </template>

    <!-- ============ 从链接导入 ============ -->
    <template v-else>
      <div class="link-header">
        <button class="link-back" type="button" @click="view = 'options'">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M15 6l-6 6 6 6" />
          </svg>
        </button>
        <p class="link-title">{{ t('events.import.title') }}</p>
      </div>

      <div class="link-input-card">
        <textarea
          v-model="linkInput"
          class="link-input"
          rows="3"
          :placeholder="t('events.import.placeholder')"
          autocapitalize="off"
          autocomplete="off"
          autocorrect="off"
          spellcheck="false"
        />
        <p class="link-hint">{{ t('events.import.hint') }}</p>
        <button class="link-parse-btn" type="button" :disabled="parsing || !linkInput.trim()" @click="handleParse">
          <span v-if="parsing" class="link-spinner" aria-hidden="true" />
          {{ parsing ? t('events.import.parsing') : t('events.import.parse') }}
        </button>
      </div>
    </template>
  </AppSheet>
</template>

<script setup>
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import AppSheet from '@/components/common/AppSheet.vue'
import { useDialogBackButton } from '@/composables/useDialogBackButton'
import { parseEventCoverFromShareText } from '@/utils/events/eventCoverImport'
import { showGlobalToast } from '@/utils/globalToast'

const { t } = useI18n()

const props = defineProps({
  modelValue: { type: Boolean, default: false }
})

const emit = defineEmits(['update:modelValue', 'manual', 'import-link'])

const view = ref('options')
const linkInput = ref('')
const parsing = ref(false)

const ERROR_KEYS = {
  noUrl: 'events.addEdit.coverImportFailNoUrl',
  unsupported: 'events.addEdit.coverImportFailUnsupported',
  noCover: 'events.addEdit.coverImportFailNoCover',
  network: 'events.addEdit.coverImportFailNetwork'
}

function close() {
  emit('update:modelValue', false)
}

useDialogBackButton(() => close(), () => props.modelValue)

watch(view, (next) => {
  if (next === 'link-import') {
    linkInput.value = ''
    parsing.value = false
  }
})

function onManual() {
  close()
  emit('manual')
}

async function handleParse() {
  if (parsing.value) return
  parsing.value = true
  try {
    const result = await parseEventCoverFromShareText(linkInput.value)
    if (!result.ok) {
      showGlobalToast(t(ERROR_KEYS[result.reason] || 'events.addEdit.coverImportFailNetwork'))
      return
    }
    // 解析成功：收起弹层，交给调用方直接进活动新增页预填
    close()
    emit('import-link', { title: result.title, location: result.location, coverUrl: result.coverUrl })
  } catch {
    showGlobalToast(t('events.addEdit.coverImportFailNetwork'))
  } finally {
    parsing.value = false
  }
}
</script>

<style scoped>
/* 外壳由 AppSheet 提供；样式对齐 goods/AddMethodSheet */

/* 宽屏 center 时覆盖 AppSheet 默认宽度 */
:global(.app-sheet-overlay--center .event-add-method-sheet.app-sheet--center) {
  width: min(480px, calc(100vw - 48px)) !important;
}

/* 标题 */
.sheet-title {
  font-size: var(--font-title);
  font-weight: 700;
  color: var(--app-text, #141416);
  text-align: center;
  margin: 0 0 14px;
}

/* ---- 选项卡片 ---- */
.sheet-options {
  background: color-mix(in srgb, var(--app-glass) 76%, var(--app-surface));
  border: 1px solid color-mix(in srgb, var(--app-border) 78%, transparent);
  border-radius: var(--radius-card);
  overflow: hidden;
  margin-bottom: 10px;
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

/* 选项图标 */
.option-icon {
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  border-radius: var(--radius-xs);
  display: flex;
  align-items: center;
  justify-content: center;
}

.option-icon--manual {
  background: rgba(90, 120, 250, 0.12);
}

.option-icon--manual svg {
  width: 22px;
  height: 22px;
  stroke: #5a78fa;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.option-icon--link {
  background: rgba(50, 200, 140, 0.12);
}

.option-icon--link svg {
  width: 22px;
  height: 22px;
  stroke: #28c880;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.option-body {
  flex: 1;
  min-width: 0;
}

.option-title {
  font-size: var(--font-title);
  font-weight: 600;
  color: var(--app-text, #141416);
  margin: 0 0 2px;
}

.option-desc {
  font-size: var(--font-body);
  color: var(--app-text-tertiary, #8e8e93);
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
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

/* ---- 取消按钮 ---- */
.sheet-cancel {
  height: 54px;
  width: 100%;
  border-radius: var(--radius-card);
  background: color-mix(in srgb, var(--app-glass) 78%, var(--app-surface));
  border: 1px solid color-mix(in srgb, var(--app-border) 72%, transparent);
  font-size: var(--font-title);
  font-weight: 600;
  color: var(--app-text, #141416);
  transition: background 0.14s ease;
}

.sheet-cancel:active {
  background: rgba(142, 142, 147, 0.18);
}

/* ============ 从链接导入视图 ============ */
.link-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;
}

.link-back {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: color-mix(in srgb, var(--app-glass) 70%, var(--app-surface));
  cursor: pointer;
}

.link-back svg {
  width: 18px;
  height: 18px;
  stroke: var(--app-text);
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.link-title {
  margin: 0;
  font-size: var(--font-title);
  font-weight: 700;
  color: var(--app-text, #141416);
}

.link-input-card {
  background: color-mix(in srgb, var(--app-glass) 76%, var(--app-surface));
  border: 1px solid color-mix(in srgb, var(--app-border) 78%, transparent);
  border-radius: var(--radius-card);
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.link-input {
  width: 100%;
  padding: 12px 14px;
  border: 1px solid color-mix(in srgb, var(--app-border) 88%, transparent);
  border-radius: var(--radius-card);
  background: var(--app-surface);
  color: var(--app-text);
  font-size: var(--font-subtitle);
  resize: none;
  transition: border-color 0.16s ease, box-shadow 0.16s ease;
}

.link-input:focus-visible {
  outline: none;
  border-color: color-mix(in srgb, var(--app-text) 18%, transparent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--app-text) 8%, transparent);
}

.link-hint {
  margin: 0;
  font-size: var(--font-small);
  color: var(--app-text-tertiary, #8e8e93);
}

.link-parse-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 46px;
  border: none;
  border-radius: var(--radius-card);
  background: var(--app-primary);
  color: var(--app-surface);
  font-size: var(--font-title);
  font-weight: 600;
  transition: opacity 0.16s ease;
}

.link-parse-btn:disabled {
  opacity: 0.5;
  cursor: default;
}

.link-spinner {
  width: 14px;
  height: 14px;
  border: 2px solid color-mix(in srgb, var(--app-surface) 40%, transparent);
  border-top-color: var(--app-surface);
  border-radius: 50%;
  animation: link-parse-spin 0.8s linear infinite;
}

@keyframes link-parse-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
