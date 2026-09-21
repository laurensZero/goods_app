<template>
  <AppSheet
    :model-value="modelValue"
    sheet-class="checkout-account-address-sheet"
    @update:model-value="(v) => { if (!v) close() }"
  >
    <p class="sheet-title">{{ $t('checkout.selectAddressForAccount') }}</p>
    <p class="sheet-sub">{{ accountLabel }}</p>

    <div v-if="loading" class="sheet-state">
      <div class="parse-spinner" />
      <p>{{ $t('checkout.accountAddressLoading') }}</p>
    </div>

    <div v-else-if="error || !list.length" class="sheet-state">
      <p class="sheet-state--warn">
        {{ error || $t('checkout.accountAddressEmpty') }}
      </p>
      <p v-if="!hasCookie" class="sheet-state--hint">{{ $t('checkout.accountNoCookie') }}</p>
      <button class="sheet-retry" type="button" @click="$emit('retry')">
        {{ $t('checkout.accountAddressRetry') }}
      </button>
    </div>

    <div v-else class="address-list">
      <button
        v-for="addr in list"
        :key="addr.id"
        type="button"
        :class="['address-card', String(addr.id) === String(selectedId) && 'address-card--selected']"
        @click="onPick(addr)"
      >
        <div class="address-card__radio">
          <span :class="['radio-dot', String(addr.id) === String(selectedId) && 'radio-dot--on']" />
        </div>
        <div class="address-card__body">
          <div class="address-card__head">
            <span class="address-card__name">{{ addr.connect_name }}</span>
            <span class="address-card__phone">{{ addr.phone }}</span>
            <span v-if="Number(addr.is_default) === 1" class="address-card__badge">{{ $t('checkout.default') }}</span>
          </div>
          <p class="address-card__detail">{{ formatAddress(addr) }}</p>
        </div>
      </button>
    </div>

    <button class="sheet-cancel" type="button" @click="close">{{ $t('common.cancel') }}</button>
  </AppSheet>
</template>

<script setup>
import AppSheet from '@/components/common/AppSheet.vue'
import { useDialogBackButton } from '@/composables/useDialogBackButton'
import { useI18n } from 'vue-i18n'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  accountLabel: { type: String, default: '' },
  accountId: { type: String, default: '' },
  selectedId: { type: String, default: '' },
  list: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  error: { type: String, default: '' },
  hasCookie: { type: Boolean, default: true },
  formatAddress: { type: Function, required: true },
})

const emit = defineEmits(['update:modelValue', 'select', 'retry'])
useI18n()
useDialogBackButton(close, () => props.modelValue)

function close() {
  emit('update:modelValue', false)
}

function onPick(addr) {
  emit('select', String(addr.id))
  close()
}
</script>

<style scoped>
.sheet-title {
  margin: 0 0 4px;
  text-align: center;
  font-size: 16px;
  font-weight: 600;
  color: var(--app-text);
}

.sheet-sub {
  margin: 0 0 14px;
  text-align: center;
  font-size: 12px;
  color: var(--app-text-secondary, #8e8e93);
}

.sheet-state {
  padding: 18px 8px 8px;
  text-align: center;
  color: var(--app-text-secondary);
  font-size: 13px;
}

.sheet-state--warn {
  color: #c77700;
  margin: 0 0 8px;
}

.sheet-state--hint {
  margin: 0 0 10px;
  color: var(--app-text-tertiary);
  font-size: 12px;
}

.sheet-retry {
  border: 1px solid var(--app-border, rgba(142, 142, 147, 0.3));
  border-radius: 999px;
  background: transparent;
  color: var(--app-text);
  padding: 8px 16px;
  font-size: 13px;
  font-weight: 600;
}

.address-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 10px;
  max-height: 48vh;
  overflow: auto;
}

.address-card {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  width: 100%;
  padding: 12px 14px;
  border: 1px solid var(--app-border);
  border-radius: 14px;
  background: var(--app-surface);
  text-align: left;
}

.address-card--selected {
  border-color: #2070c0;
  background: color-mix(in srgb, #2070c0 6%, var(--app-surface));
}

.address-card__radio {
  padding-top: 4px;
}

.radio-dot {
  display: block;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 1.5px solid color-mix(in srgb, var(--app-text) 28%, transparent);
}

.radio-dot--on {
  border-color: #2070c0;
  background: #2070c0;
  box-shadow: inset 0 0 0 3px var(--app-surface);
}

.address-card__body {
  flex: 1;
  min-width: 0;
}

.address-card__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.address-card__name {
  font-size: 14px;
  font-weight: 600;
  color: var(--app-text);
}

.address-card__phone {
  font-size: 12px;
  color: var(--app-text-tertiary);
}

.address-card__badge {
  font-size: 11px;
  color: #2070c0;
  background: rgba(32, 112, 192, 0.12);
  border-radius: 999px;
  padding: 1px 6px;
}

.address-card__detail {
  margin: 4px 0 0;
  font-size: 12px;
  line-height: 1.45;
  color: var(--app-text-secondary);
}

.sheet-cancel {
  width: 100%;
  border: none;
  border-radius: 14px;
  padding: 13px 16px;
  background: color-mix(in srgb, var(--app-glass) 80%, var(--app-surface));
  color: var(--app-text);
  font-size: 15px;
  font-weight: 500;
}

.parse-spinner {
  width: 22px;
  height: 22px;
  margin: 0 auto 8px;
  border: 2px solid color-mix(in srgb, var(--app-text) 15%, transparent);
  border-top-color: #2070c0;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
