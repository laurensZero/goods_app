<template>
  <AppSheet
    v-model="showProxy"
    placement="auto"
    sheet-class="group-sheet-popup"
  >
    <div class="group-sheet">
      <p class="group-sheet__title">{{ t('nav.groupDetail') }}</p>

      <div class="group-sheet__body">
        <!-- Group name -->
        <label class="field">
          <span class="field-label">{{ t('goodsGroup.groupName') }}</span>
          <div class="field-card">
            <input
              v-model="editName"
              class="field-input"
              type="text"
              :placeholder="t('goodsGroup.groupNamePlaceholder')"
              maxlength="50"
              @blur="handleNameChange"
            />
          </div>
        </label>

        <!-- Price mode -->
        <div class="field">
          <span class="field-label">{{ t('goodsGroup.priceMode') }}</span>
          <div class="field-card field-card--row">
            <button
              v-for="mode in priceModes"
              :key="mode.value"
              :class="['segment-btn', { 'segment-btn--active': editSummaryMode === mode.value }]"
              type="button"
              @click="handlePriceModeChange(mode.value)"
            >
              {{ mode.label }}
            </button>
          </div>
        </div>

        <label v-if="editSummaryMode === 'manual'" class="field">
          <span class="field-label">{{ t('goodsGroup.manualPrice') }}</span>
          <div class="manual-price-row">
            <div class="field-card field-card--price">
              <input
                v-model="editTotalAmount"
                class="field-input"
                type="number"
                placeholder="0.00"
                @blur="handleTotalAmountChange"
              />
            </div>
            <AppSelect :model-value="editCurrency" :options="currencyOptions" :placeholder="t('goodsGroup.priceCurrency')" class="currency-select" @update:model-value="handleCurrencyChange" />
          </div>
        </label>

        <!-- Cover mode -->
        <div class="field">
          <span class="field-label">{{ t('goodsGroup.coverMode') }}</span>
          <div class="field-card field-card--row">
            <button
              v-for="mode in coverModes"
              :key="mode.value"
              :class="['segment-btn', { 'segment-btn--active': editCoverMode === mode.value }]"
              type="button"
              @click="handleCoverModeChange(mode.value)"
            >
              {{ mode.label }}
            </button>
          </div>
        </div>

        <button
          v-if="editCoverMode === 'manual'"
          class="field-card field-card--action"
          type="button"
          @click="showCoverPicker = true"
        >
          <span class="field-label">{{ t('goodsGroup.selectCover') }}</span>
          <svg class="action-arrow" viewBox="0 0 24 24" fill="none"><path d="M9 6l6 6-6 6" /></svg>
        </button>

        <!-- Note -->
        <label class="field">
          <span class="field-label">{{ t('goodsGroup.note') }}</span>
          <div class="field-card">
            <textarea
              v-model="editNote"
              class="field-textarea"
              rows="2"
              :placeholder="t('goodsGroup.note')"
              @blur="handleNoteChange"
            />
          </div>
        </label>

        <!-- Member list -->
        <div class="field">
          <span class="field-label">{{ t('goodsGroup.memberCount') }} ({{ memberGoods.length }})</span>
          <div class="member-list-card">
            <div
              v-for="goods in memberGoods"
              :key="goods.id"
              class="member-item"
            >
              <LazyCachedImage
                v-if="getGoodsThumb(goods)"
                :src="getGoodsThumb(goods)"
                class="member-thumb"
                loading="lazy"
                resume-decode-validation
              />
              <div v-else class="member-thumb member-thumb--placeholder" />
              <div class="member-info">
                <span class="member-name">{{ goods.name }}</span>
                <span class="member-price">{{ goods.actualPrice || goods.price || '-' }}</span>
              </div>
              <button class="member-remove" type="button" @click="handleRemoveMember(goods.id)">
                <svg viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" /></svg>
              </button>
            </div>
          </div>
        </div>

        <!-- Delete group -->
        <button class="delete-btn" type="button" @click="$emit('delete-group')">
          {{ t('goodsGroup.dissolveGroup') }}
        </button>
      </div>
    </div>

    <!-- Cover picker -->
    <AppSheet
      v-model="showCoverPicker"
      placement="auto"
      sheet-class="group-sheet-popup"
    >
      <div class="group-sheet">
        <p class="group-sheet__title">{{ t('goodsGroup.selectCover') }}</p>
        <div class="cover-picker-grid">
          <button
            v-for="goods in memberGoods"
            :key="goods.id"
            :class="['cover-picker-item', { 'cover-picker-item--active': editCoverItemId === goods.id }]"
            type="button"
            @click="handleCoverSelect(goods.id)"
          >
            <LazyCachedImage
              v-if="getGoodsThumb(goods)"
              :src="getGoodsThumb(goods)"
              class="cover-picker-thumb"
              loading="lazy"
              resume-decode-validation
            />
            <div v-else class="cover-picker-thumb cover-picker-thumb--placeholder" />
            <span class="cover-picker-name">{{ goods.name }}</span>
          </button>
        </div>
      </div>
    </AppSheet>
  </AppSheet>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import AppSheet from '@/components/common/AppSheet.vue'
import { getPrimaryGoodsImageUrl } from '@/utils/goods/images'
import { CURRENCIES } from '@/constants/currencies'
import AppSelect from '@/components/common/AppSelect.vue'
import LazyCachedImage from '@/components/image/LazyCachedImage.vue'

const props = defineProps({
  show: { type: Boolean, default: false },
  group: { type: Object, required: true },
  memberGoods: { type: Array, default: () => [] }
})

const emit = defineEmits(['update:show', 'update', 'remove-member', 'reorder', 'delete-group'])
const { t } = useI18n()

const showProxy = computed({
  get: () => props.show,
  set: (v) => emit('update:show', v)
})

const editName = ref('')
const editSummaryMode = ref('auto')
const editTotalAmount = ref('')
const editCurrency = ref('CNY')
const editCoverMode = ref('auto')
const editCoverItemId = ref('')
const editNote = ref('')
const showCoverPicker = ref(false)

watch(() => props.group, (g) => {
  if (!g) return
  editName.value = g.name || ''
  editSummaryMode.value = g.summaryMode || 'auto'
  editTotalAmount.value = g.totalAmount ? String(g.totalAmount) : ''
  editCurrency.value = g.currency || 'CNY'
  editCoverMode.value = g.coverMode || 'auto'
  editCoverItemId.value = g.coverItemId || ''
  editNote.value = g.note || ''
}, { immediate: true })

const priceModes = computed(() => [
  { value: 'auto', label: t('goodsGroup.priceModeAuto') },
  { value: 'manual', label: t('goodsGroup.priceModeManual') }
])

const coverModes = computed(() => [
  { value: 'auto', label: t('goodsGroup.coverModeAuto') },
  { value: 'manual', label: t('goodsGroup.coverModeManual') }
])

const currencyOptions = computed(() =>
  CURRENCIES.map((c) => ({ label: `${c.symbol} ${c.name}`, value: c.code }))
)

function getGoodsThumb(goods) {
  return getPrimaryGoodsImageUrl(goods.images, goods.coverImage || goods.image) || null
}

function handleNameChange() {
  const name = editName.value.trim()
  if (name !== props.group.name) emit('update', props.group.id, { name })
}

function handleTotalAmountChange() {
  const amount = parseFloat(editTotalAmount.value) || 0
  if (amount !== props.group.totalAmount) emit('update', props.group.id, { totalAmount: amount })
}

function handleCurrencyChange(value) {
  editCurrency.value = value
  emit('update', props.group.id, { currency: value })
}

function handleNoteChange() {
  if (editNote.value !== props.group.note) emit('update', props.group.id, { note: editNote.value })
}

function handlePriceModeChange(value) {
  editSummaryMode.value = value
  emit('update', props.group.id, { summaryMode: value })
}

function handleCoverModeChange(value) {
  editCoverMode.value = value
  emit('update', props.group.id, { coverMode: value })
}

function handleCoverSelect(goodsId) {
  editCoverItemId.value = goodsId
  showCoverPicker.value = false
  emit('update', props.group.id, { coverItemId: goodsId, coverMode: 'manual' })
}

function handleRemoveMember(goodsId) {
  emit('remove-member', [goodsId])
}

function consumeBack() {
  if (showCoverPicker.value) {
    showCoverPicker.value = false
    return true
  }
  return false
}

defineExpose({ consumeBack })
</script>

<style scoped>
/* 平板 center 时覆盖 AppSheet 默认 420px 宽度（原 Popup 为 480px） */
:global(.app-sheet-overlay--center .group-sheet-popup.app-sheet--center) {
  width: min(480px, calc(100vw - 48px)) !important;
}

.group-sheet {
  display: flex;
  flex-direction: column;
  width: 100%;
  background:
    radial-gradient(circle at top, color-mix(in srgb, var(--app-text) 5%, transparent), transparent 42%),
    transparent;
  color: var(--app-text);
}

.group-sheet__title {
  font-size: 13px;
  font-weight: 500;
  color: var(--app-text-tertiary);
  text-align: center;
  margin: 0 0 16px;
}

.group-sheet__body {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.field-label {
  color: var(--app-text);
  font-size: 14px;
  font-weight: 600;
  padding: 0 2px;
}

.field-card {
  background: color-mix(in srgb, var(--app-glass) 76%, var(--app-surface));
  border: 1px solid color-mix(in srgb, var(--app-border) 78%, transparent);
  border-radius: var(--radius-card, 18px);
  padding: 0 14px;
}

.field-card--row {
  display: flex;
  padding: 4px;
  gap: 4px;
}

.manual-price-row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.manual-price-row .field-card--price {
  flex: 1;
  min-width: 0;
}

.currency-select {
  width: 135px;
  flex-shrink: 0;
}

.currency-select :deep(.app-select__trigger) {
  height: var(--input-height, 48px);
  border-radius: var(--radius-card, 18px);
  background: color-mix(in srgb, var(--app-glass) 76%, var(--app-surface));
  border: 1px solid color-mix(in srgb, var(--app-border) 78%, transparent);
}

.field-card--action {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px;
  cursor: pointer;
  width: 100%;
  border: none;
  text-align: left;
  transition: background 0.14s ease;
}

.field-card--action:active {
  background: var(--app-selection-bg);
}

.action-arrow {
  width: 18px;
  height: 18px;
  stroke: var(--app-text-tertiary);
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.segment-btn {
  flex: 1;
  height: 36px;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: var(--app-text-secondary);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.14s ease, color 0.14s ease, box-shadow 0.14s ease;
}

.segment-btn--active {
  background: var(--app-text);
  color: var(--app-surface);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.12);
}

.field-input {
  width: 100%;
  height: var(--input-height, 48px);
  border: none;
  background: transparent;
  font-size: 15px;
  color: var(--app-text);
  outline: none;
}

.field-input::placeholder {
  color: var(--app-placeholder);
}

.field-textarea {
  width: 100%;
  min-height: 48px;
  padding: 12px 0;
  border: none;
  background: transparent;
  font-size: 15px;
  color: var(--app-text);
  outline: none;
  resize: vertical;
  font-family: inherit;
}

.field-textarea::placeholder {
  color: var(--app-placeholder);
}

/* Member list */
.member-list-card {
  background: color-mix(in srgb, var(--app-glass) 76%, var(--app-surface));
  border: 1px solid color-mix(in srgb, var(--app-border) 78%, transparent);
  border-radius: var(--radius-card, 18px);
  overflow: hidden;
}

.member-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
}

.member-item:not(:last-child) {
  border-bottom: 1px solid rgba(142, 142, 147, 0.12);
}

.member-thumb {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  object-fit: cover;
  flex-shrink: 0;
}

.member-thumb--placeholder {
  background: var(--app-surface-muted);
}

.member-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.member-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--app-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.member-price {
  font-size: 12px;
  color: var(--app-text-tertiary);
}

.member-remove {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  border-radius: 50%;
  cursor: pointer;
  flex-shrink: 0;
}

.member-remove svg {
  width: 16px;
  height: 16px;
  stroke: var(--app-text-tertiary);
  stroke-width: 2;
  stroke-linecap: round;
}

.member-remove:active {
  background: var(--app-selection-bg);
}

.delete-btn {
  height: var(--button-height, 52px);
  border: 1.5px solid #ff3b30;
  border-radius: var(--radius-small, 14px);
  background: transparent;
  color: #ff3b30;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.14s ease, background 0.14s ease;
}

.delete-btn:active {
  transform: scale(var(--press-scale-button, 0.96));
  background: rgba(255, 59, 48, 0.08);
}

/* Cover picker */
.cover-picker-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  padding: 0 4px;
}

.cover-picker-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 10px 6px;
  border-radius: var(--radius-card, 18px);
  border: 2px solid color-mix(in srgb, var(--app-border) 78%, transparent);
  background: color-mix(in srgb, var(--app-glass) 76%, var(--app-surface));
  cursor: pointer;
  transition: border-color 0.2s ease, background 0.2s ease, transform 0.14s ease;
}

.cover-picker-item--active {
  border-color: var(--app-pending, #0e74e9);
  background: rgba(14, 116, 233, 0.06);
}

.cover-picker-item:active {
  transform: scale(var(--press-scale-card, 0.98));
}

.cover-picker-thumb {
  width: 56px;
  height: 56px;
  border-radius: 10px;
  object-fit: cover;
}

.cover-picker-thumb--placeholder {
  background: var(--app-surface-muted);
}

.cover-picker-name {
  font-size: 11px;
  color: var(--app-text-secondary);
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}
</style>
