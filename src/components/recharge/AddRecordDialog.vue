<template>
  <Teleport to="body">
    <Transition name="dialog-fade">
      <div v-if="show" class="dialog-overlay" @click="close" />
    </Transition>

    <Transition name="dialog-pop">
      <section v-if="show" class="dialog" role="dialog" aria-modal="true" :aria-label="isEditMode ? '编辑充值记录' : '新增充值记录'">
        <p class="dialog-label">{{ isEditMode ? '编辑记录' : '新增记录' }}</p>
        <h3 class="dialog-title">{{ isEditMode ? '更新充值信息' : '添加充值信息' }}</h3>

        <div class="dialog-fields">
          <template v-if="mode === 'preset'">
            <div class="preset-section">
              <div class="preset-section__head">
                <label class="field-label">数据源</label>
                <p class="field-tip">先选游戏，再选档位</p>
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
                    <p class="preset-card__meta">{{ entry.regionLabel }} · {{ entry.optionCount }} 个档位</p>
                  </div>
                </button>
              </div>
            </div>

            <div class="preset-section">
              <div class="preset-section__head">
                <label class="field-label">数据源档位</label>
                <p class="field-tip">{{ selectedPresetGame ? '选择后会自动填充项目和金额' : '请先选择一个数据源' }}</p>
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

              <div v-else class="preset-empty">选择数据源后，这里会显示对应档位。</div>
            </div>
          </template>

          <template v-if="mode !== 'preset'">
            <label class="field-label">游戏</label>
            <AppSelect v-model="form.game" :options="gameSelectOptions" placeholder="请选择游戏" />

            <label class="field-label">充值项目</label>
            <input v-model.trim="form.itemName" class="field-input" type="text" placeholder="例如：月卡 / 大月卡" />

            <label class="field-label">金额（元）</label>
            <input v-model="form.amount" class="field-input" type="number" min="0" step="1" placeholder="请输入金额" />
          </template>

          <label class="field-label">日期</label>
          <button type="button" class="date-field" @click="openDatePicker">
            <span :class="{ 'date-field__value--placeholder': !form.chargedAt }">
              {{ form.chargedAt || '请选择日期' }}
            </span>
            <svg class="date-field__icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <rect x="3" y="5" width="18" height="16" rx="3" />
              <path d="M8 3V7" />
              <path d="M16 3V7" />
              <path d="M3 10H21" />
            </svg>
          </button>

          <label class="field-label">备注（选填）</label>
          <textarea v-model.trim="form.note" class="field-textarea" rows="3" placeholder="可填写备注" />

          <label class="field-label">图片链接（选填）</label>
          <input v-model.trim="form.image" class="field-input" type="url" placeholder="https://" />
        </div>

        <p v-if="errorText" class="error-text">{{ errorText }}</p>

        <div class="dialog-actions">
          <button type="button" class="btn btn--ghost" @click="close">取消</button>
          <button type="button" class="btn btn--primary" @click="submit">{{ isEditMode ? '保存修改' : '添加记录' }}</button>
        </div>
      </section>
    </Transition>

    <Popup
      v-model:show="showDatePicker"
      teleport="body"
      :z-index="2000"
      :position="datePickerPopupPosition"
      :round="!isTabletViewport"
      :class="['picker-popup', { 'picker-popup--center': isTabletViewport }]"
    >
      <DatePicker
        v-model="datePickerValue"
        title="选择日期"
        :min-date="minDate"
        :max-date="maxDate"
        @cancel="showDatePicker = false"
        @confirm="onDateConfirm"
      />
    </Popup>
  </Teleport>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { DatePicker, Popup } from 'vant'
import AppSelect from '@/components/common/AppSelect.vue'
import LazyCachedImage from '@/components/image/LazyCachedImage.vue'
import rechargeDistribution from '@/constants/recharge-options-distribution.json'
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
const datePickerValue = ref(toDatePickerValue(new Date().toISOString().slice(0, 10)))
const windowWidth = ref(window.innerWidth)
const isEditMode = computed(() => Boolean(props.record?.id))
const isTabletViewport = computed(() => windowWidth.value >= 900)
const datePickerPopupPosition = computed(() => (isTabletViewport.value ? 'center' : 'bottom'))
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
  form.chargedAt = String(target.chargedAt || new Date().toISOString().slice(0, 10)).trim()
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

function handleResize() {
  windowWidth.value = window.innerWidth
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
  const amountValidation = validatePrice(form.amount)

  if (!amountValidation.valid) {
    errorText.value = amountValidation.message
    return
  }

  const amountNumber = Number(form.amount)

  if (!form.game) {
    errorText.value = '请选择游戏，再继续保存'
    return
  }

  if (!form.itemName) {
    errorText.value = '请输入充值项目名称，再继续保存'
    return
  }

  if (!Number.isFinite(amountNumber) || amountNumber <= 0) {
    errorText.value = '金额必须大于 0，请重新输入'
    return
  }

  if (!form.chargedAt || Number.isNaN(new Date(form.chargedAt).getTime())) {
    errorText.value = '日期格式无效，请重新选择日期'
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
  window.addEventListener('resize', handleResize, { passive: true })
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize)
})
</script>

<style scoped>
.dialog {
  position: fixed;
  left: 50%;
  top: 50%;
  z-index: 90;
  width: min(100vw - 24px, 540px);
  max-height: min(86vh, 740px);
  transform: translate(-50%, -50%);
  overflow: auto;
  padding: 18px;
  border-radius: 24px;
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
  aspect-ratio: 1.18;
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

.picker-popup {
  overflow: hidden;
}

:global(.picker-popup--center.van-popup--center) {
  width: min(560px, calc(100vw - 64px));
  max-width: calc(100vw - 64px);
  border-radius: 24px;
  overflow: hidden;
}

:deep(.picker-popup .van-picker) {
  --van-picker-background: var(--app-surface);
  --van-picker-toolbar-height: 52px;
  --van-picker-option-font-size: 17px;
  --van-picker-title-font-size: 16px;
  --van-picker-confirm-action-color: var(--app-text);
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

:deep(.picker-popup .van-picker-column) {
  touch-action: pan-y;
}

:global(html.theme-dark) :deep(.picker-popup.van-popup),
:global(html.theme-dark) :deep(.picker-popup.van-popup--bottom) {
  background: rgba(24, 24, 28, 0.94);
  border: 1px solid rgba(255, 255, 255, 0.06);
  box-shadow: 0 24px 56px rgba(0, 0, 0, 0.42);
  backdrop-filter: blur(24px) saturate(150%);
  -webkit-backdrop-filter: blur(24px) saturate(150%);
}

:global(html.theme-dark) :deep(.picker-popup .van-picker) {
  --van-picker-mask-color:
    linear-gradient(180deg, rgba(24, 24, 28, 0.92), rgba(24, 24, 28, 0)),
    linear-gradient(0deg, rgba(24, 24, 28, 0.92), rgba(24, 24, 28, 0));
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
  transform: translate(-50%, calc(-50% + 14px)) scale(0.98);
}

@media (max-width: 520px) {
  .preset-grid--source {
    grid-template-columns: 1fr;
  }
}
</style>
