<template>
  <div ref="modeSwitchRef" class="mode-switch" role="tablist" :aria-label="ariaLabel" :style="modeSwitchStyle">
    <span class="mode-switch__indicator" aria-hidden="true" />

    <button
      v-for="option in normalizedOptions"
      :key="option.value"
      type="button"
      class="mode-switch__item"
      :class="{ 'mode-switch__item--active': modelValue === option.value }"
      role="tab"
      :aria-selected="modelValue === option.value"
      :aria-label="option.ariaLabel || option.label"
      @click="$emit('update:modelValue', option.value)"
    >
      {{ option.label }}
    </button>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'

const props = defineProps({
  modelValue: {
    type: String,
    default: 'goods'
  },
  ariaLabel: {
    type: String,
    default: '首页内容切换'
  },
  options: {
    type: Array,
    default: () => ([
      { value: 'goods', label: '收藏' },
      { value: 'wishlist', label: '心愿' },
      { value: 'stats', label: '统计' }
    ])
  }
})

defineEmits(['update:modelValue'])

const MODE_SWITCH_LAST_VALUE_KEY = 'goods-home-top-switch-last-value-v1'
const modeSwitchRef = ref(null)

const normalizedOptions = computed(() =>
  props.options.map((option) => ({
    value: option.value,
    label: option.label,
    ariaLabel: option.ariaLabel || option.label
  }))
)

const currentIndex = computed(() => {
  const index = normalizedOptions.value.findIndex((option) => option.value === props.modelValue)
  return index >= 0 ? index : 0
})

const animatedIndex = ref(currentIndex.value)

function readStoredValue() {
  try {
    return sessionStorage.getItem(MODE_SWITCH_LAST_VALUE_KEY) || ''
  } catch {
    return ''
  }
}

function writeStoredValue(value) {
  try {
    sessionStorage.setItem(MODE_SWITCH_LAST_VALUE_KEY, value)
  } catch {
    // ignore storage failures
  }
}

const modeSwitchStyle = computed(() => {
  return {
    '--mode-switch-index': animatedIndex.value,
    '--mode-switch-count': normalizedOptions.value.length || 1
  }
})

onMounted(() => {
  const storedValue = readStoredValue()
  const storedIndex = normalizedOptions.value.findIndex((option) => option.value === storedValue)
  if (storedIndex >= 0 && storedIndex !== currentIndex.value) {
    animatedIndex.value = storedIndex

    window.requestAnimationFrame(() => {
      // Ensure browser commits the "from" position before switching to target.
      void modeSwitchRef.value?.offsetWidth
      window.requestAnimationFrame(() => {
        animatedIndex.value = currentIndex.value
        writeStoredValue(String(props.modelValue || ''))
      })
    })
    return
  }

  animatedIndex.value = currentIndex.value
  writeStoredValue(String(props.modelValue || ''))
})

watch(currentIndex, (nextIndex) => {
  animatedIndex.value = nextIndex
  writeStoredValue(String(props.modelValue || ''))
})
</script>

<style scoped>
.mode-switch {
  --mode-switch-gap: 6px;
  --mode-switch-pad: 4px;
  --mode-switch-height: 32px;
  --mode-switch-duration: 280ms;
  --mode-switch-color-duration: 180ms;
  --mode-switch-count: 3;
  --mode-switch-index: 0;
  position: relative;
  display: inline-grid;
  grid-template-columns: repeat(var(--mode-switch-count, 3), minmax(0, 1fr));
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
    (100% - (var(--mode-switch-gap, 6px) * (var(--mode-switch-count, 3) - 1)) - (var(--mode-switch-pad, 4px) * 2))
    / var(--mode-switch-count, 3)
  );
  border-radius: 999px;
  background: #141416;
  transform: translateX(calc((100% + var(--mode-switch-gap, 6px)) * var(--mode-switch-index, 0)));
  transition:
    transform var(--mode-switch-duration) cubic-bezier(0.22, 1, 0.36, 1),
    background var(--mode-switch-color-duration) ease,
    box-shadow var(--mode-switch-color-duration) ease;
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
    transform var(--mode-switch-color-duration) ease,
    color var(--mode-switch-color-duration) ease;
}

.mode-switch__item:active {
  transform: scale(0.96);
}

.mode-switch__item--active {
  color: #ffffff;
}
</style>
