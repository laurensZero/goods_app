<script setup>
import { ref, watch } from 'vue'

const props = defineProps({
  modelValue: { type: String, default: '' },
  placeholder: { type: String, default: '搜索…' },
  delay: { type: Number, default: 300 }
})

const emit = defineEmits(['update:modelValue', 'search'])

const text = ref(props.modelValue)
let timer = null

watch(() => props.modelValue, (value) => {
  if (value !== text.value) text.value = value
})

function onChange() {
  emit('update:modelValue', text.value)
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => emit('search', text.value), props.delay)
}

function clear() {
  text.value = ''
  emit('update:modelValue', '')
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => emit('search', ''), 0)
}
</script>

<template>
  <div class="search-box">
    <input
      v-model="text"
      class="input search-input"
      type="search"
      :placeholder="placeholder"
      @input="onChange"
    >
    <button v-if="text" class="search-clear" type="button" aria-label="清空" @click="clear">×</button>
  </div>
</template>

<style scoped>
.search-box {
  position: relative;
  flex: 1;
  min-width: 160px;
}

.search-input {
  padding-right: 34px;
}

.search-clear {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  width: 22px;
  height: 22px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  color: var(--app-text-tertiary);
  background: var(--app-surface-soft);
  border: none;
}
</style>
