<template>
  <section class="editor-panel">
    <div class="editor-group">
      <p class="editor-group-title">{{ t('imageEditor.cutout') }}</p>
      <button
        type="button"
        class="editor-btn editor-btn--primary"
        :disabled="loading || saving"
        @click="emit('run')"
      >
        {{ loading ? loadingText : t('imageEditor.oneClickCutout') }}
      </button>

      <button
        v-if="errorText"
        type="button"
        class="editor-btn"
        :disabled="loading || saving"
        @click="emit('run')"
      >
        {{ t('imageEditor.retry') }}
      </button>

      <p class="editor-hint">{{ t('imageEditor.cutoutHint') }}</p>

      <div v-if="cloudAvailable" class="editor-model">
        <span class="editor-model__label">{{ t('imageEditor.cutoutModel') }}</span>
        <div class="editor-model__options">
          <button
            v-for="model in modelOptions"
            :key="model.value"
            type="button"
            :class="['editor-model__option', modelValue === model.value && 'editor-model__option--active']"
            @click="emit('update:modelValue', model.value)"
          >
            {{ model.label }}
          </button>
        </div>
        <p class="editor-hint">{{ t('imageEditor.cutoutModelHint') }}</p>
      </div>

      <p v-if="qualityHint" class="editor-hint editor-hint--warn">{{ qualityHint }}</p>
    </div>

    <div v-if="loading" class="editor-progress">
      <div class="editor-progress__head">
        <span>{{ loadingText }}</span>
        <strong>{{ progress }}%</strong>
      </div>
      <div class="editor-progress__track">
        <div class="editor-progress__fill" :style="{ width: `${progress}%` }" />
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

defineProps({
  loading: { type: Boolean, default: false },
  saving: { type: Boolean, default: false },
  progress: { type: Number, default: 0 },
  loadingText: { type: String, default: '' },
  errorText: { type: String, default: '' },
  qualityHint: { type: String, default: '' },
  cloudAvailable: { type: Boolean, default: false },
  modelValue: { type: String, default: 'falcon' }
})

defineEmits(['run', 'update:modelValue'])

const { t } = useI18n()

const modelOptions = computed(() => [
  { value: 'falcon', label: t('imageEditor.modelFalcon') },
  { value: 'aurora', label: t('imageEditor.modelAurora') },
  { value: 'ghost', label: t('imageEditor.modelGhost') }
])
</script>
