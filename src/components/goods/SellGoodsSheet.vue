<template>
  <Popup
    v-model:show="showProxy"
    teleport="body"
    :position="popupPosition"
    round
    :class="['sell-sheet-popup', { 'sell-sheet-popup--tablet': isTablet }]"
  >
    <div class="sell-sheet">
      <div v-if="!isTablet" class="sell-sheet__handle" />
      <p class="sell-sheet__title">{{ t('sale.sheetTitle') }}</p>

      <div class="sell-sheet__body">
        <!-- 目标状态 -->
        <div class="field-group">
          <span class="field-label">{{ t('sale.targetStatus') }}</span>
          <div class="chip-row">
            <button
              v-for="option in statusOptions"
              :key="option.value"
              :class="['status-chip', { 'status-chip--active': form.status === option.value }]"
              type="button"
              @click="form.status = option.value"
            >
              {{ option.label }}
            </button>
          </div>
        </div>

        <!-- 逐件选择 -->
        <div v-if="unitOptions.length > 0" class="field-group">
          <span class="field-label">{{ t('sale.selectUnits') }}</span>
          <div class="chip-row">
            <button
              v-for="unit in unitOptions"
              :key="unit.index"
              :class="['unit-chip', {
                'unit-chip--active': selectedUnits.has(unit.index),
                'unit-chip--disabled': unit.disabled
              }]"
              type="button"
              :disabled="unit.disabled"
              @click="toggleUnit(unit.index)"
            >
              <span>{{ t('sale.unitLabel', { n: unit.index + 1 }) }}</span>
              <span class="unit-chip__status">{{ unit.statusLabel }}</span>
            </button>
          </div>
        </div>

        <!-- 价格 -->
        <div v-if="showPriceFields" class="field-group">
          <span class="field-label">{{ priceLabel }}</span>
          <input
            v-model="form.price"
            class="field-input"
            type="number"
            inputmode="decimal"
            min="0"
            :placeholder="t('sale.pricePlaceholder')"
          />
          <p v-if="selectedUnits.size > 1" class="field-hint">{{ t('sale.perUnitHint') }}</p>
        </div>

        <!-- 平台 -->
        <div v-if="showPriceFields" class="field-group">
          <span class="field-label">{{ t('sale.platform') }}</span>
          <input
            v-model="form.platform"
            class="field-input"
            type="text"
            :placeholder="t('sale.platformPlaceholder')"
          />
          <div v-if="platformChips.length > 0" class="chip-row">
            <button
              v-for="platform in platformChips"
              :key="platform"
              :class="['platform-chip', { 'platform-chip--active': form.platform === platform }]"
              type="button"
              @click="form.platform = form.platform === platform ? '' : platform"
            >
              {{ platform }}
            </button>
          </div>
        </div>

        <!-- 手续费 -->
        <div v-if="showFeeField" class="field-group">
          <span class="field-label">{{ t('sale.fee') }}</span>
          <input
            v-model="form.fee"
            class="field-input"
            type="number"
            inputmode="decimal"
            min="0"
            :placeholder="t('sale.feePlaceholder')"
          />
        </div>

        <!-- 日期 -->
        <div class="field-group">
          <span class="field-label">{{ t('sale.date') }}</span>
          <button type="button" class="field-input field-input--btn" @click="openDatePicker">
            {{ form.date || t('common.selectDate') }}
          </button>
        </div>

        <!-- 备注 -->
        <div class="field-group">
          <span class="field-label">{{ t('sale.note') }}</span>
          <input
            v-model="form.note"
            class="field-input"
            type="text"
            :placeholder="t('sale.notePlaceholder')"
          />
        </div>
      </div>

      <button
        class="sell-sheet__submit"
        type="button"
        :disabled="saving || !canSubmit"
        @click="handleSubmit"
      >
        {{ submitText }}
      </button>
    </div>

    <AppDatePicker
      v-model:show="showDatePicker"
      v-model="datePickerValue"
      :z-index="2400"
      :is-tablet="isTablet"
      :title="t('sale.date')"
      :min-date="minDate"
      :max-date="maxDate"
      @confirm="onDateConfirm"
    />
  </Popup>
</template>

<script setup>
import { computed, ref, watch, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { Popup } from 'vant'
import { useTabletViewport } from '@/composables/useTabletViewport'
import { useGoodsStore } from '@/stores/goods'
import { formatDate } from '@/utils/format'
import { appendStatusTimelineEntry } from '@/utils/goods/statusTimeline'
import {
  EXITED_COLLECT_STATUSES,
  getStatusShortLabel,
  resolvePrimaryCollectStatus
} from '@/utils/goods/status'
import AppDatePicker from '@/components/common/AppDatePicker.vue'

const BUILTIN_PLATFORMS = ['闲鱼', '千岛', '微店', '淘宝', '转转']
const SELL_STATUSES = ['想出', '在售', '已出']

const props = defineProps({
  show: { type: Boolean, default: false },
  item: { type: Object, default: null }
})

const emit = defineEmits(['update:show', 'saved'])
const { t } = useI18n()
const store = useGoodsStore()
const { isTabletViewport: isTablet, updateViewport } = useTabletViewport()
onMounted(() => updateViewport())

const popupPosition = computed(() => (isTablet.value ? 'center' : 'bottom'))
const showProxy = computed({
  get: () => props.show,
  set: (v) => emit('update:show', v)
})

const saving = ref(false)
const selectedUnits = ref(new Set())
const form = ref({
  status: '在售',
  price: '',
  platform: '',
  fee: '',
  date: '',
  note: ''
})

const showDatePicker = ref(false)
const datePickerValue = ref([])
const minDate = new Date(2000, 0, 1)
const maxDate = new Date(2100, 11, 31)

const statusOptions = computed(() =>
  SELL_STATUSES.map((value) => ({ value, label: getStatusShortLabel(value) }))
)

const quantity = computed(() => Math.max(1, Number(props.item?.quantity) || 1))

/** 每件当前状态(unitCollectStatusList 优先,回退整条 collectStatus) */
const currentUnitStatuses = computed(() => {
  const unitList = Array.isArray(props.item?.unitCollectStatusList) ? props.item.unitCollectStatusList : []
  const fallback = String(props.item?.collectStatus || '已拥有').trim()
  return Array.from({ length: quantity.value }, (_, i) => String(unitList[i] || fallback).trim())
})

const unitOptions = computed(() => {
  if (quantity.value <= 1) return []
  return currentUnitStatuses.value.map((status, index) => ({
    index,
    statusLabel: getStatusShortLabel(status),
    disabled: EXITED_COLLECT_STATUSES.has(status)
  }))
})

const showPriceFields = computed(() => form.value.status !== '想出')
const showFeeField = computed(() => form.value.status === '已出')
const priceLabel = computed(() =>
  form.value.status === '已出' ? t('sale.dealPrice') : t('sale.listingPrice')
)

/** 历史平台(扫描全部商品时间线按频次排序) + 内置常用平台 */
const platformChips = computed(() => {
  const counts = new Map()
  for (const item of store.list) {
    const timeline = Array.isArray(item?.statusTimeline) ? item.statusTimeline : []
    for (const entry of timeline) {
      const platform = String(entry?.platform || '').trim()
      if (platform) counts.set(platform, (counts.get(platform) || 0) + 1)
    }
  }
  const history = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([p]) => p)
  const merged = [...history]
  for (const p of BUILTIN_PLATFORMS) {
    if (!merged.includes(p)) merged.push(p)
  }
  return merged.slice(0, 8)
})

const canSubmit = computed(() => {
  if (!props.item) return false
  if (unitOptions.value.length > 0 && selectedUnits.value.size === 0) return false
  return true
})

const submitText = computed(() => {
  if (saving.value) return t('common.loading')
  const count = unitOptions.value.length > 0 ? selectedUnits.value.size : 0
  return count > 0 ? `${t('sale.confirm')} (${count})` : t('sale.confirm')
})

watch(
  () => props.show,
  (show) => {
    if (!show) return
    const primary = String(props.item?.collectStatus || '').trim()
    form.value = {
      status: primary === '在售' ? '已出' : primary === '想出' ? '在售' : '已出',
      price: '',
      platform: '',
      fee: '',
      date: formatDate(new Date(), 'YYYY-MM-DD'),
      note: ''
    }
    const selectable = unitOptions.value.filter((u) => !u.disabled).map((u) => u.index)
    selectedUnits.value = new Set(selectable)
  }
)

function toggleUnit(index) {
  const next = new Set(selectedUnits.value)
  if (next.has(index)) next.delete(index)
  else next.add(index)
  selectedUnits.value = next
}

function openDatePicker() {
  const normalized = String(form.value.date || '').trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    const [year, month, day] = normalized.split('-')
    datePickerValue.value = [year, String(Number(month)), String(Number(day))]
  } else {
    const now = new Date()
    datePickerValue.value = [String(now.getFullYear()), String(now.getMonth() + 1), String(now.getDate())]
  }
  showDatePicker.value = true
}

function onDateConfirm({ selectedValues }) {
  if (Array.isArray(selectedValues) && selectedValues.length >= 3) {
    form.value.date = `${selectedValues[0]}-${String(selectedValues[1]).padStart(2, '0')}-${String(selectedValues[2]).padStart(2, '0')}`
  }
  showDatePicker.value = false
}

async function handleSubmit() {
  if (!props.item || saving.value || !canSubmit.value) return
  saving.value = true
  try {
    const status = form.value.status
    const saleFields = showPriceFields.value
      ? {
          price: form.value.price,
          platform: form.value.platform,
          fee: showFeeField.value ? form.value.fee : ''
        }
      : {}
    const baseOptions = { at: form.value.date, note: form.value.note, ...saleFields }

    let timeline = Array.isArray(props.item.statusTimeline) ? props.item.statusTimeline : []
    const updates = {}

    if (unitOptions.value.length > 0) {
      // 手续费是整笔金额(平台按交易收取),逐件均摊写入,否则统计会按件数重复扣除;
      // 均摊到分为止,余数记在最后一件上保证总和精确
      const selectedIndexes = [...selectedUnits.value]
      const totalFee = Number(saleFields.fee)
      const feeShares = new Map()
      if (Number.isFinite(totalFee) && totalFee > 0 && selectedIndexes.length > 0) {
        const base = Math.floor((totalFee / selectedIndexes.length) * 100) / 100
        selectedIndexes.forEach((unitIndex, i) => {
          const share = i === selectedIndexes.length - 1
            ? Math.round((totalFee - base * (selectedIndexes.length - 1)) * 100) / 100
            : base
          feeShares.set(unitIndex, String(share))
        })
      }

      const unitList = [...currentUnitStatuses.value]
      for (const index of selectedIndexes) {
        unitList[index] = status
        timeline = appendStatusTimelineEntry(timeline, status, {
          ...baseOptions,
          fee: feeShares.get(index) ?? '',
          unitIndex: index
        })
      }
      updates.unitCollectStatusList = unitList
      updates.collectStatus = resolvePrimaryCollectStatus({
        unitCollectStatusList: unitList,
        collectStatus: status
      })
    } else {
      timeline = appendStatusTimelineEntry(timeline, status, baseOptions)
      updates.collectStatus = status
    }

    updates.statusTimeline = timeline
    await store.updateGoods(props.item.id, updates)
    emit('update:show', false)
    emit('saved', { status })
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.sell-sheet-popup { overflow: visible; }
:global(.sell-sheet-popup.van-popup--bottom) { left: 0; right: 0; bottom: 0; width: 100%; }
:global(.sell-sheet-popup.van-popup--center) { width: min(480px, calc(100vw - 48px)) !important; max-width: calc(100vw - 48px) !important; border-radius: 28px !important; }

.sell-sheet {
  display: flex; flex-direction: column; width: 100%; max-height: 90dvh;
  padding: 12px 16px max(24px, env(safe-area-inset-bottom));
  background: radial-gradient(circle at top, color-mix(in srgb, var(--app-text) 5%, transparent), transparent 42%), var(--app-bg);
  color: var(--app-text);
}
.sell-sheet__handle { width: 36px; height: 4px; border-radius: 4px; background: rgba(142, 142, 147, 0.28); margin: 0 auto 16px; flex-shrink: 0; }
.sell-sheet__title { font-size: 13px; font-weight: 500; color: var(--app-text-tertiary); text-align: center; margin: 0 0 16px; }
.sell-sheet__body { display: flex; flex-direction: column; gap: 16px; overflow-y: auto; max-height: 56vh; padding-bottom: 4px; }

.field-group { display: flex; flex-direction: column; gap: 8px; }
.field-label { font-size: 13px; font-weight: 500; color: var(--app-text-secondary); }
.field-hint { font-size: 12px; color: var(--app-text-tertiary); margin: 0; }

.field-input {
  width: 100%; height: 44px; padding: 0 12px; border-radius: var(--radius-small, 14px);
  background: color-mix(in srgb, var(--app-glass) 76%, var(--app-surface));
  border: 1px solid color-mix(in srgb, var(--app-border) 78%, transparent);
  font-size: 15px; color: var(--app-text); outline: none; box-sizing: border-box;
}
.field-input::placeholder { color: var(--app-placeholder); }
.field-input--btn { display: flex; align-items: center; cursor: pointer; text-align: left; }

.chip-row { display: flex; gap: 6px; flex-wrap: wrap; }

.status-chip {
  display: inline-flex; align-items: center; height: 34px; padding: 0 16px;
  border: 1px solid color-mix(in srgb, var(--app-border) 78%, transparent); border-radius: 999px;
  background: transparent; color: var(--app-text-secondary); font-size: 13px; font-weight: 500;
  cursor: pointer; transition: background 0.14s ease, color 0.14s ease, border-color 0.14s ease;
}
.status-chip--active { background: var(--app-chip-accent-bg, rgba(32, 112, 192, 0.12)); color: var(--app-chip-accent-text, #2070c0); border-color: var(--app-chip-accent-border, rgba(32, 112, 192, 0.24)); }

.unit-chip {
  display: inline-flex; flex-direction: column; align-items: center; gap: 1px; padding: 6px 12px;
  border: 1px solid color-mix(in srgb, var(--app-border) 78%, transparent); border-radius: 12px;
  background: transparent; color: var(--app-text-secondary); font-size: 12px; font-weight: 500;
  cursor: pointer; transition: background 0.14s ease, color 0.14s ease, border-color 0.14s ease;
}
.unit-chip__status { font-size: 11px; color: var(--app-text-tertiary); }
.unit-chip--active { background: var(--app-chip-accent-bg, rgba(32, 112, 192, 0.12)); color: var(--app-chip-accent-text, #2070c0); border-color: var(--app-chip-accent-border, rgba(32, 112, 192, 0.24)); }
.unit-chip--active .unit-chip__status { color: var(--app-chip-accent-text, #2070c0); }
.unit-chip--disabled { opacity: 0.4; cursor: not-allowed; }

.platform-chip {
  display: inline-flex; align-items: center; height: 28px; padding: 0 10px;
  border: 1px solid color-mix(in srgb, var(--app-border) 78%, transparent); border-radius: 999px;
  background: transparent; color: var(--app-text-secondary); font-size: 12px; font-weight: 500;
  cursor: pointer; white-space: nowrap; transition: background 0.14s ease, color 0.14s ease, border-color 0.14s ease;
}
.platform-chip--active { background: var(--app-chip-accent-bg, rgba(32, 112, 192, 0.12)); color: var(--app-chip-accent-text, #2070c0); border-color: var(--app-chip-accent-border, rgba(32, 112, 192, 0.24)); }

.sell-sheet__submit {
  height: var(--button-height, 52px); border: none; border-radius: var(--radius-small, 14px);
  background: var(--app-text); color: var(--app-surface); font-size: 16px; font-weight: 600;
  cursor: pointer; margin-top: 16px; flex-shrink: 0;
  transition: transform 0.14s ease, opacity 0.14s ease;
}
.sell-sheet__submit:active { transform: scale(var(--press-scale-button, 0.96)); }
.sell-sheet__submit:disabled { opacity: 0.4; cursor: not-allowed; }

:global(html.theme-dark) .sell-sheet-popup.van-popup { --van-popup-background: var(--app-surface); background: var(--app-surface) !important; box-shadow: 0 -4px 24px rgba(0, 0, 0, 0.42); border: none; }
</style>
