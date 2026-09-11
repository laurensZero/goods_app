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
          <div class="timeline-item__row">
            <button
              v-if="showUnitSelect"
              type="button"
              class="timeline-item__unit-btn"
              @click="toggleUnitPanel(index)"
            >
              {{ entryScopeLabel(entry) }}
            </button>
            <!-- 用 change 而非 input:逐键 emit 会触发整表 deep watch 重建,
                 Android WebView 下有中断中文输入法组合(吞字)的风险 -->
            <input
              type="text"
              :value="entry.note || ''"
              class="timeline-item__note"
              :class="{ 'timeline-item__note--flex': showUnitSelect }"
              :placeholder="t('goods.editor.timelineNotePlaceholder')"
              @change="updateEntry(index, 'note', $event.target.value)"
            />
          </div>

          <div v-if="showUnitSelect && activeUnitIndex === index" class="unit-panel">
            <div class="unit-panel__actions">
              <button type="button" class="unit-panel__chip" @click="selectWholeLot(index)">
                {{ t('goods.detail.timelineAllUnits') }}
              </button>
              <button type="button" class="unit-panel__chip" @click="selectAllUnits(index)">
                {{ t('common.selectAll') }}
              </button>
              <button type="button" class="unit-panel__chip unit-panel__chip--ghost" @click="activeUnitIndex = -1">
                {{ t('common.done') }}
              </button>
            </div>

            <!-- 同日且同状态的件自动归批,一键套用;状态已分叉的组不会出现 -->
            <div v-if="datePresets.length > 0" class="unit-panel__presets">
              <button
                v-for="preset in datePresets"
                :key="`${preset.date}-${preset.status}-${preset.units[0]}`"
                type="button"
                class="unit-panel__preset"
                @click="applyDatePreset(index, preset.units)"
              >
                <span class="unit-panel__preset-label">{{ scopeLabelForUnits(preset.units) }}</span>
                <span class="unit-panel__preset-meta">
                  <span v-if="preset.status" class="unit-panel__preset-status">{{ preset.status }}</span>
                  <span class="unit-panel__preset-date">{{ preset.date }}</span>
                </span>
              </button>
            </div>

            <div class="unit-panel__grid">
              <label
                v-for="n in quantityNumber"
                :key="`unit-check-${n}`"
                class="unit-panel__item"
                :class="{ 'unit-panel__item--on': isUnitChecked(entry, n - 1) }"
              >
                <input
                  type="checkbox"
                  class="unit-panel__checkbox"
                  :checked="isUnitChecked(entry, n - 1)"
                  @change="toggleUnit(index, n - 1)"
                />
                <span>{{ t('sale.unitLabel', { n }) }}</span>
              </label>
            </div>
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
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { formatDate } from '@/utils/format'
import { useTabletViewport } from '@/composables/useTabletViewport'
import { getEntryUnitIndexes, makeUnitScopeFields } from '@/utils/goods/statusTimeline'
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
  },
  quantity: {
    type: Number,
    default: 1
  },
  unitAcquiredAtList: {
    type: Array,
    default: () => []
  },
  unitCollectStatusList: {
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
const activeUnitIndex = ref(-1)
const minDate = new Date(2000, 0, 1)
const maxDate = new Date(2100, 11, 31)

// 按日期排序的条目（仅用于渲染，不直接修改原始数据）
const entries = ref([])

const quantityNumber = computed(() => Math.max(1, Number(props.quantity) || 1))
const showUnitSelect = computed(() => quantityNumber.value >= 2)

// 同日且同当前状态的件才归为快捷预设——两件购入日相同但状态已分叉(如一件已赠出)
// 时不能提示「第 1-2 件」,否则一键套用会把历史状态写到不该覆盖的件上
const datePresets = computed(() => {
  if (!showUnitSelect.value) return []
  const dates = Array.isArray(props.unitAcquiredAtList) ? props.unitAcquiredAtList : []
  const statuses = Array.isArray(props.unitCollectStatusList) ? props.unitCollectStatusList : []
  /** @type {Map<string, { date: string, status: string, units: number[] }>} */
  const byBatch = new Map()
  for (let i = 0; i < quantityNumber.value; i++) {
    const date = String(dates[i] || '').trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue
    const status = String(statuses[i] || '').trim()
    const key = `${date}|${status}`
    if (!byBatch.has(key)) byBatch.set(key, { date, status, units: [] })
    byBatch.get(key).units.push(i)
  }
  return [...byBatch.values()]
    .filter((batch) => batch.units.length >= 2)
    .sort((a, b) => a.date.localeCompare(b.date) || a.status.localeCompare(b.status))
})

function scopeLabelForUnits(units) {
  const sorted = [...new Set(units)].sort((a, b) => a - b)
  if (sorted.length === 0) return t('goods.detail.timelineAllUnits')
  if (sorted.length === 1) return t('sale.unitLabel', { n: sorted[0] + 1 })
  const consecutive = sorted[sorted.length - 1] - sorted[0] === sorted.length - 1
  if (consecutive) {
    return t('goods.detail.timelineUnitRange', { a: sorted[0] + 1, b: sorted[sorted.length - 1] + 1 })
  }
  return sorted.map((u) => t('sale.unitLabel', { n: u + 1 })).join('、')
}

function entryScopeLabel(entry) {
  return scopeLabelForUnits(getEntryUnitIndexes(entry) || [])
}

// 从 modelValue 初始化并排序
function syncEntries() {
  const list = Array.isArray(props.modelValue) ? [...props.modelValue] : []
  entries.value = list.sort((a, b) => a.at.localeCompare(b.at))
}

// 监听 modelValue 变化
watch(() => props.modelValue, () => {
  syncEntries()
  // 条目被外部移除时收起归属面板,避免悬空索引
  if (activeUnitIndex.value >= entries.value.length) activeUnitIndex.value = -1
}, { immediate: true, deep: true })

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
  activeUnitIndex.value = -1
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

  const trimmed = typeof value === 'string' ? value.trim() : value
  const updated = { ...entry, [field]: trimmed }
  if (field === 'note' && !trimmed) {
    delete updated.note
  }

  sorted[index] = updated

  // 如果修改了日期，重新排序
  if (field === 'at') {
    sorted.sort((a, b) => a.at.localeCompare(b.at))
  }

  emit('update:modelValue', sorted)
}

function toggleUnitPanel(index) {
  activeUnitIndex.value = activeUnitIndex.value === index ? -1 : index
}

function applyEntryScope(index, units) {
  const sorted = [...entries.value]
  const entry = sorted[index]
  if (!entry) return
  const { unitIndex, unitIndexes } = makeUnitScopeFields(units)
  const updated = { ...entry }
  delete updated.unitIndex
  delete updated.unitIndexes
  if (unitIndex != null) updated.unitIndex = unitIndex
  if (unitIndexes) updated.unitIndexes = unitIndexes
  sorted[index] = updated
  emit('update:modelValue', sorted)
}

function isUnitChecked(entry, unitIndex) {
  const scope = getEntryUnitIndexes(entry)
  return scope !== null && scope.includes(unitIndex)
}

function toggleUnit(index, unitIndex) {
  const entry = entries.value[index]
  if (!entry) return
  const current = getEntryUnitIndexes(entry) || []
  const next = current.includes(unitIndex)
    ? current.filter((u) => u !== unitIndex)
    : [...current, unitIndex]
  applyEntryScope(index, next)
}

function selectAllUnits(index) {
  applyEntryScope(index, Array.from({ length: quantityNumber.value }, (_, i) => i))
}

function selectWholeLot(index) {
  applyEntryScope(index, [])
  activeUnitIndex.value = -1
}

function applyDatePreset(index, units) {
  applyEntryScope(index, units)
  activeUnitIndex.value = -1
}

function removeEntry(index) {
  const sorted = [...entries.value]
  sorted.splice(index, 1)
  emit('update:modelValue', sorted)
  if (activeUnitIndex.value === index) activeUnitIndex.value = -1
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

.timeline-item__unit-btn {
  min-width: 96px;
  max-width: 140px;
  padding: 8px 10px;
  border: 1px solid var(--app-border);
  border-radius: 10px;
  background: var(--app-surface);
  color: var(--app-text);
  font-size: 12px;
  text-align: left;
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex-shrink: 0;
}

.timeline-item__unit-btn:hover,
.timeline-item__unit-btn:focus-visible {
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

.timeline-item__note--flex {
  flex: 1;
  min-width: 0;
  width: auto;
}

.timeline-item__note:focus {
  border-color: var(--app-primary);
}

.unit-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  border: 1px solid color-mix(in srgb, var(--app-primary) 28%, var(--app-border));
  border-radius: 12px;
  background: color-mix(in srgb, var(--app-primary) 4%, var(--app-surface));
}

.unit-panel__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.unit-panel__chip {
  padding: 5px 12px;
  border: 1px solid var(--app-border);
  border-radius: 999px;
  background: var(--app-surface);
  color: var(--app-text-secondary);
  font-size: 12px;
  cursor: pointer;
}

.unit-panel__chip:hover {
  border-color: var(--app-primary);
  color: var(--app-primary);
}

.unit-panel__chip--ghost {
  margin-left: auto;
}

.unit-panel__presets {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.unit-panel__preset {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  padding: 7px 10px;
  border: 1px dashed color-mix(in srgb, var(--app-primary) 40%, var(--app-border));
  border-radius: 8px;
  background: transparent;
  color: var(--app-text);
  font-size: 12px;
  cursor: pointer;
}

.unit-panel__preset:hover {
  background: color-mix(in srgb, var(--app-primary) 8%, transparent);
}

.unit-panel__preset-label {
  font-weight: 600;
  color: var(--app-primary);
}

.unit-panel__preset-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.unit-panel__preset-status {
  color: var(--app-text-secondary);
  white-space: nowrap;
}

.unit-panel__preset-date {
  color: var(--app-text-tertiary);
}

.unit-panel__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(72px, 1fr));
  gap: 6px;
  max-height: 160px;
  overflow-y: auto;
}

.unit-panel__item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border: 1px solid var(--app-border);
  border-radius: 8px;
  background: var(--app-surface);
  font-size: 12px;
  color: var(--app-text-secondary);
  cursor: pointer;
}

.unit-panel__item--on {
  border-color: var(--app-primary);
  color: var(--app-primary);
  background: color-mix(in srgb, var(--app-primary) 8%, var(--app-surface));
}

.unit-panel__checkbox {
  width: 14px;
  height: 14px;
  accent-color: var(--app-primary);
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
