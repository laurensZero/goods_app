<!--
  TrackPagePickerSheet.vue
  B 站多P视频的分P选择面板：支持多选，确认按页码升序返回，
  选中多P时由调用方按顺序生成多条曲目实现连播。
-->
<template>
  <AppSheet
    :model-value="modelValue"
    :sheet-class="'track-page-picker'"
    @update:model-value="(v) => { if (!v) cancel() }"
  >
    <p class="sheet-title">{{ t('events.tracks.selectPageTitle') }}</p>
    <p class="sheet-hint">{{ t('events.tracks.selectPageHint') }}</p>
    <p v-if="error" class="sheet-error">{{ t('events.tracks.loadPagesFailed') }}</p>

    <div class="sheet-pages">
      <button
        v-for="item in pages"
        :key="item.page"
        type="button"
        class="sheet-page"
        :class="{ 'sheet-page--selected': selectedPages[item.page] }"
        @click="toggle(item.page)"
      >
        <span class="sheet-page__check" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none">
            <path d="M5 12l5 5L20 7" />
          </svg>
        </span>
        <span class="sheet-page__num">P{{ item.page }}</span>
        <span class="sheet-page__part">{{ item.part || t('events.tracks.unnamedTrack') }}</span>
        <span v-if="item.durationMs" class="sheet-page__duration">{{ formatTrackDuration(item.durationMs) }}</span>
      </button>
    </div>

    <button
      type="button"
      class="sheet-confirm"
      :disabled="!Object.keys(selectedPages).length"
      @click="confirm('merge')"
    >{{ t('events.tracks.mergePlayBtn') }}</button>
    <button
      type="button"
      class="sheet-confirm sheet-confirm--split"
      :disabled="!Object.keys(selectedPages).length"
      @click="confirm('split')"
    >{{ t('events.tracks.splitAddBtn') }}</button>
    <button type="button" class="sheet-cancel" @click="cancel">{{ t('common.cancel') }}</button>
  </AppSheet>
</template>

<script setup>
import { reactive, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import AppSheet from '@/components/common/AppSheet.vue'
import { useDialogBackButton } from '@/composables/useDialogBackButton'
import { formatTrackDuration } from '@/utils/music/neteaseMusic'

const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false
  },
  pages: {
    type: Array,
    default: () => []
  },
  error: {
    type: Boolean,
    default: false
  },
  // 打开时预先勾选的分P（改分P时回显当前选中）
  preselected: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits(['update:modelValue', 'confirm', 'cancel'])

const { t } = useI18n()

// Set 在 reactive 里走代理不稳定，用普通对象按页码记选中态
const selectedPages = reactive({})

function clearSelection() {
  for (const key of Object.keys(selectedPages)) delete selectedPages[key]
}

watch(() => props.modelValue, (visible) => {
  if (!visible) return
  clearSelection()
  // 回显当前已选的分P
  for (const page of props.preselected || []) {
    const num = Math.floor(Number(page) || 0)
    if (num > 0) selectedPages[num] = true
  }
})

function toggle(page) {
  if (selectedPages[page]) delete selectedPages[page]
  else selectedPages[page] = true
}

function confirm(mode) {
  const pages = Object.keys(selectedPages)
    .map((key) => Number(key))
    .filter((page) => Number.isFinite(page) && page > 0)
    .sort((left, right) => left - right)
  emit('confirm', pages, mode)
  emit('update:modelValue', false)
}

function cancel() {
  emit('cancel')
  emit('update:modelValue', false)
}

useDialogBackButton(cancel, () => props.modelValue)
</script>

<style scoped>
.sheet-title {
  color: var(--app-text);
  font-size: 17px;
  font-weight: 700;
}

.sheet-hint {
  margin-top: 4px;
  color: var(--app-text-tertiary);
  font-size: 12px;
  line-height: 1.6;
}

.sheet-error {
  margin-top: 4px;
  color: #c34a4a;
  font-size: 12px;
}

.sheet-pages {
  display: grid;
  gap: 8px;
  max-height: 46vh;
  margin-top: 12px;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.sheet-page {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-width: 0;
  padding: 12px 14px;
  border: 1px solid color-mix(in srgb, var(--app-border) 86%, transparent);
  border-radius: 16px;
  background: var(--app-surface);
  text-align: left;
  transition: border-color 160ms ease, background 160ms ease;
}

.sheet-page--selected {
  border-color: #fb7299;
  background: rgba(251, 114, 153, 0.08);
}

.sheet-page__check {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  border: 1.5px solid var(--app-border);
  border-radius: 7px;
  color: transparent;
  transition: background 160ms ease, border-color 160ms ease, color 160ms ease;
}

.sheet-page--selected .sheet-page__check {
  border-color: #fb7299;
  background: #fb7299;
  color: #fff;
}

.sheet-page__check svg {
  width: 13px;
  height: 13px;
  stroke: currentColor;
  stroke-width: 2.4;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.sheet-page__num {
  flex-shrink: 0;
  color: #e85c86;
  font-size: 13px;
  font-weight: 700;
}

.sheet-page__part {
  min-width: 0;
  overflow: hidden;
  color: var(--app-text);
  font-size: 14px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sheet-page__duration {
  flex-shrink: 0;
  margin-left: auto;
  color: var(--app-text-tertiary);
  font-size: 12px;
}

.sheet-confirm,
.sheet-cancel {
  width: 100%;
  height: 46px;
  margin-top: 12px;
  border: none;
  border-radius: 16px;
  font-size: 15px;
  font-weight: 600;
}

.sheet-confirm {
  background: #141416;
  color: #fff;
}

.sheet-confirm:disabled {
  opacity: 0.45;
}

.sheet-confirm--split {
  margin-top: 8px;
  background: var(--app-surface);
  color: var(--app-text);
}

.sheet-cancel {
  margin-top: 8px;
  background: var(--app-surface);
  color: var(--app-text-secondary);
}
</style>
