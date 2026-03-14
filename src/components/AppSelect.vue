<template>
  <div ref="rootRef" class="app-select" :class="{ 'app-select--open': open }">
    <button class="app-select__trigger" type="button" @pointerdown="flushActiveInput" @click="toggle">
      <span class="app-select__value" :class="{ 'app-select__value--placeholder': !displayLabel }">
        {{ displayLabel || placeholder }}
      </span>

      <svg class="app-select__arrow" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M7 10L12 15L17 10" />
      </svg>
    </button>

    <transition name="select-panel">
      <div v-if="open" class="app-select__panel">
        <button
          v-for="option in normalizedOptions"
          :key="option.value"
          class="app-select__option"
          :class="{ 'app-select__option--active': option.value === modelValue }"
          type="button"
          @click="selectOption(option.value)"
        >
          <span>{{ option.label }}</span>

          <svg
            v-if="option.value === modelValue"
            class="app-select__check"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <path d="M5 13L9 17L19 7" />
          </svg>
        </button>

        <div v-if="normalizedOptions.length === 0" class="app-select__empty">暂无可选项</div>
      </div>
    </transition>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { commitActiveInput, flushActiveInput } from '@/utils/commitActiveInput'

const props = defineProps({
  modelValue: {
    type: String,
    default: ''
  },
  options: {
    type: Array,
    default: () => []
  },
  placeholder: {
    type: String,
    default: '请选择'
  }
})

const emit = defineEmits(['update:modelValue'])

const rootRef = ref(null)
const open = ref(false)

const normalizedOptions = computed(() =>
  props.options.map((item) => {
    if (typeof item === 'string') {
      return { label: item, value: item }
    }

    return {
      label: item.label ?? item.text ?? item.value ?? '',
      value: item.value ?? item.label ?? item.text ?? ''
    }
  })
)

const displayLabel = computed(() => {
  const matched = normalizedOptions.value.find((item) => item.value === props.modelValue)
  return matched?.label ?? ''
})

async function toggle() {
  await commitActiveInput()
  open.value = !open.value
}

function close() {
  open.value = false
}

function selectOption(value) {
  emit('update:modelValue', value)
  close()
}

function handleClickOutside(event) {
  if (!rootRef.value?.contains(event.target)) {
    close()
  }
}

onMounted(() => {
  document.addEventListener('mousedown', handleClickOutside)
  document.addEventListener('touchstart', handleClickOutside)
})

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', handleClickOutside)
  document.removeEventListener('touchstart', handleClickOutside)
})
</script>

<style scoped>
.app-select {
  position: relative;
  width: 100%;
}

.app-select__trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  height: 48px;
  padding: 0 14px;
  border: 1px solid rgba(20, 20, 22, 0.08);
  border-radius: 16px;
  background: var(--app-surface);
  color: var(--app-text);
  text-align: left;
  box-shadow: inset 0 1px 0 color-mix(in srgb, #ffffff 68%, transparent);
  transition: border-color 0.18s ease, transform 0.16s ease, box-shadow 0.18s ease;
}

.app-select__trigger:active {
  transform: scale(0.98);
}

.app-select--open .app-select__trigger,
.app-select__trigger:focus-visible {
  border-color: rgba(20, 20, 22, 0.16);
  box-shadow: 0 0 0 3px rgba(20, 20, 22, 0.04);
  outline: none;
}

.app-select__value {
  overflow: hidden;
  color: var(--app-text);
  font-size: 16px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.app-select__value--placeholder {
  color: var(--app-placeholder);
}

.app-select__arrow {
  width: 18px;
  height: 18px;
  margin-left: 10px;
  flex-shrink: 0;
  stroke: var(--app-text-tertiary);
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
  transition: transform 0.18s ease;
}

.app-select--open .app-select__arrow {
  transform: rotate(180deg);
}

.app-select__panel {
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  z-index: 30;
  width: 100%;
  padding: 8px;
  border: 1px solid rgba(20, 20, 22, 0.05);
  border-radius: 18px;
  background: var(--app-surface);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.06);
}

.app-select__option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  min-height: 44px;
  padding: 0 12px;
  border: none;
  border-radius: 12px;
  background: transparent;
  color: var(--app-text);
  font-size: 15px;
  text-align: left;
  transition: background 0.16s ease, transform 0.16s ease, color 0.16s ease;
}

.app-select__option:hover,
.app-select__option:active {
  background: var(--app-surface-soft);
}

.app-select__option--active {
  background: rgba(20, 20, 22, 0.06);
  color: var(--app-text);
  font-weight: 600;
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
  font-size: 14px;
  text-align: center;
}

.select-panel-enter-active,
.select-panel-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
  transform-origin: top center;
}

.select-panel-enter-from,
.select-panel-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

:global(html.theme-dark) .app-select__trigger {
    border-color: rgba(255, 255, 255, 0.07);
    background: color-mix(in srgb, var(--app-surface) 92%, var(--app-glass));
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.04),
      0 0 0 1px rgba(255, 255, 255, 0.02);
  }

:global(html.theme-dark) .app-select--open .app-select__trigger,
  :global(html.theme-dark) .app-select__trigger:focus-visible {
    border-color: rgba(255, 255, 255, 0.12);
    box-shadow:
      0 0 0 3px rgba(255, 255, 255, 0.04),
      inset 0 1px 0 rgba(255, 255, 255, 0.04);
  }

:global(html.theme-dark) .app-select__panel {
    border-color: rgba(255, 255, 255, 0.06);
    background: rgba(24, 24, 28, 0.82);
    backdrop-filter: blur(20px) saturate(140%);
    -webkit-backdrop-filter: blur(20px) saturate(140%);
    box-shadow: 0 18px 40px rgba(0, 0, 0, 0.34);
  }

:global(html.theme-dark) .app-select__option:hover,
  :global(html.theme-dark) .app-select__option:active,
  :global(html.theme-dark) .app-select__option--active {
    background: rgba(255, 255, 255, 0.07);
  }
</style>
