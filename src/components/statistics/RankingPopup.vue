<template>
  <AppSheet
    :model-value="show"
    :placement="isMobile ? 'bottom' : 'center'"
    sheet-class="ranking-popup"
    @update:model-value="$emit('update:show', $event)"
  >
    <div class="ranking-popup__header">
      <h3 class="ranking-popup__title">{{ t('leaderboard.fullRanking') }}</h3>
      <button type="button" class="ranking-popup__close" @click="$emit('update:show', false)">
        ✕
      </button>
    </div>
    <div class="ranking-popup__body">
      <div v-if="entries.length > 0" class="ranking-popup__list">
        <article
          v-for="(entry, index) in entries"
          :key="entry.key"
          class="ranking-popup__item"
          :class="{ 'ranking-popup__item--tappable': interactive }"
          :role="interactive ? 'button' : undefined"
          :tabindex="interactive ? 0 : undefined"
          @click="interactive && emit('select', entry)"
          @keydown.enter="interactive && emit('select', entry)"
        >
          <div class="ranking-popup__index">{{ index + 1 }}</div>
          <div class="ranking-popup__content">
            <div class="ranking-popup__main">
              <div>
                <p class="ranking-popup__name">{{ entry.label }}</p>
                <p v-if="entry.meta" class="ranking-popup__meta">{{ entry.meta }}</p>
              </div>
              <p class="ranking-popup__value">{{ formatLeaderboardMetricValue(entry, metric, t) }}</p>
            </div>
            <div class="ranking-popup__chips">
              <span class="ranking-popup__chip">{{ t('leaderboard.items', { count: entry.quantity }) }}</span>
              <span class="ranking-popup__chip ranking-popup__chip--actual">{{ t('leaderboard.actualTotalPrice', { price: entry.actualTotalValue.toFixed(2) }) }}</span>
              <span v-if="interactive" class="ranking-popup__chip ranking-popup__chip--enter">{{ t('profile.entry.open') }}</span>
            </div>
          </div>
        </article>
      </div>
      <EmptyState
        v-else
        icon="📊"
        :title="t('leaderboard.emptyTitle')"
        :description="t('leaderboard.emptyDesc')"
      />
    </div>
  </AppSheet>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import { formatLeaderboardMetricValue } from '@/utils/goods/leaderboard'
import AppSheet from '@/components/common/AppSheet.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import { useDialogBackButton } from '@/composables/useDialogBackButton'

const { t } = useI18n()

const isMobile = ref(typeof window !== 'undefined' && window.innerWidth < 600)

function onResize() {
  isMobile.value = window.innerWidth < 600
}

onMounted(() => window.addEventListener('resize', onResize))
onBeforeUnmount(() => window.removeEventListener('resize', onResize))

const props = defineProps({
  show: { type: Boolean, default: false },
  entries: { type: Array, default: () => [] },
  metric: { type: String, default: 'quantity' },
  interactive: { type: Boolean, default: false }
})

const emit = defineEmits(['update:show', 'select'])

useDialogBackButton(() => emit('update:show', false), () => props.show)
</script>

<style scoped>
.ranking-popup__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 20px 12px;
  position: sticky;
  top: 0;
  background: transparent;
  z-index: 1;
}
.ranking-popup__title {
  margin: 0;
  font-size: var(--font-title-lg);
  font-weight: 700;
  color: var(--app-text);
}
.ranking-popup__close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 50%;
  background: var(--app-chip-bg);
  color: var(--app-text-secondary);
  font-size: var(--font-body-lg);
  cursor: pointer;
}
.ranking-popup__body {
  padding: 0 20px 24px;
  overflow-y: auto;
  max-height: calc(85vh - 60px);
}
.ranking-popup__list {
  display: grid;
  gap: 10px;
}
.ranking-popup__item {
  display: flex;
  gap: 12px;
  padding: 14px;
  border-radius: var(--radius-card);
  background: var(--app-surface-soft);
}
.ranking-popup__index {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  flex-shrink: 0;
  border-radius: var(--radius-xs);
  background: var(--app-chip-bg);
  color: var(--app-text);
  font-size: var(--font-body-lg);
  font-weight: 700;
}
.ranking-popup__content {
  flex: 1;
  min-width: 0;
}
.ranking-popup__main {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}
.ranking-popup__name {
  color: var(--app-text);
  font-size: var(--font-subtitle);
  font-weight: 600;
}
.ranking-popup__meta {
  margin-top: 2px;
  color: var(--app-text-secondary);
  font-size: var(--font-small);
}
.ranking-popup__value {
  color: var(--app-text);
  font-size: var(--font-subtitle);
  font-weight: 700;
  white-space: nowrap;
}
.ranking-popup__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}
.ranking-popup__chip {
  border-radius: var(--radius-pill);
  padding: 4px 10px;
  background: var(--app-surface-muted);
  color: var(--app-text-secondary);
  font-size: var(--font-caption);
}
.ranking-popup__chip--actual {
  background: color-mix(in srgb, #10b981 10%, transparent);
  color: #0d9668;
}
.ranking-popup__item--tappable {
  cursor: pointer;
  transition: transform 0.16s ease, background 0.16s ease;
}
.ranking-popup__item--tappable:active {
  transform: scale(0.98);
  background: var(--app-surface-muted);
}
.ranking-popup__chip--enter {
  margin-left: auto;
  background: color-mix(in srgb, var(--app-primary) 12%, transparent);
  color: var(--app-text);
  font-weight: 600;
}
</style>
