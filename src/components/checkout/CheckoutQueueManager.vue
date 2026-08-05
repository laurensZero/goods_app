<template>
  <Popup
    :show="show"
    :position="position"
    :round="!isTabletViewport"
    :lock-scroll="false"
    :class="['picker-popup', 'queue-manager-popup', { 'picker-popup--center': isTabletViewport }]"
    @update:show="$emit('update:show', $event)"
  >
    <div class="queue-manager">
      <div class="queue-manager__head">
        <div>
          <p class="queue-manager__label">{{ $t('checkout.queueTitle') }}</p>
          <h3 class="queue-manager__title">{{ $t('checkout.queueManageTitle') }}</h3>
        </div>
        <button type="button" class="queue-manager__close" @click="$emit('update:show', false)">
          {{ $t('common.close') }}
        </button>
      </div>
      <p class="queue-manager__desc">{{ $t('checkout.queueManageDesc') }}</p>

      <div v-if="displayQueueItems.length" class="queue-list">
        <div
          v-for="entry in displayQueueItems"
          :key="entry.id"
          class="queue-item"
          :class="{
            'queue-item--failed': entry.status === 'failed',
            'queue-item--running': entry.status === 'running',
            'queue-item--success': entry.status === 'success',
          }"
          @click="openQueueDetail(entry)"
        >
          <div class="queue-item__body">
            <p class="queue-item__title">{{ entry.summary.goodsText || $t('checkout.queueTitle') }}</p>
            <p class="queue-item__meta">{{ formatQueueTime(entry.displayAt || entry.scheduledAt) }}</p>
            <p v-if="entry.summary.giftText" class="queue-item__meta queue-item__meta--gift">{{ entry.summary.giftText }}</p>
            <p v-if="entry.status === 'success' && entry.result?.orderNo" class="queue-item__meta queue-item__meta--order-no">
              {{ $t('checkout.orderNo') }}: {{ entry.result.orderNo }}
            </p>
            <p v-if="entry.lastError" class="queue-item__error">{{ entry.lastError }}</p>
          </div>
          <div class="queue-item__actions">
            <span class="queue-item__status">{{ queueStatusText(entry) }}</span>
            <button v-if="entry.status === 'failed'" type="button" class="queue-item__btn" @click.stop="retryQueuedOrder(entry.id)">{{ $t('checkout.queueRetry') }}</button>
            <button type="button" class="queue-item__btn queue-item__btn--ghost" @click.stop="removeQueuedOrder(entry.id)">{{ $t('checkout.queueRemove') }}</button>
          </div>
        </div>
      </div>
      <p v-else class="queue-manager__empty">{{ $t('checkout.queueEmpty') }}</p>

      <div v-if="failedQueueItems.length" class="queue-manager__footer">
        <button type="button" class="queue-manager__clear" @click="$emit('clear-failed')">
          {{ $t('checkout.queueClearFailed') }}
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
  displayQueueItems: { type: Array, default: () => [] },
  failedQueueItems: { type: Array, default: () => [] },
  formatQueueTime: { type: Function, required: true },
  queueStatusText: { type: Function, required: true },
  openQueueDetail: { type: Function, required: true },
  retryQueuedOrder: { type: Function, required: true },
  removeQueuedOrder: { type: Function, required: true },
})
defineEmits(['update:show', 'clear-failed'])
</script>

<style scoped>
.queue-manager {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 16px 20px calc(env(safe-area-inset-bottom, 0px) + 16px);
  max-height: 78dvh;
}

.queue-manager__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.queue-manager__label {
  font-size: 12px;
  color: var(--app-text-tertiary);
}

.queue-manager__title {
  margin-top: 4px;
  font-size: 18px;
  font-weight: 700;
  color: var(--app-text);
}

.queue-manager__desc {
  font-size: 13px;
  color: var(--app-text-secondary);
}

.queue-manager__close {
  border: none;
  background: none;
  color: #2070c0;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.queue-manager__empty {
  padding: 16px 0 8px;
  color: var(--app-text-tertiary);
  font-size: 13px;
  text-align: center;
}

.queue-manager__footer {
  display: flex;
  justify-content: flex-end;
}

.queue-manager__clear {
  border: none;
  background: none;
  color: #c74444;
  font-size: 12px;
  cursor: pointer;
}

.queue-manager-popup {
  overflow: hidden;
}

.queue-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.queue-item {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 12px;
  border-radius: var(--radius-small);
  background: var(--app-surface-soft);
  cursor: pointer;
}

.queue-item--running {
  background: color-mix(in srgb, #4a7aec 8%, var(--app-surface-soft));
}

.queue-item--failed {
  background: color-mix(in srgb, #c74444 9%, var(--app-surface-soft));
}

.queue-item--success {
  background: color-mix(in srgb, #27a15b 8%, var(--app-surface-soft));
}

.queue-item__body {
  flex: 1;
  min-width: 0;
}

.queue-item__title {
  font-size: 13px;
  font-weight: 600;
  color: var(--app-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.queue-item__meta {
  margin-top: 3px;
  font-size: 12px;
  color: var(--app-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.queue-item__meta--gift {
  color: var(--app-text-tertiary);
}

.queue-item__error {
  margin-top: 4px;
  font-size: 12px;
  color: #c74444;
}

.queue-item__actions {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6px;
  flex-shrink: 0;
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

.queue-item__meta--order-no {
  color: #27a15b;
}

.queue-item__btn {
  border: 1px solid var(--app-border);
  border-radius: var(--radius-xs);
  background: var(--app-surface);
  color: var(--app-text);
  font-size: 12px;
  padding: 4px 8px;
  cursor: pointer;
}

.queue-item__btn--ghost {
  background: transparent;
}
</style>