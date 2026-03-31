<template>
  <button
    v-if="show"
    class="scroll-top-button"
    type="button"
    aria-label="返回顶部"
    @click="$emit('click')"
  >
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 19V5" />
      <path d="M6 11L12 5L18 11" />
    </svg>
  </button>
</template>

<script setup>
defineProps({
  show: { type: Boolean, default: false }
})

defineEmits(['click'])
</script>

<style scoped>
.scroll-top-button {
  position: fixed;
  left: 16px;
  bottom: calc(var(--tabbar-height) + env(safe-area-inset-bottom));
  display: flex;
  align-items: center;
  justify-content: center;
  width: var(--fab-size);
  height: var(--fab-size);
  border: 1px solid var(--app-glass-border);
  border-radius: 50%;
  background: var(--app-glass);
  color: var(--app-text);
  box-shadow: var(--app-shadow);
  backdrop-filter: blur(20px) saturate(140%);
  -webkit-backdrop-filter: blur(20px) saturate(140%);
  transition: transform 0.16s ease, box-shadow 0.16s ease;
  z-index: 65;
}

.scroll-top-button svg {
  width: 22px;
  height: 22px;
  stroke: currentColor;
  stroke-width: 2.2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.scroll-top-button:active {
  transform: scale(0.96);
}
</style>
