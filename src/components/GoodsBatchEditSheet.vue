<template>
  <Popup
    v-model:show="showProxy"
    teleport="body"
    :z-index="210"
    position="bottom"
    round
    class="batch-edit-popup"
  >
    <div class="batch-edit-sheet">
      <div class="batch-edit-sheet__handle" />

      <section class="batch-edit-hero">
        <p class="batch-edit-hero__label">批量编辑</p>
        <h2 class="batch-edit-hero__title">修改 {{ selectedCount }} 件谷子</h2>
        <p class="batch-edit-hero__desc">只会应用这次填写的字段，留空的内容保持原值。</p>
      </section>

      <section class="batch-edit-section">
        <div class="field-card batch-edit-card">
          <label class="field">
            <span class="field-label">分类</span>
            <AppSelect v-model="form.category" :options="presets.categories" placeholder="留空则不修改" />
          </label>

          <label class="field">
            <span class="field-label">IP</span>
            <AppSelect v-model="form.ip" :options="presets.ips" placeholder="留空则不修改" />
          </label>

          <div class="field">
            <span class="field-label">角色</span>
            <div class="multi-select" :class="{ 'multi-select--open': showCharPicker }">
              <button class="multi-select__trigger" type="button" @click="toggleCharPicker">
                <div class="multi-select__content">
                  <span v-if="form.characters.length === 0" class="multi-select__placeholder">留空则不修改</span>
                  <div v-else class="multi-select__chips">
                    <span v-for="character in form.characters" :key="character" class="multi-select__chip">
                      {{ character }}
                      <button
                        class="multi-select__chip-remove"
                        type="button"
                        aria-label="移除角色"
                        @click.stop="toggleChar(character)"
                      >
                        ×
                      </button>
                    </span>
                  </div>
                </div>
                <svg class="multi-select__arrow" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M7 10L12 15L17 10" />
                </svg>
              </button>
              <transition name="select-panel">
                <div v-if="showCharPicker" class="multi-select__panel">
                  <button
                    v-for="character in availableCharacters"
                    :key="character.name"
                    class="multi-select__option"
                    :class="{ 'multi-select__option--active': form.characters.includes(character.name) }"
                    type="button"
                    @click="toggleChar(character.name)"
                  >
                    <span>{{ character.name }}</span>
                    <svg
                      v-if="form.characters.includes(character.name)"
                      class="multi-select__check"
                      viewBox="0 0 24 24"
                      fill="none"
                      aria-hidden="true"
                    >
                      <path d="M5 13L9 17L19 7" />
                    </svg>
                  </button>
                  <div v-if="availableCharacters.length === 0" class="multi-select__empty">暂无可选角色</div>
                </div>
              </transition>
            </div>
          </div>

          <label class="field">
            <span class="field-label">购入日期</span>
            <button class="date-field" type="button" @pointerdown="flushActiveInput" @click="openDatePicker">
              <span :class="{ 'date-field__value--placeholder': !form.acquiredAt }">
                {{ form.acquiredAt || '留空则不修改' }}
              </span>
              <svg class="date-field__icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <rect x="3" y="5" width="18" height="16" rx="3" />
                <path d="M8 3V7" />
                <path d="M16 3V7" />
                <path d="M3 10H21" />
              </svg>
            </button>
          </label>
        </div>
      </section>

      <div class="batch-edit-actions">
        <button class="confirm-btn confirm-btn--ghost" type="button" @click="close">取消</button>
        <button class="confirm-btn confirm-btn--danger" type="button" :disabled="!canSubmit" @click="apply">
          应用修改
        </button>
      </div>
    </div>
  </Popup>

  <Popup
    v-model:show="showDatePicker"
    teleport="body"
    :z-index="220"
    position="bottom"
    round
    class="picker-popup"
  >
    <DatePicker
      v-model="datePickerValue"
      title="选择购入日期"
      :min-date="minDate"
      :max-date="maxDate"
      @cancel="showDatePicker = false"
      @confirm="onDateConfirm"
    />
  </Popup>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { DatePicker, Popup } from 'vant'
import { usePresetsStore } from '@/stores/presets'
import { formatDate } from '@/utils/format'
import { commitActiveInput, flushActiveInput } from '@/utils/commitActiveInput'
import AppSelect from '@/components/AppSelect.vue'

const props = defineProps({
  show: { type: Boolean, default: false },
  selectedCount: { type: Number, default: 0 }
})

const emit = defineEmits(['update:show', 'apply'])

const presets = usePresetsStore()
const minDate = new Date(2000, 0, 1)
const maxDate = new Date(2100, 11, 31)
const showDatePicker = ref(false)
const showCharPicker = ref(false)
const form = reactive({
  category: '',
  ip: '',
  acquiredAt: '',
  characters: []
})
const datePickerValue = ref(toDatePickerValue(formatDate(new Date(), 'YYYY-MM-DD')))

const showProxy = computed({
  get: () => props.show,
  set: (value) => emit('update:show', value)
})

const canSubmit = computed(() =>
  Boolean(form.category || form.ip || form.acquiredAt || form.characters.length > 0)
)

const availableCharacters = computed(() =>
  form.ip
    ? presets.characters.filter((character) => character.ip === form.ip)
    : presets.characters
)

watch(
  () => props.show,
  (visible) => {
    if (visible) {
      resetForm()
      return
    }

    closeNestedPanels()
  }
)

watch(
  () => form.ip,
  (ip) => {
    if (!ip) return

    form.characters = form.characters.filter((name) =>
      presets.characters.some((character) => character.name === name && character.ip === ip)
    )
  }
)

function resetForm() {
  form.category = ''
  form.ip = ''
  form.acquiredAt = ''
  form.characters = []
  datePickerValue.value = toDatePickerValue(formatDate(new Date(), 'YYYY-MM-DD'))
  closeNestedPanels()
}

function closeNestedPanels() {
  showDatePicker.value = false
  showCharPicker.value = false
}

function close() {
  closeNestedPanels()
  emit('update:show', false)
}

function openDatePicker() {
  datePickerValue.value = toDatePickerValue(form.acquiredAt)
  showDatePicker.value = true
}

function onDateConfirm({ selectedValues }) {
  const [year, month, day] = normalizeDateParts(selectedValues.join('-'))
  form.acquiredAt = `${year}-${month}-${day}`
  datePickerValue.value = [year, month, day]
  showDatePicker.value = false
}

function toggleCharPicker() {
  showCharPicker.value = !showCharPicker.value
}

function toggleChar(name) {
  const idx = form.characters.indexOf(name)
  if (idx >= 0) form.characters.splice(idx, 1)
  else form.characters.push(name)
}

async function apply() {
  if (!canSubmit.value) return

  await commitActiveInput()

  const payload = {}
  if (form.category) payload.category = form.category
  if (form.ip) payload.ip = form.ip
  if (form.acquiredAt) payload.acquiredAt = form.acquiredAt
  if (form.characters.length > 0) payload.characters = [...form.characters]
  if (Object.keys(payload).length === 0) return

  emit('apply', payload)
  close()
}

function consumeBack() {
  if (showDatePicker.value) {
    showDatePicker.value = false
    return true
  }

  if (showCharPicker.value) {
    showCharPicker.value = false
    return true
  }

  if (props.show) {
    close()
    return true
  }

  return false
}

function toDatePickerValue(dateString) {
  const [year, month, day] = normalizeDateParts(dateString)
  return [year, month, day]
}

function normalizeDateParts(dateString) {
  const [fallbackYear, fallbackMonth, fallbackDay] = formatDate(new Date(), 'YYYY-MM-DD').split('-')

  if (!dateString) {
    return [fallbackYear, fallbackMonth, fallbackDay]
  }

  const [year = fallbackYear, month = fallbackMonth, day = fallbackDay] = `${dateString}`.split('-')
  return [year, month.padStart(2, '0'), day.padStart(2, '0')]
}

defineExpose({
  close,
  consumeBack
})
</script>

<style scoped>
.batch-edit-popup {
  overflow: hidden;
}

.batch-edit-sheet {
  padding: 12px 16px calc(env(safe-area-inset-bottom) + 16px);
  background:
    radial-gradient(circle at top, rgba(20, 20, 22, 0.05), transparent 42%),
    #f5f5f7;
}

.batch-edit-sheet__handle {
  width: 42px;
  height: 5px;
  margin: 0 auto 18px;
  border-radius: 999px;
  background: rgba(20, 20, 22, 0.12);
}

.batch-edit-hero {
  margin-bottom: 14px;
}

.batch-edit-hero__label {
  color: var(--app-text-tertiary);
  font-size: 13px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.batch-edit-hero__title {
  margin-top: 6px;
  color: var(--app-text);
  font-size: 26px;
  font-weight: 600;
  letter-spacing: -0.04em;
}

.batch-edit-hero__desc {
  margin-top: 8px;
  color: var(--app-text-secondary);
  font-size: 14px;
  line-height: 1.6;
}

.batch-edit-card {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 14px;
  border-radius: var(--radius-card);
  background: #ffffff;
  box-shadow: var(--app-shadow);
}

.field {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
  border-radius: var(--radius-small);
  background: #f4f4f6;
}

.field-label {
  color: var(--app-text);
  font-size: 14px;
  font-weight: 600;
}

.date-field {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  min-height: 48px;
  padding: 0 14px;
  border: 1px solid rgba(20, 20, 22, 0.08);
  border-radius: 16px;
  background: #ffffff;
  color: var(--app-text);
  text-align: left;
  transition: border-color 0.18s ease, transform 0.16s ease, box-shadow 0.18s ease;
}

.date-field:active {
  transform: scale(0.98);
}

.date-field:focus-visible {
  border-color: rgba(20, 20, 22, 0.16);
  box-shadow: 0 0 0 3px rgba(20, 20, 22, 0.04);
  outline: none;
}

.date-field span {
  color: var(--app-text);
  font-size: 16px;
}

.date-field__value--placeholder {
  color: var(--app-placeholder);
}

.date-field__icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  stroke: #8e8e93;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.multi-select {
  position: relative;
}

.multi-select__trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  min-height: 48px;
  padding: 10px 14px;
  border: 1px solid rgba(20, 20, 22, 0.08);
  border-radius: 16px;
  background: #ffffff;
  color: var(--app-text);
  text-align: left;
  transition: border-color 0.18s ease, transform 0.16s ease, box-shadow 0.18s ease;
}

.multi-select__trigger:active {
  transform: scale(0.98);
}

.multi-select--open .multi-select__trigger,
.multi-select__trigger:focus-visible {
  border-color: rgba(20, 20, 22, 0.16);
  box-shadow: 0 0 0 3px rgba(20, 20, 22, 0.04);
  outline: none;
}

.multi-select__content {
  display: flex;
  flex: 1;
  min-width: 0;
}

.multi-select__placeholder {
  color: var(--app-placeholder);
  font-size: 16px;
}

.multi-select__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.multi-select__chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 100%;
  padding: 6px 10px;
  border-radius: 999px;
  background: rgba(20, 20, 22, 0.08);
  color: var(--app-text);
  font-size: 13px;
  font-weight: 500;
  line-height: 1.2;
}

.multi-select__chip-remove {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border: none;
  border-radius: 50%;
  background: rgba(20, 20, 22, 0.12);
  color: var(--app-text-secondary);
  font-size: 12px;
  line-height: 1;
}

.multi-select__arrow {
  width: 18px;
  height: 18px;
  margin-left: 10px;
  flex-shrink: 0;
  stroke: #8e8e93;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
  transition: transform 0.18s ease;
}

.multi-select--open .multi-select__arrow {
  transform: rotate(180deg);
}

.multi-select__panel {
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  z-index: 40;
  width: 100%;
  max-height: 240px;
  overflow-y: auto;
  padding: 8px;
  border: 1px solid rgba(20, 20, 22, 0.05);
  border-radius: 18px;
  background: #ffffff;
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.08);
}

.multi-select__option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  min-height: 44px;
  padding: 0 12px;
  border: none;
  border-radius: 12px;
  background: transparent;
  color: #141416;
  font-size: 15px;
  text-align: left;
  transition: background 0.16s ease, color 0.16s ease;
}

.multi-select__option:active {
  background: #f5f5f7;
}

.multi-select__option--active {
  background: rgba(20, 20, 22, 0.06);
  font-weight: 600;
}

.multi-select__check {
  width: 16px;
  height: 16px;
  margin-left: 10px;
  flex-shrink: 0;
  stroke: #141416;
  stroke-width: 2.4;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.multi-select__empty {
  padding: 14px 12px;
  color: #8e8e93;
  font-size: 14px;
  text-align: center;
}

.batch-edit-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-top: 16px;
}

.picker-popup {
  overflow: hidden;
}

:deep(.picker-popup .van-picker) {
  --van-picker-background: #ffffff;
  --van-picker-toolbar-height: 52px;
  --van-picker-option-font-size: 17px;
  --van-picker-title-font-size: 16px;
  --van-picker-confirm-action-color: #141416;
  --van-picker-cancel-action-color: #8e8e93;
}

:deep(.picker-popup .van-picker__toolbar) {
  padding: 0 8px;
}

:deep(.picker-popup .van-picker__title) {
  font-weight: 600;
}

:deep(.picker-popup .van-picker-column__item) {
  color: var(--app-text-secondary);
}

:deep(.picker-popup .van-picker-column__item--selected) {
  color: var(--app-text);
}

.confirm-btn {
  height: 48px;
  border: none;
  border-radius: 16px;
  font-size: 15px;
  font-weight: 600;
  transition: transform 0.16s ease, opacity 0.16s ease, background 0.16s ease;
}

.confirm-btn:active {
  transform: scale(0.96);
}

.confirm-btn:disabled {
  opacity: 0.4;
  pointer-events: none;
}

.confirm-btn--ghost {
  background: #f4f4f6;
  color: var(--app-text);
}

.confirm-btn--danger {
  background: #141416;
  color: #ffffff;
}
</style>
