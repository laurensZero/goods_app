<template>
  <div class="sq sq-single-choice">
    <div class="sq-header">
      <h3 class="sq-title">{{ question.title }}</h3>
      <span v-if="question.required" class="sq-required">*</span>
      <span v-else class="sq-optional">({{ t('survey.optional') }})</span>
    </div>
    <p v-if="question.description" class="sq-desc">{{ question.description }}</p>
    <div class="sq-options">
      <label
        v-for="option in question.options"
        :key="option.id"
        class="sq-radio"
        :class="{ 'sq-radio--checked': modelValue === option.id }"
      >
        <input
          type="radio"
          class="sq-radio-input"
          :name="`survey-${question.id}`"
          :value="option.id"
          :checked="modelValue === option.id"
          @change="$emit('update:modelValue', option.id)"
        />
        <span class="sq-radio-dot" />
        <span class="sq-radio-label">{{ option.label }}</span>
      </label>
    </div>
  </div>
</template>

<script setup>
import { useI18n } from 'vue-i18n'

defineOptions({ name: 'SurveyQuestionSingleChoice' })

const { t } = useI18n()

defineProps({
  question: { type: Object, required: true },
  modelValue: { type: String, default: '' }
})

defineEmits(['update:modelValue'])
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
.sq-options {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 12px;
}
.sq-radio {
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
.sq-radio--checked {
  border-color: var(--van-primary-color);
  background: var(--van-primary-color-light);
}
.sq-radio-input {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
}
.sq-radio-dot {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 2px solid var(--van-border-color);
  flex-shrink: 0;
  position: relative;
  transition: all 0.2s;
}
.sq-radio--checked .sq-radio-dot {
  border-color: var(--van-primary-color);
}
.sq-radio--checked .sq-radio-dot::after {
  content: '';
  position: absolute;
  top: 3px;
  left: 3px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--van-primary-color);
}
.sq-radio-label {
  font-size: 14px;
  color: var(--van-text-color);
  line-height: 1.4;
}
</style>
