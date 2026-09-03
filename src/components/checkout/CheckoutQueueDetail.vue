<template>
  <Popup
    :show="show"
    :position="position"
    :round="!isTabletViewport"
    :lock-scroll="false"
    :class="['picker-popup', 'queue-detail-popup', { 'picker-popup--center': isTabletViewport }]"
    @update:show="$emit('update:show', $event)"
  >
    <div v-if="activeQueueDetail" class="queue-detail">
      <div class="queue-detail__head">
        <div>
          <p class="queue-detail__label">{{ $t('checkout.queueDetailTitle') }}</p>
          <h3 class="queue-detail__title">{{ activeQueueDetail.summary.goodsText || $t('checkout.queueTitle') }}</h3>
        </div>
        <span class="queue-item__status" :class="`queue-item__status--${activeQueueDetail.status}`">{{ queueStatusText(activeQueueDetail) }}</span>
      </div>

      <div class="queue-detail__rows">
        <div class="queue-detail__row">
          <span class="queue-detail__row-label">{{ $t('checkout.queueScheduledAt') }}</span>
          <span class="queue-detail__row-value">{{ formatQueueTime(activeQueueDetail.displayAt || activeQueueDetail.scheduledAt) }}</span>
        </div>
        <div class="queue-detail__row">
          <span class="queue-detail__row-label">{{ $t('checkout.retryCount') }}</span>
          <span class="queue-detail__row-value">{{ activeQueueDetail.maxAttempts === Infinity ? '∞' : activeQueueDetail.maxAttempts }}</span>
        </div>
        <div class="queue-detail__row">
          <span class="queue-detail__row-label">{{ $t('checkout.concurrency') }}</span>
          <span class="queue-detail__row-value">{{ activeQueueDetail.concurrency }}</span>
        </div>
        <div v-if="activeQueueDetail.summary.giftText" class="queue-detail__row">
          <span class="queue-detail__row-label">{{ $t('checkout.selectedGifts') }}</span>
          <span class="queue-detail__row-value">{{ activeQueueDetail.summary.giftText }}</span>
        </div>
        <template v-if="activeQueueDetail.status === 'success' && activeQueueDetail.result">
          <div class="queue-detail__row">
            <span class="queue-detail__row-label">{{ $t('checkout.queueOrderNo') }}</span>
            <span class="queue-detail__row-value">{{ activeQueueDetail.result.orderNo }}</span>
          </div>
          <div class="queue-detail__row">
            <span class="queue-detail__row-label">{{ $t('checkout.queueAmount') }}</span>
            <span class="queue-detail__row-value">{{ formatFen(activeQueueDetail.result.amount || 0) }}</span>
          </div>
          <p class="queue-detail__success-hint">{{ $t('checkout.payInMihoyoApp') }}</p>
        </template>
        <div v-if="activeQueueDetail.lastError" class="queue-detail__row">
          <span class="queue-detail__row-label">{{ $t('checkout.queueFailed') }}</span>
          <span class="queue-detail__row-value queue-detail__error">{{ activeQueueDetail.lastError }}</span>
        </div>
      </div>

      <div v-if="activeQueueDetail.logs?.length" class="queue-detail__logs">
        <p class="queue-detail__section-title">{{ $t('checkout.queueLogTitle') }}</p>
        <div v-for="log in activeQueueDetail.logs" :key="`${log.type}-${log.at}`" class="queue-detail__log">
          <span class="queue-detail__log-time">{{ formatQueueLogTime(log.at) }}</span>
          <span class="queue-detail__log-message">
            {{ $t(`checkout.queueLog.${log.type}`) }}<template v-if="log.message">：{{ log.message }}</template>
          </span>
        </div>
      </div>

      <div class="queue-detail__actions">
        <button v-if="activeQueueDetail.status === 'failed'" type="button" class="queue-detail__btn" @click="retryQueuedOrder(activeQueueDetail.id); $emit('update:show', false)">
          {{ $t('checkout.queueRetry') }}
        </button>
        <button type="button" class="queue-detail__btn queue-detail__btn--ghost" @click="removeQueuedOrder(activeQueueDetail.id); $emit('update:show', false)">
          {{ $t('checkout.queueRemove') }}
        </button>
      </div>
    </div>
  </Popup>
</template>

<script setup>
import { Popup } from 'vant'

defineProps({
  show: { type: Boolean, default: false },
  position: { type: String, default: 'bottom' },
  isTabletViewport: { type: Boolean, default: false },
  activeQueueDetail: { type: Object, default: null },
  formatQueueTime: { type: Function, required: true },
  formatQueueLogTime: { type: Function, required: true },
  formatFen: { type: Function, required: true },
  queueStatusText: { type: Function, required: true },
  retryQueuedOrder: { type: Function, required: true },
  removeQueuedOrder: { type: Function, required: true },
})
defineEmits(['update:show'])
</script>

<style scoped>
.queue-detail {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 16px 20px calc(env(safe-area-inset-bottom, 0px) + 16px);
  max-height: 78dvh;
  overflow-y: auto;
}

.queue-detail__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.queue-detail__label {
  font-size: 12px;
  color: var(--app-text-tertiary);
}

.queue-detail__title {
  margin-top: 4px;
  font-size: 17px;
  font-weight: 700;
  color: var(--app-text);
}

.queue-item__status {
  font-size: 12px;
  color: var(--app-text-tertiary);
}

.queue-item__status--success {
  color: #27a15b;
}

.queue-item__status--failed {
  color: #c74444;
}

.queue-item__status--running {
  color: #4a7aec;
}

.queue-detail__rows {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.queue-detail__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 6px 0;
}

.queue-detail__row-label {
  flex-shrink: 0;
  font-size: 13px;
  color: var(--app-text-secondary);
}

.queue-detail__row-value {
  font-size: 13px;
  color: var(--app-text);
  text-align: right;
  word-break: break-all;
}

.queue-detail__success-hint {
  margin-top: 6px;
  font-size: 12px;
  color: #27a15b;
}

.queue-detail__error {
  color: #c74444;
}

.queue-detail__logs {
  padding-top: 4px;
}

.queue-detail__section-title {
  margin-bottom: 6px;
  font-size: 13px;
  font-weight: 600;
  color: var(--app-text-secondary);
}

.queue-detail__log {
  display: flex;
  gap: 10px;
  padding: 4px 0;
  font-size: 12px;
  line-height: 1.45;
}

.queue-detail__log-time {
  flex-shrink: 0;
  color: var(--app-text-tertiary);
}

.queue-detail__log-message {
  min-width: 0;
  color: var(--app-text);
  word-break: break-all;
}

.queue-detail__actions {
  display: flex;
  gap: 10px;
  padding-top: 4px;
}

.queue-detail__btn {
  flex: 1;
  border: 1px solid var(--app-border);
  border-radius: var(--radius-xs);
  background: var(--app-surface);
  color: var(--app-text);
  font-size: 14px;
  padding: 10px 0;
  cursor: pointer;
}

.queue-detail__btn--ghost {
  background: transparent;
}
</style>