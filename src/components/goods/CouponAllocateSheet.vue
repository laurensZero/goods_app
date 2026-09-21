<template>
  <AppSheet
    v-model="showProxy"
    :z-index="210"
    placement="auto"
    size="wide"
    :close-on-overlay="false"
    sheet-class="coupon-allocate-popup"
  >
    <div class="coupon-sheet">
      <section class="coupon-hero">
        <p class="coupon-hero__label">{{ t('goods.couponAllocate.title') }}</p>
        <h2 class="coupon-hero__title">{{ t('goods.couponAllocate.heading', { count: eligibleItems.length }) }}</h2>
        <p class="coupon-hero__desc">{{ t('goods.couponAllocate.desc') }}</p>
      </section>

      <section class="coupon-section">
        <div class="field-card coupon-card">
          <label class="field">
            <span class="field-label">{{ t('goods.couponAllocate.amountLabel') }}</span>
            <input
              v-model="amountInput"
              class="field-input"
              type="number"
              min="0"
              step="0.01"
              inputmode="decimal"
              :placeholder="t('goods.couponAllocate.amountPlaceholder')"
              :aria-invalid="Boolean(amountError)"
              @keydown="preventNegative"
              @input="sanitizeAmount"
            />
            <span v-if="amountError" class="field-error">{{ amountError }}</span>
          </label>

          <div class="preview-block">
            <div class="preview-head">
              <span class="preview-head__title">{{ t('goods.couponAllocate.previewTitle') }}</span>
              <button class="preview-head__btn" type="button" @click="runPreview">
                {{ t('goods.couponAllocate.calculate') }}
              </button>
            </div>

            <div v-if="skippedCount > 0" class="preview-note">
              {{ t('goods.couponAllocate.skippedNoPrice', { count: skippedCount }) }}
            </div>

            <template v-if="preview">
              <div class="preview-summary">
                <div class="preview-summary__row">
                  <span>{{ t('goods.couponAllocate.totalListed') }}</span>
                  <span>¥{{ formatMoney(preview.totalListed) }}</span>
                </div>
                <div class="preview-summary__row">
                  <span>{{ t('goods.couponAllocate.totalDiscount') }}</span>
                  <span class="preview-summary__discount">-¥{{ formatMoney(preview.totalAllocated) }}</span>
                </div>
                <div class="preview-summary__row preview-summary__row--strong">
                  <span>{{ t('goods.couponAllocate.totalPaid') }}</span>
                  <span>¥{{ formatMoney(preview.totalListed - preview.totalAllocated) }}</span>
                </div>
              </div>

              <ul class="preview-list">
                <li v-for="row in preview.rows" :key="row.id" class="preview-item" :class="{ 'preview-item--skip': !row.eligible }">
                  <div class="preview-item__main">
                    <span class="preview-item__name">{{ row.name }}</span>
                    <span class="preview-item__meta">
                      ¥{{ formatMoney(row.price) }} × {{ row.quantity }}
                      <template v-if="row.quantity >= 2 && row.unitActualPriceList.length">
                        · {{ t('goods.couponAllocate.perUnit') }}
                        {{ row.unitActualPriceList.map((u) => `¥${u}`).join(' / ') }}
                      </template>
                    </span>
                  </div>
                  <div class="preview-item__prices">
                    <span v-if="row.eligible" class="preview-item__discount">-¥{{ formatMoney(row.discount) }}</span>
                    <span class="preview-item__actual">¥{{ formatMoney(row.actualTotal) }}</span>
                  </div>
                </li>
              </ul>
            </template>
            <div v-else class="preview-empty">{{ t('goods.couponAllocate.previewEmpty') }}</div>
          </div>
        </div>
      </section>

      <div class="coupon-actions">
        <button class="confirm-btn confirm-btn--ghost" type="button" @click="close">{{ t('common.cancel') }}</button>
        <button
          class="confirm-btn confirm-btn--danger"
          type="button"
          :disabled="!canConfirm"
          @click="confirm"
        >
          {{ t('goods.couponAllocate.confirmApply') }}
        </button>
      </div>
    </div>
  </AppSheet>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import AppSheet from '@/components/common/AppSheet.vue'
import { allocateCouponByListedPrice } from '@/utils/goods/couponAllocate'

const { t } = useI18n()

const props = defineProps({
  show: { type: Boolean, default: false },
  /** 已选中的收藏谷子（心愿单项应由调用方过滤掉） */
  items: { type: Array, default: () => [] }
})

const emit = defineEmits(['update:show', 'apply'])

const amountInput = ref('')
const amountError = ref('')
const preview = ref(null)

const showProxy = computed({
  get: () => props.show,
  set: (value) => emit('update:show', value)
})

const eligibleItems = computed(() =>
  (props.items || []).filter((item) => {
    const n = Number(item?.price)
    return Number.isFinite(n) && n > 0
  })
)

const skippedCount = computed(() => (props.items || []).length - eligibleItems.value.length)

const parsedAmount = computed(() => {
  const raw = String(amountInput.value || '').trim()
  if (!raw) return NaN
  return Number(raw)
})

const canConfirm = computed(() =>
  Boolean(preview.value?.ok) && preview.value.rows.some((r) => r.eligible)
)

watch(
  () => props.show,
  (visible) => {
    if (visible) {
      amountInput.value = ''
      amountError.value = ''
      preview.value = null
    }
  }
)

function close() {
  emit('update:show', false)
}

function preventNegative(event) {
  if (event.key === '-') event.preventDefault()
}

function sanitizeAmount(event) {
  const raw = String(event?.target?.value ?? amountInput.value ?? '')
  amountInput.value = raw.replace(/-/g, '')
  amountError.value = ''
  preview.value = null
}

function runPreview() {
  const amount = parsedAmount.value
  if (!Number.isFinite(amount) || amount <= 0) {
    amountError.value = t('goods.couponAllocate.invalidAmount')
    preview.value = null
    return
  }
  amountError.value = ''
  preview.value = allocateCouponByListedPrice(eligibleItems.value, amount)
  if (!preview.value.ok) {
    amountError.value = t(`goods.couponAllocate.reason.${preview.value.reason || 'invalidAmount'}`)
  }
}

function confirm() {
  if (!canConfirm.value) return
  const rows = preview.value.rows.filter((r) => r.eligible)
  emit('apply', {
    couponAmount: preview.value.couponAmount,
    allocations: rows.map((r) => ({
      id: r.id,
      actualPrice: r.actualPrice,
      unitActualPriceList: r.unitActualPriceList
    }))
  })
  close()
}

function formatMoney(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return '0.00'
  return n.toFixed(2)
}

defineExpose({ close })
</script>

<style scoped>
:global(.app-sheet-overlay--center .coupon-allocate-popup.app-sheet--center) {
  width: min(560px, calc(100vw - 48px)) !important;
}

:global(.coupon-allocate-popup .app-sheet__scroll) {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-height: 0;
}

.coupon-sheet {
  display: flex;
  flex-direction: column;
  gap: 14px;
  width: 100%;
  color: var(--app-text);
}

.coupon-hero__label {
  color: var(--app-text-tertiary);
  font-size: 13px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.coupon-hero__title {
  margin-top: 6px;
  font-size: 24px;
  font-weight: 600;
  letter-spacing: -0.03em;
}

.coupon-hero__desc {
  margin-top: 8px;
  color: var(--app-text-secondary);
  font-size: 13px;
  line-height: 1.6;
}

.coupon-card {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 14px;
  border-radius: var(--radius-card);
  background: var(--app-surface);
  box-shadow: var(--app-shadow);
}

.field {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
  border-radius: var(--radius-small);
  background: var(--app-surface-soft);
}

.field-label {
  font-size: 14px;
  font-weight: 600;
}

.field-input {
  width: 100%;
  min-height: 48px;
  padding: 0 14px;
  border: 1px solid var(--app-input-border);
  border-radius: 16px;
  background: var(--app-surface);
  color: var(--app-text);
  font-size: 16px;
}

.field-input:focus {
  border-color: var(--app-input-focus-border);
  box-shadow: 0 0 0 3px var(--app-input-focus-ring);
  outline: none;
}

.field-error {
  color: #c74444;
  font-size: 12px;
}

.preview-block {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  border-radius: var(--radius-small);
  background: var(--app-surface-soft);
}

.preview-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.preview-head__title {
  font-size: 14px;
  font-weight: 600;
}

.preview-head__btn {
  border: none;
  background: transparent;
  color: #2070c0;
  font-size: 13px;
  font-weight: 600;
  padding: 0;
}

.preview-note {
  color: var(--app-text-tertiary);
  font-size: 12px;
  line-height: 1.5;
}

.preview-empty {
  color: var(--app-text-tertiary);
  font-size: 13px;
  text-align: center;
  padding: 12px 0;
}

.preview-summary {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 12px;
  border-radius: 12px;
  background: var(--app-surface);
}

.preview-summary__row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  font-size: 13px;
  color: var(--app-text-secondary);
}

.preview-summary__row--strong {
  color: var(--app-text);
  font-weight: 600;
  font-size: 14px;
}

.preview-summary__discount {
  color: #c7375d;
  font-weight: 600;
}

.preview-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 280px;
  overflow-y: auto;
}

.preview-item {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 12px;
  background: var(--app-surface);
}

.preview-item--skip {
  opacity: 0.55;
}

.preview-item__main {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.preview-item__name {
  font-size: 14px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.preview-item__meta {
  color: var(--app-text-tertiary);
  font-size: 12px;
  line-height: 1.4;
}

.preview-item__prices {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
  flex-shrink: 0;
}

.preview-item__discount {
  color: #c7375d;
  font-size: 12px;
  font-weight: 600;
}

.preview-item__actual {
  font-size: 14px;
  font-weight: 600;
}

.coupon-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.confirm-btn {
  height: 48px;
  border: none;
  border-radius: 16px;
  font-size: 15px;
  font-weight: 600;
}

.confirm-btn:disabled {
  opacity: 0.4;
  pointer-events: none;
}

.confirm-btn--ghost {
  background: var(--app-surface-soft);
  color: var(--app-text);
}

.confirm-btn--danger {
  background: var(--app-text);
  color: var(--app-surface);
}

:global(html.theme-dark) .coupon-sheet .field-input {
  border-color: var(--app-input-border) !important;
  background: color-mix(in srgb, var(--app-surface) 94%, var(--app-glass)) !important;
}
</style>
