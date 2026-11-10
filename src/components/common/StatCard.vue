<template>
  <article class="stat-card">
    <p class="stat-card__label">{{ label }}</p>
    <p :class="['stat-card__value', valueClass]">{{ value }}</p>
    <div v-if="$slots.default" class="stat-card__meta">
      <slot />
    </div>
  </article>
</template>

<script setup>
defineProps({
  label: { type: String, default: '' },
  value: { type: [String, Number], default: '' },
  valueClass: { type: String, default: '' }
})
</script>

<style scoped>
.stat-card {
  min-width: 0;
  padding: 14px 16px;
  border-radius: var(--radius-card);
  background: var(--app-surface);
  box-shadow: var(--app-shadow);
}

.stat-card__label {
  font-size: var(--font-small);
  color: var(--app-text-tertiary);
  line-height: 1.2;
}

.stat-card__value {
  margin-top: 6px;
  font-size: var(--font-title-lg);
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--app-text);
}

.stat-card__meta {
  margin-top: 4px;
  font-size: var(--font-caption);
  color: var(--app-text-secondary);
}
</style>
