<template>
  <div class="sq sq-text">
    <div class="sq-header">
      <h3 class="sq-title">{{ question.title }}</h3>
      <span v-if="question.required" class="sq-required">*</span>
      <span v-else class="sq-optional">({{ t('survey.optional') }})</span>
    </div>
    <p v-if="question.description" class="sq-desc">{{ question.description }}</p>
    <div class="sq-field">
      <textarea
        v-if="question.multiline"
        class="sq-textarea"
        :value="modelValue"
        :placeholder="question.placeholder || ''"
        :maxlength="question.maxLength || undefined"
        rows="4"
        @input="$emit('update:modelValue', $event.target.value)"
      />
      <input
        v-else
        class="sq-input"
        type="text"
        :value="modelValue"
        :placeholder="question.placeholder || ''"
        :maxlength="question.maxLength || undefined"
        @input="$emit('update:modelValue', $event.target.value)"
      />
      <span v-if="question.maxLength > 0" class="sq-char-count">
        {{ (modelValue || '').length }}/{{ question.maxLength }}
      </span>
    </div>
  </div>
</template>

<script setup>
import { useI18n } from 'vue-i18n'

defineOptions({ name: 'SurveyQuestionText' })

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
.sq-field {
  position: relative;
  margin-top: 12px;
}
.sq-input,
.sq-textarea {
  width: 100%;
  padding: 12px 14px;
  border-radius: 10px;
  border: 1.5px solid var(--van-border-color);
  background: var(--van-background);
  font-size: 14px;
  color: var(--van-text-color);
  outline: none;
  transition: border-color 0.2s;
  box-sizing: border-box;
  font-family: inherit;
}
.sq-input:focus,
.sq-textarea:focus {
  border-color: var(--van-primary-color);
}
.sq-textarea {
  resize: vertical;
  min-height: 80px;
  line-height: 1.5;
}
.sq-char-count {
  position: absolute;
  bottom: 8px;
  right: 12px;
  font-size: 11px;
  color: var(--van-text-color-3);
}
.sq-textarea ~ .sq-char-count {
  bottom: 8px;
}
</style>
