<template>
  <div class="hsl-picker">
    <div class="hsl-picker__preview">
      <span class="hsl-picker__swatch" :style="{ background: modelValue }" aria-hidden="true" />
      <strong class="hsl-picker__hex">{{ modelValue }}</strong>
      <button
        v-if="supportsEyeDropper || pickFallbackEnabled"
        type="button"
        class="hsl-picker__dropper"
        :aria-label="t('common.eyeDropper')"
        :title="t('common.eyeDropper')"
        @click="pickFromScreen"
      >
        <svg class="hsl-picker__dropper-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M19.53 4.47a2.5 2.5 0 0 0-3.54 0l-1.17 1.17-2.29-2.29a1.25 1.25 0 0 0-1.77 1.77l.59.59-7.06 7.06a.75.75 0 0 0-.22.53v3.18l-1.2 1.2a1.5 1.5 0 1 0 2.12 2.12l1.2-1.2h3.18a.75.75 0 0 0 .53-.22l7.06-7.06.59.59a1.25 1.25 0 0 0 1.77-1.77l-2.29-2.29 1.17-1.17a2.5 2.5 0 0 0 0-3.54ZM7.3 15.3l5.84-5.84 1.4 1.4-5.84 5.84H7.3v-1.4Z"
            fill="currentColor"
          />
        </svg>
      </button>
    </div>

    <div class="hsl-picker__sliders">
      <label class="hsl-picker__slider">
        <span class="hsl-picker__slider-label">Hue</span>
        <input
          :value="state.h"
          class="hsl-picker__slider-input hsl-picker__slider-input--hue"
          type="range"
          min="0"
          max="360"
          step="1"
          @input="onHueInput"
        >
      </label>

      <label class="hsl-picker__slider">
        <span class="hsl-picker__slider-label">Sat</span>
        <input
          :value="state.s"
          class="hsl-picker__slider-input"
          type="range"
          min="0"
          max="100"
          step="1"
          :style="saturationTrackStyle"
          @input="onSaturationInput"
        >
      </label>

      <label class="hsl-picker__slider">
        <span class="hsl-picker__slider-label">Light</span>
        <input
          :value="state.l"
          class="hsl-picker__slider-input"
          type="range"
          min="0"
          max="100"
          step="1"
          :style="lightnessTrackStyle"
          @input="onLightnessInput"
        >
      </label>
    </div>

    <div class="hsl-picker__footer">
      <input
        :value="modelValue"
        type="text"
        inputmode="text"
        maxlength="7"
        class="hsl-picker__hex-input"
        @change="onHexInput"
      >
    </div>
  </div>
</template>

<script setup>
import { computed, reactive, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { hexToHsl, hslToHex, isHexColor } from '@/utils/color'

const props = defineProps({
  modelValue: {
    type: String,
    default: '#ffffff'
  },
  field: {
    type: String,
    default: ''
  },
  pickFallbackEnabled: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['update:modelValue', 'fallback-pick'])
const { t } = useI18n()

const state = reactive({ h: 0, s: 0, l: 100 })

const supportsEyeDropper = typeof window !== 'undefined' && 'EyeDropper' in window

function syncFromHex() {
  const hsl = hexToHsl(props.modelValue)
  state.h = hsl.h
  state.s = hsl.s
  state.l = hsl.l
}

watch(() => props.modelValue, syncFromHex, { immediate: true })

const saturationTrackStyle = computed(() => {
  const hue = Number(state.h) || 0
  const lightness = Number(state.l) || 0
  return {
    '--slider-track': `linear-gradient(90deg, ${hslToHex(hue, 0, lightness)} 0%, ${hslToHex(hue, 100, lightness)} 100%)`
  }
})

const lightnessTrackStyle = computed(() => {
  const hue = Number(state.h) || 0
  const saturation = Number(state.s) || 0
  return {
    '--slider-track': `linear-gradient(90deg, ${hslToHex(hue, saturation, 0)} 0%, ${hslToHex(hue, saturation, 50)} 50%, ${hslToHex(hue, saturation, 100)} 100%)`
  }
})

function emitHex() {
  emit('update:modelValue', hslToHex(state.h, state.s, state.l))
}

function coerceNeutralForHue() {
  if (Number(state.s) > 4) return

  state.s = props.field === 'text' ? 10 : 18

  if (Number(state.l) >= 98) {
    state.l = props.field === 'bg' ? 94 : 92
  } else if (Number(state.l) <= 2) {
    state.l = props.field === 'text' ? 14 : 18
  }
}

function onHueInput(event) {
  state.h = Number(event.target.value)
  coerceNeutralForHue()
  emitHex()
}

function onSaturationInput(event) {
  state.s = Number(event.target.value)
  emitHex()
}

function onLightnessInput(event) {
  state.l = Number(event.target.value)
  emitHex()
}

function onHexInput(event) {
  const value = String(event.target.value || '').trim().toLowerCase()

  if (!isHexColor(value)) {
    event.target.value = props.modelValue
    return
  }

  const hsl = hexToHsl(value)
  state.h = hsl.h
  state.s = hsl.s
  state.l = hsl.l
  emit('update:modelValue', value)
}

async function pickFromScreen() {
  if (supportsEyeDropper) {
    try {
      const eyeDropper = new window.EyeDropper()
      const result = await eyeDropper.open()

      if (result?.sRGBHex) {
        const value = result.sRGBHex.toLowerCase()
        const hsl = hexToHsl(value)
        state.h = hsl.h
        state.s = hsl.s
        state.l = hsl.l
        emit('update:modelValue', value)
      }
    } catch (error) {
      // User cancelled the eyedropper selection.
    }
    return
  }

  if (props.pickFallbackEnabled) {
    emit('fallback-pick')
  }
}
</script>

<style scoped>
.hsl-picker {
  display: grid;
  gap: 14px;
  color: var(--app-text);
}

.hsl-picker__preview {
  display: flex;
  align-items: center;
  gap: 10px;
}

.hsl-picker__swatch {
  width: 34px;
  height: 34px;
  flex-shrink: 0;
  border-radius: 10px;
  box-shadow:
    inset 0 0 0 1px rgba(20, 20, 22, 0.1),
    inset 0 0 0 1px rgba(255, 255, 255, 0.24);
}

.hsl-picker__hex {
  flex: 1;
  min-width: 0;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 14px;
  letter-spacing: 0.04em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.hsl-picker__dropper {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  flex-shrink: 0;
  border: 1px solid var(--app-border);
  border-radius: 12px;
  background: color-mix(in srgb, var(--app-surface-soft) 78%, transparent);
  color: var(--app-text-secondary);
  transition:
    background var(--motion-fast, 200ms) ease,
    color var(--motion-fast, 200ms) ease,
    transform var(--motion-fast, 200ms) ease;
}

.hsl-picker__dropper:active {
  transform: scale(0.94);
}

.hsl-picker__dropper-icon {
  width: 18px;
  height: 18px;
}

.hsl-picker__sliders {
  display: grid;
  gap: 12px;
}

.hsl-picker__slider {
  display: grid;
  gap: 8px;
}

.hsl-picker__slider-label {
  color: var(--app-text-secondary);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.hsl-picker__slider-input {
  width: 100%;
  height: 8px;
  appearance: none;
  background: var(--slider-track);
  border-radius: 999px;
  outline: none;
}

.hsl-picker__slider-input--hue {
  --slider-track: linear-gradient(
    90deg,
    #ff3b30 0%,
    #ff9500 16%,
    #ffcc00 32%,
    #34c759 48%,
    #32ade6 64%,
    #5856d6 80%,
    #ff2d55 100%
  );
}

.hsl-picker__slider-input::-webkit-slider-thumb {
  width: 18px;
  height: 18px;
  appearance: none;
  background: var(--app-surface);
  border: 3px solid rgba(255, 255, 255, 0.88);
  border-radius: 999px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.18);
}

.hsl-picker__slider-input::-moz-range-thumb {
  width: 18px;
  height: 18px;
  background: var(--app-surface);
  border: 3px solid rgba(255, 255, 255, 0.88);
  border-radius: 999px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.18);
}

.hsl-picker__footer {
  display: flex;
}

.hsl-picker__hex-input {
  width: 100%;
  min-height: 42px;
  padding: 0 14px;
  color: var(--app-text);
  background: color-mix(in srgb, var(--app-surface-soft) 78%, transparent);
  border: 1px solid var(--app-border);
  border-radius: var(--radius-small, 14px);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  text-align: center;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.hsl-picker__hex-input:focus {
  outline: none;
  border-color: color-mix(in srgb, var(--app-text) 18%, transparent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--app-text) 8%, transparent);
}
</style>
