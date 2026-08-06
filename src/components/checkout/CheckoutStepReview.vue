<template>
  <section class="form-section checkout-step">
    <div class="section-head">
      <p class="section-label">{{ $t('checkout.stepLabel', { current: stepNumber, total: stepCount }) }}</p>
      <h2 class="section-title">{{ $t('checkout.stepReview') }}</h2>
    </div>

    <div class="field-card">
      <p class="card-label">{{ $t('checkout.orderItems') }}</p>
      <div v-for="item in items" :key="item.id" class="review-item">
        <img v-if="getItemCover(item)" :src="getItemCover(item)" class="review-item__img" loading="lazy" />
        <div v-else class="review-item__img review-item__img--fallback">商</div>
        <div class="review-item__body">
          <p class="review-item__name">{{ item.name }}</p>
          <div class="review-item__meta">
            <span class="review-item__sku">{{ item.selectedSkuText || '' }}</span>
            <span class="review-item__qty">x{{ item.quantity }}</span>
            <span class="review-item__price">
              <template v-if="item.isPointOrder">{{ item.pointCost }} {{ $t('checkout.pointsUnit') }} + {{ formatFen(getItemPrice(item)) }}</template>
              <template v-else>{{ formatFen(getItemPrice(item)) }}</template>
            </span>
          </div>
        </div>
      </div>
    </div>

    <div v-if="selectedGiftSections.length" class="field-card">
      <p class="card-label">{{ $t('checkout.selectedGifts') }}</p>
      <div v-for="activity in selectedGiftSections" :key="activity.activityId" class="review-gift-activity">
        <p class="review-gift-activity__title">{{ activity.name }}</p>
        <div class="review-gift-list">
          <div v-for="gift in activity.gifts" :key="gift.goods_id" class="review-gift-item">
            <img v-if="getGiftImageUrl(gift)" :src="getGiftImageUrl(gift)" class="review-gift-item__img" loading="lazy" />
            <div v-else class="review-gift-item__img review-gift-item__img--fallback">礼</div>
            <div class="review-gift-item__body">
              <p class="review-gift-item__name">{{ gift.name }}</p>
              <p class="review-gift-item__meta">{{ $t('checkout.selectN', { n: activity.gifts.length }) }}</p>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="field-card">
      <p class="card-label">{{ $t('checkout.shippingAddress') }}</p>
      <p v-if="selectedAddress" class="review-address">
        {{ selectedAddress.connect_name }} {{ selectedAddress.phone }}<br />
        {{ formatAddress(selectedAddress) }}
      </p>
    </div>

    <div class="field">
      <span class="field-label">{{ $t('checkout.remark') }}</span>
      <input v-model="remarkModel" type="text" :placeholder="$t('checkout.remarkPlaceholder')" maxlength="50" />
    </div>

    <div class="review-total">
      <template v-if="isPointOrder">
        <div class="review-total__row">
          <span>{{ $t('checkout.goodsAmount') }}</span>
          <span>{{ formatFen(totalAmount) }}</span>
        </div>
        <div class="review-total__row review-total__row--pay">
          <span>{{ $t('checkout.exchangePoints') }}</span>
          <span class="review-total__amount">{{ totalPointCost }} {{ $t('checkout.pointsUnit') }}</span>
        </div>
      </template>
      <template v-else>
        <div class="review-total__row">
          <span>{{ $t('checkout.goodsAmount') }}</span>
          <span>{{ formatFen(totalAmount) }}</span>
        </div>
        <div v-if="bestCoupon" class="review-total__row review-total__row--discount">
          <span>{{ couponName(bestCoupon) }}</span>
          <span>-{{ formatFen(discountAmount) }}</span>
        </div>
        <div class="review-total__row review-total__row--pay">
          <span>{{ $t('checkout.total') }}</span>
          <span class="review-total__amount">{{ formatFen(payTotal) }}</span>
        </div>
      </template>
    </div>
  </section>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  items: { type: Array, default: () => [] },
  isPointOrder: { type: Boolean, default: false },
  totalAmount: { type: Number, default: 0 },
  totalPointCost: { type: Number, default: 0 },
  bestCoupon: { type: Object, default: null },
  discountAmount: { type: Number, default: 0 },
  payTotal: { type: Number, default: 0 },
  selectedGiftSections: { type: Array, default: () => [] },
  selectedAddress: { type: Object, default: null },
  remark: { type: String, default: '' },
  formatFen: { type: Function, required: true },
  couponName: { type: Function, required: true },
  formatAddress: { type: Function, required: true },
  getItemCover: { type: Function, required: true },
  getItemPrice: { type: Function, required: true },
  getGiftImageUrl: { type: Function, required: true },
  stepNumber: { type: Number, required: true },
  stepCount: { type: Number, required: true },
})
const emit = defineEmits(['update:remark'])

const remarkModel = computed({
  get: () => props.remark,
  set: (val) => emit('update:remark', val),
})
</script>

<style src="@/assets/views/checkout-shared.css"></style>
<style scoped>
/* ── 确认页 ── */
.card-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--app-text-tertiary);
}

.review-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 0;
  border-bottom: 1px solid var(--app-border);
}

.review-item:last-child {
  border-bottom: none;
}

.review-item__img {
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  border-radius: 12px;
  object-fit: cover;
  background: var(--app-surface);
}

.review-item__img--fallback {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--app-text-tertiary);
  font-size: 14px;
  font-weight: 600;
}

.review-item__body {
  flex: 1;
  min-width: 0;
}

.review-item__name {
  color: var(--app-text);
  font-size: 14px;
  line-height: 1.45;
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
}

.review-item__meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 3px;
}

.review-item__sku {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  color: var(--app-text-tertiary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.review-item__qty {
  flex-shrink: 0;
  font-size: 13px;
  color: var(--app-text-secondary);
}

.review-item__price {
  flex-shrink: 0;
  font-weight: 500;
  color: #2070c0;
}

.review-gift-activity {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-top: 6px;
}

.review-gift-activity + .review-gift-activity {
  padding-top: 14px;
  border-top: 1px solid var(--app-border);
}

.review-gift-activity__title {
  font-size: 14px;
  font-weight: 600;
  color: var(--app-text);
}

.review-gift-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.review-gift-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: var(--radius-small);
  background: var(--app-surface-soft);
}

.review-gift-item__img {
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  border-radius: 12px;
  object-fit: cover;
  background: var(--app-surface);
}

.review-gift-item__img--fallback {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--app-text-tertiary);
  font-size: 14px;
  font-weight: 600;
}

.review-gift-item__body {
  flex: 1;
  min-width: 0;
}

.review-gift-item__name {
  font-size: 13px;
  color: var(--app-text);
  line-height: 1.45;
}

.review-gift-item__meta {
  margin-top: 2px;
  font-size: 12px;
  color: var(--app-text-tertiary);
}

.review-address {
  font-size: 14px;
  color: var(--app-text);
  line-height: 1.6;
}

.review-total {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px 16px;
  border-radius: var(--radius-card);
  background: var(--app-surface);
  box-shadow: var(--app-shadow);
  font-size: 14px;
  color: var(--app-text);
}

.review-total__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.review-total__row--discount {
  color: #28a745;
}

.review-total__row--pay {
  font-size: 15px;
  font-weight: 600;
  padding-top: 8px;
  border-top: 1px solid var(--app-border);
}

.review-total__amount {
  font-size: 20px;
  color: #2070c0;
}
</style>