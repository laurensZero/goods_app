<template>
  <Teleport to="body">
    <Transition name="dialog-fade">
      <div v-if="show" class="dialog-overlay" @click="close" />
    </Transition>

    <Transition name="dialog-pop">
      <section v-if="show" class="dialog" role="dialog" aria-modal="true" :aria-label="isEditMode ? t('recharge.editRecord') : t('recharge.addRecord')">
        <p class="dialog-label">{{ isEditMode ? t('recharge.dialog.editLabel') : t('recharge.dialog.addLabel') }}</p>
        <h3 class="dialog-title">{{ isEditMode ? t('recharge.dialog.editTitle') : t('recharge.dialog.addTitle') }}</h3>

        <div class="dialog-fields">
          <template v-if="mode === 'preset'">
            <div class="preset-section">
              <div class="preset-section__head">
                <label class="field-label">{{ t('recharge.dialog.dataSource') }}</label>
                <p class="field-tip">{{ t('recharge.dialog.dataSourceTip') }}</p>
              </div>

              <div class="preset-grid preset-grid--source">
                <button
                  v-for="entry in presetGameCards"
                  :key="entry.key"
                  type="button"
                  :class="['preset-card', 'preset-card--source', { 'preset-card--active': form.presetGameKey === entry.key }]"
                  @click="form.presetGameKey = entry.key"
                >
                  <div class="preset-card__body">
                    <p class="preset-card__title">{{ entry.displayName }}</p>
                    <p class="preset-card__meta">{{ entry.regionLabel }} · {{ t('recharge.dialog.tiers', { count: entry.optionCount }) }}</p>
                  </div>
                </button>
              </div>
            </div>

            <div class="preset-section">
              <div class="preset-section__head">
                <label class="field-label">{{ t('recharge.dialog.dataTier') }}</label>
                <p class="field-tip">{{ selectedPresetGame ? t('recharge.dialog.tierTip') : t('recharge.dialog.selectGameFirst') }}</p>
              </div>

              <div v-if="presetOptionCards.length > 0" class="preset-grid preset-grid--option">
                <button
                  v-for="option in presetOptionCards"
                  :key="option.value"
                  type="button"
                  :class="['preset-card', 'preset-card--option', { 'preset-card--active': form.presetOptionKey === option.value }]"
                  @click="form.presetOptionKey = option.value"
                >
                  <div class="preset-card__media preset-card__media--option">
                    <LazyCachedImage
                      v-if="option.image"
                      :src="option.image"
                      :alt="option.name"
                      class="preset-card__image"
                      loading="lazy"
                    />
                    <div v-else class="preset-card__fallback">{{ option.name.slice(0, 1) || '?' }}</div>
                  </div>
                  <div class="preset-card__body">
                    <p class="preset-card__title">{{ option.name }}</p>
                    <p class="preset-card__meta">¥{{ option.amountText }}</p>
                  </div>
                </button>
              </div>

              <div v-else class="preset-empty">{{ t('recharge.dialog.tierPlaceholder') }}</div>
            </div>
          </template>

          <template v-if="mode !== 'preset'">
            <label class="field-label">{{ t('recharge.dialog.game') }}</label>
            <AppSelect v-model="form.game" :options="gameSelectOptions" :placeholder="t('recharge.dialog.gamePlaceholder')" />

            <label class="field-label">{{ t('recharge.dialog.itemName') }}</label>
            <input v-model.trim="form.itemName" class="field-input" type="text" :placeholder="t('recharge.dialog.itemNamePlaceholder')" />

            <label class="field-label">{{ t('recharge.dialog.amount') }}</label>
            <input v-model="form.amount" class="field-input" type="number" min="0" step="1" :placeholder="t('recharge.dialog.amountPlaceholder')" />
          </template>

          <label class="field-label">{{ t('recharge.dialog.date') }}</label>
          <button type="button" class="date-field" @click="openDatePicker">
            <span :class="{ 'date-field__value--placeholder': !form.chargedAt }">
              {{ form.chargedAt || t('recharge.dialog.datePlaceholder') }}
            </span>
            <svg class="date-field__icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <rect x="3" y="5" width="18" height="16" rx="3" />
              <path d="M8 3V7" />
              <path d="M16 3V7" />
              <path d="M3 10H21" />
            </svg>
          </button>

          <label class="field-label">{{ t('recharge.dialog.note') }}</label>
          <textarea v-model.trim="form.note" class="field-textarea" rows="3" :placeholder="t('recharge.dialog.notePlaceholder')" />

          <label class="field-label">{{ t('recharge.dialog.imageUrl') }}</label>
          <input v-model.trim="form.image" class="field-input" type="url" placeholder="https://" />
        </div>

        <p v-if="errorText" class="error-text">{{ errorText }}</p>

        <div class="dialog-actions">
          <button type="button" class="btn btn--ghost" @click="close">{{ t('common.cancel') }}</button>
          <button type="button" class="btn btn--primary" @click="submit">{{ isEditMode ? t('recharge.dialog.saveEdit') : t('recharge.dialog.saveNew') }}</button>
        </div>
      </section>
    </Transition>

    <AppDatePicker
      v-model:show="showDatePicker"
      v-model="datePickerValue"
      :z-index="2000"
      :is-tablet="isTabletViewport"
      :title="t('recharge.dialog.date')"
      :min-date="minDate"
      :max-date="maxDate"
      @confirm="onDateConfirm"
    />
  </Teleport>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import AppSelect from '@/components/common/AppSelect.vue'

const { t } = useI18n()
import AppDatePicker from '@/components/common/AppDatePicker.vue'
import LazyCachedImage from '@/components/image/LazyCachedImage.vue'
import { useTabletViewport } from '@/composables/useTabletViewport'
import rechargeDistribution from '@/constants/recharge-options-distribution.json'
import { formatDate } from '@/utils/format'
import { buildRechargePresetImageMap, resolveRechargePresetImage } from '@/utils/rechargeImages'
import { validatePrice } from '@/utils/validate'

const GAME_LABEL_MAP = {
  hk4e_cn: '原神',
  hkrpg_cn: '星穹铁道',
  bh3_cn: '崩坏3',
  nap_cn: '绝区零'
}

const props = defineProps({
  show: {
    type: Boolean,
    default: false
  },
  record: {
    type: Object,
    default: null
  },
  gameOptions: {
    type: Array,
    default: () => []
  },
  mode: {
    type: String,
    default: 'manual'
  }
})

const emit = defineEmits(['update:show', 'save'])
const minDate = new Date(2000, 0, 1)
const maxDate = new Date(2100, 11, 31)

const form = reactive({
  presetGameKey: '',
  presetOptionKey: '',
  game: '',
  itemName: '',
  amount: '',
  chargedAt: '',
  note: '',
  image: ''
})

const errorText = ref('')
const showDatePicker = ref(false)
const datePickerValue = ref(toDatePickerValue(formatDate(new Date(), 'YYYY-MM-DD')))
const isEditMode = computed(() => Boolean(props.record?.id))
const { isTabletViewport, updateViewport } = useTabletViewport()
const presetImageMap = buildRechargePresetImageMap()
const presetGameEntries = computed(() => {
  const source = rechargeDistribution || {}
  return Object.entries(source)
    .map(([key, value]) => {
      const gameBiz = String(value?.gameBiz || '').trim()
      const region = String(value?.region || '').trim()
      const displayName = GAME_LABEL_MAP[gameBiz] || gameBiz || key
      const options = Array.isArray(value?.options) ? value.options : []
      return {
        key,
        gameBiz,
        region,
        displayName,
        options
      }
    })
    .filter((entry) => entry.options.length > 0)
})

const selectedPresetGame = computed(() => (
  presetGameEntries.value.find((entry) => entry.key === form.presetGameKey) || null
))

const presetGameCards = computed(() => (
  presetGameEntries.value.map((entry) => ({
    ...entry,
    image: String(entry.options.find((option) => option?.image)?.image || '').trim(),
    regionLabel: entry.region || 'default',
    optionCount: entry.options.length
  }))
))

const presetOptionCards = computed(() => {
  const target = selectedPresetGame.value
  if (!target) return []

  return target.options
    .map((option, index) => {
      const name = String(option?.name || '').trim()
      const amount = Number(option?.amount || 0)
      return {
        value: getPresetOptionValue(option, index),
        name,
        amount,
        amountText: amount.toFixed(2),
        image: String(option?.image || '').trim(),
        sourceIndex: index
      }
    })
    .sort((a, b) => {
      const nameCompare = a.name.localeCompare(b.name, 'zh-Hans-CN', { sensitivity: 'base', numeric: true })
      if (nameCompare !== 0) return nameCompare

      const amountCompare = a.amount - b.amount
      if (amountCompare !== 0) return amountCompare

      return a.sourceIndex - b.sourceIndex
    })
    .map(({ sourceIndex, amount, ...rest }) => rest)
})

const gameSelectOptions = computed(() => {
  const fromRecords = props.gameOptions.map((item) => ({ label: item, value: item }))
  const fromPresets = presetGameEntries.value.map((entry) => ({ label: entry.displayName, value: entry.displayName }))
  const map = new Map()

  for (const option of [...fromRecords, ...fromPresets]) {
    if (!option.value) continue
    if (!map.has(option.value)) {
      map.set(option.value, option)
    }
  }

  return Array.from(map.values())
})

function resetForm() {
  const target = props.record || {}
  const defaultPresetGameKey = props.mode === 'preset'
    ? String(presetGameEntries.value[0]?.key || '').trim()
    : ''
  const defaultPresetGame = presetGameEntries.value.find((entry) => entry.key === defaultPresetGameKey)

  form.presetGameKey = defaultPresetGameKey
  form.presetOptionKey = ''
  form.game = String(target.game || defaultPresetGame?.displayName || props.gameOptions[0] || '').trim()
  form.itemName = String(target.itemName || '').trim()
  form.amount = target.amount == null ? '' : String(target.amount)
  form.chargedAt = String(target.chargedAt || formatDate(new Date(), 'YYYY-MM-DD')).trim()
  form.note = String(target.note || '').trim()
  form.image = String(target.image || '').trim()
  datePickerValue.value = toDatePickerValue(form.chargedAt)
  showDatePicker.value = false
  errorText.value = ''
}

function getPresetOptionValue(option, index) {
  const id = String(option?.id || '').trim()
  const name = String(option?.name || '').trim()
  const amount = Number(option?.amount || 0)
  return id || `${name}::${amount.toFixed(2)}::${index}`
}

function resolvePresetImage(record) {
  return resolveRechargePresetImage(record, presetImageMap)
}

function applyPresetOption() {
  const targetGame = selectedPresetGame.value
  if (!targetGame || !form.presetOptionKey) return

  const found = targetGame.options.find((option, index) => {
    return getPresetOptionValue(option, index) === form.presetOptionKey
  })

  if (!found) return

  form.game = targetGame.displayName
  form.itemName = String(found.name || '').trim()
  form.amount = String(Number(found.amount || 0))
  form.image = String(found.image || '').trim()
}

function close() {
  showDatePicker.value = false
  emit('update:show', false)
}

function openDatePicker() {
  datePickerValue.value = toDatePickerValue(form.chargedAt)
  showDatePicker.value = true
}

function onDateConfirm({ selectedValues }) {
  const [year, month, day] = normalizeDateParts(selectedValues.join('-'))
  form.chargedAt = `${year}-${month}-${day}`
  datePickerValue.value = [year, month, day]
  showDatePicker.value = false
}

function submit() {
  const amountText = String(form.amount ?? '').trim()

  if (!amountText) {
    errorText.value = t('recharge.dialog.errorAmount')
    return
  }

  const amountValidation = validatePrice(amountText)

  if (!amountValidation.valid) {
    errorText.value = amountValidation.message
    return
  }

  const amountNumber = Number(amountText)

  if (amountNumber < 0) {
    errorText.value = t('recharge.dialog.errorNegative')
    return
  }

  if (!form.game) {
    errorText.value = t('recharge.dialog.errorGame')
    return
  }

  if (!form.itemName) {
    errorText.value = t('recharge.dialog.errorItem')
    return
  }

  if (!form.chargedAt || Number.isNaN(new Date(form.chargedAt).getTime())) {
    errorText.value = t('recharge.dialog.errorDate')
    return
  }

  emit('save', {
    game: form.game,
    itemName: form.itemName,
    amount: amountNumber,
    chargedAt: form.chargedAt,
    note: form.note,
    image: form.image
  })
}

watch(() => props.show, (value) => {
  if (value) resetForm()
}, { immediate: true })

watch(() => props.record, () => {
  if (props.show) resetForm()
})

watch(() => form.presetGameKey, (next) => {
  if (props.mode !== 'preset') return
  form.presetOptionKey = ''
  const target = presetGameEntries.value.find((entry) => entry.key === next)
  if (!target) return
  form.game = target.displayName
  form.itemName = ''
  form.amount = ''
  form.image = ''
})

watch(() => form.presetOptionKey, () => {
  if (props.mode !== 'preset') return
  applyPresetOption()
})

function toDatePickerValue(dateString) {
  const [year, month, day] = normalizeDateParts(dateString)
  return [year, month, day]
}

function normalizeDateParts(dateString) {
  const fallback = new Date()
  const fallbackYear = `${fallback.getFullYear()}`
  const fallbackMonth = `${fallback.getMonth() + 1}`.padStart(2, '0')
  const fallbackDay = `${fallback.getDate()}`.padStart(2, '0')

  if (!dateString) {
    return [fallbackYear, fallbackMonth, fallbackDay]
  }

  const [year = fallbackYear, month = fallbackMonth, day = fallbackDay] = `${dateString}`.split('-')
  return [
    String(year || fallbackYear).padStart(4, '0'),
    String(month || fallbackMonth).padStart(2, '0'),
    String(day || fallbackDay).padStart(2, '0')
  ]
}

onMounted(() => {
  updateViewport()
})

onBeforeUnmount(() => {
})
</script>

<style scoped>
.dialog {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 90;
  width: 100%;
  max-height: min(90dvh, 760px);
  transform: translateY(0);
  overflow: auto;
  padding: 18px 16px max(24px, env(safe-area-inset-bottom));
  border-radius: 24px 24px 0 0;
  border: 1px solid var(--app-glass-border);
  background: color-mix(in srgb, var(--app-glass-strong) 90%, transparent);
  box-shadow: var(--app-shadow);
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
}

.dialog-label {
  color: var(--app-text-tertiary);
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.dialog-title {
  margin-top: 4px;
  color: var(--app-text);
  font-size: 22px;
  font-weight: 700;
  letter-spacing: -0.03em;
}

.dialog-fields {
  display: grid;
  gap: 8px;
  margin-top: 14px;
}

.preset-section {
  display: grid;
  gap: 10px;
  margin-bottom: 8px;
}

.preset-section__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}

.field-label {
  margin-top: 2px;
  color: var(--app-text-secondary);
  font-size: 13px;
  font-weight: 500;
}

.field-tip {
  color: var(--app-text-tertiary);
  font-size: 12px;
  text-align: right;
}

.preset-grid {
  display: grid;
  gap: 10px;
}

.preset-grid--source {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.preset-grid--option {
  grid-template-columns: repeat(auto-fit, minmax(112px, 1fr));
}

.preset-card {
  display: grid;
  gap: 10px;
  min-width: 0;
  padding: 10px;
  border: 1px solid var(--app-border);
  border-radius: 18px;
  background: var(--app-surface);
  box-shadow: var(--app-shadow);
  text-align: left;
  transition:
    transform var(--motion-fast) var(--motion-emphasis),
    border-color var(--motion-fast) var(--motion-emphasis),
    background var(--motion-fast) var(--motion-emphasis),
    box-shadow var(--motion-fast) var(--motion-emphasis);
}

.preset-card:active {
  transform: scale(var(--press-scale-button));
}

.preset-card--active {
  border-color: color-mix(in srgb, var(--app-text) 24%, transparent);
  background: color-mix(in srgb, var(--app-surface) 90%, var(--app-text) 10%);
  box-shadow: 0 14px 28px rgba(20, 20, 22, 0.08);
}

.preset-card--source {
  min-height: 78px;
  align-content: center;
}

.preset-card__media {
  display: flex;
  align-items: center;
  justify-content: center;
  aspect-ratio: 1 / 1;
  overflow: hidden;
  border-radius: 14px;
  background: #ffffff;
}

.preset-card__media--option {
  aspect-ratio: 1;
}

.preset-card__image {
  width: 100%;
  height: 100%;
  object-fit: contain;
  background: #ffffff;
}

.preset-card__fallback {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  color: var(--app-text);
  font-size: 28px;
  font-weight: 700;
}

.preset-card__body {
  min-width: 0;
}

.preset-card__title {
  color: var(--app-text);
  font-size: 14px;
  font-weight: 600;
  line-height: 1.35;
}

.preset-card__meta {
  margin-top: 4px;
  color: var(--app-text-tertiary);
  font-size: 12px;
}

.preset-empty {
  padding: 14px 16px;
  border-radius: 16px;
  background: var(--app-surface-soft);
  color: var(--app-text-tertiary);
  font-size: 13px;
}

.field-input,
.date-field,
.field-textarea {
  width: 100%;
  border: 1px solid transparent;
  border-radius: var(--radius-small);
  background: var(--app-surface);
  color: var(--app-text);
  box-shadow: var(--app-shadow);
}

.field-input {
  height: var(--input-height);
  padding: 0 12px;
}

.date-field {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: var(--input-height);
  padding: 0 12px;
  box-shadow: var(--app-shadow);
  text-align: left;
  transition: border-color 0.16s ease, transform 0.16s ease, box-shadow 0.16s ease;
}

.field-textarea {
  min-height: 78px;
  padding: 10px 12px;
  resize: vertical;
}

.field-input:focus,
.date-field:focus-visible,
.field-textarea:focus {
  outline: none;
  border-color: color-mix(in srgb, var(--app-text) 18%, transparent);
}

.date-field:active {
  transform: scale(0.99);
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

.error-text {
  margin-top: 12px;
  color: #d34a4a;
  font-size: 13px;
}

.dialog-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-top: 14px;
}

.btn {
  height: var(--button-height);
  border: none;
  border-radius: var(--radius-small);
  font-size: 15px;
  font-weight: 600;
  transition: transform var(--motion-fast) var(--motion-emphasis), opacity var(--motion-fast) var(--motion-emphasis);
}

.btn:active {
  transform: scale(var(--press-scale-button));
}

.btn--ghost {
  background: var(--app-surface-soft);
  color: var(--app-text-secondary);
}

.btn--primary {
  background: var(--app-text);
  color: var(--app-surface);
}

.dialog-overlay {
  position: fixed;
  inset: 0;
  z-index: 80;
  background: var(--app-overlay);
  backdrop-filter: blur(var(--app-overlay-blur)) saturate(var(--app-overlay-saturate));
  -webkit-backdrop-filter: blur(var(--app-overlay-blur)) saturate(var(--app-overlay-saturate));
}

.dialog-fade-enter-active,
.dialog-fade-leave-active {
  transition: opacity var(--motion-fast) var(--motion-emphasis);
}

.dialog-fade-enter-from,
.dialog-fade-leave-to {
  opacity: 0;
}

.dialog-pop-enter-active,
.dialog-pop-leave-active {
  transition: opacity var(--motion-fast) var(--motion-emphasis), transform var(--motion-fast) var(--motion-emphasis);
}

.dialog-pop-enter-from,
.dialog-pop-leave-to {
  opacity: 0;
  transform: translateY(100%);
}

@media (min-width: 900px) {
  .dialog {
    left: 50%;
    top: 50%;
    right: auto;
    bottom: auto;
    width: min(100vw - 24px, 540px);
    max-height: min(86vh, 740px);
    transform: translate(-50%, -50%);
    padding: 18px;
    border-radius: 24px;
  }

  .dialog-pop-enter-from,
  .dialog-pop-leave-to {
    opacity: 0;
    transform: translate(-50%, calc(-50% + 14px)) scale(0.98);
  }
}

@media (max-width: 520px) {
  .preset-grid--source {
    grid-template-columns: 1fr;
  }
}
</style>
