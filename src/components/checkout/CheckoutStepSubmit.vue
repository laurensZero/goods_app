<template>
  <section class="form-section checkout-step">
    <div v-if="!orderResult" class="section-head">
      <p class="section-label">{{ $t('checkout.stepLabel', { current: stepNumber, total: stepCount }) }}</p>
      <h2 class="section-title">{{ $t('checkout.stepSubmit') }}</h2>
    </div>

    <template v-if="!orderResult">
      <div class="field-card">
        <div class="timer-header">
          <h3 class="timer-title">{{ $t('checkout.scheduledPurchase') }}</h3>
          <button type="button" class="timer-toggle" :aria-pressed="timerEnabled" @click="$emit('timer-toggle')">
            <div class="save-char-toggle" :class="{ 'save-char-toggle--on': timerEnabled }">
              <div class="save-char-knob" />
            </div>
          </button>
        </div>
        <div v-if="timerEnabled" class="timer-body">
          <p class="timer-hint">{{ $t('checkout.timerHint') }}</p>
          <button class="timer-field" type="button" @click="$emit('open-timer-picker')">
            <span :class="{ 'timer-field__placeholder': !timerTargetTime }">
              {{ timerTargetTime ? formattedTimerTarget : $t('checkout.selectTime') }}
            </span>
            <svg class="timer-field__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M12 2v4M12 6a6 6 0 1 0 0 12 6 6 0 0 0 0-12z" />
              <path d="M12 9v3l2 2" />
            </svg>
          </button>
          <p v-if="timerTargetTime" class="timer-countdown">
            {{ $t('checkout.countdown') }}: <strong>{{ remainingText }}</strong>
          </p>
          <div class="retry-row">
            <span class="retry-label">{{ $t('checkout.retryCount') }}</span>
            <div class="retry-controls">
              <div class="qty-controls">
                <button type="button" class="qty-btn" :disabled="retryCount === 0" @click="$emit('decrease-retry')">−</button>
                <span class="qty-value">{{ retryCount === Infinity ? '∞' : retryCount }}</span>
                <button type="button" class="qty-btn" @click="$emit('increase-retry')">+</button>
              </div>
              <button
                type="button"
                class="retry-infinite"
                :class="{ 'retry-infinite--active': retryCount === Infinity }"
                :aria-label="$t('checkout.retryForever')"
                @click="$emit('infinite-retry')"
              >∞</button>
            </div>
          </div>
          <div class="concurrency-row">
            <span class="retry-label">{{ $t('checkout.concurrency') }}</span>
            <div class="qty-controls">
              <button type="button" class="qty-btn" :disabled="concurrency <= 1" @click="$emit('decrease-concurrency')">−</button>
              <span class="qty-value">{{ concurrency }}</span>
              <button type="button" class="qty-btn" :disabled="concurrency >= maxConcurrency" @click="$emit('increase-concurrency')">+</button>
            </div>
          </div>
          <p v-if="concurrency > 1" class="concurrency-warn">{{ $t('checkout.concurrencyWarn') }}</p>
          <div class="qq-notify-row" :class="{ 'qq-notify-row--disabled': !qqBound }">
            <div class="qq-notify-row__info">
              <span class="qq-notify-row__title">{{ $t('checkout.qqNotifyToggle') }}</span>
              <span class="qq-notify-row__desc">{{ qqBound ? $t('checkout.qqNotifyDesc') : $t('checkout.qqNotifyUnbound') }}</span>
            </div>
            <label class="toggle-switch" :aria-label="$t('checkout.qqNotifyToggle')">
              <input
                type="checkbox"
                :checked="checkoutNotify"
                :disabled="!qqBound"
                @change="$emit('toggle-checkout-notify', $event.target.checked)"
              />
              <span class="toggle-slider" />
            </label>
          </div>
          <button v-if="queueItems.length" type="button" class="queue-preview-btn" @click="$emit('open-queue')">
            <span>{{ $t('checkout.queueTitle') }}</span>
            <span class="queue-preview-btn__count">{{ activeQueueItems.length }}</span>
          </button>
        </div>
      </div>

      <p v-if="error" class="step-error">{{ error }}</p>
    </template>

    <!-- Order success -->
    <template v-else>
      <div class="order-success">
        <div class="order-success__icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </svg>
        </div>
        <h2 class="order-success__title">{{ $t('checkout.orderCreated') }}</h2>
        <p class="order-success__amount">
          <template v-if="isPointOrder">{{ formatFen(orderResult.amount || 0) }} + {{ orderResult.orderPoints || totalPointCost }} {{ $t('checkout.pointsUnit') }}</template>
          <template v-else>{{ formatFen(orderResult.amount || 0) }}</template>
        </p>
        <div class="order-success__info">
          <p>{{ $t('checkout.orderNo') }}: {{ orderResult.orderNo }}</p>
          <p v-if="orderResult.productName" class="order-success__product">{{ orderResult.productName }}</p>
        </div>
        <p class="order-success__hint">{{ $t('checkout.payInMihoyoApp') }}</p>
      </div>
    </template>
  </section>
</template>

<script setup>
defineProps({
  orderResult: { type: Object, default: null },
  isPointOrder: { type: Boolean, default: false },
  totalPointCost: { type: Number, default: 0 },
  timerEnabled: { type: Boolean, default: false },
  timerTargetTime: { type: Number, default: 0 },
  formattedTimerTarget: { type: String, default: '' },
  remainingText: { type: String, default: '' },
  retryCount: { type: Number, default: 3 },
  concurrency: { type: Number, default: 1 },
  maxConcurrency: { type: Number, default: 5 },
  qqBound: { type: Boolean, default: false },
  checkoutNotify: { type: Boolean, default: false },
  queueItems: { type: Array, default: () => [] },
  activeQueueItems: { type: Array, default: () => [] },
  error: { type: String, default: '' },
  formatFen: { type: Function, required: true },
  stepNumber: { type: Number, required: true },
  stepCount: { type: Number, required: true },
})
defineEmits([
  'timer-toggle',
  'open-timer-picker',
  'decrease-retry',
  'increase-retry',
  'infinite-retry',
  'decrease-concurrency',
  'increase-concurrency',
  'toggle-checkout-notify',
  'open-queue',
])
</script>

<style src="@/assets/views/checkout-shared.css"></style>
<style scoped>
/* ── 定时下单 ── */
.timer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.timer-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--app-text);
}

.timer-toggle {
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
}

.save-char-toggle {
  width: 44px;
  height: 26px;
  border-radius: 13px;
  background: color-mix(in srgb, var(--app-text) 12%, var(--app-surface-soft));
  position: relative;
  transition: background 0.22s;
}

.save-char-toggle--on {
  background: #2070c0;
}

.save-char-knob {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--app-surface);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.22);
  transition: transform 0.22s var(--motion-ease-spring);
}

.save-char-toggle--on .save-char-knob {
  transform: translateX(18px);
}

:global(html.theme-dark) .save-char-toggle {
  background: rgba(255, 255, 255, 0.14);
}

:global(html.theme-dark) .save-char-knob {
  background: rgba(255, 255, 255, 0.94);
}

.timer-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.timer-hint {
  font-size: 13px;
  color: var(--app-text-secondary);
}

.timer-field {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  width: 100%;
  min-height: 44px;
  padding: 0 14px;
  border: 1px solid var(--app-border);
  border-radius: var(--radius-small);
  background: var(--app-surface);
  color: var(--app-text);
  font-size: 15px;
  text-align: left;
  cursor: pointer;
  transition: border-color 0.16s ease, transform 0.16s ease;
}

.timer-field:active {
  transform: scale(0.98);
}

.timer-field__placeholder {
  color: var(--app-placeholder);
}

.timer-field__icon {
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  stroke: var(--app-text-tertiary);
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.timer-countdown {
  font-size: 13px;
  color: var(--app-text-secondary);
}

.timer-countdown strong {
  color: #2070c0;
  font-size: 15px;
}

.retry-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.retry-label {
  font-size: 13px;
  color: var(--app-text-secondary);
}

.concurrency-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.concurrency-warn {
  margin-top: 2px;
  font-size: 12px;
  color: #c74444;
}

.qq-notify-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 0 2px;
}

.qq-notify-row--disabled .qq-notify-row__title,
.qq-notify-row--disabled .qq-notify-row__desc {
  opacity: 0.5;
}

.qq-notify-row__info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.qq-notify-row__title {
  font-size: 13px;
  color: var(--app-text);
  font-weight: 500;
}

.qq-notify-row__desc {
  font-size: 12px;
  color: var(--app-text-secondary);
}

/* Toggle Switch（复用设置页样式） */
.toggle-switch {
  position: relative;
  display: inline-block;
  width: 51px;
  height: 31px;
  flex-shrink: 0;
}

.toggle-switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

.toggle-slider {
  position: absolute;
  cursor: pointer;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: var(--app-surface-muted, #e5e5ea);
  transition: background-color 0.25s ease;
  border-radius: 31px;
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.08);
}

.toggle-slider::before {
  position: absolute;
  content: '';
  height: 27px;
  width: 27px;
  left: 2px;
  bottom: 2px;
  background-color: #fff;
  transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  border-radius: 50%;
  box-shadow:
    0 1px 3px rgba(0, 0, 0, 0.12),
    0 1px 2px rgba(0, 0, 0, 0.08);
}

.toggle-switch input:checked + .toggle-slider {
  background-color: var(--app-chip-accent-text);
}

.toggle-switch input:checked + .toggle-slider::before {
  transform: translateX(20px);
}

.toggle-switch input:disabled + .toggle-slider {
  opacity: 0.4;
  cursor: not-allowed;
}

.retry-controls {
  display: flex;
  align-items: center;
  gap: 8px;
}

.retry-infinite {
  width: 34px;
  height: 34px;
  border: 1px solid var(--app-border);
  border-radius: var(--radius-xs);
  background: var(--app-surface-soft);
  color: var(--app-text);
  font-size: 16px;
  font-weight: 600;
  line-height: 1;
  cursor: pointer;
  transition: border-color 0.16s ease, background 0.16s ease, color 0.16s ease;
}

.retry-infinite:active:not(.retry-infinite--active) {
  transform: scale(0.96);
}

.retry-infinite--active {
  border-color: color-mix(in srgb, #4a7aec 60%, var(--app-border));
  background: color-mix(in srgb, #4a7aec 12%, var(--app-surface));
  color: #2070c0;
}

.qty-controls {
  display: flex;
  align-items: center;
  border: 1px solid var(--app-border);
  border-radius: var(--radius-xs);
  overflow: hidden;
}

.qty-btn {
  width: 34px;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: var(--app-surface-soft);
  color: var(--app-text);
  font-size: 16px;
  font-weight: 500;
  cursor: pointer;
}

.qty-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.qty-btn:active:not(:disabled) {
  background: var(--app-surface-muted);
}

.qty-value {
  width: 40px;
  text-align: center;
  font-size: 14px;
  font-weight: 500;
  color: var(--app-text);
  border-left: 1px solid var(--app-border);
  border-right: 1px solid var(--app-border);
  line-height: 34px;
}

.queue-preview-btn {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  width: 100%;
  min-height: 40px;
  padding: 0 12px;
  border: 1px solid var(--app-border);
  border-radius: var(--radius-small);
  background: var(--app-surface);
  color: var(--app-text);
  font-size: 13px;
  cursor: pointer;
}

.queue-preview-btn__count {
  min-width: 22px;
  height: 22px;
  padding: 0 6px;
  border-radius: 999px;
  background: color-mix(in srgb, #4a7aec 14%, var(--app-surface));
  color: #2070c0;
  font-size: 12px;
  font-weight: 700;
  line-height: 22px;
  text-align: center;
}

:global(html.theme-dark) .timer-field {
  border-color: rgba(255, 255, 255, 0.07);
  background: color-mix(in srgb, var(--app-surface) 92%, var(--app-glass));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03);
}

/* ── 下单成功 ── */
.order-success {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 32px 16px 16px;
}

.order-success__icon {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: rgba(40, 167, 69, 0.1);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 16px;
}

.order-success__icon svg {
  width: 32px;
  height: 32px;
  stroke: #28a745;
}

.order-success__title {
  font-size: 20px;
  font-weight: 700;
  color: var(--app-text);
  margin-bottom: 8px;
}

.order-success__amount {
  font-size: 28px;
  font-weight: 700;
  color: #2070c0;
  margin-bottom: 16px;
}

.order-success__info {
  padding: 12px 16px;
  border-radius: var(--radius-small);
  background: var(--app-surface-soft);
  font-size: 13px;
  color: var(--app-text-secondary);
  line-height: 1.6;
  margin-bottom: 12px;
}

.order-success__product {
  color: var(--app-text);
}

.order-success__hint {
  font-size: 13px;
  color: var(--app-text-tertiary);
}
</style>