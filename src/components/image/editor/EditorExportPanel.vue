<template>
  <section class="editor-panel">
    <div class="editor-group">
      <p class="editor-group-title">{{ t('imageEditor.exportSettings') }}</p>

      <label class="editor-toggle">
        <div class="editor-toggle__info">
          <strong>{{ t('imageEditor.autoWhiteBg') }}</strong>
          <span>{{ t('imageEditor.autoWhiteBgDesc') }}</span>
        </div>
        <input
          :checked="whiteBgEnabled"
          type="checkbox"
          class="editor-toggle__input"
          @change="emit('update:whiteBgEnabled', $event.target.checked)"
        />
        <span class="editor-toggle__track" aria-hidden="true">
          <span class="editor-toggle__thumb" />
        </span>
      </label>

      <label v-if="whiteBgEnabled" class="editor-field">
        <span class="editor-field__label">{{ t('imageEditor.whiteBgStyle') }}</span>
        <AppSelect
          :model-value="whiteBgStyle"
          :options="whiteBgStyleOptions"
          :placeholder="t('imageEditor.selectExportStyle')"
          @update:model-value="emit('update:whiteBgStyle', $event)"
        />
      </label>

      <div v-if="whiteBgEnabled" class="editor-field">
        <span class="editor-field__label">{{ t('imageEditor.bgColor') }}</span>
        <div class="editor-bg-color">
          <button
            type="button"
            class="editor-bg-color__trigger"
            :aria-expanded="bgColorPickerOpen"
            @click="emit('toggle-bg-color-picker')"
          >
            <span class="editor-bg-color__trigger-swatch" :style="{ background: bgColor }" aria-hidden="true" />
            <span class="editor-bg-color__trigger-hex">{{ bgColor }}</span>
            <svg class="editor-bg-color__trigger-arrow" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M7 10L12 15L17 10" />
            </svg>
          </button>

          <div v-if="bgColorPickerOpen" class="editor-bg-color__picker">
            <HslColorPicker
              :model-value="bgColor"
              pick-fallback-enabled
              @update:model-value="emit('update:bgColor', $event)"
              @fallback-pick="emit('enter-color-pick')"
            />
          </div>

          <div class="editor-bg-color__actions">
            <div class="editor-bg-color__presets" :aria-label="t('imageEditor.bgColor')">
              <button
                v-for="preset in bgColorPresets"
                :key="preset"
                type="button"
                class="editor-bg-color__swatch"
                :class="{ 'editor-bg-color__swatch--active': bgColor === preset }"
                :style="{ background: preset }"
                :aria-label="preset"
                :aria-pressed="bgColor === preset"
                @click="emit('update:bgColor', preset)"
              />
            </div>
            <button
              type="button"
              class="editor-btn editor-bg-color__pick"
              :disabled="pickingColor"
              @click="emit('pick-dominant')"
            >
              {{ pickingColor ? t('imageEditor.pickingColor') : t('imageEditor.pickFromImage') }}
            </button>
          </div>
        </div>
      </div>

      <label v-if="whiteBgEnabled" class="editor-slider">
        <div class="editor-slider__head">
          <span>{{ t('imageEditor.whiteBgRatio') }}</span>
          <strong>{{ whiteBgScalePercent }}%</strong>
        </div>
        <input
          :value="whiteBgScalePercent"
          type="range"
          min="40"
          max="100"
          step="1"
          @input="emit('update:whiteBgScalePercent', Number($event.target.value))"
        />
      </label>

      <p class="editor-hint">{{ t('imageEditor.noCompressOnSave') }}</p>
    </div>
  </section>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import AppSelect from '@/components/common/AppSelect.vue'
import HslColorPicker from '@/components/common/HslColorPicker.vue'

defineProps({
  whiteBgEnabled: { type: Boolean, default: true },
  whiteBgStyle: { type: String, default: 'standard' },
  whiteBgScalePercent: { type: Number, default: 88 },
  bgColor: { type: String, default: '#ffffff' },
  bgColorPickerOpen: { type: Boolean, default: false },
  pickingColor: { type: Boolean, default: false }
})

const emit = defineEmits([
  'update:whiteBgEnabled',
  'update:whiteBgStyle',
  'update:whiteBgScalePercent',
  'update:bgColor',
  'toggle-bg-color-picker',
  'enter-color-pick',
  'pick-dominant'
])

const { t } = useI18n()

const bgColorPresets = ['#ffffff', '#000000', '#8a8a8e']

const whiteBgStyleOptions = computed(() => [
  { value: 'standard', label: t('imageEditor.standardBg') },
  { value: 'product', label: t('imageEditor.productEnhance') }
])
</script>
