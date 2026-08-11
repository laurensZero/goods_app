<script setup>
import { computed } from 'vue'
import AppSelect from './AppSelect.vue'

const props = defineProps({
  modelValue: { type: Object, required: true }, // { mode, value }
  label: { type: String, required: true }
})

const emit = defineEmits(['update:modelValue'])

const MODES = [
  { value: 'any', label: '不限' },
  { value: 'exact', label: '等于' },
  { value: 'gte', label: '大于等于' },
  { value: 'lte', label: '小于等于' }
]

const current = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v)
})

function onModeChange(mode) {
  if (mode === 'any') {
    current.value = { mode: 'any', value: '' }
  } else {
    current.value = { ...current.value, mode }
  }
}
</script>

<template>
  <div class="version-rule">
    <div class="rule-mode">
      <span class="field-label">{{ label }}</span>
      <AppSelect
        class="rule-mode-select"
        :model-value="current.mode"
        :options="MODES"
        @update:model-value="onModeChange"
      />
    </div>
    <div v-if="current.mode !== 'any'" class="rule-value">
      <input
        v-model="current.value"
        class="input"
        type="text"
        :placeholder="current.mode === 'exact' ? '例如 1.6.0.3' : current.mode === 'gte' ? '最低版本' : '最高版本'"
      >
    </div>
  </div>
</template>

<style scoped>
.version-rule {
  display: grid;
  gap: 6px;
}

.rule-mode {
  display: flex;
  align-items: center;
  gap: 10px;
}

.rule-mode .field-label {
  min-width: 72px;
}

.rule-mode .rule-mode-select {
  width: 130px;
  flex-shrink: 0;
}
</style>