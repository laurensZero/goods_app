<template>
  <div class="chips-wrap">
    <button
      class="chip"
      type="button"
      :class="{ 'chip--active': modelValue === '' }"
      @click="$emit('update:modelValue', '')"
    >
      全部
    </button>
    <button
      v-for="cat in categories"
      :key="cat"
      class="chip"
      type="button"
      :class="{ 'chip--active': modelValue === cat }"
      @click="$emit('update:modelValue', cat)"
    >
      {{ cat }}
    </button>
  </div>
</template>

<script setup>
defineProps({
  categories: { type: Array, default: () => [] },
  modelValue: { type: String, default: '' }
})

defineEmits(['update:modelValue'])
</script>

<style scoped>
.chips-wrap {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  scrollbar-width: none;
  padding-bottom: 2px;
}

.chips-wrap::-webkit-scrollbar {
  display: none;
}

.chip {
  flex-shrink: 0;
  min-height: 36px;
  padding: 0 16px;
  border: none;
  border-radius: 999px;
  background: #e9e9ec;
  color: var(--app-text-secondary);
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
  box-shadow: inset 0 0 0 1px rgba(17, 20, 22, 0.03);
  transition: transform 0.16s ease, background 0.16s ease, color 0.16s ease;
}

.chip:active {
  transform: scale(0.96);
}

.chip--active {
  background: #141416;
  color: #fff;
  box-shadow: 0 8px 18px rgba(20, 20, 22, 0.14);
}
</style>
