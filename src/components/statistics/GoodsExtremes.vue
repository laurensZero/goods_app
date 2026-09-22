<template>
  <div v-if="extremes.length > 0" class="extremes-section">
    <div class="extremes-header">
      <p class="section-label">{{ t('stats.extremes.label') }}</p>
      <h2 class="section-title section-title--sub">{{ t('stats.extremes.title') }}</h2>
    </div>
    <div class="extremes-grid">
      <article v-for="item in extremes" :key="item.key" class="extreme-card">
        <div class="extreme-image-wrap">
          <img
            v-if="item.coverImage"
            :src="item.coverImage"
            :alt="item.name"
            class="extreme-image"
            loading="lazy"
          />
          <span v-else class="extreme-icon">{{ item.icon }}</span>
        </div>
        <div class="extreme-info">
          <p class="extreme-label">{{ item.label }}</p>
          <p class="extreme-name">{{ item.name }}</p>
          <p class="extreme-value">{{ item.value }}</p>
        </div>
      </article>
    </div>
  </div>
</template>

<script setup>
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

defineProps({
  extremes: { type: Array, default: () => [] }
})
</script>

<style scoped>
.extremes-section { padding: 0 var(--page-padding); margin-top: var(--section-gap); }
.extremes-header { margin-bottom: 14px; }
.section-label {
  color: var(--app-text-tertiary);
  font-size: 13px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.section-title--sub {
  margin-top: 4px;
  font-size: 22px;
  font-weight: 600;
  color: var(--app-text);
}
.extremes-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
}
@media (min-width: 600px) {
  .extremes-grid { grid-template-columns: repeat(4, 1fr); }
}
.extreme-card {
  display: flex;
  flex-direction: column;
  border-radius: var(--radius-card);
  background: var(--app-surface);
  box-shadow: var(--app-shadow);
  overflow: hidden;
}
.extreme-image-wrap {
  position: relative;
  width: 100%;
  aspect-ratio: 1 / 1;
  background: var(--app-surface-soft);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.extreme-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.extreme-icon {
  font-size: 36px;
  opacity: 0.7;
}
.extreme-info {
  padding: 12px;
}
.extreme-label {
  color: var(--app-text-tertiary);
  font-size: 11px;
  font-weight: 600;
}
.extreme-name {
  margin-top: 4px;
  color: var(--app-text);
  font-size: 14px;
  font-weight: 600;
  line-height: 1.35;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.extreme-value {
  margin-top: 4px;
  color: var(--app-text-secondary);
  font-size: 13px;
  font-weight: 500;
}

</style>
