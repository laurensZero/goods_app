<template>
  <section v-if="entries.length > 0" class="status-timeline-section">
    <div class="section-head">
      <p class="section-label">{{ t('goods.detail.statusTimeline') }}</p>
      <h2 class="section-title">{{ t('goods.detail.statusTimelineLabel') }}</h2>
    </div>

    <div class="timeline-card">
      <div
        v-for="(entry, index) in entries"
        :key="`${entry.at}-${entry.status}-${index}`"
        class="timeline-entry"
        :class="{ 'timeline-entry--first': index === 0 }"
      >
        <div class="timeline-rail" aria-hidden="true">
          <div :class="['timeline-dot', { 'timeline-dot--active': index === 0 }]" />
          <div v-if="index < entries.length - 1" class="timeline-line" />
        </div>
        <div class="timeline-content">
          <div class="timeline-header">
            <span :class="['timeline-status', { 'timeline-status--active': index === 0 }]">
              {{ getStatusLabel(entry.status) }}
            </span>
            <span v-if="entry.price" class="timeline-price">
              ¥{{ entry.price }}{{ entry.status === '在售' ? ` ${t('sale.timelineListed')}` : entry.status === '已出' ? ` ${t('sale.timelineDealt')}` : '' }}
            </span>
            <span v-if="entry.platform" class="timeline-platform">{{ entry.platform }}</span>
            <span class="timeline-date">{{ entry.at }}</span>
          </div>
          <p v-if="entry.fee" class="timeline-note">{{ t('sale.fee') }} ¥{{ entry.fee }}</p>
          <p v-if="entry.note" class="timeline-note">{{ entry.note }}</p>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { getStatusLabel } from '@/utils/goods/status'

const props = defineProps({
  timeline: {
    type: Array,
    default: () => []
  }
})

const { t } = useI18n()

const entries = computed(() => {
  if (!Array.isArray(props.timeline)) return []
  return [...props.timeline].reverse()
})
</script>

<style scoped>
.status-timeline-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.section-head {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.section-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--app-text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin: 0;
}

.section-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--app-text);
  margin: 0;
}

.timeline-card {
  background: var(--app-surface);
  border-radius: 16px;
  padding: 16px;
  display: flex;
  flex-direction: column;
}

.timeline-entry {
  display: flex;
  gap: 14px;
  min-height: 56px;
}

.timeline-entry:last-child {
  min-height: auto;
}

.timeline-rail {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 16px;
  flex-shrink: 0;
}

.timeline-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--app-border);
  flex-shrink: 0;
  margin-top: 5px;
}

.timeline-dot--active {
  background: var(--app-primary);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--app-primary) 20%, transparent);
}

.timeline-line {
  width: 2px;
  flex: 1;
  background: var(--app-border);
  margin: 4px 0;
  border-radius: 1px;
}

.timeline-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding-bottom: 14px;
}

.timeline-entry:last-child .timeline-content {
  padding-bottom: 0;
}

.timeline-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.timeline-status {
  font-size: 14px;
  font-weight: 500;
  color: var(--app-text-secondary);
}

.timeline-status--active {
  color: var(--app-primary);
  font-weight: 600;
}

.timeline-date {
  font-size: 12px;
  color: var(--app-text-tertiary);
}

.timeline-price {
  font-size: 12px;
  font-weight: 600;
  color: var(--app-chip-accent-text, #2070c0);
  background: var(--app-chip-accent-bg, rgba(32, 112, 192, 0.12));
  padding: 1px 8px;
  border-radius: 999px;
  white-space: nowrap;
}

.timeline-platform {
  font-size: 11px;
  color: var(--app-text-tertiary);
  border: 1px solid color-mix(in srgb, var(--app-border) 78%, transparent);
  padding: 1px 7px;
  border-radius: 999px;
  white-space: nowrap;
}

.timeline-note {
  font-size: 12px;
  color: var(--app-text-tertiary);
  margin: 0;
  line-height: 1.4;
}
</style>
