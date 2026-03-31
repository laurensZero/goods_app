<template>
  <div class="mode-switch" role="tablist" aria-label="首页模式切换" :style="modeSwitchStyle">
    <span class="mode-switch__indicator" aria-hidden="true" />

    <button
      type="button"
      class="mode-switch__item"
      :class="{ 'mode-switch__item--active': modelValue === 'goods' }"
      role="tab"
      :aria-selected="modelValue === 'goods'"
      aria-label="切换到收藏模式"
      @click="$emit('update:modelValue', 'goods')"
    >
      收藏
    </button>

    <button
      type="button"
      class="mode-switch__item"
      :class="{ 'mode-switch__item--active': modelValue === 'recharge' }"
      role="tab"
      :aria-selected="modelValue === 'recharge'"
      aria-label="切换到充值模式"
      @click="$emit('update:modelValue', 'recharge')"
    >
      充值
    </button>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  modelValue: {
    type: String,
    default: 'goods'
  }
})

defineEmits(['update:modelValue'])

const modeSwitchStyle = computed(() => ({
  '--mode-switch-index': props.modelValue === 'recharge' ? 1 : 0
}))
</script>

<style scoped>
.mode-switch {
  --mode-switch-gap: 6px;
  --mode-switch-pad: 4px;
  --mode-switch-height: 32px;
  --mode-switch-duration: calc(var(--home-motion-density-duration) + 80ms);
  --mode-switch-count: 2;
  --mode-switch-index: 0;
  position: relative;
  display: inline-grid;
  grid-template-columns: repeat(var(--mode-switch-count, 2), minmax(0, 1fr));
  gap: var(--mode-switch-gap);
  padding: var(--mode-switch-pad);
  border-radius: 999px;
  background: var(--app-glass);
  box-shadow: var(--app-shadow);
}

.mode-switch__indicator {
  position: absolute;
  top: var(--mode-switch-pad, 4px);
  left: var(--mode-switch-pad, 4px);
  height: var(--mode-switch-height, 32px);
  width: calc(
    (100% - (var(--mode-switch-gap, 6px) * (var(--mode-switch-count, 2) - 1)) - (var(--mode-switch-pad, 4px) * 2))
    / var(--mode-switch-count, 2)
  );
  border-radius: 999px;
  background: #141416;
  transform: translateX(calc((100% + var(--mode-switch-gap, 6px)) * var(--mode-switch-index, 0)));
  transition:
    transform var(--mode-switch-duration) var(--home-motion-ease-emphasis),
    background var(--home-motion-density-duration) var(--home-motion-ease-standard),
    box-shadow var(--home-motion-density-duration) var(--home-motion-ease-standard);
  box-shadow: 0 6px 14px rgba(20, 20, 22, 0.12);
  will-change: transform;
  pointer-events: none;
  z-index: 0;
}

.mode-switch__item {
  position: relative;
  z-index: 1;
  min-width: 58px;
  height: var(--mode-switch-height, 32px);
  padding: 0 12px;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: var(--app-text-secondary);
  font-size: 13px;
  font-weight: 600;
  transition:
    transform var(--home-motion-density-duration) var(--home-motion-ease-standard),
    color var(--home-motion-density-duration) var(--home-motion-ease-standard);
}

.mode-switch__item:active {
  transform: scale(0.96);
}

.mode-switch__item--active {
  color: #ffffff;
}
</style>
