<template>
  <section class="form-section checkout-step">
    <div class="section-head">
      <p class="section-label">{{ $t('checkout.stepLabel', { current: stepNumber, total: stepCount }) }}</p>
      <h2 class="section-title">{{ $t('checkout.stepAddress') }}</h2>
    </div>

    <div v-if="addressLoading" class="loading-state">
      <div class="parse-spinner" />
      <p class="loading-text">{{ $t('checkout.fetchingAddress') }}</p>
    </div>
    <template v-else>
      <p v-if="addressError" class="step-error">{{ addressError }}</p>
      <div v-if="!addresses.length" class="field-card">
        <p class="empty-hint">{{ $t('checkout.noAddress') }}</p>
      </div>
      <div v-else class="address-list">
        <button
          v-for="addr in addresses"
          :key="addr.id"
          type="button"
          class="address-card"
          :class="{ 'address-card--selected': selectedAddressId === String(addr.id) }"
          @click="$emit('select-address', addr.id)"
        >
          <div class="address-card__radio">
            <span class="radio-dot" :class="{ 'radio-dot--on': selectedAddressId === String(addr.id) }" />
          </div>
          <div class="address-card__body">
            <div class="address-card__head">
              <span class="address-card__name">{{ addr.connect_name }}</span>
              <span class="address-card__phone">{{ addr.phone }}</span>
              <span v-if="addr.is_default" class="address-card__badge">{{ $t('checkout.default') }}</span>
            </div>
            <p class="address-card__detail">{{ formatAddress(addr) }}</p>
          </div>
        </button>
      </div>
    </template>
  </section>
</template>

<script setup>
defineProps({
  addresses: { type: Array, default: () => [] },
  selectedAddressId: { type: String, default: '' },
  addressLoading: { type: Boolean, default: false },
  addressError: { type: String, default: '' },
  formatAddress: { type: Function, required: true },
  stepNumber: { type: Number, required: true },
  stepCount: { type: Number, required: true },
})
defineEmits(['select-address'])
</script>

<style src="@/views/checkout-shared.css"></style>
<style scoped>
/* ── 地址 ── */
.address-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.address-card {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  width: 100%;
  padding: 14px 16px;
  border: 1px solid var(--app-border);
  border-radius: var(--radius-card);
  background: var(--app-surface);
  box-shadow: var(--app-shadow);
  text-align: left;
  cursor: pointer;
  transition: border-color 0.16s ease, box-shadow 0.16s ease, background 0.16s ease, transform 0.12s ease;
}

.address-card:active {
  transform: scale(0.98);
}

.address-card--selected {
  border-color: color-mix(in srgb, #4a7aec 55%, var(--app-border));
  background: color-mix(in srgb, #4a7aec 10%, var(--app-surface));
  box-shadow: 0 0 0 1px color-mix(in srgb, #4a7aec 22%, transparent);
}

.address-card__radio {
  padding-top: 2px;
}

.radio-dot {
  display: block;
  width: 18px;
  height: 18px;
  border: 2px solid var(--app-text-tertiary);
  border-radius: 50%;
  transition: border-color 0.16s ease;
}

.radio-dot--on {
  border-color: #2070c0;
  box-shadow: inset 0 0 0 4px #2070c0;
}

.address-card__body {
  flex: 1;
  min-width: 0;
}

.address-card__head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.address-card__name {
  font-size: 15px;
  font-weight: 600;
  color: var(--app-text);
}

.address-card__phone {
  font-size: 13px;
  color: var(--app-text-secondary);
}

.address-card__badge {
  font-size: 11px;
  padding: 1px 6px;
  border-radius: var(--radius-xxs);
  background: color-mix(in srgb, #4a7aec 12%, var(--app-surface-soft));
  color: #2070c0;
  font-weight: 500;
}

.address-card__detail {
  font-size: 13px;
  color: var(--app-text-secondary);
  line-height: 1.5;
}

:global(html.theme-dark) .address-card--selected {
  border-color: rgba(109, 157, 255, 0.82);
  background: color-mix(in srgb, #4a7aec 18%, var(--app-surface));
  box-shadow: 0 0 0 1px rgba(109, 157, 255, 0.28);
}

:global(html.theme-dark) .radio-dot {
  border-color: rgba(255, 255, 255, 0.3);
}

:global(html.theme-dark) .radio-dot--on {
  border-color: rgba(109, 157, 255, 0.9);
  box-shadow: inset 0 0 0 4px rgba(109, 157, 255, 0.9);
}
</style>