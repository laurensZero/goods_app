<template>
  <div class="status-timeline-editor">
    <div v-if="entries.length === 0" class="timeline-empty">
      <p class="timeline-empty__text">{{ t('goods.detail.statusTimelineEmpty') }}</p>
      <p class="timeline-empty__hint">{{ t('goods.editor.timelineHint') }}</p>
    </div>

    <div v-else class="timeline-list">
      <div
        v-for="(entry, index) in entries"
        :key="`entry-${entry.at}-${entry.status}-${index}`"
        class="timeline-item"
      >
        <div class="timeline-item__fields">
          <div class="timeline-item__row">
            <AppSelect
              :model-value="entry.status"
              :options="collectStatusOptions"
              :placeholder="t('goods.editor.selectStatus')"
              @update:model-value="updateEntry(index, 'status', $event)"
            />
            <button
              type="button"
              class="timeline-item__date-btn"
              @click="openDatePicker(index)"
            >
              {{ entry.at || t('common.selectDate') }}
            </button>
          </div>
          <input
            type="text"
            :value="entry.note || ''"
            class="timeline-item__note"
            :placeholder="t('goods.editor.timelineNotePlaceholder')"
            @input="updateEntry(index, 'note', $event.target.value)"
          />
          <div v-if="hasSaleData(entry)" class="timeline-item__sale">
            <span class="timeline-item__sale-text">{{ formatSaleData(entry) }}</span>
            <button
              type="button"
              class="timeline-item__sale-clear"
              @click="clearSaleData(index)"
            >
              {{ t('sale.clearSaleData') }}
            </button>
          </div>
        </div>
        <button
          type="button"
          class="timeline-item__delete"
          :aria-label="t('common.delete')"
          @click="removeEntry(index)"
        >
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>

    <button type="button" class="timeline-add-btn" @click="addEntry">
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 5v14M5 12h14" />
      </svg>
      <span>{{ t('goods.editor.addTimelineEntry') }}</span>
    </button>

    <AppDatePicker
      v-model:show="showDatePicker"
      v-model="datePickerValue"
      :z-index="2000"
      :is-tablet="isTabletViewport"
      :title="t('goods.editor.datePickerTitle')"
      :min-date="minDate"
      :max-date="maxDate"
      @confirm="onDateConfirm"
    />
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { formatDate } from '@/utils/format'
import { useTabletViewport } from '@/composables/useTabletViewport'
import AppSelect from '@/components/common/AppSelect.vue'
import AppDatePicker from '@/components/common/AppDatePicker.vue'

const props = defineProps({
  modelValue: {
    type: Array,
    default: () => []
  },
  collectStatusOptions: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits(['update:modelValue'])

const { t } = useI18n()
const { isTabletViewport } = useTabletViewport()

const showDatePicker = ref(false)
const datePickerValue = ref([])
const activeDateIndex = ref(-1)
const minDate = new Date(2000, 0, 1)
const maxDate = new Date(2100, 11, 31)

// 按日期排序的条目（仅用于渲染，不直接修改原始数据）
const entries = ref([])

// 从 modelValue 初始化并排序
function syncEntries() {
  const list = Array.isArray(props.modelValue) ? [...props.modelValue] : []
  entries.value = list.sort((a, b) => a.at.localeCompare(b.at))
}

// 监听 modelValue 变化
watch(() => props.modelValue, syncEntries, { immediate: true, deep: true })

function toDatePickerValue(dateString) {
  const normalized = String(dateString || '').trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    const [year, month, day] = normalized.split('-')
    return [year, String(Number(month)), String(Number(day))]
  }
  const now = new Date()
  return [String(now.getFullYear()), String(now.getMonth() + 1), String(now.getDate())]
}

function fromDatePickerValue(values) {
  if (!Array.isArray(values) || values.length < 3) return ''
  const year = values[0]
  const month = String(values[1]).padStart(2, '0')
  const day = String(values[2]).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function openDatePicker(index) {
  activeDateIndex.value = index
  const entry = entries.value[index]
  datePickerValue.value = toDatePickerValue(entry?.at)
  showDatePicker.value = true
}

function onDateConfirm({ selectedValues }) {
  const index = activeDateIndex.value
  if (index < 0 || index >= entries.value.length) {
    showDatePicker.value = false
    return
  }

  const newDate = fromDatePickerValue(selectedValues)
  const sorted = [...entries.value]
  sorted[index] = { ...sorted[index], at: newDate }

  // 重新排序后更新
  sorted.sort((a, b) => a.at.localeCompare(b.at))
  emit('update:modelValue', sorted)
  showDatePicker.value = false
}

function updateEntry(index, field, value) {
  const sorted = [...entries.value]
  const entry = sorted[index]
  if (!entry) return

  const updated = { ...entry, [field]: value }
  if (field === 'note' && !value) {
    delete updated.note
  }

  sorted[index] = updated

  // 如果修改了日期，重新排序
  if (field === 'at') {
    sorted.sort((a, b) => a.at.localeCompare(b.at))
  }

  emit('update:modelValue', sorted)
}

function removeEntry(index) {
  const sorted = [...entries.value]
  sorted.splice(index, 1)
  emit('update:modelValue', sorted)
}

function hasSaleData(entry) {
  return Boolean(entry?.price || entry?.platform || entry?.fee)
}

function formatSaleData(entry) {
  const parts = []
  if (entry.price) parts.push(`¥${entry.price}`)
  if (entry.platform) parts.push(entry.platform)
  if (entry.fee) parts.push(`${t('sale.fee')} ¥${entry.fee}`)
  return parts.join(' · ')
}

function clearSaleData(index) {
  const sorted = [...entries.value]
  const entry = sorted[index]
  if (!entry) return
  const { price: _price, platform: _platform, fee: _fee, ...rest } = entry
  sorted[index] = rest
  emit('update:modelValue', sorted)
}

function addEntry() {
  const newEntry = {
    status: '已拥有',
    at: formatDate(new Date(), 'YYYY-MM-DD')
  }
  const sorted = [...entries.value, newEntry].sort((a, b) => a.at.localeCompare(b.at))
  emit('update:modelValue', sorted)
}
</script>

<style scoped>
.status-timeline-editor {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.timeline-empty {
  text-align: center;
  padding: 24px 16px;
}

.timeline-empty__text {
  font-size: 14px;
  color: var(--app-text-secondary);
  margin: 0 0 4px;
}

.timeline-empty__hint {
  font-size: 12px;
  color: var(--app-text-tertiary);
  margin: 0;
}

.timeline-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.timeline-item {
  display: flex;
  gap: 8px;
  align-items: flex-start;
}

.timeline-item__fields {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.timeline-item__row {
  display: flex;
  gap: 8px;
}

.timeline-item__row .app-select {
  flex: 1;
}

.timeline-item__date-btn {
  min-width: 120px;
  padding: 8px 12px;
  border: 1px solid var(--app-border);
  border-radius: 10px;
  background: var(--app-surface);
  color: var(--app-text);
  font-size: 13px;
  text-align: left;
  cursor: pointer;
  white-space: nowrap;
}

.timeline-item__date-btn:hover {
  border-color: var(--app-primary);
}

.timeline-item__note {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--app-border);
  border-radius: 10px;
  background: var(--app-surface);
  color: var(--app-text);
  font-size: 13px;
  outline: none;
}

.timeline-item__note:focus {
  border-color: var(--app-primary);
}

.timeline-item__sale {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.timeline-item__sale-text {
  font-size: 12px;
  color: var(--app-text-tertiary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.timeline-item__sale-clear {
  border: none;
  background: transparent;
  color: var(--app-danger, #dc2626);
  font-size: 12px;
  cursor: pointer;
  padding: 0;
  flex-shrink: 0;
}

.timeline-item__delete {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--app-text-tertiary);
  cursor: pointer;
  flex-shrink: 0;
  margin-top: 4px;
}

.timeline-item__delete:hover {
  background: var(--app-fill);
  color: var(--app-danger);
}

.timeline-item__delete svg {
  width: 16px;
  height: 16px;
}

.timeline-add-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  padding: 10px;
  border: 1px dashed var(--app-border);
  border-radius: 10px;
  background: transparent;
  color: var(--app-text-secondary);
  font-size: 13px;
  cursor: pointer;
}

.timeline-add-btn:hover {
  border-color: var(--app-primary);
  color: var(--app-primary);
  background: color-mix(in srgb, var(--app-primary) 5%, transparent);
}

.timeline-add-btn svg {
  width: 16px;
  height: 16px;
}
</style>
