<template>
  <section class="editor-panel">
    <div class="editor-group">
      <p class="editor-group-title">{{ t('imageEditor.orientation') }}</p>
      <div class="editor-actions">
        <button type="button" class="editor-btn" :disabled="saving" @click="emit('rotate-left')">
          {{ t('imageEditor.rotateLeft') }}
        </button>
        <button type="button" class="editor-btn" :disabled="saving" @click="emit('rotate-right')">
          {{ t('imageEditor.rotateRight') }}
        </button>
        <button type="button" class="editor-btn" :disabled="saving" @click="emit('flip-h')">
          {{ t('imageEditor.flipH') }}
        </button>
        <button type="button" class="editor-btn editor-btn--ghost" :disabled="saving" @click="emit('reset')">
          {{ t('imageEditor.resetOrientation') }}
        </button>
      </div>
    </div>

    <div v-if="!simpleMode && showCropRatio" class="editor-group">
      <p class="editor-group-title">{{ t('imageEditor.cropRatio') }}</p>
      <div class="editor-chips">
        <button
          v-for="option in ratioOptions"
          :key="option.value"
          type="button"
          :class="['editor-chip', isActiveRatio(option.value) && 'editor-chip--active']"
          :disabled="saving"
          @click="emit('update:cropRatio', option.value)"
        >
          {{ option.label }}
        </button>
      </div>
    </div>

    <div v-if="!simpleMode" class="editor-group">
      <p class="editor-group-title">{{ t('imageEditor.correction') }}</p>

      <label v-if="!simpleMode" class="editor-slider">
        <div class="editor-slider__head">
          <span>{{ t('imageEditor.freeRotate') }}</span>
          <strong>{{ formatAngle(freeAngle) }}</strong>
        </div>
        <input
          :value="freeAngle"
          type="range"
          min="-180"
          max="180"
          step="1"
          :disabled="saving || !cropperReady"
          @input="onFreeAngleInput"
          @change="emit('record-history')"
        />
      </label>

      <label class="editor-slider">
        <div class="editor-slider__head">
          <span>{{ t('imageEditor.brightness') }}</span>
          <strong>{{ formatSignedValue(brightness) }}</strong>
        </div>
        <input
          :value="brightness"
          type="range"
          min="-60"
          max="60"
          step="1"
          @input="emit('update:brightness', Number($event.target.value))"
          @change="emit('record-history')"
        />
      </label>

      <label class="editor-slider">
        <div class="editor-slider__head">
          <span>{{ t('imageEditor.contrast') }}</span>
          <strong>{{ formatSignedValue(contrast) }}</strong>
        </div>
        <input
          :value="contrast"
          type="range"
          min="-40"
          max="40"
          step="1"
          @input="emit('update:contrast', Number($event.target.value))"
          @change="emit('record-history')"
        />
      </label>

      <label class="editor-slider">
        <div class="editor-slider__head">
          <span>{{ t('imageEditor.saturation') }}</span>
          <strong>{{ formatSignedValue(saturation) }}</strong>
        </div>
        <input
          :value="saturation"
          type="range"
          min="-50"
          max="50"
          step="1"
          @input="emit('update:saturation', Number($event.target.value))"
          @change="emit('record-history')"
        />
      </label>
    </div>
  </section>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps({
  saving: { type: Boolean, default: false },
  simpleMode: { type: Boolean, default: false },
  cropperReady: { type: Boolean, default: false },
  showCropRatio: { type: Boolean, default: true },
  brightness: { type: Number, default: 0 },
  contrast: { type: Number, default: 0 },
  saturation: { type: Number, default: 0 },
  freeAngle: { type: Number, default: 0 },
  cropRatio: { type: [Number, String], default: 'free' }
})

const emit = defineEmits([
  'rotate-left',
  'rotate-right',
  'flip-h',
  'reset',
  'record-history',
  'update:brightness',
  'update:contrast',
  'update:saturation',
  'update:freeAngle',
  'update:cropRatio'
])

const { t } = useI18n()

const ratioOptions = computed(() => [
  { value: 'free', label: t('imageEditor.ratioFree') },
  { value: 1, label: t('imageEditor.ratio1to1') },
  { value: 4 / 3, label: t('imageEditor.ratio4to3') },
  { value: 3 / 4, label: t('imageEditor.ratio3to4') },
  { value: 16 / 9, label: t('imageEditor.ratio16to9') }
])

function isActiveRatio(value) {
  if (value === 'free') {
    return String(props.cropRatio) === 'free'
  }
  return Math.abs(Number(props.cropRatio) - Number(value)) < 0.001
}

function onFreeAngleInput(event) {
  emit('update:freeAngle', Number(event.target.value))
}

function formatSignedValue(value) {
  const number = Number(value) || 0
  return number > 0 ? `+${number}` : `${number}`
}

function formatAngle(value) {
  const number = Math.round(Number(value) || 0)
  return number > 0 ? `+${number}°` : `${number}°`
}
</script>
