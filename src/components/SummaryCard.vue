<template>
  <section class="summary-card">
    <div class="summary-orb summary-orb--left" />
    <div class="summary-orb summary-orb--right" />

    <div class="summary-head">
      <p class="summary-label">Collection Value</p>
    </div>

    <p class="summary-value">
      <span class="summary-currency">¥</span>{{ intPart }}<span class="summary-decimal">.{{ decPart }}</span>
    </p>
  </section>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  totalValue: { type: String, default: '0.00' },
  totalCount: { type: Number, default: 0 }
})

const intPart = computed(() => props.totalValue.split('.')[0])
const decPart = computed(() => props.totalValue.split('.')[1] ?? '00')
</script>

<style scoped>
.summary-card {
  position: relative;
  padding: 24px;
  border-radius: var(--radius-large);
  overflow: hidden;
  color: #fff;
  background:
    radial-gradient(circle at top left, rgba(255, 255, 255, 0.16), transparent 34%),
    linear-gradient(145deg, #17181c 0%, #24262d 52%, #33363e 100%);
  box-shadow: var(--app-shadow);
}

.summary-orb {
  position: absolute;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.08);
  pointer-events: none;
  filter: blur(2px);
}

.summary-orb--left {
  top: -44px;
  left: -36px;
  width: 160px;
  height: 160px;
}

.summary-orb--right {
  right: -18px;
  bottom: -32px;
  width: 120px;
  height: 120px;
}

.summary-head,
.summary-value {
  position: relative;
  z-index: 1;
}

.summary-label {
  margin-bottom: 8px;
  color: rgba(255, 255, 255, 0.56);
  font-size: 12px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.summary-value {
  margin: 22px 0 0;
  font-size: 44px;
  font-weight: 700;
  line-height: 1;
  letter-spacing: -0.05em;
}

.summary-currency {
  margin-right: 4px;
  font-size: 20px;
  font-weight: 600;
  vertical-align: 14px;
  opacity: 0.78;
}

.summary-decimal {
  font-size: 22px;
  font-weight: 600;
  opacity: 0.72;
}

@media (max-width: 360px) {
  .summary-value {
    font-size: 38px;
  }
}
</style>
