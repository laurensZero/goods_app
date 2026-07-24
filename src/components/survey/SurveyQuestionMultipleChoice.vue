<template>
  <div class="sq sq-multiple-choice">
    <div class="sq-header">
      <h3 class="sq-title">{{ question.title }}</h3>
      <span v-if="question.required" class="sq-required">*</span>
      <span v-else class="sq-optional">({{ t('survey.optional') }})</span>
    </div>
    <p v-if="question.description" class="sq-desc">{{ question.description }}</p>
    <p v-if="question.maxSelect > 0" class="sq-hint">
      {{ t('survey.selectAtMost', { max: question.maxSelect }) }}
    </p>
    <div class="sq-options">
      <label
        v-for="option in question.options"
        :key="option.id"
        class="sq-checkbox"
        :class="{
          'sq-checkbox--checked': selectedSet.has(option.id),
          'sq-checkbox--disabled': !selectedSet.has(option.id) && isMaxReached
        }"
      >
        <input
          type="checkbox"
          class="sq-checkbox-input"
          :value="option.id"
          :checked="selectedSet.has(option.id)"
          :disabled="!selectedSet.has(option.id) && isMaxReached"
          @change="toggleOption(option.id)"
        />
        <span class="sq-checkbox-box">
          <svg v-if="selectedSet.has(option.id)" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </span>
        <span class="sq-checkbox-label">{{ option.label }}</span>
      </label>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

defineOptions({ name: 'SurveyQuestionMultipleChoice' })

const { t } = useI18n()

const props = defineProps({
  question: { type: Object, required: true },
  modelValue: { type: Array, default: () => [] }
})

const emit = defineEmits(['update:modelValue'])

const selectedSet = computed(() => new Set(props.modelValue || []))

const isMaxReached = computed(() => {
  if (!props.question.maxSelect || props.question.maxSelect <= 0) return false
  return (props.modelValue || []).length >= props.question.maxSelect
})

function toggleOption(optionId) {
  const current = [...(props.modelValue || [])]
  const index = current.indexOf(optionId)
  if (index >= 0) {
    current.splice(index, 1)
  } else {
    if (props.question.maxSelect > 0 && current.length >= props.question.maxSelect) return
    current.push(optionId)
  }
  emit('update:modelValue', current)
}
</script>

<style scoped>
.sq {
  padding: 16px 0;
}
.sq-header {
  display: flex;
  align-items: baseline;
  gap: 4px;
  margin-bottom: 4px;
}
.sq-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--van-text-color);
  margin: 0;
}
.sq-required {
  color: var(--van-danger-color);
  font-weight: 700;
}
.sq-optional {
  font-size: 12px;
  color: var(--van-text-color-3);
  font-weight: 400;
}
.sq-desc {
  font-size: 13px;
  color: var(--van-text-color-2);
  margin: 0 0 12px;
  line-height: 1.5;
}
.sq-hint {
  font-size: 12px;
  color: var(--van-text-color-3);
  margin: 0 0 8px;
}
.sq-options {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 12px;
}
.sq-checkbox {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border-radius: 10px;
  background: var(--van-background);
  border: 1.5px solid var(--van-border-color);
  cursor: pointer;
  transition: all 0.2s;
}
.sq-checkbox--checked {
  border-color: var(--van-primary-color);
  background: var(--van-primary-color-light);
}
.sq-checkbox--disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.sq-checkbox-input {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
}
.sq-checkbox-box {
  width: 18px;
  height: 18px;
  border-radius: 4px;
  border: 2px solid var(--van-border-color);
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}
.sq-checkbox--checked .sq-checkbox-box {
  border-color: var(--van-primary-color);
  background: var(--van-primary-color);
  color: #fff;
}
.sq-checkbox-box svg {
  width: 12px;
  height: 12px;
}
.sq-checkbox-label {
  font-size: 14px;
  color: var(--van-text-color);
  line-height: 1.4;
}
</style>
