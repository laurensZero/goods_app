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
              type="text"
              inputmode="decimal"
              autocomplete="off"
              :placeholder="t('goods.couponAllocate.amountPlaceholder')"
              :aria-invalid="Boolean(previewError)"
              @keydown="preventNegative"
              @input="sanitizeAmount"
            />
            <span v-if="previewError" class="field-error">{{ previewError }}</span>
          </label>

          <div class="ghost-block" :class="{ 'ghost-block--open': ghostPanelOpen }">
            <button class="ghost-toggle" type="button" @click="ghostPanelOpen = !ghostPanelOpen">
              <span class="ghost-toggle__label">
                {{ t('goods.couponAllocate.ghostToggle') }}
                <span v-if="ghostItems.length" class="ghost-toggle__badge">{{ ghostItems.length }}</span>
              </span>
              <svg class="ghost-toggle__chevron" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </button>
            <p class="ghost-hint">{{ t('goods.couponAllocate.ghostHint') }}</p>

            <div v-if="ghostPanelOpen" class="ghost-panel">
              <div v-for="(ghost, index) in ghostItems" :key="ghost.id" class="ghost-row">
                <input
                  :value="ghost.amount"
                  class="field-input ghost-row__amount"
                  type="text"
                  inputmode="decimal"
                  autocomplete="off"
                  :placeholder="t('goods.couponAllocate.ghostAmountPlaceholder')"
                  @keydown="preventNegative"
                  @input="onGhostAmountInput(ghost, $event)"
                />
                <input
                  :value="ghost.quantity"
                  class="field-input ghost-row__qty"
                  type="text"
                  inputmode="numeric"
                  autocomplete="off"
                  :aria-label="t('goods.couponAllocate.ghostQuantityLabel')"
                  :placeholder="t('goods.couponAllocate.ghostQuantityLabel')"
                  @input="onGhostQuantityInput(ghost, $event)"
                />
                <button
                  class="ghost-row__remove"
                  type="button"
                  :aria-label="t('goods.couponAllocate.ghostRemove')"
                  @click="removeGhost(index)"
                >×</button>
              </div>
              <button class="ghost-add" type="button" @click="addGhost">
                + {{ t('goods.couponAllocate.ghostAdd') }}
              </button>
            </div>
          </div>

          <div class="preview-block">
            <div class="preview-head">
              <span class="preview-head__title">{{ t('goods.couponAllocate.previewTitle') }}</span>
              <span v-if="preview" class="preview-head__live">{{ t('goods.couponAllocate.liveHint') }}</span>
            </div>

            <div v-if="skippedCount > 0" class="preview-note">
              {{ t('goods.couponAllocate.skippedNoPrice', { count: skippedCount }) }}
            </div>

            <template v-if="preview">
              <div class="preview-summary">
                <div class="preview-summary__row">
                  <span>{{ t('goods.couponAllocate.totalListed') }}</span>
                  <span>¥{{ formatMoney(summary.listed) }}</span>
                </div>
                <div class="preview-summary__row">
                  <span>{{ t('goods.couponAllocate.totalDiscount') }}</span>
                  <span class="preview-summary__discount">-¥{{ formatMoney(summary.discount) }}</span>
                </div>
                <div v-if="summary.ghostCount > 0" class="preview-summary__row">
                  <span>{{ t('goods.couponAllocate.ghostRefundTotal') }}</span>
                  <span class="preview-summary__ghost">-¥{{ formatMoney(summary.ghostRefund) }}</span>
                </div>
                <div class="preview-summary__row preview-summary__row--strong">
                  <span>{{ t('goods.couponAllocate.totalPaid') }}</span>
                  <span>¥{{ formatMoney(summary.paid) }}</span>
                </div>
              </div>

              <ul class="preview-list">
                <li
                  v-for="row in preview.rows"
                  :key="row.id"
                  class="preview-item"
                  :class="{ 'preview-item--skip': !row.eligible, 'preview-item--ghost': row.ghost }"
                >
                  <div class="preview-item__main">
                    <span class="preview-item__title-row">
                      <span class="preview-item__name">{{ row.name || t('goods.couponAllocate.ghostFallbackName') }}</span>
                      <span v-if="row.ghost" class="preview-item__tag">{{ t('goods.couponAllocate.ghostTag') }}</span>
                    </span>
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

/** 已退款/退掉的「幽灵谷子」：不写回收藏，只参与分摊比例计算 */
const ghostItems = ref([])
const ghostPanelOpen = ref(false)
let ghostSeq = 0

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

/** 幽灵行 → 分摊入参（金额为标价单价，数量默认 1） */
const ghostsForAlloc = computed(() =>
  ghostItems.value.map((ghost) => ({
    id: ghost.id,
    name: '',
    price: parseAmountText(ghost.amount),
    quantity: Math.max(1, Math.floor(Number(ghost.quantity) || 1))
  }))
)

const parsedAmount = computed(() => {
  const raw = normalizeAmountText(amountInput.value)
  if (!raw || raw === '.') return NaN
  return Number(raw)
})

/** 填写时实时分摊；金额非法时不展示预览 */
const liveResult = computed(() => {
  const amount = parsedAmount.value
  if (!Number.isFinite(amount) || amount <= 0) return null
  return allocateCouponByListedPrice(eligibleItems.value, amount, ghostsForAlloc.value)
})

const preview = computed(() => (liveResult.value?.ok ? liveResult.value : null))

const previewError = computed(() => {
  const raw = normalizeAmountText(amountInput.value)
  if (!raw) return ''
  if (raw === '.') return t('goods.couponAllocate.invalidAmount')
  const amount = Number(raw)
  if (!Number.isFinite(amount) || amount <= 0) {
    return t('goods.couponAllocate.invalidAmount')
  }
  if (liveResult.value && !liveResult.value.ok) {
    return t(`goods.couponAllocate.reason.${liveResult.value.reason || 'invalidAmount'}`)
  }
  return ''
})

function normalizeAmountText(value) {
  let raw = String(value ?? '').trim()
  // 全角数字/点 → 半角，便于手机输入
  raw = raw
    .replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/[．。・]/g, '.')
    .replace(/[^\d.]/g, '')
  const parts = raw.split('.')
  if (parts.length > 2) {
    raw = `${parts[0]}.${parts.slice(1).join('')}`
  } else {
    raw = parts.length === 2 ? `${parts[0]}.${parts[1]}` : raw
  }
  const [intPart = '', decPart] = raw.split('.')
  if (decPart !== undefined) {
    raw = `${intPart}.${decPart.slice(0, 2)}`
  }
  return raw
}

/** 归一化后的金额文本（'' 表示未填） */
function parseAmountText(value) {
  const raw = normalizeAmountText(value)
  return !raw || raw === '.' ? '' : raw
}

function preventNegative(event) {
  if (event.key === '-') event.preventDefault()
}

function sanitizeAmount(event) {
  const next = normalizeAmountText(event?.target?.value ?? amountInput.value)
  amountInput.value = next
  if (event?.target && event.target.value !== next) {
    event.target.value = next
  }
}

// ── 幽灵谷子（已退掉/退款，仅参与分摊）──────────────────────────
function addGhost() {
  ghostSeq += 1
  ghostItems.value = [...ghostItems.value, { id: `ghost_${Date.now()}_${ghostSeq}`, amount: '', quantity: '1' }]
  ghostPanelOpen.value = true
}

function removeGhost(index) {
  ghostItems.value = ghostItems.value.filter((_, i) => i !== index)
}

function onGhostAmountInput(ghost, event) {
  const next = normalizeAmountText(event?.target?.value ?? ghost.amount)
  ghost.amount = next
  if (event?.target && event.target.value !== next) {
    event.target.value = next
  }
}

function onGhostQuantityInput(ghost, event) {
  const digits = String(event?.target?.value ?? ghost.quantity).replace(/[^\d]/g, '').slice(0, 2)
  ghost.quantity = digits
  if (event?.target && event.target.value !== digits) {
    event.target.value = digits
  }
}

/** 汇总（元）：含幽灵，便于对账（标价 - 优惠 - 幽灵退回 = 剩余实付） */
const summary = computed(() => {
  const rows = preview.value?.rows || []
  const listed = rows.reduce((sum, row) => sum + Number(row.listedTotal || 0), 0)
  const discount = rows.reduce((sum, row) => sum + Number(row.discount || 0), 0)
  const ghostRefund = rows.reduce((sum, row) => (row.ghost ? sum + Number(row.actualTotal || 0) : sum), 0)
  const paid = rows.reduce((sum, row) => (row.ghost ? sum : sum + Number(row.actualTotal || 0)), 0)
  const ghostCount = rows.filter((row) => row.ghost).length
  return { listed, discount, ghostRefund, paid, ghostCount }
})

const canConfirm = computed(() =>
  Boolean(preview.value?.ok) && preview.value.rows.some((r) => r.eligible && !r.ghost)
)

watch(
  () => props.show,
  (visible) => {
    if (visible) {
      amountInput.value = ''
      ghostItems.value = []
      ghostPanelOpen.value = false
    }
  }
)

function close() {
  emit('update:show', false)
}

function confirm() {
  if (!canConfirm.value) return
  // 幽灵谷子不进收藏，只写回真实选中的谷子
  const rows = preview.value.rows.filter((r) => r.eligible && !r.ghost)
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
  font-size: var(--font-body);
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
  font-size: var(--font-body);
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
  font-size: var(--font-body-lg);
  font-weight: 600;
}

.field-input {
  width: 100%;
  min-height: 48px;
  padding: 0 14px;
  border: 1px solid var(--app-input-border);
  border-radius: var(--radius-medium);
  background: var(--app-surface);
  color: var(--app-text);
  font-size: var(--font-title);
}

.field-input:focus {
  border-color: var(--app-input-focus-border);
  box-shadow: 0 0 0 3px var(--app-input-focus-ring);
  outline: none;
}

.field-error {
  color: #c74444;
  font-size: var(--font-small);
}

/* ── 幽灵谷子（已退款，仅参与分摊）───────────────────────────── */
.ghost-block {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 14px;
  border-radius: var(--radius-small);
  background: var(--app-surface-soft);
}

.ghost-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--app-text);
  font-size: var(--font-body-lg);
  font-weight: 600;
  text-align: left;
}

.ghost-toggle__label {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.ghost-toggle__badge {
  min-width: 20px;
  padding: 2px 8px;
  border-radius: var(--radius-pill);
  background: var(--app-text);
  color: var(--app-surface);
  font-size: var(--font-caption);
  font-weight: 600;
  text-align: center;
}

.ghost-toggle__chevron {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  color: var(--app-text-tertiary);
  transition: transform 180ms ease;
}

.ghost-block--open .ghost-toggle__chevron {
  transform: rotate(180deg);
}

.ghost-hint {
  color: var(--app-text-tertiary);
  font-size: var(--font-small);
  line-height: 1.5;
}

.ghost-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-top: 2px;
}

.ghost-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 72px 36px;
  gap: 8px;
  align-items: center;
}

.ghost-row__amount,
.ghost-row__qty {
  min-height: 42px;
  font-size: var(--font-body-lg);
}

.ghost-row__qty {
  text-align: center;
}

.ghost-row__remove {
  width: 36px;
  height: 36px;
  border: none;
  border-radius: var(--radius-xs);
  background: var(--app-surface);
  color: var(--app-text-secondary);
  font-size: var(--font-title-lg);
  line-height: 1;
}

.ghost-add {
  align-self: flex-start;
  padding: 8px 14px;
  border: 1px dashed var(--app-input-border);
  border-radius: var(--radius-xs);
  background: transparent;
  color: var(--app-text-secondary);
  font-size: var(--font-body);
  font-weight: 600;
}

.preview-summary__ghost {
  color: var(--app-text-secondary);
  font-weight: 600;
}

.preview-item--ghost {
  border: 1px dashed var(--app-input-border);
  background: transparent;
}

.preview-item__tag {
  flex-shrink: 0;
  padding: 2px 6px;
  border-radius: var(--radius-xxs);
  background: var(--app-surface-soft);
  color: var(--app-text-tertiary);
  font-size: var(--font-caption);
  font-weight: 600;
  vertical-align: middle;
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
  font-size: var(--font-body-lg);
  font-weight: 600;
}

.preview-head__live {
  color: var(--app-text-tertiary);
  font-size: var(--font-small);
}

.preview-note {
  color: var(--app-text-tertiary);
  font-size: var(--font-small);
  line-height: 1.5;
}

.preview-empty {
  color: var(--app-text-tertiary);
  font-size: var(--font-body);
  text-align: center;
  padding: 12px 0;
}

.preview-summary {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 12px;
  border-radius: var(--radius-xs);
  background: var(--app-surface);
}

.preview-summary__row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  font-size: var(--font-body);
  color: var(--app-text-secondary);
}

.preview-summary__row--strong {
  color: var(--app-text);
  font-weight: 600;
  font-size: var(--font-body-lg);
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
  border-radius: var(--radius-xs);
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

.preview-item__title-row {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.preview-item__name {
  font-size: var(--font-body-lg);
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.preview-item__meta {
  color: var(--app-text-tertiary);
  font-size: var(--font-small);
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
  font-size: var(--font-small);
  font-weight: 600;
}

.preview-item__actual {
  font-size: var(--font-body-lg);
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
  border-radius: var(--radius-medium);
  font-size: var(--font-subtitle);
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

html.theme-dark .coupon-sheet .field-input {
  border-color: var(--app-input-border) !important;
  background: color-mix(in srgb, var(--app-surface) 94%, var(--app-glass)) !important;
}
</style>
