<!--
  EventAddMethodSheet.vue
  底部弹出的「添加活动」方式选择面板（样式对齐谷子 AddMethodSheet）
  用法：<EventAddMethodSheet v-model="showSheet" @manual="..." @import-link="..." />
  解析成功后 emit('import-link', { title, location, coverUrl, dates, dayTickets })，
  由调用方写入 sessionStorage 并跳转 /events/add 预填。
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

      <!-- 场次/票种选择（仅会员购等返回场次时展示）：选中票档即代表导入该日期 -->
      <template v-if="sessionRows.length > 0">
        <p class="session-title">{{ t('events.import.sessionTitle') }}</p>
        <div class="session-list">
          <div v-for="row in sessionRows" :key="row.date" class="session-row" :class="{ 'session-row--checked': isRowSelected(row) }">
            <span class="session-row__main">
              <span class="session-row__date">{{ row.date }}</span>
              <span v-if="row.name" class="session-row__name">{{ row.name }}</span>
            </span>
            <span class="session-row__tickets">
              <template v-if="row.tickets.length > 0">
                <button
                  v-for="(ticket, ticketIndex) in row.tickets"
                  :key="ticketIndex"
                  type="button"
                  class="ticket-chip"
                  :class="{ 'ticket-chip--active': row.ticketIndex === ticketIndex }"
                  @click="toggleTicket(row, ticketIndex)"
                >
                  <span v-if="ticket.name" class="ticket-chip__name">{{ ticket.name }}</span>
                  <span class="ticket-chip__price">¥{{ ticket.price }}</span>
                </button>
              </template>
              <span v-else class="ticket-chip ticket-chip--static">{{ t('events.import.sessionDateOnly') }}</span>
            </span>
          </div>
        </div>
        <p class="session-hint">{{ t('events.import.sessionHint') }}</p>
      </template>

      <button
        v-if="parsed"
        class="link-parse-btn link-fill-btn"
        type="button"
        :disabled="filling"
        @click="handleFillForm"
      >
        {{ filling ? t('events.import.parsing') : t('events.import.fillForm') }}
      </button>
    </template>
  </AppSheet>
</template>

<script setup>
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import AppSheet from '@/components/common/AppSheet.vue'
import { useDialogBackButton } from '@/composables/useDialogBackButton'
import { parseEventCoverFromShareText } from '@/utils/events/eventCoverImport'
import { collectSessionSelection } from '@/utils/events/eventImportPrefill'
import { showGlobalToast } from '@/utils/globalToast'

const { t } = useI18n()

const props = defineProps({
  modelValue: { type: Boolean, default: false }
})

const emit = defineEmits(['update:modelValue', 'manual', 'import-link'])

const view = ref('options')
const linkInput = ref('')
const parsing = ref(false)
const filling = ref(false)
/** @type {import('vue').Ref<Array<{ date: string, name: string, tickets: Array<{name: string, price: string}>, ticketIndex: number }>>} */
const sessionRows = ref([])
const parsed = ref(null)

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
    filling.value = false
    parsed.value = null
    sessionRows.value = []
  }
})

function onManual() {
  close()
  emit('manual')
}

function toggleTicket(row, ticketIndex) {
  row.ticketIndex = row.ticketIndex === ticketIndex ? -1 : ticketIndex
}

/** 该日期是否会导入：选了票档，或该场次本身没有票档数据（只填日期） */
function isRowSelected(row) {
  return row.tickets.length === 0 || row.ticketIndex >= 0
}

async function handleParse() {
  if (parsing.value) return
  parsing.value = true
  parsed.value = null
  sessionRows.value = []
  try {
    const result = await parseEventCoverFromShareText(linkInput.value)
    if (!result.ok) {
      showGlobalToast(t(ERROR_KEYS[result.reason] || 'events.addEdit.coverImportFailNetwork'))
      return
    }
    const sessions = Array.isArray(result.sessions) ? result.sessions : []
    if (sessions.length === 0) {
      // 无场次数据（大麦/猫眼等）：维持原行为，解析完直接进新增页
      close()
      emit('import-link', { title: result.title, location: result.location, coverUrl: result.coverUrl })
      return
    }
    parsed.value = result
    sessionRows.value = sessions.map((session) => ({
      date: session.date,
      name: session.name,
      tickets: session.tickets,
      ticketIndex: -1
    }))
  } catch {
    showGlobalToast(t('events.addEdit.coverImportFailNetwork'))
  } finally {
    parsing.value = false
  }
}

// 确认填入：选中的票档所在日期 → 交调用方进新增页预填
function handleFillForm() {
  if (filling.value || !parsed.value) return
  filling.value = true
  try {
    const { dates, dayTickets } = collectSessionSelection(sessionRows.value)
    close()
    emit('import-link', {
      title: parsed.value.title,
      location: parsed.value.location,
      coverUrl: parsed.value.coverUrl,
      dates,
      dayTickets
    })
  } finally {
    filling.value = false
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

.link-fill-btn {
  margin-top: 12px;
}

/* ---- 场次/票种选择 ---- */
.session-title {
  margin: 16px 0 10px;
  font-size: var(--font-body);
  font-weight: 600;
  color: var(--app-text, #141416);
}

.session-list {
  display: flex;
  flex-direction: column;
  background: color-mix(in srgb, var(--app-glass) 76%, var(--app-surface));
  border: 1px solid color-mix(in srgb, var(--app-border) 78%, transparent);
  border-radius: var(--radius-card);
  overflow: hidden;
  max-height: 260px;
  overflow-y: auto;
  overscroll-behavior: contain;
  /* 细滚动条，覆盖 Windows 原生滚动条（带上下箭头按钮，很突兀） */
  scrollbar-width: thin;
  scrollbar-color: color-mix(in srgb, var(--app-text) 18%, transparent) transparent;
}

.session-list::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

.session-list::-webkit-scrollbar-track {
  background: transparent;
}

.session-list::-webkit-scrollbar-thumb {
  border: 2px solid transparent;
  border-radius: var(--radius-pill);
  background: color-mix(in srgb, var(--app-text) 18%, transparent);
  background-clip: padding-box;
}

.session-list::-webkit-scrollbar-thumb:hover {
  background: color-mix(in srgb, var(--app-text) 28%, transparent);
  background-clip: padding-box;
}

.session-list::-webkit-scrollbar-button {
  display: none;
  width: 0;
  height: 0;
}

.session-row {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 14px;
  transition: background 0.14s ease;
}

.session-row + .session-row {
  border-top: 1px solid rgba(142, 142, 147, 0.15);
}

.session-row--checked {
  background: color-mix(in srgb, var(--app-primary) 4%, transparent);
}

.session-row__main {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.session-row__date {
  flex-shrink: 0;
  font-size: var(--font-body);
  font-weight: 600;
  color: var(--app-text, #141416);
}

.session-row__name {
  min-width: 0;
  font-size: var(--font-small);
  color: var(--app-text-tertiary, #8e8e93);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.session-row__tickets {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.ticket-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px;
  border: 1px solid color-mix(in srgb, var(--app-border) 88%, transparent);
  border-radius: var(--radius-pill);
  background: var(--app-surface);
  font-size: var(--font-small);
  color: var(--app-text-secondary);
  cursor: pointer;
  transition: border-color 0.14s ease, background 0.14s ease, color 0.14s ease;
}

.ticket-chip--active {
  border-color: var(--app-primary);
  background: var(--app-primary);
  color: var(--app-surface);
}

/* 无票档数据的场次：固定只填日期，不可点选 */
.ticket-chip--static {
  border-style: dashed;
  color: var(--app-text-tertiary, #8e8e93);
  cursor: default;
}

.ticket-chip__name {
  max-width: 120px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ticket-chip__price {
  font-weight: 600;
  white-space: nowrap;
}

.session-hint {
  margin: 8px 0 0;
  font-size: var(--font-small);
  color: var(--app-text-tertiary, #8e8e93);
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
