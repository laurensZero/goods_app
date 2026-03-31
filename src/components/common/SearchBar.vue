<template>
  <div class="search-shell">
    <svg class="search-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20L16.65 16.65" />
    </svg>

    <input
      ref="inputRef"
      :value="modelValue"
      :placeholder="placeholder"
      :autofocus="autofocus"
      type="text"
      inputmode="search"
      class="search-input"
      @input="syncInput($event)"
      @blur="syncInput($event)"
      @change="syncInput($event)"
      @compositionend="syncInput($event)"
      @paste="syncInputLater"
      @search="syncInput($event)"
    />

    <button
      v-if="modelValue"
      class="clear-btn"
      type="button"
      aria-label="清空搜索"
      @click="$emit('update:modelValue', '')"
    >
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M18 6L6 18" />
        <path d="M6 6L18 18" />
      </svg>
    </button>
  </div>
</template>

<script setup>
import { ref } from 'vue'
defineProps({
  modelValue: { type: String, default: '' },
  placeholder: { type: String, default: '搜索名称或分类' },
  autofocus: { type: Boolean, default: false }
})

const emit = defineEmits(['update:modelValue'])
const inputRef = ref(null)

function syncInput(event) {
  if (event?.target) {
    emit('update:modelValue', event.target.value ?? '')
    return
  }

  emit('update:modelValue', inputRef.value?.value ?? '')
}

function syncInputLater() {
  requestAnimationFrame(() => {
    syncInput()
  })
}
</script>

<style scoped>
.search-shell {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: var(--input-height);
  padding: 0 14px;
  border-radius: var(--radius-small);
  background: var(--app-surface);
  box-shadow: var(--app-shadow);
  border: 1px solid transparent;
  transition: border-color 0.16s ease, box-shadow 0.16s ease, transform 0.16s ease;
}

.search-shell:focus-within {
  border-color: rgba(20, 20, 22, 0.16);
}

.search-icon,
.clear-btn svg {
  width: 18px;
  height: 18px;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.search-icon {
  flex-shrink: 0;
  color: var(--app-text-tertiary);
}

.search-input {
  flex: 1;
  min-width: 0;
  height: calc(var(--input-height) - 2px);
  border: none;
  outline: none;
  background: transparent;
  color: var(--app-text);
  font-size: 16px;
}

.search-input::placeholder {
  color: var(--app-placeholder);
}

.search-input::-webkit-search-cancel-button {
  display: none;
}

.clear-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: var(--app-surface-soft);
  color: var(--app-text-secondary);
  transition: transform 0.16s ease, background 0.16s ease;
}

.clear-btn:active {
  transform: scale(0.96);
  background: rgba(20, 20, 22, 0.12);
}
</style>
