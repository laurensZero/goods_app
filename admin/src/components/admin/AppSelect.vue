<template>
  <div ref="rootRef" class="app-select" :class="{ 'app-select--open': open, 'app-select--disabled': disabled, 'app-select--inline': inline }">
    <button
      class="app-select__trigger"
      type="button"
      :disabled="disabled"
      @click="toggle"
    >
      <span class="app-select__value" :class="{ 'app-select__value--placeholder': !displayLabel }">
        {{ displayLabel || placeholder || '请选择…' }}
      </span>

      <svg class="app-select__arrow" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M7 10L12 15L17 10" />
      </svg>
    </button>

    <transition name="select-panel">
      <div v-if="open" class="app-select__panel" role="listbox">
        <button
          v-for="option in normalizedOptions"
          :key="option.value"
          class="app-select__option"
          :class="{ 'app-select__option--active': String(option.value) === String(modelValue) }"
          type="button"
          role="option"
          :aria-selected="String(option.value) === String(modelValue)"
          @click="selectOption(option.value)"
        >
          <span class="app-select__label">{{ option.label }}</span>

          <svg
            v-if="String(option.value) === String(modelValue)"
            class="app-select__check"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <path d="M5 13L9 17L19 7" />
          </svg>
        </button>

        <div v-if="normalizedOptions.length === 0" class="app-select__empty">无选项</div>
      </div>
    </transition>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

const props = defineProps({
  modelValue: {
    type: [String, Number],
    default: ''
  },
  options: {
    type: Array,
    default: () => []
  },
  placeholder: {
    type: String,
    default: ''
  },
  disabled: {
    type: Boolean,
    default: false
  },
  inline: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['update:modelValue', 'change'])

const rootRef = ref(null)
const open = ref(false)

const normalizedOptions = computed(() =>
  props.options.map((item) => {
    if (typeof item === 'string' || typeof item === 'number') {
      return { label: String(item), value: item }
    }

    return {
      label: item.label ?? item.text ?? String(item.value ?? ''),
      value: item.value ?? item.label ?? item.text ?? ''
    }
  })
)

const displayLabel = computed(() => {
  const matched = normalizedOptions.value.find((item) => String(item.value) === String(props.modelValue))
  return matched?.label ?? ''
})

function toggle() {
  if (props.disabled) return
  open.value = !open.value
}

function close() {
  open.value = false
}

function selectOption(value) {
  emit('update:modelValue', value)
  emit('change', value)
  close()
}

function handleClickOutside(event) {
  if (!rootRef.value?.contains(event.target)) {
    close()
  }
}

function handleKeydown(event) {
  if (event.key === 'Escape') close()
}

onMounted(() => {
  document.addEventListener('mousedown', handleClickOutside)
  document.addEventListener('touchstart', handleClickOutside)
  document.addEventListener('keydown', handleKeydown)
})

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', handleClickOutside)
  document.removeEventListener('touchstart', handleClickOutside)
  document.removeEventListener('keydown', handleKeydown)
})
</script>

<style scoped>
.app-select {
  position: relative;
  width: 100%;
  min-width: 0;
}

.app-select--inline {
  width: auto;
}

.app-select__trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  min-height: var(--input-height);
  padding: 0 12px;
  border: 1px solid var(--app-input-border);
  border-radius: var(--radius-xs);
  background: var(--app-surface);
  color: var(--app-text);
  font-size: 14px;
  text-align: left;
  cursor: pointer;
  transition: border-color var(--motion-fast) var(--motion-ease-default),
    box-shadow var(--motion-fast) var(--motion-ease-default),
    transform var(--motion-fast) var(--motion-ease-default);
}

.app-select__trigger:active {
  transform: scale(0.99);
}

.app-select--disabled .app-select__trigger {
  opacity: 0.55;
  cursor: not-allowed;
}

.app-select--disabled .app-select__trigger:active {
  transform: none;
}

.app-select--open .app-select__trigger,
.app-select__trigger:focus-visible {
  border-color: var(--app-input-focus-border);
  box-shadow: 0 0 0 4px var(--app-input-focus-ring);
  outline: none;
}

.app-select__value {
  overflow: hidden;
  color: var(--app-text);
  font-size: 14px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.app-select__value--placeholder {
  color: var(--app-placeholder);
}

.app-select__arrow {
  width: 16px;
  height: 16px;
  margin-left: 8px;
  flex-shrink: 0;
  stroke: var(--app-text-tertiary);
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
  transition: transform var(--motion-fast) var(--motion-ease-default);
}

.app-select--open .app-select__arrow {
  transform: rotate(180deg);
}

.app-select__panel {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  z-index: 50;
  min-width: 100%;
  padding: 6px;
  border: 1px solid var(--app-border);
  border-radius: var(--radius-card);
  background: var(--app-surface);
  box-shadow: var(--app-shadow);
  max-height: 280px;
  overflow-y: auto;
}

.app-select__option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  min-height: 38px;
  padding: 0 10px;
  border: none;
  border-radius: var(--radius-xxs);
  background: transparent;
  color: var(--app-text);
  font-size: 14px;
  text-align: left;
  cursor: pointer;
  transition: background var(--motion-fast) ease, transform var(--motion-fast) ease;
}

.app-select__option:hover,
.app-select__option:active {
  background: var(--app-surface-soft);
}

.app-select__option--active {
  background: color-mix(in srgb, var(--app-text) 6%, transparent);
  font-weight: 600;
}

.app-select__label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.app-select__check {
  width: 16px;
  height: 16px;
  margin-left: 10px;
  flex-shrink: 0;
  stroke: currentColor;
  stroke-width: 2.4;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.app-select__empty {
  padding: 14px 12px;
  color: var(--app-text-tertiary);
  font-size: 13px;
  text-align: center;
}

.select-panel-enter-active,
.select-panel-leave-active {
  transition: opacity var(--motion-fast) ease, transform var(--motion-fast) ease;
  transform-origin: top center;
}

.select-panel-enter-from,
.select-panel-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

:global(html.theme-dark) .app-select__trigger {
  border-color: rgba(255, 255, 255, 0.08);
}

:global(html.theme-dark) .app-select__panel {
  border-color: rgba(255, 255, 255, 0.08);
  background: color-mix(in srgb, var(--app-surface) 96%, var(--app-glass));
  backdrop-filter: blur(var(--app-frost-blur)) saturate(var(--app-frost-saturate));
  -webkit-backdrop-filter: blur(var(--app-frost-blur)) saturate(var(--app-frost-saturate));
}
</style>
