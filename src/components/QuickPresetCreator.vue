<template>
  <div class="quick-create-card">
    <input
      ref="inputRef"
      :value="modelValue"
      class="quick-create-input"
      type="text"
      :placeholder="placeholder"
      :maxlength="maxlength"
      @input="emit('update:modelValue', $event.target.value)"
      @keyup.enter="emit('submit')"
      @keyup.esc="emit('cancel')"
    />

    <div v-if="secondaryOptions.length > 0" class="quick-create-secondary">
      <span v-if="secondaryLabel" class="quick-create-secondary__label">{{ secondaryLabel }}</span>
      <AppSelect
        :model-value="secondaryValue"
        :options="secondaryOptions"
        :placeholder="secondaryPlaceholder"
        @update:model-value="emit('update:secondaryValue', $event)"
      />
    </div>

    <div class="quick-create-actions">
      <button type="button" class="quick-create-btn quick-create-btn--ghost" @click="emit('cancel')">取消</button>
      <button type="button" class="quick-create-btn quick-create-btn--primary" @click="emit('submit')">{{ submitText }}</button>
    </div>
  </div>
</template>

<script setup>
import { nextTick, ref, watch } from 'vue'
import AppSelect from '@/components/AppSelect.vue'

const props = defineProps({
  show: { type: Boolean, default: false },
  modelValue: { type: String, default: '' },
  placeholder: { type: String, default: '' },
  maxlength: { type: Number, default: 40 },
  submitText: { type: String, default: '保存' },
  secondaryValue: { type: String, default: '' },
  secondaryOptions: { type: Array, default: () => [] },
  secondaryLabel: { type: String, default: '' },
  secondaryPlaceholder: { type: String, default: '请选择' }
})

const emit = defineEmits(['update:modelValue', 'update:secondaryValue', 'submit', 'cancel'])

const inputRef = ref(null)

watch(() => props.show, async (visible) => {
  if (!visible) return
  await nextTick()
  inputRef.value?.focus()
}, { immediate: true })
</script>

<style scoped>
.quick-create-card {
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  border-radius: 16px;
  background: rgba(20, 20, 22, 0.04);
}

.quick-create-input {
  width: 100%;
  min-height: 44px;
  padding: 0 12px;
  border: 1px solid transparent;
  border-radius: 14px;
  background: var(--app-surface);
  color: var(--app-text);
  font-size: 15px;
  outline: none;
  transition: border-color 0.16s ease;
}

.quick-create-input:focus {
  border-color: rgba(20, 20, 22, 0.16);
}

.quick-create-input::placeholder {
  color: var(--app-placeholder);
}

.quick-create-secondary {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.quick-create-secondary__label {
  color: var(--app-text-tertiary);
  font-size: 12px;
  font-weight: 500;
}

.quick-create-actions {
  display: flex;
  gap: 8px;
}

.quick-create-btn {
  flex: 1;
  min-height: 40px;
  border: none;
  border-radius: 12px;
  font-size: 14px;
  font-weight: 600;
  transition: transform 0.16s ease, opacity 0.16s ease;
}

.quick-create-btn:active {
  transform: scale(0.97);
}

.quick-create-btn--ghost {
  background: rgba(20, 20, 22, 0.08);
  color: var(--app-text-secondary);
}

.quick-create-btn--primary {
  background: #141416;
  color: #ffffff;
}

@media (prefers-color-scheme: dark) {
  .quick-create-card {
    background: rgba(255, 255, 255, 0.05);
  }

  .quick-create-input {
    border-color: rgba(255, 255, 255, 0.07);
    background: color-mix(in srgb, var(--app-surface) 92%, var(--app-glass));
  }

  .quick-create-input:focus {
    border-color: rgba(255, 255, 255, 0.12);
  }

  .quick-create-btn--ghost {
    background: rgba(255, 255, 255, 0.08);
    color: var(--app-text);
  }

  .quick-create-btn--primary {
    background: #f5f5f7;
    color: #141416;
  }
}
</style>
