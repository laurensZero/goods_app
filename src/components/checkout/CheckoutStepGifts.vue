<template>
  <section class="form-section checkout-step">
    <div class="section-head">
      <p class="section-label">{{ $t('checkout.stepLabel', { current: stepNumber, total: stepCount }) }}</p>
      <h2 class="section-title">{{ $t('checkout.stepGifts') }}</h2>
    </div>

    <div v-if="giftLoading" class="loading-state">
      <div class="parse-spinner" />
      <p class="loading-text">{{ $t('checkout.loadingGifts') }}</p>
    </div>
    <template v-else>
      <p v-if="giftError" class="step-error">{{ giftError }}</p>
      <div v-if="!giftActivities.length" class="field-card">
        <p class="empty-hint">{{ $t('checkout.noGifts') }}</p>
      </div>
      <div v-else class="gift-sections">
        <div v-for="act in giftActivities" :key="act.activityId" class="field-card">
          <p class="gift-activity__title">{{ act.name || $t('checkout.giftActivity') }}</p>
          <template v-if="getMatchedStage(act, totalAmount)">
            <p v-if="!isActivityActive(act)" class="gift-activity__notice">{{ giftActivityStateText(act) }}</p>
            <p class="gift-activity__tier">
              {{ $t('checkout.tierThreshold', { amount: formatFen(getMatchedStage(act, totalAmount)?.threshold || 0) }) }}
              — {{ $t('checkout.selectN', { n: getMatchedStage(act, totalAmount).num }) }}
            </p>
            <div class="gift-grid">
              <button
                v-for="gift in getAvailableGifts(act, totalAmount)"
                :key="gift.goods_id"
                type="button"
                class="gift-card"
                :class="{
                  'gift-card--selected': isGiftSelected(act.activityId, gift.goods_id),
                  'gift-card--soldout': gift.stock <= 0,
                }"
                :disabled="gift.stock <= 0"
                @click="toggleGift(act.activityId, gift.goods_id, getMatchedStage(act, totalAmount)?.num || 1)"
              >
                <img v-if="getGiftImageUrl(gift)" :src="getGiftImageUrl(gift)" class="gift-card__img" loading="lazy" />
                <div v-else class="gift-card__img gift-card__img--fallback">礼</div>
                <div class="gift-card__check">
                  <svg v-if="isGiftSelected(act.activityId, gift.goods_id)" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
                <span class="gift-card__name">{{ gift.name }}</span>
                <span class="gift-card__stock">
                  {{ gift.stock <= 0 ? $t('checkout.soldOut') : $t('checkout.stock', { n: gift.stock }) }}
                </span>
              </button>
            </div>
          </template>
          <p v-else class="gift-activity__empty">{{ $t('checkout.giftThresholdNotMet') }}</p>
        </div>
      </div>
    </template>
  </section>
</template>

<script setup>
defineProps({
  giftActivities: { type: Array, default: () => [] },
  giftLoading: { type: Boolean, default: false },
  giftError: { type: String, default: '' },
  totalAmount: { type: Number, default: 0 },
  formatFen: { type: Function, required: true },
  getMatchedStage: { type: Function, required: true },
  isActivityActive: { type: Function, required: true },
  giftActivityStateText: { type: Function, required: true },
  getAvailableGifts: { type: Function, required: true },
  isGiftSelected: { type: Function, required: true },
  toggleGift: { type: Function, required: true },
  getGiftImageUrl: { type: Function, required: true },
  stepNumber: { type: Number, required: true },
  stepCount: { type: Number, required: true },
})
</script>

<style src="@/assets/views/checkout-shared.css"></style>
<style scoped>
/* ── 赠品 ── */
.gift-sections {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.gift-activity__title {
  font-size: 15px;
  font-weight: 600;
  color: var(--app-text);
}

.gift-activity__notice {
  font-size: 12px;
  color: #c77700;
  margin-bottom: 4px;
}

.gift-activity__tier {
  font-size: 13px;
  color: var(--app-text-secondary);
}

.gift-activity__empty {
  font-size: 13px;
  color: var(--app-text-tertiary);
  padding: 8px 0;
  text-align: center;
}

.gift-grid {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.gift-card {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--app-border);
  border-radius: var(--radius-small);
  background: var(--app-surface);
  text-align: left;
  cursor: pointer;
  transition: border-color 0.16s ease, background 0.16s ease, transform 0.12s ease;
}

.gift-card:active {
  transform: scale(0.98);
}

.gift-card--selected {
  border-color: color-mix(in srgb, #4a7aec 60%, var(--app-border));
  background: color-mix(in srgb, #4a7aec 8%, var(--app-surface));
}

.gift-card--soldout {
  opacity: 0.45;
  cursor: not-allowed;
  background: var(--app-surface-soft);
  border-color: var(--app-border);
}

.gift-card__img {
  flex-shrink: 0;
  width: 38px;
  height: 38px;
  border-radius: 10px;
  object-fit: cover;
  background: var(--app-surface-soft);
}

.gift-card__img--fallback {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--app-text-tertiary);
  font-size: 13px;
  font-weight: 600;
}

.gift-card__check {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  border: 1.5px solid var(--app-text-tertiary);
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.16s ease;
}

.gift-card--selected .gift-card__check {
  border-color: #2070c0;
  background: #2070c0;
}

.gift-card__check svg {
  width: 14px;
  height: 14px;
  stroke: #fff;
}

.gift-card__name {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  color: var(--app-text);
}

.gift-card__stock {
  flex-shrink: 0;
  font-size: 12px;
  color: var(--app-text-tertiary);
}

:global(html.theme-dark) .gift-card {
  border-color: rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.04);
}

:global(html.theme-dark) .gift-card--selected {
  border-color: rgba(109, 157, 255, 0.72);
  background: color-mix(in srgb, #4a7aec 14%, var(--app-surface));
}

:global(html.theme-dark) .gift-card__check {
  border-color: rgba(255, 255, 255, 0.3);
}
</style>