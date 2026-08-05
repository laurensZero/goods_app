<template>
  <section class="form-section checkout-step">
    <div class="section-head">
      <p class="section-label">{{ $t('checkout.stepLabel', { current: stepNumber, total: stepCount }) }}</p>
      <h2 class="section-title">{{ $t('checkout.stepCoupon') }}</h2>
    </div>

    <div v-if="couponProcessing" class="loading-state">
      <div class="parse-spinner" />
      <p class="loading-text">{{ $t('checkout.claimingCoupons') }}</p>
      <p class="loading-sub">{{ $t('checkout.pleaseWait') }}</p>
    </div>
    <template v-else>
      <div class="field-card">
        <div v-if="couponResults.length" class="coupon-list">
          <div v-for="c in couponResults" :key="c.coupon_id" class="coupon-item" :class="{ 'coupon-item--ok': c.success }">
            <span class="coupon-item__icon">{{ c.success ? '✓' : '✗' }}</span>
            <span class="coupon-item__name">{{ c.name || c.coupon_id }}</span>
            <span class="coupon-item__status">{{ c.success ? $t('checkout.couponClaimed') : (c.message || $t('checkout.couponFailed')) }}</span>
          </div>
        </div>
        <p v-else class="empty-hint">{{ $t('checkout.noCoupons') }}</p>
      </div>
    </template>
  </section>
</template>

<script setup>
defineProps({
  couponProcessing: { type: Boolean, default: false },
  couponResults: { type: Array, default: () => [] },
  stepNumber: { type: Number, required: true },
  stepCount: { type: Number, required: true },
})
</script>

<style src="@/views/checkout-shared.css"></style>
<style scoped>
/* ── 优惠券 ── */
.coupon-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.coupon-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: var(--radius-small);
  background: var(--app-surface-soft);
}

.coupon-item--ok {
  background: rgba(40, 167, 69, 0.08);
}

.coupon-item__icon {
  flex-shrink: 0;
  width: 18px;
  font-size: 14px;
  font-weight: 700;
  color: #c74444;
}

.coupon-item--ok .coupon-item__icon {
  color: #28a745;
}

.coupon-item__name {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  color: var(--app-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.coupon-item__status {
  flex-shrink: 0;
  max-width: 55%;
  font-size: 12px;
  color: var(--app-text-tertiary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: right;
}
</style>