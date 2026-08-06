<template>
  <van-popup
    :show="show"
    :position="isMobile ? 'bottom' : 'center'"
    round
    transition="sheet-pop"
    :style="isMobile ? { maxHeight: '85vh' } : {}"
    class="ranking-popup picker-popup"
    @update:show="$emit('update:show', $event)"
  >
    <div class="ranking-popup__header">
      <h3 class="ranking-popup__title">{{ t('leaderboard.fullRanking') }}</h3>
      <button type="button" class="ranking-popup__close" @click="$emit('update:show', false)">
        ✕
      </button>
    </div>
    <div class="ranking-popup__body">
      <div v-if="entries.length > 0" class="ranking-popup__list">
        <article v-for="(entry, index) in entries" :key="entry.key" class="ranking-popup__item">
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
  </van-popup>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import { formatLeaderboardMetricValue } from '@/utils/goods/leaderboard'
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
  metric: { type: String, default: 'quantity' }
})

const emit = defineEmits(['update:show'])

useDialogBackButton(() => emit('update:show', false), () => props.show)
</script>

<style scoped>
.ranking-popup {
  --van-popup-background: var(--app-surface);
}
:global(.ranking-popup.van-popup--bottom) {
  border-radius: var(--radius-large) var(--radius-large) 0 0 !important;
}
:global(.ranking-popup.van-popup--center) {
  border-radius: var(--radius-large) !important;
}
:global(.ranking-popup) {
  scrollbar-width: none;
}
:global(.ranking-popup::-webkit-scrollbar) { display: none; }
.ranking-popup__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 20px 12px;
  position: sticky;
  top: 0;
  background: var(--app-surface);
  z-index: 1;
}
.ranking-popup__title {
  margin: 0;
  font-size: 18px;
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
  font-size: 14px;
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
  border-radius: 12px;
  background: var(--app-chip-bg);
  color: var(--app-text);
  font-size: 14px;
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
  font-size: 15px;
  font-weight: 600;
}
.ranking-popup__meta {
  margin-top: 2px;
  color: var(--app-text-secondary);
  font-size: 12px;
}
.ranking-popup__value {
  color: var(--app-text);
  font-size: 15px;
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
  border-radius: 999px;
  padding: 4px 10px;
  background: var(--app-surface-muted);
  color: var(--app-text-secondary);
  font-size: 11px;
}
.ranking-popup__chip--actual {
  background: color-mix(in srgb, #10b981 10%, transparent);
  color: #0d9668;
}
</style>
